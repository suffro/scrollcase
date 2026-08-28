/**
 * Interactive and scripted input collection for `scrollcase new scroll`.
 *
 * This is a CLI-edge module: finite decisions use the shared navigable menu, free-form values use
 * explicit text prompts, and a non-terminal process must provide every material value as a flag.
 * The build layer receives one complete object and never reads a terminal.
 *
 * Only what nobody else can answer is asked. An identity that follows from the box name, a version
 * with an obvious starting point, and the pixi already installed are defaults, not questions —
 * every one of them is still a flag for the caller who cares. A session that asked nine questions to
 * produce a file whose answers were nearly all forced is a session that taught the user the tool is
 * tedious.
 */

import { createInterface } from 'node:readline/promises';
import { runtimeAdapters } from './contract/runtimes.mjs';
import {
  DEFAULT_RUNTIME_ID,
  EXAMPLE_PIXI_VERSION,
  authoredExecutionKinds,
  resolveRuntimeVersion,
} from './build/authoring.mjs';
import { probePixi } from './build/pixi.mjs';
import { fail } from './build/process.mjs';
import { chooseCliValue } from './cli-menu.mjs';
import { promptHeading, promptMarker } from './cli-output.mjs';
import { chooseTarget, cliTargetFamilies, parseCliTarget } from './cli-targets.mjs';

const MAX_PROMPT_ATTEMPTS = 5;

/**
 * One line of prose per question, printed above it.
 *
 * A field name is a label, not an explanation. `sourceRevision` and `assetBaseUrl` in particular
 * mean nothing to someone meeting the tool for the first time, and a wrong answer to either is
 * recorded in a signed document. Kept to a single line each: a paragraph in front of every prompt
 * is skipped as reliably as no help at all.
 */
const HINTS = Object.freeze({
  target: 'The OS, architecture and accelerator this box is built for. One box, one target.',
  cudaVersion: 'The CUDA ABI to build against. It is part of the box identity, so 12.4 and 12.8 are different boxes.',
  boxId: 'Name of the box across all its versions. Used in its directory, its archives and its channel pointer.',
  sourceRevision: 'Which version of the thing you are packaging this is — a model commit, a release tag. Recorded verbatim in the box provenance.',
  assetBaseUrl: 'Where you will publish built boxes. The signed release points at it; it does not have to exist yet.',
  runtime: 'What runs inside the box. python and node bring an interpreter; native runs a binary you compiled yourself.',
  execution: 'What `scrollcase run` starts inside the box: a file, an importable module, or nothing at all.',
  scriptSource: 'Point at a file you already have, or start from a generated stub.',
  scriptPath: 'Path from the project root to the file the box should run.',
  binaryPath: 'Path from the project root to the compiled executable the box should run.',
  module: 'Dotted name of a module importable inside the box, run with python -m.',
});

/** Host-constraint flags, and the `compatibility` field each one sets. */
const COMPATIBILITY_FLAGS = Object.freeze({
  'min-host-app-version': 'minHostAppVersion',
  'max-host-app-version-exclusive': 'maxHostAppVersionExclusive',
  'min-macos-version': 'minMacosVersion',
  'min-nvidia-driver-version': 'minNvidiaDriverVersion',
});

const flagText = (flags, name) => {
  if (!flags.has(name)) return null;
  const value = flags.get(name);
  if (typeof value !== 'string' || value.trim() === '') fail(`--${name} requires a value.`);
  return value.trim();
};

/**
 * Asks once, and keeps asking until a required answer arrives.
 *
 * Aborting on an empty answer threw away every value already typed and sent the user back to the
 * first question, which punishes a slip far out of proportion to it. Repeating the question costs
 * one line and keeps the session's work.
 */
export async function promptText(question, {
  defaultValue = null,
  hint = null,
  optional = false,
  input = process.stdin,
  output = process.stdout,
} = {}) {
  const readline = createInterface({ input, output });
  try {
    const marker = promptMarker({ stream: output });
    const suffix = defaultValue === null ? '' : `[${defaultValue}] `;
    // The name and its explanation are printed once, above the loop: a field name alone rarely says
    // what the field is for, and repeating the whole explanation on every retry would bury the
    // answer the user is being asked for. A retry restates what is required and re-marks the line.
    output.write(promptHeading(question, { hint, stream: output }));
    // Bounded, so an input stream that only ever yields blank lines ends in an error rather than a
    // loop nobody can interrupt.
    for (let attempt = 0; attempt < MAX_PROMPT_ATTEMPTS; attempt += 1) {
      const value = String(await readline.question(`${marker}${suffix}`)).trim();
      if (value) return value;
      if (defaultValue !== null) return defaultValue;
      if (optional) return null;
      output.write(`${question} is required.\n`);
    }
    fail(`${question} is required.`);
  } finally {
    readline.close();
  }
}

/**
 * `--labels` as the JSON object it is, matching `--default-args` rather than inventing a second
 * spelling for structured input. Scrollcase never reads a label, so nothing here interprets one
 * beyond checking that it is a string keyed by a string.
 */
function parseLabels(value) {
  if (value === null) return {};
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    fail('--labels must be a JSON object of string values.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)
    || Object.values(parsed).some((item) => typeof item !== 'string')) {
    fail('--labels must be a JSON object of string values.');
  }
  return parsed;
}

function parseDefaultArgs(value) {
  if (value === null) return [];
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    fail('--default-args must be a JSON array of strings.');
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    fail('--default-args must be a JSON array of strings.');
  }
  return parsed;
}

async function collectTarget(flags, { terminal, ask, chooseTargetValue }) {
  const requested = flagText(flags, 'target');
  if (requested) return parseCliTarget(requested);
  if (!terminal) fail('new scroll requires --target <targetId> without a terminal.');

  const selected = await chooseTargetValue(cliTargetFamilies(), {
    terminal: true,
    hint: HINTS.target,
  });
  if (selected.target.accelerator !== 'cuda') return parseCliTarget(selected.targetId);
  const cudaVersion = await ask('CUDA version (major.minor)', { hint: HINTS.cudaVersion });
  return parseCliTarget(`${selected.targetId}${cudaVersion}`);
}

/**
 * Collects a complete `createScroll` argument object from flags or interactive prompts.
 *
 * @param {ReadonlyMap<string, unknown>} flags
 * @param {object} [options]
 * @returns {Promise<object>}
 */
export async function collectNewScrollOptions(flags, {
  terminal = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  ask = promptText,
  choose = chooseCliValue,
  chooseTargetValue = chooseTarget,
  probe = probePixi,
} = {}) {
  const required = async (flag, question, hint) => {
    const supplied = flagText(flags, flag);
    if (supplied !== null) return supplied;
    if (!terminal) fail(`new scroll requires --${flag} <value> without a terminal.`);
    return ask(question, { hint });
  };
  /** A value with a defensible default: taken from the flag, otherwise settled without asking. */
  const derived = (flag, defaultValue) => flagText(flags, flag) ?? defaultValue;
  const finite = async (flag, question, choices, hint) => {
    const supplied = flagText(flags, flag);
    if (!supplied && !terminal) {
      fail(`new scroll requires --${flag} <${choices.join('|')}> without a terminal.`);
    }
    return choose(question, choices, { flag: supplied, hint, terminal });
  };

  const target = await collectTarget(flags, { terminal, ask, chooseTargetValue });
  // Asked first among the box's own decisions, because it decides which of the later questions
  // exist: a native box is never asked for a module, and is never offered a generated stub.
  // Not `finite`: this is the one closed choice with a defensible default, so a scripted session
  // that never mentioned a runtime keeps working and gets the runtime it has always got.
  const runtimeIds = runtimeAdapters().map((runtime) => runtime.id);
  if (runtimeIds[0] !== DEFAULT_RUNTIME_ID) {
    fail('The runtime menu must offer the default first; it is what a non-terminal session gets.');
  }
  const runtimeId = await choose('runtime', runtimeIds, {
    flag: flagText(flags, 'runtime'),
    hint: HINTS.runtime,
    terminal,
  });
  const boxId = await required('box-id', 'Box ID', HINTS.boxId);
  // The upstream revision is the one identity nothing here can supply: it names the version of the
  // thing being packaged, and inventing it would put a false claim into the box's provenance.
  const sourceRevision = await required('source-revision', 'Upstream revision', HINTS.sourceRevision);
  const version = derived('version', '1.0.0');
  const scrollVersion = derived('scroll-version', undefined);
  const runtimeVersion = resolveRuntimeVersion(runtimeId, flagText(flags, 'runtime-version'));
  // Pinning the pixi that is actually installed: `findPixi` refuses to build with any other, so a
  // pinned version the machine does not have is a scroll that cannot be built where it was written.
  const pixiVersion = derived('pixi-version', probe()?.version ?? EXAMPLE_PIXI_VERSION);
  // Host constraints are flags only. They are the fields most authors leave empty, and prompting for
  // four of them taught every user to press Enter four times before reaching the questions that
  // matter. A project that has a constraint states it; a project that has none says nothing.
  const compatibility = {};
  for (const [flag, field] of Object.entries(COMPATIBILITY_FLAGS)) {
    const value = flagText(flags, flag);
    if (value) compatibility[field] = value;
  }
  const minRam = flagText(flags, 'min-ram-gb');
  if (minRam !== null) {
    const minRamGb = Number(minRam);
    if (!Number.isFinite(minRamGb) || minRamGb <= 0) fail('--min-ram-gb must be a positive number.');
    compatibility.minRamGb = minRamGb;
  }
  // Not derivable and not optional: the signed release names the URL the archive itself is published
  // under, so a build has nowhere to point without it.
  const assetBaseUrl = await required('asset-base-url', 'Asset base URL', HINTS.assetBaseUrl);
  // Free-form annotations, flags only and empty by default. Scrollcase reads none of them, so
  // prompting for one would be asking the author to fill in a field on the tool's behalf.
  const labels = parseLabels(flagText(flags, 'labels'));
  const executionKind = await finite(
    'execution',
    'execution kind',
    authoredExecutionKinds(runtimeId),
    HINTS.execution,
  );
  const defaultArgs = parseDefaultArgs(flagText(flags, 'default-args'));

  const result = {
    boxId,
    target,
    labels,
    version,
    scrollVersion,
    sourceRevision,
    runtimeId,
    runtimeVersion,
    pixiVersion,
    compatibility,
    assetBaseUrl,
    executionKind,
    defaultArgs,
  };
  if (executionKind === 'python-module') {
    result.module = await required('module', 'Python module', HINTS.module);
  } else if (executionKind !== 'library-only') {
    // Every remaining kind names a payload file. Whether Scrollcase can write a starter for it is
    // the runtime's answer: it generates source, and it does not generate compiled binaries.
    const generable = executionKind !== 'native-binary';
    const noun = generable ? 'script' : 'binary';
    const existing = flagText(flags, 'script');
    const generateScript = Boolean(flags.get('generate-script'));
    if (existing && generateScript) {
      fail('Choose either --script <path> or --generate-script, not both.');
    }
    if (generateScript && !generable) {
      fail(`Scrollcase cannot generate a ${noun}; point --script at the one you built.`);
    }
    if (existing) result.scriptSourcePath = existing;
    else if (generateScript) result.generateScript = true;
    else if (!terminal) {
      fail(`${executionKind} execution requires --script <path>${generable ? ' or --generate-script' : ''} without a terminal.`);
    } else if (!generable) {
      result.scriptSourcePath = await ask('Binary path', { hint: HINTS.binaryPath });
    } else {
      const source = await choose(
        'script source',
        ['existing project script', 'generate starter script'],
        { hint: HINTS.scriptSource, terminal: true },
      );
      if (source === 'existing project script') {
        result.scriptSourcePath = await ask('Script path', { hint: HINTS.scriptPath });
      } else result.generateScript = true;
    }
    const destination = flagText(flags, 'script-destination');
    if (destination) result.scriptRelativePath = destination;
    const generatedScriptSourcePath = flagText(flags, 'generated-script-path');
    if (generatedScriptSourcePath) result.generatedScriptSourcePath = generatedScriptSourcePath;
  }
  return result;
}
