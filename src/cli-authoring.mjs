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
  BOX_ID_SHAPE,
  DEFAULT_RUNTIME_ID,
  EXAMPLE_PIXI_VERSION,
  authoredExecutionKinds,
  boxIdProblem,
  resolveRuntimeVersion,
} from './build/authoring.mjs';
import { probePixi } from './build/pixi.mjs';
import { fail } from './build/process.mjs';
import { questionDocs } from './cli-docs.mjs';
import { chooseCliValue } from './cli-menu.mjs';
import { promptHeading, promptMarker } from './cli-output.mjs';
import { chooseTarget, cliTargetFamilies, parseCliTarget } from './cli-targets.mjs';

const MAX_PROMPT_ATTEMPTS = 5;

/**
 * One line of prose per question, printed above it.
 *
 * A field name is a label, not an explanation. `sourceRevision` and `publishBaseUrl` in particular
 * mean nothing to someone meeting the tool for the first time, and a wrong answer to either is
 * recorded in a signed document. Kept to a single line each: a paragraph in front of every prompt
 * is skipped as reliably as no help at all.
 */
const HINTS = Object.freeze({
  target: 'The OS, architecture and accelerator this box is built for. One box, one target.',
  cudaVersion: 'The CUDA ABI to build against. It is part of the box identity, so 12.4 and 12.8 are different boxes.',
  boxId: `Name of the box across all its versions. Used in its directory, its archives and its channel pointer. ${BOX_ID_SHAPE}.`,
  sourceRevision: 'Which version of the thing you are packaging this is — a model commit, a release tag. Recorded verbatim in the box provenance.',
  publishBaseUrl: 'Where you will publish built boxes, so the signed documents can point at each other. Optional — press Enter, and a box you only run locally never needs one.',
  runtime: 'What runs inside the box. python and node bring an interpreter; native runs a binary you compiled yourself.',
  scriptSource: 'Start from a generated stub, or point at a file you already have.',
  binarySource: 'A program a package installs into the box, or one you compiled and keep in this project.',
  environmentPath: 'Path inside the box to the program the dependency solve installs, such as venv/bin/ffmpeg.',
  scriptPath: 'Path from the project root to the file the box should run.',
  binaryPath: 'Path from the project root to the compiled executable the box should run.',
  module: 'Dotted name of a module importable inside the box, run with python -m.',
});

/**
 * What each execution kind means, in the words someone choosing between them needs.
 *
 * The hint above the menu is assembled from the kinds actually offered rather than written once for
 * every runtime, because the offered set differs per runtime and a fixed sentence went stale the
 * moment a second runtime existed: a `node` box was told it could pick "an importable module", which
 * is not one of its options and never has been.
 *
 * Each entry says what the box is *for*, as a gerund phrase, in the menu's own order — so the items
 * are parallel, the list has a visible end, and every option carries a reason to pick it.
 *
 * The framing is the part that took three tries. Asking what `scrollcase run` starts has no honest
 * answer for `library-only` except "nothing", which describes an absence and reads as an option that
 * does not do anything — so nobody would choose it, and the one thing it is actually for goes
 * unsaid. Saying more inside that framing failed twice: hung off the last item it gave "…, or
 * nothing at all, for a box other code imports rather than runs", where the list has no visible end
 * and "a box other" sends the reader down the wrong parse; moved to the front it gave "Whether this
 * box has an entry point `scrollcase run` can start", a relative clause with its "that" dropped and
 * a code span inside it. `promptHeading` renders a hint as one lead-in line and appends the colon,
 * so there is room for a list and nothing else. Asking what the box is for makes `library-only` an
 * answer in its own right rather than the absence of one.
 *
 * "Imported" is exact, not loose: `authoredExecutionKinds` offers `library-only` only to a runtime
 * with an import probe, so it never reaches `native`, which has no module system to be imported by.
 */
const EXECUTION_KIND_MEANINGS = Object.freeze({
  'python-script': 'running a script file',
  'python-module': 'running an importable module',
  'node-script': 'running a script file',
  'native-binary': 'running the compiled binary you supply',
  'library-only': 'being imported by another application as a library',
});

/** The one-line explanation printed above the execution menu, for the kinds this runtime offers. */
function executionHint(kinds) {
  const meanings = kinds.map((kind) => EXECUTION_KIND_MEANINGS[kind] ?? kind);
  const listed = meanings.length > 1
    ? `${meanings.slice(0, -1).join(', ')}, or ${meanings.at(-1)}`
    : meanings[0];
  // An em dash, not a colon: the renderer adds a colon of its own at the end, and two in one line
  // reads as two questions.
  return `What this box is for — ${listed}`;
}

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
  // Returns why an answer is unacceptable, or null when it is fine. Checking here rather than after
  // the whole session means a malformed value is refused on the line that produced it, while the
  // user still remembers what they typed and has lost nothing else.
  validate = null,
  docs = null,
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
    output.write(promptHeading(question, { hint, docs, stream: output }));
    // Bounded, so an input stream that only ever yields blank lines ends in an error rather than a
    // loop nobody can interrupt.
    let lastProblem = null;
    for (let attempt = 0; attempt < MAX_PROMPT_ATTEMPTS; attempt += 1) {
      const value = String(await readline.question(`${marker}${suffix}`)).trim();
      const answer = value || defaultValue;
      if (answer !== null && answer !== '') {
        if (!validate) return answer;
        const problem = await validate(answer);
        if (!problem) return answer;
        lastProblem = problem;
        output.write(`${problem}\n`);
        continue;
      }
      if (optional) return null;
      output.write(`${question} is required.\n`);
    }
    fail(lastProblem ?? `${question} is required.`);
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

/**
 * The arguments a box always passes to its entry point, in either of the two forms people write.
 *
 * A JSON array for several — `'["-a", "-b"]'` — and the bare argument for one, because quoting a
 * one-element JSON array to say `-hide_banner` is a tax on the common case. The two are told apart
 * by the leading bracket rather than by trying JSON first and falling back: a malformed array would
 * otherwise become a single literal argument that looks almost right, which is a worse failure than
 * being told the array is malformed.
 *
 * The quotes around the array are the shell's requirement, not this tool's — `[...]` unquoted is a
 * glob pattern and never reaches the process.
 */
function parseDefaultArgs(value) {
  if (value === null) return [];
  if (!value.trimStart().startsWith('[')) return [value];
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    fail('--default-args looks like a JSON array but is not valid JSON. Use \'["-a", "-b"]\', or pass a single argument unquoted.');
  }
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) {
    fail('--default-args must be a JSON array of strings, or a single argument.');
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
    docs: questionDocs('target'),
  });
  if (selected.target.accelerator !== 'cuda') return parseCliTarget(selected.targetId);
  const cudaVersion = await ask('CUDA version (major.minor)', { hint: HINTS.cudaVersion, docs: questionDocs('cudaVersion') });
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
  const required = async (flag, question, hint, docsKey) => {
    const supplied = flagText(flags, flag);
    if (supplied !== null) return supplied;
    if (!terminal) fail(`new scroll requires --${flag} <value> without a terminal.`);
    return ask(question, { hint, docs: questionDocs(docsKey) });
  };
  /** A value with a defensible default: taken from the flag, otherwise settled without asking. */
  const derived = (flag, defaultValue) => flagText(flags, flag) ?? defaultValue;
  const finite = async (flag, question, choices, hint, docsKey) => {
    const supplied = flagText(flags, flag);
    if (!supplied && !terminal) {
      fail(`new scroll requires --${flag} <${choices.join('|')}> without a terminal.`);
    }
    return choose(question, choices, { flag: supplied, hint, docs: questionDocs(docsKey), terminal });
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
    docs: questionDocs('runtime'),
    terminal,
  });
  // Checked against the schema's own pattern as it is typed. It used to be accepted here and refused
  // by `validateScroll` at the very end — after the revision, the URL and the execution kind had all
  // been answered — with a message that named neither the value nor the shape it needed.
  const boxId = await (async () => {
    const supplied = flagText(flags, 'box-id');
    if (supplied !== null) {
      const problem = await boxIdProblem(supplied);
      if (problem) fail(problem);
      return supplied;
    }
    if (!terminal) fail('new scroll requires --box-id <value> without a terminal.');
    return ask('Box ID', { hint: HINTS.boxId, validate: boxIdProblem, docs: questionDocs('boxId') });
  })();
  // The upstream revision is the one identity nothing here can supply: it names the version of the
  // thing being packaged, and inventing it would put a false claim into the box's provenance.
  const sourceRevision = await required('source-revision', 'Upstream revision', HINTS.sourceRevision, 'sourceRevision');
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
  // Optional, because most boxes never need one: a box built to run where it was built is never
  // published, so there is nowhere for its documents to point. Skipping writes no `publishBaseUrl`
  // rather than a placeholder — a made-up URL in a signed release is a false statement about where
  // the box is published, and the build simply omits the links instead.
  const publishBaseUrl = flagText(flags, 'publish-base-url')
    ?? (terminal ? await ask('Publish base URL', { hint: HINTS.publishBaseUrl, optional: true, docs: questionDocs('publishBaseUrl') }) : null);
  // Free-form annotations, flags only and empty by default. Scrollcase reads none of them, so
  // prompting for one would be asking the author to fill in a field on the tool's behalf.
  const labels = parseLabels(flagText(flags, 'labels'));
  // A menu of one is not a question. `native` defines exactly one authored kind — it has no module
  // system, so there is no `library-only` for it either — and being asked to pick from a single
  // option reads as though something else was expected to be there.
  const executionKinds = authoredExecutionKinds(runtimeId);
  const suppliedKind = flagText(flags, 'execution');
  const executionKind = executionKinds.length === 1 && suppliedKind === null
    ? executionKinds[0]
    : await finite('execution', 'execution kind', executionKinds, executionHint(executionKinds), 'execution');
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
    publishBaseUrl,
    executionKind,
    defaultArgs,
  };
  if (executionKind === 'python-module') {
    result.module = await required('module', 'Python module', HINTS.module, 'module');
  } else if (executionKind !== 'library-only') {
    // Every remaining kind names a payload file. Whether Scrollcase can write a starter for it is
    // the runtime's answer: it generates source, and it does not generate compiled binaries.
    const generable = executionKind !== 'native-binary';
    const noun = generable ? 'script' : 'binary';
    const existing = flagText(flags, 'script');
    const fromEnvironment = flagText(flags, 'from-environment');
    const generateScript = Boolean(flags.get('generate-script'));
    if ([existing, fromEnvironment, generateScript || null].filter(Boolean).length > 1) {
      fail('Choose one of --script <path>, --from-environment <path> or --generate-script.');
    }
    if (generateScript && !generable) {
      fail(`Scrollcase cannot generate a ${noun}; point --script at the one you built.`);
    }
    if (fromEnvironment) result.environmentPath = fromEnvironment;
    else if (existing) result.scriptSourcePath = existing;
    else if (generateScript) result.generateScript = true;
    else if (!terminal) {
      fail(`${executionKind} execution requires --from-environment <path> or --script <path>${generable ? ' or --generate-script' : ''} without a terminal.`);
    } else if (!generable) {
      // A compiled binary has two origins and they are not the same question. Most `native` boxes
      // package a program conda-forge already installs — `venv/bin/ffmpeg` — and nothing of the
      // project's is copied in at all; the other case is a binary the project built itself. Only the
      // second was ever askable, which meant the common one needed `scroll.json` edited by hand.
      const origin = await choose(
        'binary source',
        ['a program the environment provides', 'a compiled binary in this project'],
        { hint: HINTS.binarySource, docs: questionDocs('binarySource'), terminal: true },
      );
      if (origin === 'a program the environment provides') {
        result.environmentPath = await ask('Path inside the box', {
          hint: HINTS.environmentPath,
          docs: questionDocs('environmentPath'),
        });
      } else {
        result.scriptSourcePath = await ask('Binary path', { hint: HINTS.binaryPath, docs: questionDocs('binaryPath') });
      }
    } else {
      // The generated stub first, because it is the preselected answer and the one that works with
      // nothing else in place: a first scroll can be built and run immediately, and the stub is a
      // file to edit rather than a file to go and find. Pointing at an existing script assumes the
      // author already wrote one, which is the later case, not the first.
      const source = await choose(
        'script source',
        ['generate starter script', 'existing project script'],
        { hint: HINTS.scriptSource, docs: questionDocs('scriptSource'), terminal: true },
      );
      if (source === 'existing project script') {
        result.scriptSourcePath = await ask('Script path', { hint: HINTS.scriptPath, docs: questionDocs('scriptPath') });
      } else result.generateScript = true;
    }
    const destination = flagText(flags, 'script-destination');
    if (destination) result.scriptRelativePath = destination;
    const generatedScriptSourcePath = flagText(flags, 'generated-script-path');
    if (generatedScriptSourcePath) result.generatedScriptSourcePath = generatedScriptSourcePath;
  }
  return result;
}
