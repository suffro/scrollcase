/**
 * Reference implementation of the Scrollcase box-format runtime model.
 *
 * A target says which machine a box runs on; a runtime says what runs *inside* it — where the
 * interpreter sits, which execution kinds exist, how a declared entry point becomes a command line,
 * and which inherited environment variables can change what that command loads. Those are different
 * questions with different answers, and until now they lived in one table: `targets.mjs` carried a
 * nested `python: {…}` block and a Python self-test assertion, so every target adapter was also a
 * statement that a box is a Python box.
 *
 * Splitting them is what makes a second runtime an adapter rather than a fork. This module is the
 * runtime half, and it is contract-level for the same reason `targets.mjs` is: a consumer unpacking
 * a box relies on the layout, and a consumer running one relies on the argv rule. The golden cases
 * in `fixtures/runtime-contract.json` are what "agree" means, and are what the Python and Rust
 * mirrors validate themselves against.
 *
 * Schema version 3 made the runtime a declaration: a box says `runtime: { id, version, entryPoint }`
 * instead of leaving a reader to infer Python from a Python-shaped entry point. `RUNTIME_IDS` is the
 * vocabulary that declaration may use and `RUNTIME_ADAPTERS` is what this build can actually run —
 * two different lists on purpose, so implementing `node` later is code and not another wire break.
 *
 * Only the pure half lives here. Nothing in this module reads a file, joins a host path, or starts
 * a process: every function is a statement about names, so the same inputs give the same answer in
 * every language and on every host. Builder-side behaviour — environment preparation, launcher
 * repair, authoring templates — lives under `src/runtimes/<id>/`, which may do all three.
 *
 * Two shapes deserve their reasons stated:
 *
 * - `buildArgv` returns payload-*relative* paths tagged as paths rather than a joined command line.
 *   A box root is a real filesystem path and the three consumers join one in their own platform's
 *   terms; returning a joined string would put "what a Windows path looks like" inside the format,
 *   and would make the golden fixture depend on the host that reads it.
 * - `resolveExecutionFiles` returns candidates plus the message for when none of them resolve,
 *   instead of throwing. The caller owns the error path — `fail()` in the builder, a typed error in
 *   each consumer — and the wording is part of the contract, so it belongs beside the rule that
 *   produces it rather than being restated at every call site.
 */

/**
 * What a runtime implies for a box, independent of the machine it runs on.
 *
 * @typedef {object} BoxRuntimeAdapter
 * @property {string} id canonical runtime id, e.g. `python`
 * @property {readonly string[]} executionKinds the `execution.kind` values this runtime defines
 * @property {readonly string[]} executionEnvironmentVariables inherited variables whose presence
 *   can change which code this runtime loads — the runtime half of the diagnostic list, to which
 *   the target adapter adds the operating system's own
 * @property {(target: BoxRuntimeTarget) => BoxRuntimeLayout} layout where the runtime lives inside
 *   the payload
 * @property {(target: BoxRuntimeTarget) => ExecutablePayloadPaths} executablePayloadPaths payload
 *   paths the runtime itself requires the executable bit on
 * @property {(options: { execution: object, runtimeVersion: string,
 *   target: BoxRuntimeTarget }) => ResolvedExecutionFiles} resolveExecutionFiles
 * @property {(options: { execution: object,
 *   target: BoxRuntimeTarget }) => BoxRuntimeInvocation} buildArgv
 * @property {(options: { probe: BoxRuntimeSelfTestProbe, execution: object | null | undefined,
 *   target: BoxRuntimeTarget }) => readonly BoxRuntimeSelfTestInvocation[]} selfTestInvocations
 *   every command a self-test probe implies, in declaration order
 */

/**
 * The part of a target a runtime rule reads. A `BoxTarget` and the `BoxTargetAdapter` resolved from
 * one both satisfy it, so callers pass whichever they are already holding.
 *
 * @typedef {{ platform: string }} BoxRuntimeTarget
 */

/**
 * Where a runtime lives inside an extracted box.
 *
 * @typedef {object} BoxRuntimeLayout
 * @property {string} root directory the runtime was relocated into
 * @property {string} entryPoint the runtime's own executable, relative to the box root
 * @property {string} scriptsDirectory directory holding generated console scripts
 * @property {string} standardLibrary directory holding the runtime's bundled library
 * @property {string} executableSuffix suffix an executable carries on this platform
 * @property {string} launcherKind frozen wire string naming how launchers were repaired
 */

/**
 * Payload paths a runtime requires the executable bit on, as a rule rather than a list: a conda
 * prefix carries hundreds of console scripts and no scroll could name them by hand.
 *
 * @typedef {{ files: readonly string[], directories: readonly string[] }} ExecutablePayloadPaths
 */

/**
 * @typedef {object} ResolvedExecutionFiles
 * @property {readonly string[]} candidates payload paths, any one of which resolving satisfies the
 *   declaration
 * @property {string} missing the message for a box where none of them do
 */

/**
 * One element of a shell-free command line: either a literal argument or a payload path the caller
 * resolves against the box root.
 *
 * @typedef {{ kind: 'literal' | 'payload-path', value: string }} BoxRuntimeArgument
 */

/**
 * @typedef {object} BoxRuntimeInvocation
 * @property {BoxRuntimeArgument} command the runtime's own entry point
 * @property {readonly BoxRuntimeArgument[]} args everything the box declared, before the caller's
 *   own arguments
 */

/**
 * What a self-test asks the box to prove, plus the builder-only extension a scroll may add.
 *
 * `imports` asks the runtime's loader a question and only means something to a runtime that has
 * one. `commands` asks the box's declared execution a question, which every runtime can answer and
 * a native one can answer *only* that way. A probe carries whichever apply; `code` never travels on
 * the wire, because signing it would claim a consumer had repeated a check it cannot see.
 *
 * @typedef {object} BoxRuntimeSelfTestProbe
 * @property {readonly string[]} [imports] modules the runtime must be able to load
 * @property {readonly { args: readonly string[], expectExitCode?: number }[]} [commands]
 * @property {string | null} [code] builder-only extra source in the runtime's own language
 */

/**
 * One command the self-test runs, and the status it must exit with.
 *
 * @typedef {object} BoxRuntimeSelfTestInvocation
 * @property {BoxRuntimeArgument} command
 * @property {readonly BoxRuntimeArgument[]} args
 * @property {number} expectExitCode
 */

/**
 * Every runtime id the box format admits, in the order the schema lists them.
 *
 * The wire enum and the implemented set are deliberately two different things: schema version 3
 * fixes the vocabulary once, so a later release can implement `node` without another wire break.
 * A box naming a runtime this build has no adapter for is refused by name, not misread.
 */
export const RUNTIME_IDS = Object.freeze(['python', 'node', 'native']);

const PYTHON_EXECUTION_ENVIRONMENT = Object.freeze([
  'PYTHONPATH',
  'PYTHONHOME',
  'PYTHONSTARTUP',
  'PYTHONBREAKPOINT',
]);

const POSIX_PYTHON_LAYOUT = Object.freeze({
  root: 'venv',
  entryPoint: 'venv/bin/python',
  scriptsDirectory: 'venv/bin',
  standardLibrary: 'venv/lib',
  executableSuffix: '',
  launcherKind: 'posix-polyglot',
});

const PYTHON_LAYOUTS = Object.freeze({
  macos: POSIX_PYTHON_LAYOUT,
  linux: POSIX_PYTHON_LAYOUT,
  windows: Object.freeze({
    root: 'venv',
    entryPoint: 'venv/python.exe',
    scriptsDirectory: 'venv/Scripts',
    standardLibrary: 'venv/Lib',
    executableSuffix: '.exe',
    // Reads like a stale reference to a tool this project does not use. It is a frozen wire string
    // under the published format; it is not a typo and must not be "cleaned".
    launcherKind: 'uv-windows-pe',
  }),
});

/**
 * The assertion every Python self-test opens with, so the check begins by proving it is running on
 * the platform the box was built for rather than on whatever interpreter answered first.
 */
const PYTHON_PLATFORM_ASSERTIONS = Object.freeze({
  macos: "import sys; assert sys.platform == 'darwin'",
  linux: "import sys; assert sys.platform.startswith('linux')",
  windows: "import sys; assert sys.platform == 'win32'",
});

const PYTHON_MAJOR_MINOR = /^(\d+)\.(\d+)(?:\.|$)/;

function pythonLayout(target) {
  const layout = PYTHON_LAYOUTS[target?.platform];
  if (!layout) {
    throw new TypeError(`No python runtime layout exists for platform ${String(target?.platform)}`);
  }
  return layout;
}

/**
 * The `major.minor` prefix naming the standard-library directory a packed prefix carries.
 *
 * A patch component is deliberately dropped rather than rejected: a scroll may pin `3.14.2`, and
 * the directory conda-forge writes is `python3.14` either way.
 */
function pythonMajorMinor(version) {
  const match = PYTHON_MAJOR_MINOR.exec(String(version));
  if (!match) {
    throw new TypeError(`Invalid Python version for execution discovery: ${version}.`);
  }
  return `${match[1]}.${match[2]}`;
}

/**
 * Every path a dotted module could legitimately resolve to inside a box.
 *
 * The payload root comes first because a box may ship its application beside the environment rather
 * than installed into it, which is what a scroll's `localFiles` produce.
 */
function pythonModuleEntryPoints({ module, runtimeVersion, target }) {
  const layout = pythonLayout(target);
  const modulePath = String(module).split('.').join('/');
  const relativeCandidates = [`${modulePath}.py`, `${modulePath}/__main__.py`];
  // Windows names its standard library once, with no interpreter version in the path; every other
  // platform carries `python<major>.<minor>` under it.
  const standardLibrary = target.platform === 'windows'
    ? layout.standardLibrary
    : `${layout.standardLibrary}/python${pythonMajorMinor(runtimeVersion)}`;
  const roots = ['', standardLibrary, `${standardLibrary}/site-packages`];
  return roots.flatMap((root) =>
    relativeCandidates.map((path) => (root ? `${root}/${path}` : path)));
}

/**
 * A command probe, turned into an invocation of the box's own declared execution.
 *
 * Shared by every runtime, because it is not a runtime-specific rule: the box says how it is run,
 * and the probe appends arguments to that. A probe of this shape in a box that declares no
 * execution has nothing to invoke, which is a contradiction in the declaration rather than a
 * property of the box, so it is refused where scrolls are read and reported here as a programming
 * error if it ever gets this far.
 */
function commandInvocation(runtime, { command, execution, target }) {
  if (!execution) {
    throw new TypeError('A self-test command needs a declared execution to invoke');
  }
  const { command: entryPoint, args } = runtime.buildArgv({ execution, target });
  return {
    command: entryPoint,
    args: [...args, ...command.args.map((value) => ({ kind: 'literal', value }))],
    expectExitCode: command.expectExitCode ?? 0,
  };
}

function freezeInvocations(invocations) {
  return Object.freeze(invocations.map((invocation) => Object.freeze({
    command: Object.freeze(invocation.command),
    args: Object.freeze(invocation.args.map((argument) => Object.freeze(argument))),
    expectExitCode: invocation.expectExitCode,
  })));
}

const PYTHON_RUNTIME = Object.freeze({
  id: 'python',
  executionKinds: Object.freeze(['python-script', 'python-module']),
  executionEnvironmentVariables: PYTHON_EXECUTION_ENVIRONMENT,

  layout: pythonLayout,

  executablePayloadPaths(target) {
    const layout = pythonLayout(target);
    // The interpreter by name, and the console-script directory wholesale. A conda prefix generates
    // that directory's contents at solve time and nothing declares them, so the rule is the only
    // way they can carry the bit at all.
    return Object.freeze({
      files: Object.freeze([layout.entryPoint]),
      directories: Object.freeze([layout.scriptsDirectory]),
    });
  },

  resolveExecutionFiles({ execution, runtimeVersion, target }) {
    if (execution.kind === 'python-script') {
      return Object.freeze({
        candidates: Object.freeze([execution.script]),
        missing: `Execution script is missing from the box: ${execution.script}.`,
      });
    }
    return Object.freeze({
      candidates: Object.freeze(pythonModuleEntryPoints({
        module: execution.module,
        runtimeVersion,
        target,
      })),
      missing: `Execution module is not discoverable in the box: ${execution.module}.`,
    });
  },

  buildArgv({ execution, target }) {
    const layout = pythonLayout(target);
    const args = execution.kind === 'python-script'
      ? [{ kind: 'payload-path', value: execution.script }]
      : [{ kind: 'literal', value: '-m' }, { kind: 'literal', value: execution.module }];
    for (const value of execution.defaultArgs ?? []) args.push({ kind: 'literal', value });
    return Object.freeze({
      command: Object.freeze({ kind: 'payload-path', value: layout.entryPoint }),
      args: Object.freeze(args.map((argument) => Object.freeze(argument))),
    });
  },

  selfTestInvocations({ probe, execution, target }) {
    const invocations = [];
    if (probe.imports?.length) {
      const assertion = PYTHON_PLATFORM_ASSERTIONS[target?.platform];
      if (!assertion) {
        throw new TypeError(`No python self-test assertion exists for platform ${String(target?.platform)}`);
      }
      const imports = `import ${probe.imports.join(', ')}`;
      const code = probe.code
        ? `${assertion}\n${imports}\n${probe.code}`
        : `${assertion}\n${imports}`;
      invocations.push({
        command: { kind: 'payload-path', value: pythonLayout(target).entryPoint },
        args: ['-c', code].map((value) => ({ kind: 'literal', value })),
        expectExitCode: 0,
      });
    }
    for (const command of probe.commands ?? []) {
      invocations.push(commandInvocation(PYTHON_RUNTIME, { command, execution, target }));
    }
    return freezeInvocations(invocations);
  },
});

const RUNTIME_ADAPTERS = Object.freeze([PYTHON_RUNTIME]);

/**
 * Returns the runtime adapter for a runtime id.
 *
 * @param {string} runtimeId
 * @returns {BoxRuntimeAdapter}
 * @throws {TypeError} when no runtime with that id exists
 */
export function runtimeAdapter(runtimeId) {
  const adapter = RUNTIME_ADAPTERS.find((candidate) => candidate.id === runtimeId);
  if (!adapter) throw new TypeError(`No box runtime adapter exists for ${String(runtimeId)}`);
  return adapter;
}

/**
 * Lists every runtime adapter, for contract tests and for callers enumerating what a box may be.
 *
 * @returns {BoxRuntimeAdapter[]} every runtime adapter, as a fresh array
 */
export function runtimeAdapters() {
  return [...RUNTIME_ADAPTERS];
}

/**
 * Ensures a declared entry point agrees with where the runtime actually sits in the payload.
 *
 * @param {string} runtimeId
 * @param {import('./targets.mjs').BoxTargetAdapter} adapter the resolved target adapter, whose id
 *   names the layout the entry point is being judged against
 * @param {string} entryPoint
 * @returns {void}
 * @throws {TypeError} when the entry point is not the one the runtime defines for this target
 */
export function assertRuntimeEntryPoint(runtimeId, adapter, entryPoint) {
  const runtime = runtimeAdapter(runtimeId);
  const expected = runtime.layout(adapter).entryPoint;
  if (entryPoint !== expected) {
    throw new TypeError(`${adapter.id} boxes with the ${runtime.id} runtime must use entry point ${expected}`);
  }
}

/**
 * The message for a box declaring a runtime this build has no adapter for.
 *
 * The wire vocabulary is fixed and the implemented set is not, so this case is expected rather than
 * exceptional, and the wording says which of the two the box fell foul of. It lives here so the
 * builder and all three consumers report an unimplemented runtime identically instead of each
 * inventing a phrasing.
 *
 * @param {string} runtimeId
 * @returns {string}
 */
export function unimplementedRuntimeMessage(runtimeId) {
  const implemented = RUNTIME_ADAPTERS.map((adapter) => adapter.id).join(', ');
  return RUNTIME_IDS.includes(runtimeId)
    ? `Runtime ${runtimeId} is not implemented by this version of Scrollcase; it implements ${implemented}.`
    : `Unknown runtime: ${String(runtimeId)}. The box format defines ${RUNTIME_IDS.join(', ')}.`;
}

/**
 * Whether this build carries an adapter for a runtime id — the question every caller asks before
 * `runtimeAdapter`, which throws rather than returning nothing.
 *
 * @param {string} runtimeId
 * @returns {boolean}
 */
export function isImplementedRuntime(runtimeId) {
  return RUNTIME_ADAPTERS.some((adapter) => adapter.id === runtimeId);
}

/**
 * Whether a payload path is one the runtime requires the executable bit on.
 *
 * A directory matches by prefix so one rule covers a whole generated scripts tree; an exact file
 * match covers the runtime's own entry point, which lives outside it on Windows.
 *
 * @param {ExecutablePayloadPaths} rule
 * @param {string} relativePath forward-slash path relative to the box root
 * @returns {boolean}
 */
export function isExecutablePayloadPath(rule, relativePath) {
  if (rule.files.includes(relativePath)) return true;
  return rule.directories.some((directory) => relativePath.startsWith(`${directory}/`));
}

/**
 * The complete list of inherited variables that can change what a box executes.
 *
 * Two halves, because they have two owners: the runtime contributes the variables its own loader
 * reads, and the target contributes the operating system's dynamic-linker controls. Callers want
 * one list, and assembling it here rather than at each of them is what keeps a diagnostic report
 * from depending on which call site produced it.
 *
 * @param {string} runtimeId
 * @param {import('./targets.mjs').BoxTargetAdapter} adapter
 * @returns {readonly string[]} the runtime's variables followed by the target's
 */
export function executionAffectingVariables(runtimeId, adapter) {
  return Object.freeze([
    ...runtimeAdapter(runtimeId).executionEnvironmentVariables,
    ...adapter.executionAffectingEnvironmentVariables,
  ]);
}
