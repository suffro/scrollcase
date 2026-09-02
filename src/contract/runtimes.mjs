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
 * vocabulary that declaration may use and `RUNTIME_ADAPTERS` is what this build can actually run.
 * They now hold the same three, which is what the split was for: `node` and `native` arrived as
 * adapters and the wire did not move. The two lists stay separate because they answer to different
 * release cycles — a consumer crate published before a runtime landed still has to refuse a box
 * naming it, by name, rather than misread it as another runtime.
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
 * @property {readonly string[]} selfTestProbeKinds the probe shapes this runtime can answer
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
 * Two fields are nullable, and both mean the same thing: the runtime does not have that. A native
 * box carries no interpreter to name and no bundled library to search, so `entryPoint` and
 * `standardLibrary` are null rather than a plausible-looking path nothing would find. Every caller
 * that reads one already has to decide what to do when the box declares none, because
 * `runtime.entryPoint` is optional on the wire for exactly this reason.
 *
 * @typedef {object} BoxRuntimeLayout
 * @property {string} root directory the runtime was relocated into
 * @property {string | null} entryPoint the runtime's own executable, relative to the box root, or
 *   null for a runtime that has no separate executable to name
 * @property {string} scriptsDirectory directory holding generated console scripts
 * @property {string | null} standardLibrary directory holding the runtime's bundled library, or
 *   null for a runtime that has none
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
function commandInvocations(runtime, { probe, execution, target }) {
  return (probe.commands ?? []).map((command) => {
    if (!execution) {
      throw new TypeError('A self-test command needs a declared execution to invoke');
    }
    const { command: entryPoint, args } = runtime.buildArgv({ execution, target });
    return {
      command: entryPoint,
      args: [...args, ...command.args.map((value) => ({ kind: 'literal', value }))],
      expectExitCode: command.expectExitCode ?? 0,
    };
  });
}

/**
 * Refuses a probe shape the runtime cannot answer, before anything tries to run it.
 *
 * An import probe asks a module system a question, and a runtime without one has nothing to ask.
 * Silently dropping it would report a pass for a check that never ran, which is worse than the
 * declaration being refused.
 */
function assertProbeKinds(runtime, probe) {
  for (const kind of ['imports', 'commands']) {
    if (!probe[kind]?.length) continue;
    if (!runtime.selfTestProbeKinds.includes(kind)) {
      throw new TypeError(unsupportedSelfTestProbeMessage(runtime.id, kind));
    }
  }
}

/** The one place an interpreted runtime's `-c`/`-e` probe is assembled, given its own source. */
function sourceProbeInvocation({ runtime, target, flag, source }) {
  return {
    command: { kind: 'payload-path', value: runtime.layout(target).entryPoint },
    args: [flag, source].map((value) => ({ kind: 'literal', value })),
    expectExitCode: 0,
  };
}

function freezeInvocations(invocations) {
  return Object.freeze(invocations.map((invocation) => Object.freeze({
    command: Object.freeze(invocation.command),
    args: Object.freeze(invocation.args.map((argument) => Object.freeze(argument))),
    expectExitCode: invocation.expectExitCode,
  })));
}

/**
 * The interpreter by name, and the console-script directory wholesale.
 *
 * A conda prefix generates that directory's contents at solve time and nothing declares them, so
 * the rule is the only way they can carry the bit at all. A runtime with no interpreter of its own
 * contributes only the directory: the file it runs is one the scroll declared, and the scroll is
 * what says the bit belongs on it.
 */
function prefixExecutablePayloadPaths(layout) {
  return Object.freeze({
    files: Object.freeze(layout.entryPoint === null ? [] : [layout.entryPoint]),
    directories: Object.freeze([layout.scriptsDirectory]),
  });
}

const PYTHON_RUNTIME = Object.freeze({
  id: 'python',
  executionKinds: Object.freeze(['python-script', 'python-module']),
  executionEnvironmentVariables: PYTHON_EXECUTION_ENVIRONMENT,
  selfTestProbeKinds: Object.freeze(['imports', 'commands']),

  layout: pythonLayout,

  executablePayloadPaths(target) {
    return prefixExecutablePayloadPaths(pythonLayout(target));
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
    assertProbeKinds(PYTHON_RUNTIME, probe);
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
      invocations.push(sourceProbeInvocation({
        runtime: PYTHON_RUNTIME,
        target,
        flag: '-c',
        source: code,
      }));
    }
    invocations.push(...commandInvocations(PYTHON_RUNTIME, { probe, execution, target }));
    return freezeInvocations(invocations);
  },
});

const NODE_EXECUTION_ENVIRONMENT = Object.freeze([
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_EXTRA_CA_CERTS',
]);

const POSIX_NODE_LAYOUT = Object.freeze({
  root: 'venv',
  entryPoint: 'venv/bin/node',
  scriptsDirectory: 'venv/bin',
  standardLibrary: 'venv/lib',
  executableSuffix: '',
  launcherKind: 'posix-polyglot',
});

const NODE_LAYOUTS = Object.freeze({
  macos: POSIX_NODE_LAYOUT,
  linux: POSIX_NODE_LAYOUT,
  windows: Object.freeze({
    root: 'venv',
    // conda-forge installs a Windows package's own executables at the prefix root and its generated
    // launchers under `Scripts`, which is why node.exe sits beside python.exe rather than under it.
    entryPoint: 'venv/node.exe',
    scriptsDirectory: 'venv/Scripts',
    standardLibrary: 'venv/Lib',
    launcherKind: 'uv-windows-pe',
    executableSuffix: '.exe',
  }),
});

/**
 * The assertion every Node self-test opens with. Same purpose as the Python one: prove the check is
 * running on the platform the box was built for before it proves anything else.
 */
const NODE_PLATFORM_ASSERTIONS = Object.freeze({
  macos: "if (process.platform !== 'darwin') throw new Error('platform mismatch: ' + process.platform)",
  linux: "if (process.platform !== 'linux') throw new Error('platform mismatch: ' + process.platform)",
  windows: "if (process.platform !== 'win32') throw new Error('platform mismatch: ' + process.platform)",
});

function nodeLayout(target) {
  const layout = NODE_LAYOUTS[target?.platform];
  if (!layout) {
    throw new TypeError(`No node runtime layout exists for platform ${String(target?.platform)}`);
  }
  return layout;
}

const NODE_RUNTIME = Object.freeze({
  id: 'node',
  // One kind, deliberately. Node has no `-m` analogue worth inventing: a package entry point
  // resolves to a file, and naming that file is what every other declaration in the format does.
  executionKinds: Object.freeze(['node-script']),
  executionEnvironmentVariables: NODE_EXECUTION_ENVIRONMENT,
  selfTestProbeKinds: Object.freeze(['imports', 'commands']),

  layout: nodeLayout,

  executablePayloadPaths(target) {
    return prefixExecutablePayloadPaths(nodeLayout(target));
  },

  resolveExecutionFiles({ execution }) {
    return Object.freeze({
      candidates: Object.freeze([execution.script]),
      missing: `Execution script is missing from the box: ${execution.script}.`,
    });
  },

  buildArgv({ execution, target }) {
    const args = [{ kind: 'payload-path', value: execution.script }];
    for (const value of execution.defaultArgs ?? []) args.push({ kind: 'literal', value });
    return Object.freeze({
      command: Object.freeze({ kind: 'payload-path', value: nodeLayout(target).entryPoint }),
      args: Object.freeze(args.map((argument) => Object.freeze(argument))),
    });
  },

  selfTestInvocations({ probe, execution, target }) {
    assertProbeKinds(NODE_RUNTIME, probe);
    const invocations = [];
    if (probe.imports?.length) {
      const assertion = NODE_PLATFORM_ASSERTIONS[target?.platform];
      if (!assertion) {
        throw new TypeError(`No node self-test assertion exists for platform ${String(target?.platform)}`);
      }
      // `require` rather than `import()`, because `-e` source is evaluated as CommonJS and Node 22
      // resolves an ES module through `require` as well. A box whose dependency cannot be loaded
      // either way is a box whose probe should fail.
      const imports = probe.imports
        .map((specifier) => `require(${JSON.stringify(specifier)});`)
        .join('\n');
      const code = probe.code
        ? `${assertion}\n${imports}\n${probe.code}`
        : `${assertion}\n${imports}`;
      invocations.push(sourceProbeInvocation({
        runtime: NODE_RUNTIME,
        target,
        flag: '-e',
        source: code,
      }));
    }
    invocations.push(...commandInvocations(NODE_RUNTIME, { probe, execution, target }));
    return freezeInvocations(invocations);
  },
});

/**
 * A native box has no interpreter, so its layout names none — and names no standard library either,
 * because there is no loader that would search one.
 *
 * The packed prefix is still there. A native box is built from a `pixi.lock` like every other, and
 * the binary it runs links against the shared libraries that lock installed; what changes is only
 * that nothing in `venv/` is started to run the box. `scriptsDirectory` therefore stays: a conda
 * prefix generates console scripts whoever depends on it, and they still need the bit.
 */
const POSIX_NATIVE_LAYOUT = Object.freeze({
  root: 'venv',
  entryPoint: null,
  scriptsDirectory: 'venv/bin',
  standardLibrary: null,
  executableSuffix: '',
  launcherKind: 'posix-polyglot',
});

const NATIVE_LAYOUTS = Object.freeze({
  macos: POSIX_NATIVE_LAYOUT,
  linux: POSIX_NATIVE_LAYOUT,
  windows: Object.freeze({
    root: 'venv',
    entryPoint: null,
    scriptsDirectory: 'venv/Scripts',
    standardLibrary: null,
    executableSuffix: '.exe',
    launcherKind: 'uv-windows-pe',
  }),
});

function nativeLayout(target) {
  const layout = NATIVE_LAYOUTS[target?.platform];
  if (!layout) {
    throw new TypeError(`No native runtime layout exists for platform ${String(target?.platform)}`);
  }
  return layout;
}

const NATIVE_RUNTIME = Object.freeze({
  id: 'native',
  executionKinds: Object.freeze(['native-binary']),
  // Nothing of its own. A compiled binary is loaded by the operating system's dynamic linker, and
  // the variables that steer it are the target's — `LD_LIBRARY_PATH` and its siblings — which the
  // target adapter already contributes. Repeating them here would double every diagnostic line.
  executionEnvironmentVariables: Object.freeze([]),
  // The one shape a runtime with no module system can answer.
  selfTestProbeKinds: Object.freeze(['commands']),

  layout: nativeLayout,

  executablePayloadPaths(target) {
    return prefixExecutablePayloadPaths(nativeLayout(target));
  },

  resolveExecutionFiles({ execution }) {
    return Object.freeze({
      candidates: Object.freeze([execution.binary]),
      missing: `Execution binary is missing from the box: ${execution.binary}.`,
    });
  },

  buildArgv({ execution }) {
    const args = (execution.defaultArgs ?? []).map((value) => Object.freeze({ kind: 'literal', value }));
    // The binary *is* the command. Every other runtime puts its own entry point first and the
    // declaration second; here there is nothing to put first, which is the whole of what `native`
    // means.
    return Object.freeze({
      command: Object.freeze({ kind: 'payload-path', value: execution.binary }),
      args: Object.freeze(args),
    });
  },

  selfTestInvocations({ probe, execution, target }) {
    assertProbeKinds(NATIVE_RUNTIME, probe);
    return freezeInvocations(commandInvocations(NATIVE_RUNTIME, { probe, execution, target }));
  },
});

const RUNTIME_ADAPTERS = Object.freeze([PYTHON_RUNTIME, NODE_RUNTIME, NATIVE_RUNTIME]);

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
 * Three answers, because there are three cases. A runtime with an interpreter admits exactly one
 * value for a given target, so a declaration is checked against it. A runtime without one — a
 * native box — admits none, and a declaration there is refused rather than ignored: it would name a
 * file the box never starts, and a reader would believe it. And a box that declares nothing at all
 * is checked against nothing, because `runtime.entryPoint` is optional on the wire and its absence
 * is a legitimate answer for both.
 *
 * @param {string} runtimeId
 * @param {import('./targets.mjs').BoxTargetAdapter} adapter the resolved target adapter, whose id
 *   names the layout the entry point is being judged against
 * @param {string | null | undefined} entryPoint
 * @returns {void}
 * @throws {TypeError} when the entry point is not the one the runtime defines for this target
 */
export function assertRuntimeEntryPoint(runtimeId, adapter, entryPoint) {
  const runtime = runtimeAdapter(runtimeId);
  const expected = runtime.layout(adapter).entryPoint;
  if (expected === null) {
    if (entryPoint !== undefined && entryPoint !== null) {
      throw new TypeError(`${runtime.id} boxes have no runtime entry point to declare; the executable a ${runtime.id} box runs is named by its execution`);
    }
    return;
  }
  if (entryPoint !== undefined && entryPoint !== expected) {
    throw new TypeError(`${adapter.id} boxes with the ${runtime.id} runtime must use entry point ${expected}`);
  }
}

/**
 * The message for a self-test probe shape the runtime cannot answer.
 *
 * Stated here, beside the rule, for the same reason `resolveExecutionFiles` returns its own
 * `missing`: the wording is part of the contract, and the builder and all three consumers should
 * refuse an impossible probe identically instead of each inventing a phrasing.
 *
 * @param {string} runtimeId
 * @param {string} probeKind
 * @returns {string}
 */
export function unsupportedSelfTestProbeMessage(runtimeId, probeKind) {
  const runtime = runtimeAdapter(runtimeId);
  return `The ${runtime.id} runtime cannot answer a selfTest.${probeKind} probe; it answers ${runtime.selfTestProbeKinds.map((kind) => `selfTest.${kind}`).join(' and ')}.`;
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
