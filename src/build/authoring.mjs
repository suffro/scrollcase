/**
 * Authoring one scroll inside an initialized workspace.
 *
 * `init` owns workspace structure; this module owns the atomic creation of one target-specific
 * scroll. All material input is validated before the first write, and existing paths are never
 * overwritten. Execution metadata is authored here and later copied unchanged into both signed
 * manifests by the builder; keeping creation separate prevents this module from acquiring build or
 * execution policy.
 *
 * What is generated is deliberately short. A scroll that restates what the target already implies is
 * a scroll nobody wants to write by hand, so anything `readScroll` can derive is left out and the
 * self-test is written as a real Python file rather than escaped into a JSON string.
 */

import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { boxTargetAdapter, boxTargetId, condaSubdir } from '../contract/targets.mjs';
import { BOX_SCHEMA_VERSION } from '../contract/documents.mjs';
import { runtimeBuilder } from '../runtimes/index.mjs';
import { fileExists, safeRelativePath } from './filesystem.mjs';
import { fail } from './process.mjs';
import { schemaValidationError } from './schema-validation.mjs';

const scrollSchemaUrl = new URL('../contract/schema/scroll.schema.json', import.meta.url);
const targetSchemaUrl = new URL('../contract/schema/target.schema.json', import.meta.url);
const executionSchemaUrl = new URL('../contract/schema/execution.schema.json', import.meta.url);
const EXECUTION_KINDS = Object.freeze(['python-script', 'python-module', 'library-only']);
/**
 * The runtime `scrollcase new` writes. Authoring is deliberately narrower than the format: the
 * wire vocabulary names every runtime the format defines, and this names the one a generated
 * scroll can actually be built from today.
 */
export const AUTHORED_RUNTIME_ID = 'python';
export const EXAMPLE_PIXI_VERSION = '0.73.0';
export const DEFAULT_SCROLL_VERSION = '1.0.0';

/**
 * The Python a new scroll asks for when nobody says otherwise.
 *
 * Deliberately one minor behind the newest Python conda-forge publishes, and deliberately a
 * committed constant rather than a version looked up at run time. conda-forge builds the heavy
 * compiled packages for a new minor months after the interpreter lands, so defaulting to the newest
 * hands a first-time user a solve that cannot succeed; and resolving over the network would make two
 * people running the same command in different months get different scrolls.
 * `scripts/bump-python-version.mjs` moves both constants at release time, and `--python-version`
 * overrides this one per scroll.
 */
export const DEFAULT_PYTHON_VERSION = '3.14';

/**
 * What `--python-version latest` means: the newest Python conda-forge published when this Scrollcase
 * release was cut.
 *
 * Also a committed constant, and for the same reason as the default. Asking the network on every
 * invocation would make the flag return different answers on different days, which is exactly what a
 * scroll exists to prevent — so `latest` resolves here, once, and the resolved number is written
 * into the scroll rather than the word.
 */
export const LATEST_PYTHON_VERSION = '3.15';

/**
 * Turns a requested Python version into the one a scroll records.
 *
 * @param {string | null | undefined} requested a version, `latest`, or nothing
 * @returns {string}
 */
export function resolvePythonVersion(requested) {
  if (requested === null || requested === undefined || requested === '') {
    return DEFAULT_PYTHON_VERSION;
  }
  return requested === 'latest' ? LATEST_PYTHON_VERSION : requested;
}

const TYPESCRIPT_CONSUMER_TEMPLATE = `/**
 * Runs a local box through the typed Node consumer.
 *
 * SETUP (once):
 *   npm install scrollcase
 *   npm install --save-dev tsx typescript
 *
 * RUN:
 *   npx tsx consumer-templates/run-box.ts
 *
 * Replace the placeholders below with the values scrollcase build printed.
 */
import { runBox } from 'scrollcase/consumer';

const releaseToRun =
  '.scrollcase/dist/boxes/<box-id>/<version>/<target>/<hash>.release.json';

runBox(releaseToRun, {
  publicPath: '.scrollcase/keys/signing-public.json',
  args: [],
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
  onPrepared: ({ boxId, version, targetId }) => {
    console.log(\`Running \${boxId} \${version} (\${targetId})\`);
  },
}).then((result) => {
  if (result.signal) console.error(\`Box exited after \${result.signal}.\`);
  process.exitCode = result.exitCode ?? 1;
});
`;

const CONSUMER_PACKAGE_JSON = `${JSON.stringify({
  private: true,
  type: 'module',
}, null, 2)}\n`;

const PYTHON_CONSUMER_TEMPLATE = `"""
Runs a local box through the typed Python consumer.

The Python consumer is published separately on PyPI.
npm install scrollcase does not install this Python package.

SETUP (once):

    python -m pip install scrollcase-consumer

RUN (from the project root):

    python consumer-templates/run_box.py

Replace the placeholders below with the values scrollcase build printed.
"""

from __future__ import annotations

import sys

from scrollcase_consumer import PreparedBox, run_box


RELEASE_TO_RUN = (
    ".scrollcase/dist/boxes/<box-id>/<version>/<target>/<hash>.release.json"
)


def _report(prepared: PreparedBox) -> None:
    print(
        f"Running {prepared.box_id} {prepared.version} ({prepared.target_id})"
    )


def main() -> int:
    result = run_box(
        RELEASE_TO_RUN,
        public_key_path=".scrollcase/keys/signing-public.json",
        args=[],
        on_prepared=_report,
    )

    if result.signal is not None:
        print(f"Box exited after {result.signal}.", file=sys.stderr)
    return result.exit_code if result.exit_code is not None else 1


if __name__ == "__main__":
    raise SystemExit(main())
`;

const RUST_CONSUMER_MANIFEST = `[package]
name = "scrollcase-consumer-template"
version = "0.1.0"
edition = "2021"
publish = false

[dependencies]
`;

const RUST_CONSUMER_TEMPLATE = `//! Runs a local box through the typed Rust consumer.
//!
//! SETUP (once, from the project root):
//!   cargo add --manifest-path consumer-templates/rust/Cargo.toml scrollcase-consumer
//!
//! RUN:
//!   cargo run --manifest-path consumer-templates/rust/Cargo.toml
//!
//! Replace the placeholders below with the values scrollcase build printed.

use std::error::Error;
use std::path::Path;

use scrollcase_consumer::run::{run_box, RunBoxOptions, RunOptions};
use scrollcase_consumer::trust::TrustAnchors;

const RELEASE_TO_RUN: &str =
    ".scrollcase/dist/boxes/<box-id>/<version>/<target>/<hash>.release.json";

fn main() -> Result<(), Box<dyn Error>> {
    let temporary_root = std::env::temp_dir();
    let result = run_box(
        Path::new(RELEASE_TO_RUN),
        &RunBoxOptions {
            trust: TrustAnchors::KeyFile(Path::new(".scrollcase/keys/signing-public.json")),
            archive: None,
            temporary_root: &temporary_root,
            run: RunOptions::default(),
        },
    )?;

    if let Some(signal) = result.signal {
        eprintln!("Box exited after {signal}.");
    }
    std::process::exit(result.exit_code.unwrap_or(1));
}
`;

async function ensureTextFile(path, contents) {
  await mkdir(dirname(path), { recursive: true });
  try {
    await writeFile(path, contents, { flag: 'wx' });
    return true;
  } catch (error) {
    if (error?.code === 'EEXIST') return false;
    throw error;
  }
}

function requiredText(value, name) {
  if (typeof value !== 'string' || value.trim() === '') fail(`${name} is required.`);
  return value.trim();
}

/**
 * A project-root-relative forward-slash path, or null when the file lies outside the project.
 *
 * Every source path a scroll names resolves from the project root, so a workspace configured to
 * keep its scrolls elsewhere cannot be described that way. Returning null lets the caller leave the
 * field out rather than write a path the reader would reject.
 */
function projectRelativePath(projectRoot, path) {
  const relativePath = relative(projectRoot, path);
  // A different Windows drive makes `relative` give up and return an absolute path.
  if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) return null;
  return relativePath.split(sep).join('/');
}

function pixiManifest(environmentName, target, runtimeVersion, runtimeId = AUTHORED_RUNTIME_ID) {
  // The workspace table is substrate — one channel, one platform, whatever the box runs. Only the
  // dependency line knows which runtime is being packed, and the runtime is what writes it.
  const runtime = runtimeBuilder(runtimeId).pixiDependency(runtimeVersion);
  return `# Solved by \`scrollcase lock\` into pixi.lock, which is committed and reviewed.
# \`platforms\` must equal the target's conda subdirectory, or the solve produces an environment
# that cannot run on the machine the box is for.
[workspace]
name = "${environmentName}"
channels = ["conda-forge"]
platforms = ["${condaSubdir(target)}"]

[dependencies]
${runtime.name} = "${runtime.spec}"
`;
}

async function validateScroll(scroll) {
  const [scrollSchema, targetSchema, executionSchema] = await Promise.all(
    [scrollSchemaUrl, targetSchemaUrl, executionSchemaUrl]
      .map(async (url) => JSON.parse(await readFile(url, 'utf8'))),
  );
  const error = schemaValidationError(scroll, scrollSchema, [targetSchema, executionSchema]);
  if (error) fail(`Generated scroll is invalid: ${error}.`);
}

/**
 * Creates one nested `<boxId>/<targetId>` scroll without overwriting any authored file.
 *
 * @param {object} options
 * @returns {Promise<{ written: string[], scroll: object, scrollDir: string, scrollRef: string,
 *   targetId: string, generatedScriptPath: string | null }>}
 */
export async function createScroll({
  workspace,
  boxId,
  target,
  labels = {},
  version,
  scrollVersion = DEFAULT_SCROLL_VERSION,
  sourceRevision,
  pythonVersion = DEFAULT_PYTHON_VERSION,
  pixiVersion,
  compatibility = {},
  assetBaseUrl,
  executionKind,
  scriptSourcePath = null,
  generateScript = false,
  generatedScriptSourcePath = null,
  scriptRelativePath = 'entrypoint.py',
  module = null,
  defaultArgs = [],
}) {
  if (!workspace?.configPath || !await fileExists(workspace.configPath)
    || !await fileExists(workspace.scrollsDir)) {
    fail('No initialized Scrollcase workspace; run scrollcase init first.');
  }

  const identity = {
    boxId: requiredText(boxId, 'boxId'),
    version: requiredText(version, 'version'),
    scrollVersion: requiredText(scrollVersion, 'scrollVersion'),
    sourceRevision: requiredText(sourceRevision, 'sourceRevision'),
    pythonVersion: requiredText(pythonVersion, 'pythonVersion'),
    pixiVersion: requiredText(pixiVersion, 'pixiVersion'),
    // Required whether or not any asset is deferred: the release manifest names the archive's own
    // published URL, not just the assets'.
    assetBaseUrl: requiredText(assetBaseUrl, 'assetBaseUrl'),
  };
  if (!compatibility || typeof compatibility !== 'object' || Array.isArray(compatibility)) {
    fail('compatibility must be an object.');
  }
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) {
    fail('labels must be an object.');
  }
  if (!EXECUTION_KINDS.includes(executionKind)) {
    fail(`Unsupported execution kind: ${executionKind}. Use ${EXECUTION_KINDS.join(', ')}.`);
  }
  if (!Array.isArray(defaultArgs) || defaultArgs.some((value) => typeof value !== 'string')) {
    fail('defaultArgs must be an array of strings.');
  }

  // Rejects an unknown target here, before anything is written.
  boxTargetAdapter(target);
  const targetId = boxTargetId(target);
  const scrollRef = `${identity.boxId}/${targetId}`;
  const scrollDir = join(workspace.scrollsDir, identity.boxId, targetId);
  if (await fileExists(scrollDir)) fail(`Scroll already exists: ${scrollRef}.`);

  let localFile = null;
  let execution;
  let generatedScriptPath = null;
  let generatedSource = null;
  if (executionKind === 'python-script') {
    if (generateScript && scriptSourcePath) {
      fail('Choose either an existing script or --generate-script, not both.');
    }
    if (!generateScript && !scriptSourcePath) {
      fail('python-script execution requires an existing script or --generate-script.');
    }
    const relativePath = safeRelativePath(scriptRelativePath);
    let sourcePath;
    if (generateScript) {
      sourcePath = safeRelativePath(generatedScriptSourcePath
        ?? `box-entrypoints/${identity.boxId}/${targetId}/entrypoint.py`);
      generatedScriptPath = join(workspace.root, ...sourcePath.split('/'));
      if (await fileExists(generatedScriptPath)) {
        fail(`Generated script already exists: ${sourcePath}.`);
      }
      generatedSource = runtimeBuilder(AUTHORED_RUNTIME_ID).templates.script;
    } else {
      sourcePath = safeRelativePath(scriptSourcePath);
      const source = join(workspace.root, ...sourcePath.split('/'));
      let details;
      try {
        details = await lstat(source);
      } catch {
        fail(`Project script is missing: ${sourcePath}.`);
      }
      if (!details.isFile() || details.isSymbolicLink()) {
        fail(`Project script must be a regular file: ${sourcePath}.`);
      }
    }
    // No sha256: this file is the one the author is about to start editing, and pinning it here
    // would make the first edit fail the build. A project pins a file it wants frozen by adding the
    // hash itself.
    localFile = { sourcePath, relativePath };
    execution = { kind: 'python-script', script: relativePath, defaultArgs: [...defaultArgs] };
  } else if (executionKind === 'python-module') {
    execution = {
      kind: 'python-module',
      module: requiredText(module, 'module'),
      defaultArgs: [...defaultArgs],
    };
  } else if (module || scriptSourcePath || generateScript || defaultArgs.length > 0) {
    fail('library-only execution cannot declare a script, module, or default arguments.');
  }

  // Everything the target or the identity already determines is left out: a generated scroll should
  // read like the decisions its author made, and `readScroll` derives the rest. What stays is what a
  // person had to choose.
  const selfTestPath = projectRelativePath(workspace.root, join(scrollDir, 'self_test.py'));
  const scroll = {
    $schema: 'https://scrollcase.dev/schema/v3/scroll.schema.json',
    schemaVersion: BOX_SCHEMA_VERSION,
    boxId: identity.boxId,
    ...(Object.keys(labels).length > 0 ? { labels: { ...labels } } : {}),
    version: identity.version,
    sourceRevision: identity.sourceRevision,
    target,
    ...(identity.scrollVersion === DEFAULT_SCROLL_VERSION
      ? {}
      : { scrollVersion: identity.scrollVersion }),
    ...(Object.keys(compatibility).length > 0 ? { compatibility: { ...compatibility } } : {}),
    runtime: { id: AUTHORED_RUNTIME_ID, version: identity.pythonVersion },
    pixiVersion: identity.pixiVersion,
    assetBaseUrl: identity.assetBaseUrl,
    selfTest: {
      imports: ['json'],
      ...(localFile ? { files: [localFile.relativePath] } : {}),
      ...(selfTestPath ? { script: selfTestPath } : {}),
    },
    ...(localFile ? { localFiles: [localFile] } : {}),
    ...(execution ? { execution } : {}),
  };
  await validateScroll(scroll);

  const boxDir = dirname(scrollDir);
  await mkdir(boxDir, { recursive: true });
  const staging = await mkdtemp(join(boxDir, '.scrollcase-new-'));
  let generatedWritten = false;
  try {
    await writeFile(join(staging, 'scroll.json'), `${JSON.stringify(scroll, null, 2)}\n`);
    await writeFile(
      join(staging, 'pixi.toml'),
      pixiManifest(`${identity.boxId}-${targetId}`, target, identity.pythonVersion),
    );
    if (selfTestPath) {
      await writeFile(
        join(staging, 'self_test.py'),
        runtimeBuilder(AUTHORED_RUNTIME_ID).templates.selfTest,
      );
    }
    if (generatedScriptPath) {
      await mkdir(dirname(generatedScriptPath), { recursive: true });
      await writeFile(generatedScriptPath, generatedSource, { flag: 'wx' });
      generatedWritten = true;
    }
    await rename(staging, scrollDir);
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (generatedWritten) await rm(generatedScriptPath, { force: true });
    throw error;
  }

  const written = [
    join(scrollDir, 'scroll.json'),
    join(scrollDir, 'pixi.toml'),
    ...(selfTestPath ? [join(scrollDir, 'self_test.py')] : []),
    ...(generatedScriptPath ? [generatedScriptPath] : []),
  ];
  return { written, scroll, scrollDir, scrollRef, targetId, generatedScriptPath };
}

/**
 * Ensures the disposable example created by `init` exists for one native target.
 *
 * The example uses the same authoring path as every real scroll. An existing target directory is
 * treated as authored input and left untouched, including when a user has edited the starter.
 *
 * @param {{ workspace: object, target: object, pixiVersion?: string }} options
 * @returns {Promise<object>}
 */
export async function ensureExampleScroll({
  workspace,
  target,
  pixiVersion = EXAMPLE_PIXI_VERSION,
}) {
  const targetId = boxTargetId(target);
  const scrollRef = `example-box/${targetId}`;
  const scrollDir = join(workspace.scrollsDir, 'example-box', targetId);
  if (await fileExists(scrollDir)) {
    return {
      created: false,
      written: [],
      scrollDir,
      scrollRef,
      targetId,
      generatedScriptPath: null,
    };
  }
  return {
    created: true,
    ...await createScroll({
      workspace,
      boxId: 'example-box',
      target,
      version: '1.0.0',
      sourceRevision: 'example-source-1.0.0',
      pixiVersion,
      compatibility: { minHostAppVersion: '1.0.0' },
      assetBaseUrl: 'https://example.org/boxes',
      executionKind: 'python-script',
      generateScript: true,
    }),
  };
}

/**
 * Writes the three consumer templates, without overwriting anything already there.
 *
 * Separate from the example on purpose. A project that declined a throwaway demo still has an
 * application to write against its boxes, and these are that application's starting point: the same
 * verification, extraction and execution call in Node, Python and Rust, against a release path the
 * author fills in. They name no particular box for the same reason — the box they will run is the
 * project's own, not the one `init` may have scaffolded beside them.
 *
 * @param {{ workspace: object }} options
 * @returns {Promise<{ written: string[] }>}
 */
export async function ensureConsumerTemplates({ workspace }) {
  const consumerFiles = [
    [join(workspace.root, 'package.json'), CONSUMER_PACKAGE_JSON],
    [join(workspace.root, 'consumer-templates', 'run-box.ts'), TYPESCRIPT_CONSUMER_TEMPLATE],
    [join(workspace.root, 'consumer-templates', 'run_box.py'), PYTHON_CONSUMER_TEMPLATE],
    [join(workspace.root, 'consumer-templates', 'rust', 'Cargo.toml'), RUST_CONSUMER_MANIFEST],
    [join(workspace.root, 'consumer-templates', 'rust', 'src', 'main.rs'), RUST_CONSUMER_TEMPLATE],
    [join(workspace.root, 'consumer-templates', 'rust', '.gitignore'), '/target/\n'],
  ];
  const written = [];
  for (const [path, contents] of consumerFiles) {
    if (await ensureTextFile(path, contents)) written.push(path);
  }
  return { written };
}
