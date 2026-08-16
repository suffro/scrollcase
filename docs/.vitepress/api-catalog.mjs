/**
 * Build-time generation of /.well-known/api-catalog (RFC 9727).
 *
 * The catalogue is deliberately narrow, because Scrollcase publishes no HTTP API and a catalogue
 * that invented one would be a lie told to machines — the exact failure this project exists to
 * make impossible in its own artefacts. What the domain does serve, and what an agent can act on
 * without reading prose, is two things: the JSON Schemas that define the box format, and the CLI
 * surface. Those are the two entries, and nothing is claimed beyond them. No `status` relation
 * either: there is no health endpoint, and the member is optional precisely so that a publisher
 * without one can say so by omission.
 *
 * The schema list is read from what the build emitted, with each entry's title and URL taken from
 * the schema's own `title` and `$id`. A catalogue is a promise about what a host serves, so it is
 * derived from what the host will actually serve rather than from a list someone maintains beside
 * it.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/** RFC 9727 fixes the path; only the origin is ours. */
export const CATALOG_PATH = '/.well-known/api-catalog';

/**
 * Every schema the build published, as linkset target objects.
 *
 * `$id` is what a document in the field points at and what a validator resolves, so it is the
 * honest href — constructing one from the filename would let the two disagree.
 */
async function schemaTargets(outDir, hostname) {
  const directory = join(outDir, 'schema', 'v2');
  const names = (await readdir(directory)).filter((name) => name.endsWith('.schema.json')).sort();
  const targets = [];
  for (const name of names) {
    const schema = JSON.parse(await readFile(join(directory, name), 'utf8'));
    targets.push({
      href: schema.$id ?? `${hostname}/schema/v2/${name}`,
      type: 'application/schema+json',
      title: schema.title ?? name,
    });
  }
  return targets;
}

export async function writeApiCatalog({ outDir, hostname }) {
  const catalogue = {
    linkset: [
      {
        anchor: `${hostname}${CATALOG_PATH}`,
        item: [
          { href: `${hostname}/schema/v2/` },
          { href: `${hostname}/reference/cli` },
        ],
      },
      {
        anchor: `${hostname}/schema/v2/`,
        'service-desc': await schemaTargets(outDir, hostname),
        'service-doc': [
          { href: `${hostname}/reference/schemas`, type: 'text/html', title: 'JSON Schemas' },
          { href: `${hostname}/reference/schemas.md`, type: 'text/markdown', title: 'JSON Schemas' },
        ],
      },
      {
        // The CLI's machine-readable description is the reference page as Markdown — the same twin
        // the site serves under content negotiation. There is no generated command schema, and
        // pointing at one that does not exist would be worse than pointing at prose that does.
        anchor: `${hostname}/reference/cli`,
        'service-desc': [
          { href: `${hostname}/reference/cli.md`, type: 'text/markdown', title: 'CLI commands' },
        ],
        'service-doc': [
          { href: `${hostname}/reference/cli`, type: 'text/html', title: 'CLI commands' },
        ],
      },
    ],
  };

  const file = join(outDir, '.well-known', 'api-catalog');
  await mkdir(join(outDir, '.well-known'), { recursive: true });
  await writeFile(file, `${JSON.stringify(catalogue, null, 2)}\n`);
  return catalogue.linkset.length - 1;
}
