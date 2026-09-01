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
 * self-test is written as a real source file in the runtime's own language rather than escaped into
 * a JSON string. Which language that is, what the starter says, and whether there is one at all are
 * the runtime's answers: a native box has no source to generate, so it is pointed at a binary that
 * already exists.
 */

import { lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { boxTargetAdapter, boxTargetId, condaSubdir } from '../contract/targets.mjs';
import { BOX_SCHEMA_VERSION } from '../contract/documents.mjs';
import { isImplementedRuntime, runtimeAdapter, unimplementedRuntimeMessage } from '../contract/runtimes.mjs';
import { runtimeBuilder } from '../runtimes/index.mjs';
import { fileExists, safeRelativePath } from './filesystem.mjs';
import { fail } from './process.mjs';
import { schemaValidationError } from './schema-validation.mjs';

const scrollSchemaUrl = new URL('../contract/schema/scroll.schema.json', import.meta.url);
const targetSchemaUrl = new URL('../contract/schema/target.schema.json', import.meta.url);
const executionSchemaUrl = new URL('../contract/schema/execution.schema.json', import.meta.url);
/**
 * A box with no entry point at all: the one execution choice that belongs to no runtime, because it
 * is the choice not to declare one. Offered wherever it makes sense, which is wherever the box can
 * still prove something about itself without being started.
 */
const LIBRARY_ONLY = 'library-only';

/**
 * The runtime `scrollcase new` writes when nobody says otherwise.
 *
 * Python, because it is what the overwhelming majority of boxes are and because a default that
 * silently changed under existing users would be a worse kind of surprise than typing a flag.
 */
export const DEFAULT_RUNTIME_ID = 'python';
export const EXAMPLE_PIXI_VERSION = '0.73.0';
export const DEFAULT_SCROLL_VERSION = '1.0.0';

/**
 * What `scrollcase new scroll --execution` may be given, per runtime.
 *
 * Derived from the runtime's own execution kinds rather than listed here, so a runtime cannot be
 * offered a shape it does not define. `library-only` is added for the runtimes that can still
 * self-test without it — a native box cannot, since a command probe is its only probe and a command
 * probe needs an execution to invoke, so offering the choice would be offering an invalid scroll.
 *
 * @param {string} runtimeId
 * @returns {string[]}
 */
export function authoredExecutionKinds(runtimeId) {
  const kinds = [...runtimeAdapter(runtimeId).executionKinds];
  return runtimeAdapter(runtimeId).selfTestProbeKinds.includes('imports')
    ? [...kinds, LIBRARY_ONLY]
    : kinds;
}

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
 * The Node a new scroll asks for, and what `latest` means for it.
 *
 * Same reasoning as the Python pair above, applied to a project that releases differently: Node's
 * even-numbered lines are the ones with long-term support, so the default is the current LTS rather
 * than one minor behind the newest. conda-forge builds both.
 */
export const DEFAULT_NODE_VERSION = '22';
export const LATEST_NODE_VERSION = '24';

/**
 * The version a generated scroll asks for, per runtime, and what `latest` resolves to.
 *
 * `native` has neither, and that is not an omission: there is no runtime to install, so there is no
 * version to pin, and `runtime.version` is legitimately absent from the scroll it writes.
 */
const RUNTIME_VERSIONS = Object.freeze({
  python: Object.freeze({ default: DEFAULT_PYTHON_VERSION, latest: LATEST_PYTHON_VERSION }),
  node: Object.freeze({ default: DEFAULT_NODE_VERSION, latest: LATEST_NODE_VERSION }),
  native: null,
});

/**
 * Turns a requested runtime version into the one a scroll records.
 *
 * @param {string} runtimeId
 * @param {string | null | undefined} requested a version, `latest`, or nothing
 * @returns {string | null} null for a runtime that has no version to record
 */
export function resolveRuntimeVersion(runtimeId, requested) {
  const versions = RUNTIME_VERSIONS[runtimeId];
  const asked = requested === '' ? null : requested ?? null;
  if (!versions) {
    if (asked !== null) fail(`The ${runtimeId} runtime installs no interpreter, so it has no version to pin.`);
    return null;
  }
  if (asked === null) return versions.default;
  return asked === 'latest' ? versions.latest : asked;
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

function pixiManifest(environmentName, target, runtimeVersion, runtimeId) {
  // The workspace table is substrate — one channel, one platform, whatever the box runs. Only the
  // dependency line knows which runtime is being packed, and the runtime is what writes it. A
  // runtime that installs nothing of its own writes none, and the table is left for the author:
  // a native box's environment holds the libraries its binary links against and nothing else, and
  // only the person who compiled it knows what those are.
  const runtime = runtimeBuilder(runtimeId).pixiDependency(runtimeVersion);
  const dependencies = runtime
    ? `${runtime.name} = "${runtime.spec}"\n`
    : '# Add the libraries this box\'s binary links against.\n';
  return `# Solved by \`scrollcase lock\` into pixi.lock, which is committed and reviewed.
# \`platforms\` must equal the target's conda subdirectory, or the solve produces an environment
# that cannot run on the machine the box is for.
[workspace]
name = "${environmentName}"
channels = ["conda-forge"]
platforms = ["${condaSubdir(target)}"]

[dependencies]
${dependencies}`;
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
 * What a box id may look like, in words rather than as a regular expression.
 *
 * Shown in the prompt and repeated when an answer is refused. A user meeting the tool does not read
 * `^[a-z0-9]+(?:[-.][a-z0-9]+)*$` and know what to type.
 */
export const BOX_ID_SHAPE =
  'lower-case letters and digits, separated by single hyphens or dots — for example my-model or acme.my-model';

let identifierPattern;

/**
 * Why a box id is unacceptable, or null when it is fine.
 *
 * The rule comes out of the schema rather than being restated here: two statements of one pattern
 * are two things that can disagree, and the whole point of checking early is that the early answer
 * matches the late one. `validateScroll` still has the last word — this only moves the *first* word
 * to the prompt that produced the value, because the schema's own report arrives after every other
 * question has been answered and says only that the value "does not match the required pattern".
 *
 * @param {unknown} value
 * @returns {Promise<string | null>}
 */
export async function boxIdProblem(value) {
  identifierPattern ??= readFile(scrollSchemaUrl, 'utf8')
    .then((text) => JSON.parse(text).$defs.identifier.pattern);
  const source = await identifierPattern;
  if (typeof value !== 'string' || value.trim() === '') return 'Box ID is required.';
  const trimmed = value.trim();
  if (new RegExp(source).test(trimmed)) return null;
  return `${trimmed} is not a usable box ID. Use ${BOX_ID_SHAPE}.`;
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
  runtimeId = DEFAULT_RUNTIME_ID,
  runtimeVersion,
  pixiVersion,
  compatibility = {},
  publishBaseUrl,
  executionKind,
  scriptSourcePath = null,
  // A payload-relative path to an entry point the dependency solve already provides, instead of a
  // project file to copy in. Mutually exclusive with the two above.
  environmentPath = null,
  generateScript = false,
  generatedScriptSourcePath = null,
  scriptRelativePath = null,
  module = null,
  defaultArgs = [],
}) {
  if (!workspace?.configPath || !await fileExists(workspace.configPath)
    || !await fileExists(workspace.scrollsDir)) {
    fail('No initialized Scrollcase workspace; run scrollcase init first.');
  }

  if (!isImplementedRuntime(runtimeId)) fail(unimplementedRuntimeMessage(runtimeId));
  const builder = runtimeBuilder(runtimeId);
  const resolvedRuntimeVersion = runtimeVersion === undefined
    ? resolveRuntimeVersion(runtimeId, null)
    : resolveRuntimeVersion(runtimeId, runtimeVersion);
  const identity = {
    boxId: requiredText(boxId, 'boxId'),
    version: requiredText(version, 'version'),
    scrollVersion: requiredText(scrollVersion, 'scrollVersion'),
    sourceRevision: requiredText(sourceRevision, 'sourceRevision'),
    runtimeVersion: resolvedRuntimeVersion === null
      ? null
      : requiredText(resolvedRuntimeVersion, 'runtimeVersion'),
    pixiVersion: requiredText(pixiVersion, 'pixiVersion'),
    // Optional, exactly as the schema has it. A build does need one — the release manifest names the
    // archive's own published URL, not just the assets' — but it may arrive later, from `edit scroll`
    // or from `build --publish-base-url`, and a box that never gets one is simply local: its release
    // and channel carry no links. Demanding it here instead made the one field nobody knows on day
    // one block writing a scroll at all, and invited a placeholder URL into a document whose whole
    // value is that it is true.
    publishBaseUrl: publishBaseUrl === undefined || publishBaseUrl === null || String(publishBaseUrl).trim() === ''
      ? null
      : String(publishBaseUrl).trim(),
  };
  if (!compatibility || typeof compatibility !== 'object' || Array.isArray(compatibility)) {
    fail('compatibility must be an object.');
  }
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) {
    fail('labels must be an object.');
  }
  const executionKinds = authoredExecutionKinds(runtimeId);
  if (!executionKinds.includes(executionKind)) {
    fail(`Unsupported execution kind for a ${runtimeId} box: ${executionKind}. Use ${executionKinds.join(', ')}.`);
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

  // Every kind that names a payload file — a Python script, a Node script, a compiled binary —
  // resolves the same way: an existing project file, or one Scrollcase writes a starter for. Only
  // the field it lands in and whether generation is possible differ, so the shape is stated once
  // and the differences are read off the runtime.
  const FILE_KINDS = Object.freeze({
    'python-script': { field: 'script', executable: false },
    'node-script': { field: 'script', executable: false },
    // The one entry that needs the bit. A native box runs this file directly, and a downloaded or
    // copied file carries no mode of its own — so if the scroll does not say it is executable, the
    // archive will not mark it and the box will not start.
    'native-binary': { field: 'binary', executable: true },
  });

  let localFile = null;
  let execution;
  let generatedScriptPath = null;
  let generatedSource = null;
  const fileKind = FILE_KINDS[executionKind];
  if (fileKind && environmentPath) {
    // The entry point is already in the payload because a package put it there — conda-forge's
    // `venv/bin/ffmpeg`, a console script the solve generated. Nothing is staged and no `localFiles`
    // entry appears: there is no file of the author's to copy, and inventing one would claim the
    // project ships something it does not.
    //
    // This case existed in the format from the start — every `native` example in this repository
    // uses it — but not in the authoring surface, which assumed a file-naming execution always
    // pointed at a project file. Writing one meant editing `scroll.json` by hand.
    if (scriptSourcePath || generateScript) {
      fail('Choose either a file from the environment or one from this project, not both.');
    }
    execution = {
      kind: executionKind,
      [fileKind.field]: safeRelativePath(environmentPath),
      defaultArgs: [...defaultArgs],
    };
  } else if (fileKind) {
    if (generateScript && scriptSourcePath) {
      fail('Choose either an existing file or --generate-script, not both.');
    }
    if (generateScript && !builder.templates) {
      fail(`Scrollcase cannot generate an entry point for a ${runtimeId} box; point --script at the binary you built.`);
    }
    if (!generateScript && !scriptSourcePath) {
      fail(`${executionKind} execution requires an existing file${builder.templates ? ' or --generate-script' : ''}.`);
    }
    const defaultFileName = builder.templates?.scriptFileName ?? 'entrypoint';
    const relativePath = safeRelativePath(scriptRelativePath ?? defaultFileName);
    let sourcePath;
    if (generateScript) {
      sourcePath = safeRelativePath(generatedScriptSourcePath
        ?? `box-entrypoints/${identity.boxId}/${targetId}/${defaultFileName}`);
      generatedScriptPath = join(workspace.root, ...sourcePath.split('/'));
      if (await fileExists(generatedScriptPath)) {
        fail(`Generated script already exists: ${sourcePath}.`);
      }
      generatedSource = builder.templates.script;
    } else {
      sourcePath = safeRelativePath(scriptSourcePath);
      const source = join(workspace.root, ...sourcePath.split('/'));
      let details;
      try {
        details = await lstat(source);
      } catch {
        fail(`Project file is missing: ${sourcePath}.`);
      }
      if (!details.isFile() || details.isSymbolicLink()) {
        fail(`Project file must be a regular file: ${sourcePath}.`);
      }
    }
    // No sha256: this file is the one the author is about to start editing, and pinning it here
    // would make the first edit fail the build. A project pins a file it wants frozen by adding the
    // hash itself.
    localFile = { sourcePath, relativePath, ...(fileKind.executable ? { executable: true } : {}) };
    execution = {
      kind: executionKind,
      [fileKind.field]: relativePath,
      defaultArgs: [...defaultArgs],
    };
  } else if (executionKind === 'python-module') {
    execution = {
      kind: 'python-module',
      module: requiredText(module, 'module'),
      defaultArgs: [...defaultArgs],
    };
  } else if (module || scriptSourcePath || environmentPath || generateScript || defaultArgs.length > 0) {
    fail('library-only execution cannot declare a script, module, or default arguments.');
  }

  // Everything the target or the identity already determines is left out: a generated scroll should
  // read like the decisions its author made, and `readScroll` derives the rest. What stays is what a
  // person had to choose.
  // The generated probe is the weakest true statement the runtime can make about a fresh box: for
  // one with a module system, that its own standard library loads; for one without, that the binary
  // the scroll names starts and exits cleanly. Both are placeholders the author is meant to replace,
  // and neither pretends to have checked anything the box actually does.
  const selfTestPath = builder.templates
    ? projectRelativePath(workspace.root, join(scrollDir, builder.templates.selfTestFileName))
    : null;
  const probe = builder.templates
    ? { imports: [builder.templates.starterImport] }
    : { commands: [{ args: [] }] };
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
    runtime: {
      id: runtimeId,
      ...(identity.runtimeVersion === null ? {} : { version: identity.runtimeVersion }),
    },
    pixiVersion: identity.pixiVersion,
    ...(identity.publishBaseUrl === null ? {} : { publishBaseUrl: identity.publishBaseUrl }),
    selfTest: {
      ...probe,
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
      pixiManifest(`${identity.boxId}-${targetId}`, target, identity.runtimeVersion, runtimeId),
    );
    if (selfTestPath) {
      await writeFile(join(staging, builder.templates.selfTestFileName), builder.templates.selfTest);
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
    ...(selfTestPath ? [join(scrollDir, builder.templates.selfTestFileName)] : []),
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
      publishBaseUrl: 'https://example.org/boxes',
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
