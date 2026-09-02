/**
 * Reading a scroll, and the provenance of the build that reads it.
 *
 * A scroll is the only input a build accepts, so it is validated before anything is installed. In
 * the nested layout, the meaningful declarations police the path: `boxId` names the parent and the
 * canonical target names the child. The declared runtime's layout is checked against the target
 * before the scroll reaches any tool discovery or build mutation.
 *
 * Reading is also where a scroll becomes complete. A split scroll's two halves are joined, fields
 * the target or the identity already determine are derived, and the result — the *effective* scroll
 * — is the single object the rest of the build and the provenance record see. Nothing downstream
 * has to ask which file a value came from or whether it was written down at all.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { boxTargetAdapter, boxTargetId } from '../contract/targets.mjs';
import {
  assertRuntimeEntryPoint,
  isImplementedRuntime,
  runtimeAdapter,
  unimplementedRuntimeMessage,
  unsupportedSelfTestProbeMessage,
} from '../contract/runtimes.mjs';
import { compareStableStrings, fileExists, safeRelativePath } from './filesystem.mjs';
import { fail, runResult } from './process.mjs';
import { schemaValidationError } from './schema-validation.mjs';
import { getWorkspace } from './workspace.mjs';

const scrollSchemaUrl = new URL('../contract/schema/scroll.schema.json', import.meta.url);
const targetSchemaUrl = new URL('../contract/schema/target.schema.json', import.meta.url);
const executionSchemaUrl = new URL('../contract/schema/execution.schema.json', import.meta.url);
let scrollSchemas;

async function loadScrollSchemas() {
  scrollSchemas ??= Promise.all([scrollSchemaUrl, targetSchemaUrl, executionSchemaUrl]
    .map(async (url) => JSON.parse(await readFile(url, 'utf8'))));
  return scrollSchemas;
}

/**
 * The only value `extends` may take. A base is always the box directory's own `scroll.json`, so
 * there is no path to validate, no traversal to screen, and no chain of bases to follow.
 */
const SCROLL_BASE_REFERENCE = '../scroll.json';

/**
 * Lists of payload entries: joined base-first.
 *
 * Whether two of them end up claiming one path is checked later, on the joined scroll, so that one
 * rule covers a conflict between a base and a fragment, between two entries of one list, and
 * between an asset and a local file alike.
 */
const JOINED_ENTRY_LISTS = Object.freeze(['assets', 'assetArchives', 'localFiles']);

/**
 * Lists of plain strings: joined base-first, with repeats dropped.
 *
 * Unlike an entry list, a repeat here is the same instruction twice. Pruning a path twice or
 * importing a module twice is idempotent, and refusing a base and a fragment that both name `json`
 * would be hostile for no gain.
 */
const JOINED_STRING_LISTS = Object.freeze(['prunePaths', 'uncompressedPaths']);

/**
 * Open maps: joined key by key, fragment winning a shared key.
 *
 * Both hold independent entries that a base and a target legitimately contribute to — shared
 * variables plus a CUDA-only one, a shared floor plus a macOS-only one. Replacing the whole map
 * would force a fragment to restate every shared key, which is the duplication `extends` exists to
 * remove.
 */
const JOINED_MAPS = Object.freeze(['compatibility', 'environment']);

/**
 * Refuses two declarations that would write the same file in the box.
 *
 * One path in a box has one source. Two declarations for it means whichever the builder staged
 * second silently overwrote the first, and which one that is depends on an ordering nobody chose —
 * so it is refused rather than settled by a precedence rule. The check spans `assets`,
 * `assetArchives` and `localFiles` together, because the conflict is about the destination and not
 * about which list an author happened to write it in.
 *
 * Entries whose shape is wrong are passed over: schema validation has already reported those.
 */
function assertDistinctPayloadDestinations(scroll) {
  const claimed = new Map();
  const declarations = [
    ...(scroll.assets ?? []).map((entry) => ['asset', entry.relativePath]),
    ...(scroll.assetArchives ?? []).map((entry) => ['asset archive', entry.relativePath]),
    ...(scroll.localFiles ?? []).map((entry) => ['local file', entry.relativePath]),
  ];
  for (const [kind, path] of declarations) {
    if (typeof path !== 'string') continue;
    const previous = claimed.get(path);
    if (previous) {
      fail(`The ${previous} and the ${kind} at ${path} both claim that path in the box; one box file has one source.`);
    }
    claimed.set(path, kind);
  }
}

/**
 * Joins the base and fragment self-tests.
 *
 * `imports`, `files` and `commands` accumulate, because a target that needs one more module — or one
 * more invocation — still needs the shared ones. `imports` and `files` drop repeats, since asking
 * for the same module twice is the same instruction twice; `commands` does not, because two
 * invocations differing only in `expectExitCode` are two different checks and comparing whole
 * objects for identity would be a rule with a surprising edge rather than a simplification.
 *
 * The extra source is one logical slot with two spellings, so a fragment naming either `code` or
 * `script` replaces both: inheriting a base's file while the fragment declares inline source would
 * produce a scroll the schema refuses, and silently running both would run a check the author did
 * not ask for.
 */
function joinSelfTests(base = {}, fragment = {}) {
  const joined = { ...base, ...fragment };
  const imports = [...new Set([...(base.imports ?? []), ...(fragment.imports ?? [])])];
  if (base.imports || fragment.imports) joined.imports = imports;
  const files = [...new Set([...(base.files ?? []), ...(fragment.files ?? [])])];
  if (base.files || fragment.files) joined.files = files;
  if (base.commands || fragment.commands) {
    joined.commands = [...(base.commands ?? []), ...(fragment.commands ?? [])];
  }
  if (fragment.code !== undefined || fragment.script !== undefined) {
    delete joined.code;
    delete joined.script;
    if (fragment.code !== undefined) joined.code = fragment.code;
    if (fragment.script !== undefined) joined.script = fragment.script;
  }
  return joined;
}

/**
 * Joins a base scroll with one target's fragment into the scroll a build actually reads.
 *
 * The rule is per field, and stating it that way is the point: a single blanket rule is wrong in
 * both directions. Replacing everything would make a fragment that adds one asset lose the shared
 * ones; merging everything would leave `execution` half from each half, producing a `python-script`
 * kind that inherited a `module` from the base.
 *
 * | Shape | Rule |
 * | --- | --- |
 * | Scalars, and the cohesive objects `target`, `runtime`, `execution`, `parity` | The fragment replaces the base |
 * | `assets`, `assetArchives`, `localFiles` | Joined base-first; a repeated `relativePath` is an error |
 * | `prunePaths`, `uncompressedPaths`, `selfTest.imports`, `selfTest.files` | Joined base-first, repeats dropped |
 * | `selfTest.commands` | Joined base-first, repeats kept |
 * | `compatibility`, `environment` | Joined key by key, the fragment winning a shared key |
 * | `extends` | Dropped: the joined scroll extends nothing |
 *
 * Order is declaration order, base first — in the joined lists and in the joined maps' keys alike.
 * Nothing is sorted, because sorting would buy nothing a rebuild needs: determinism requires that
 * one pair of files always produce one result, which declaration order already gives. It does mean
 * a split scroll and a hand-written whole one can serialise a joined map's keys in a different
 * order while holding the same entries; the two are equal in content, not necessarily byte for
 * byte. Sorting instead would change the bytes of every box whose map was not already alphabetical,
 * to fix nothing.
 */
function joinScrollFragment(base, fragment) {
  const joined = { ...base, ...fragment };
  delete joined.extends;
  for (const field of JOINED_MAPS) {
    if (base[field] || fragment[field]) joined[field] = { ...base[field], ...fragment[field] };
  }
  for (const field of JOINED_ENTRY_LISTS) {
    if (!base[field] && !fragment[field]) continue;
    joined[field] = [...(base[field] ?? []), ...(fragment[field] ?? [])];
  }
  for (const field of JOINED_STRING_LISTS) {
    if (!base[field] && !fragment[field]) continue;
    joined[field] = [...new Set([...(base[field] ?? []), ...(fragment[field] ?? [])])];
  }
  if (base.selfTest || fragment.selfTest) {
    joined.selfTest = joinSelfTests(base.selfTest, fragment.selfTest);
  }
  return joined;
}

/**
 * Reads the base a fragment extends, and refuses a base that is trying to be something else.
 *
 * A base is not a buildable scroll and must not look like one: it declares no target, because it
 * holds what its targets share, and it extends nothing, because one level of joining is the whole
 * feature. Both are checked here rather than in the schema, which never sees either file alone.
 */
async function readScrollBase(fragment, dir, reference) {
  if (fragment.extends !== SCROLL_BASE_REFERENCE) {
    fail(`Scroll ${reference} extends ${JSON.stringify(fragment.extends)}; the only base is ${SCROLL_BASE_REFERENCE}.`);
  }
  const path = resolve(dir, '..', 'scroll.json');
  if (!await fileExists(path)) {
    fail(`Scroll ${reference} extends ${SCROLL_BASE_REFERENCE}, which does not exist: ${path}`);
  }
  let base;
  try {
    base = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    return fail(`Invalid base scroll at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!base || typeof base !== 'object' || Array.isArray(base)) {
    fail(`Invalid base scroll at ${path}: expected a JSON object.`);
  }
  if (base.target !== undefined) {
    fail(`The base scroll at ${path} declares a target; each target declares its own.`);
  }
  if (base.extends !== undefined) {
    fail(`The base scroll at ${path} extends another scroll; a base is one level, not a chain.`);
  }
  return base;
}

/** Resolves an exact scroll reference to its directory, refusing anything outside the scrolls root. */
export function scrollDirectory(reference) {
  const root = getWorkspace().scrollsDir;
  const normalized = safeRelativePath(reference);
  const path = resolve(root, ...normalized.split('/'));
  if (path === root || !path.startsWith(`${root}${sep}`)) fail(`Invalid scroll: ${reference}`);
  return path;
}

/**
 * Fills in everything a scroll does not have to say twice.
 *
 * A hand-written scroll should carry decisions, not restatements: the interpreter path is the only
 * one the runtime's layout admits, the cache directory follows the box identity, and an empty list means
 * the same thing whether or not it was typed. Deriving here rather than at each use keeps one
 * effective scroll — the object the rest of the build, and the provenance record, actually see.
 */
function effectiveScroll(scroll, adapter, targetId) {
  // Only a runtime this build implements gets this far, so its layout is the one authority on where
  // the entry point sits — derived when the scroll stays quiet, checked against when it does not.
  // A runtime with no interpreter has none to derive, and leaving the field out is the honest
  // answer: `runtime.entryPoint` is optional on the wire precisely so a native box can omit it.
  const layout = runtimeAdapter(scroll.runtime.id).layout(adapter);
  const runtime = layout.entryPoint === null
    ? { ...scroll.runtime }
    : { ...scroll.runtime, entryPoint: scroll.runtime.entryPoint ?? layout.entryPoint };
  return {
    ...scroll,
    // Provenance needs a stable source identity. It is derived when the scroll does not name one,
    // so the directory layout remains checked context rather than a second wire identity.
    scrollId: scroll.scrollId ?? `${scroll.boxId}-${targetId}`,
    scrollVersion: scroll.scrollVersion ?? '1.0.0',
    compatibility: scroll.compatibility ?? {},
    runtime,
    cacheSubdir: scroll.cacheSubdir ?? `cache/${scroll.boxId}`,
    assets: scroll.assets ?? [],
    selfTest: { ...scroll.selfTest, files: scroll.selfTest.files ?? [] },
  };
}

/** Loads one exact nested scroll reference, then joins, validates and completes it. */
async function readExactScroll(reference) {
  const normalized = safeRelativePath(reference);
  const parts = normalized.split('/');
  if (parts.length !== 2) fail(`Invalid scroll reference ${reference}; use <boxId>/<targetId>.`);
  const dir = scrollDirectory(normalized);
  const fragment = JSON.parse(await readFile(resolve(dir, 'scroll.json'), 'utf8'));
  // Joining comes first: neither half of a split scroll is a complete document, so validating either
  // one alone would report the other half's fields as missing.
  const extended = fragment.extends !== undefined;
  const declared = extended
    ? joinScrollFragment(await readScrollBase(fragment, dir, normalized), fragment)
    : fragment;
  const [scrollSchema, targetSchema, executionSchema] = await loadScrollSchemas();
  const validationError = schemaValidationError(declared, scrollSchema, [targetSchema, executionSchema]);
  if (validationError) {
    fail(`Invalid scroll ${normalized}${extended ? ' joined with its base' : ''}: ${validationError}.`);
  }
  // The wire vocabulary is wider than what this build can run, deliberately, so the schema admits a
  // runtime with no adapter here and this is where that becomes a clear refusal.
  if (!isImplementedRuntime(declared.runtime.id)) fail(unimplementedRuntimeMessage(declared.runtime.id));
  const runtime = runtimeAdapter(declared.runtime.id);
  if (declared.execution && !runtime.executionKinds.includes(declared.execution.kind)) {
    fail(`Execution kind ${declared.execution.kind} does not belong to the ${runtime.id} runtime; `
      + `it defines ${runtime.executionKinds.join(', ')}.`);
  }
  // A command probe appends arguments to the box's declared execution. With none declared there is
  // nothing to append them to, so the two declarations contradict each other.
  if ((declared.selfTest.commands ?? []).length > 0 && !declared.execution) {
    fail('selfTest.commands invokes the box\'s execution, which this scroll does not declare.');
  }
  // An import probe asks a module system a question. A runtime without one cannot answer it, and
  // running the build only to discover that at self-test time would be a worse place to find out.
  for (const probeKind of ['imports', 'commands']) {
    if (!(declared.selfTest[probeKind] ?? []).length) continue;
    if (!runtime.selfTestProbeKinds.includes(probeKind)) {
      fail(unsupportedSelfTestProbeMessage(runtime.id, probeKind));
    }
  }
  // Checked here rather than in the schema: a base legitimately has no target, and requiring one
  // there would make every base file light up in an editor.
  if (declared.target === undefined) fail(`Scroll ${normalized} declares no target.`);
  const adapter = boxTargetAdapter(declared.target);
  const targetId = boxTargetId(declared.target);
  // The parity gate runs a source file with the box's own runtime, once per accelerator. A runtime
  // with no interpreter has nothing to run it with, and a compiled binary is not a check script.
  if (declared.parity && runtime.layout(adapter).entryPoint === null) {
    fail(`A ${runtime.id} box has no interpreter to run a parity check with; parity compares source run inside the box.`);
  }
  const scroll = effectiveScroll(declared, adapter, targetId);
  const payloadPaths = [
    scroll.cacheSubdir,
    ...scroll.assets.map((asset) => asset.relativePath),
    ...(scroll.assetArchives ?? []).flatMap((archive) => [archive.relativePath, archive.destination]),
    ...(scroll.localFiles ?? []).flatMap((file) => [file.sourcePath, file.relativePath]),
    ...(scroll.prunePaths ?? []),
    ...(scroll.uncompressedPaths ?? []),
    ...scroll.selfTest.files,
    ...(scroll.selfTest.script ? [scroll.selfTest.script] : []),
    ...(scroll.execution?.script ? [scroll.execution.script] : []),
    ...(scroll.execution?.binary ? [scroll.execution.binary] : []),
    ...(scroll.parity ? [scroll.parity.script] : []),
    ...(scroll.condaDependencyLicenseAudit ? [scroll.condaDependencyLicenseAudit] : []),
    ...(scroll.bundledLicenseDeclaration ? [scroll.bundledLicenseDeclaration] : []),
  ];
  for (const path of payloadPaths) safeRelativePath(path);
  assertDistinctPayloadDestinations(scroll);
  const [boxDirectory, targetDirectory] = parts;
  if (boxDirectory !== scroll.boxId) {
    fail(`Nested scroll box directory ${boxDirectory} does not match scroll boxId ${scroll.boxId}.`);
  }
  if (targetDirectory !== targetId) {
    fail(`Nested scroll target directory ${targetDirectory} does not match declared target ${targetId}.`);
  }
  assertRuntimeEntryPoint(scroll.runtime.id, adapter, scroll.runtime.entryPoint);
  return { adapter, dir, scroll, reference: normalized, targetId };
}

/**
 * Lists the scrolls named by a CLI/library reference.
 *
 * An exact `<boxId>/<targetId>` reference loads one scroll. A single box name expands to its
 * `scrolls/<boxId>/<targetId>/` children. Omitting the name discovers every nested scroll in the
 * workspace for CLI selection. Every child is validated before it is offered, so a misleading
 * directory never becomes a selectable target.
 */
export async function scrollCandidates(name = null) {
  if (name === null || name === undefined) {
    let boxes;
    try {
      boxes = await readdir(getWorkspace().scrollsDir, { withFileTypes: true });
    } catch {
      return fail('No scrolls found; run scrollcase init or scrollcase new scroll.');
    }
    const candidates = [];
    for (const box of boxes.sort((left, right) => compareStableStrings(left.name, right.name))) {
      if (!box.isDirectory()) continue;
      let targets;
      try {
        targets = await readdir(scrollDirectory(box.name), { withFileTypes: true });
      } catch {
        continue;
      }
      for (const target of targets.sort((left, right) =>
        compareStableStrings(left.name, right.name))) {
        if (!target.isDirectory()) continue;
        const nestedReference = `${box.name}/${target.name}`;
        if (await fileExists(join(scrollDirectory(nestedReference), 'scroll.json'))) {
          candidates.push(await readExactScroll(nestedReference));
        }
      }
    }
    if (candidates.length === 0) {
      fail('No scrolls found; run scrollcase init or scrollcase new scroll.');
    }
    return candidates;
  }

  const reference = safeRelativePath(name);
  if (reference.includes('/')) {
    if (reference.split('/').length !== 2
      || !await fileExists(join(scrollDirectory(reference), 'scroll.json'))) {
      fail(`Scroll not found: ${reference}.`);
    }
    return [await readExactScroll(reference)];
  }

  let entries;
  try {
    entries = await readdir(scrollDirectory(reference), { withFileTypes: true });
  } catch {
    return fail(`Scroll or box not found: ${reference}.`);
  }
  const candidates = [];
  for (const entry of entries.sort((left, right) => compareStableStrings(left.name, right.name))) {
    if (!entry.isDirectory()) continue;
    const nestedReference = `${reference}/${entry.name}`;
    if (await fileExists(join(scrollDirectory(nestedReference), 'scroll.json'))) {
      candidates.push(await readExactScroll(nestedReference));
    }
  }
  if (candidates.length === 0) fail(`Box ${reference} contains no target scrolls.`);
  return candidates;
}

/**
 * Loads a scroll without prompting.
 *
 * Library callers may select a target explicitly. An unambiguous box shorthand is also accepted;
 * ambiguity is a hard error here because only the CLI edge is allowed to ask a person.
 */
export async function readScroll(name, { targetId = null } = {}) {
  let candidates = await scrollCandidates(name);
  if (targetId) {
    candidates = candidates.filter((candidate) => candidate.targetId === targetId);
    if (candidates.length === 0) {
      fail(`Target ${targetId} is not available for ${name}.`);
    }
  }
  if (candidates.length > 1) {
    fail(
      `Box ${name} has multiple scroll targets (${candidates.map((candidate) => candidate.targetId).join(', ')}); `
      + 'use <boxId>/<targetId> or select a target explicitly.',
    );
  }
  return candidates[0];
}

/**
 * Build timestamp taken from the HEAD commit rather than the clock, so rebuilding the same commit
 * produces the same provenance. Falls back to the epoch outside a git checkout — deliberately a
 * constant, since a wall-clock fallback would reintroduce the nondeterminism this avoids.
 */
export function sourceBuildTime(cwd) {
  const result = runResult('git', ['show', '-s', '--format=%cI', 'HEAD'], { capture: true, cwd });
  return result.status === 0 ? result.stdout.trim() : new Date(0).toISOString();
}

/**
 * The commit a box was built from, and whether the tree had uncommitted changes at the time.
 *
 * Outside a git checkout there is no revision to record, which callers must handle explicitly rather
 * than inventing one: an unversioned build is reproducible by nobody.
 */
export function sourceBuildState(cwd) {
  const revision = runResult('git', ['rev-parse', 'HEAD'], { capture: true, cwd });
  if (revision.status !== 0) return null;
  const status = runResult('git', ['status', '--porcelain', '--untracked-files=all'], { capture: true, cwd });
  return { revision: revision.stdout.trim(), dirty: status.stdout.trim().length > 0 };
}
