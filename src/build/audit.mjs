/**
 * `audit` — the dependency licence inventory, without building anything.
 *
 * The inventory is a pure function of the committed lock, so it can be produced, reviewed and
 * checked into a repository long before any box exists. That matters because licence review is a
 * human step: it should happen when dependencies change, not in the middle of a multi-gigabyte build
 * that then fails at the end.
 *
 * The same function the build runs is used here, so a reviewed audit and the one a build produces
 * cannot disagree by construction.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { boxTargetId } from '../contract/targets.mjs';
import { compareStableStrings, fileExists, safeRelativePath } from './filesystem.mjs';
import { createCondaDependencyLicenseAudit, validateCondaDependencyLicenseAudit } from './licenses.mjs';
import { fail } from './process.mjs';
import { readScroll } from './scroll.mjs';
import { setScrollField } from './scroll-edit.mjs';
import { getWorkspace } from './workspace.mjs';

/**
 * Where a licence audit goes when the scroll does not say: `conda-licenses.json` beside the scroll.
 *
 * Returns null when the scroll directory is not under the project root, since a scroll path is
 * always expressed from there and one that escapes cannot be written down.
 */
function defaultAuditPath(projectRoot, scrollDir) {
  const relativePath = relative(projectRoot, join(scrollDir, 'conda-licenses.json'));
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) return null;
  return relativePath.split(sep).join('/');
}

/**
 * Produces the inventory for a scroll, and either checks it against the reviewed copy or writes it.
 *
 * Writing is explicit (`write: true`) because overwriting the reviewed file is how an unreviewed
 * licence change would slip through: the default is to compare and fail on any difference.
 */
export async function auditScroll(name, { write = false, namespace } = {}) {
  const workspace = getWorkspace();
  const { dir, scroll } = await readScroll(name);
  const lockPath = join(dir, 'pixi.lock');
  if (!await fileExists(lockPath)) fail(`Missing dependency lock: ${lockPath}`);
  const inventory = createCondaDependencyLicenseAudit({
    lockBytes: await readFile(lockPath),
    targetId: boxTargetId(scroll.target),
    ...(namespace ? { namespace } : {}),
  });

  // A package with no declared licence never reaches here: parsing the lock rejects it outright,
  // which is the point — an unlicensed dependency is a legal problem, not a reporting gap.
  const licences = new Map();
  for (const entry of inventory.packages) {
    licences.set(entry.declaredLicense, (licences.get(entry.declaredLicense) ?? 0) + 1);
  }
  const summary = {
    scrollId: scroll.scrollId,
    targetId: inventory.targetId,
    packageCount: inventory.packages.length,
    licenses: [...licences]
      .sort((left, right) => right[1] - left[1] || compareStableStrings(left[0], right[0]))
      .map(([license, count]) => ({ license, count })),
  };

  // `--write` on a scroll that declares no path writes the conventional one beside the scroll and
  // records it. Refusing instead — which is what this did — left the author to work out the path and
  // type it in by hand, for a value that is a convention rather than a decision. What stays
  // deliberate is the *declaration*: a build enforces the audit only for a scroll that names one,
  // so the check is switched on by running this command, never by a file appearing on disk.
  let declared = scroll.condaDependencyLicenseAudit;
  if (!declared && write) {
    declared = defaultAuditPath(workspace.root, dir);
    if (!declared) {
      fail(`Cannot place a licence audit for ${name}: its scroll lies outside the project root. Declare condaDependencyLicenseAudit yourself.`);
    }
  }
  if (!declared) return { inventory, summary, reviewed: null };
  const reviewedPath = join(workspace.root, safeRelativePath(declared));
  if (write) {
    await mkdir(dirname(reviewedPath), { recursive: true });
    await writeFile(reviewedPath, `${JSON.stringify(inventory, null, 2)}\n`);
    const recorded = scroll.condaDependencyLicenseAudit
      ? []
      : (await setScrollField({
        boxId: scroll.boxId,
        target: boxTargetId(scroll.target),
        field: 'condaDependencyLicenseAudit',
        value: declared,
      })).written;
    return { inventory, summary, reviewed: reviewedPath, written: true, recorded };
  }
  if (!await fileExists(reviewedPath)) {
    fail(`Reviewed licence audit is missing: ${reviewedPath}. Run audit --write and review the result.`);
  }
  validateCondaDependencyLicenseAudit(JSON.parse(await readFile(reviewedPath, 'utf8')), inventory);
  return { inventory, summary, reviewed: reviewedPath, written: false };
}
