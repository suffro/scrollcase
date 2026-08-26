/**
 * Reading a Python project's existing dependency list into conda-forge terms.
 *
 * A project arriving from pip already has `requirements.txt`, and retyping it is the sort of work
 * that invites a typo. What this cannot do is decide: names are translated where this module is
 * sure and lowercased otherwise, and every translation and every skip is reported so the author
 * reviews them before locking rather than after a build fails.
 *
 * It lives under the Python runtime because `requirements.txt`, extras, environment markers and the
 * PyPI spelling of a package are all Python facts. What stays in `src/build/dependencies.mjs` is
 * the substrate half — editing the `[dependencies]` table of a pixi manifest — which is the same
 * job whatever runtime the box packs.
 */

/**
 * PyPI names whose conda-forge package is called something else.
 *
 * Deliberately short. Every entry is one this project can state with confidence; anything else is
 * lowercased and passed through, and every rename is reported so the author can check it before
 * locking. A wrong guess here produces a lock that resolves and a box that cannot import what it
 * was built for, which is worse than an unmapped name the author has to look up.
 */
const CONDA_FORGE_NAMES = Object.freeze({
  'opencv-python': 'opencv',
  'opencv-python-headless': 'opencv',
  'psycopg2-binary': 'psycopg2',
  'msgpack': 'msgpack-python',
  'tables': 'pytables',
  'torch': 'pytorch',
});

/**
 * Reads a pip `requirements.txt` and reports what it would mean on conda-forge.
 *
 * @param {string} contents
 * @returns {{ dependencies: { name: string, spec: string }[],
 *   renamed: { from: string, to: string }[], skipped: { line: string, reason: string }[] }}
 */
export function readRequirements(contents) {
  const dependencies = [];
  const renamed = [];
  const skipped = [];
  for (const raw of contents.split('\n')) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    if (line.startsWith('-')) {
      skipped.push({ line, reason: 'a pip option, which has no conda-forge equivalent' });
      continue;
    }
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(line) || line.includes('@')) {
      skipped.push({ line, reason: 'a direct URL or VCS reference, which conda-forge cannot express' });
      continue;
    }
    // `name[extra1,extra2] >= 1.2 ; python_version < "3.12"` — the name runs to the first of these.
    const [requirement] = line.split(';');
    const match = /^([A-Za-z0-9._-]+)\s*(\[[^\]]*\])?\s*(.*)$/.exec(requirement.trim());
    if (!match) {
      skipped.push({ line, reason: 'not a requirement this reader understands' });
      continue;
    }
    const [, rawName, extras, rawSpec] = match;
    const normalized = rawName.toLowerCase().replace(/_/g, '-');
    const name = CONDA_FORGE_NAMES[normalized] ?? normalized;
    if (name !== rawName) renamed.push({ from: rawName, to: name });
    if (extras) {
      skipped.push({ line: `${rawName}${extras}`, reason: 'extras are a pip concept; add the packages they pull in yourself' });
    }
    const spec = rawSpec.trim().replace(/\s+/g, '');
    dependencies.push({ name, spec: spec === '' ? '*' : spec });
  }
  return { dependencies, renamed, skipped };
}
