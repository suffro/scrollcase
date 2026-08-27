/**
 * Returns the runtime adapter for a runtime id.
 *
 * @param {string} runtimeId
 * @returns {BoxRuntimeAdapter}
 * @throws {TypeError} when no runtime with that id exists
 */
export function runtimeAdapter(runtimeId: string): BoxRuntimeAdapter;
/**
 * Lists every runtime adapter, for contract tests and for callers enumerating what a box may be.
 *
 * @returns {BoxRuntimeAdapter[]} every runtime adapter, as a fresh array
 */
export function runtimeAdapters(): BoxRuntimeAdapter[];
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
export function assertRuntimeEntryPoint(runtimeId: string, adapter: import("./targets.mjs").BoxTargetAdapter, entryPoint: string): void;
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
export function unimplementedRuntimeMessage(runtimeId: string): string;
/**
 * Whether this build carries an adapter for a runtime id — the question every caller asks before
 * `runtimeAdapter`, which throws rather than returning nothing.
 *
 * @param {string} runtimeId
 * @returns {boolean}
 */
export function isImplementedRuntime(runtimeId: string): boolean;
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
export function isExecutablePayloadPath(rule: ExecutablePayloadPaths, relativePath: string): boolean;
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
export function executionAffectingVariables(runtimeId: string, adapter: import("./targets.mjs").BoxTargetAdapter): readonly string[];
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
export const RUNTIME_IDS: readonly string[];
/**
 * What a runtime implies for a box, independent of the machine it runs on.
 */
export type BoxRuntimeAdapter = {
    /**
     * canonical runtime id, e.g. `python`
     */
    id: string;
    /**
     * the `execution.kind` values this runtime defines
     */
    executionKinds: readonly string[];
    /**
     * inherited variables whose presence
     * can change which code this runtime loads — the runtime half of the diagnostic list, to which
     * the target adapter adds the operating system's own
     */
    executionEnvironmentVariables: readonly string[];
    /**
     * where the runtime lives inside
     * the payload
     */
    layout: (target: BoxRuntimeTarget) => BoxRuntimeLayout;
    /**
     * payload
     * paths the runtime itself requires the executable bit on
     */
    executablePayloadPaths: (target: BoxRuntimeTarget) => ExecutablePayloadPaths;
    resolveExecutionFiles: (options: {
        execution: object;
        runtimeVersion: string;
        target: BoxRuntimeTarget;
    }) => ResolvedExecutionFiles;
    buildArgv: (options: {
        execution: object;
        target: BoxRuntimeTarget;
    }) => BoxRuntimeInvocation;
    /**
     *   every command a self-test probe implies, in declaration order
     */
    selfTestInvocations: (options: {
        probe: BoxRuntimeSelfTestProbe;
        execution: object | null | undefined;
        target: BoxRuntimeTarget;
    }) => readonly BoxRuntimeSelfTestInvocation[];
};
/**
 * The part of a target a runtime rule reads. A `BoxTarget` and the `BoxTargetAdapter` resolved from
 * one both satisfy it, so callers pass whichever they are already holding.
 */
export type BoxRuntimeTarget = {
    platform: string;
};
/**
 * Where a runtime lives inside an extracted box.
 */
export type BoxRuntimeLayout = {
    /**
     * directory the runtime was relocated into
     */
    root: string;
    /**
     * the runtime's own executable, relative to the box root
     */
    entryPoint: string;
    /**
     * directory holding generated console scripts
     */
    scriptsDirectory: string;
    /**
     * directory holding the runtime's bundled library
     */
    standardLibrary: string;
    /**
     * suffix an executable carries on this platform
     */
    executableSuffix: string;
    /**
     * frozen wire string naming how launchers were repaired
     */
    launcherKind: string;
};
/**
 * Payload paths a runtime requires the executable bit on, as a rule rather than a list: a conda
 * prefix carries hundreds of console scripts and no scroll could name them by hand.
 */
export type ExecutablePayloadPaths = {
    files: readonly string[];
    directories: readonly string[];
};
export type ResolvedExecutionFiles = {
    /**
     * payload paths, any one of which resolving satisfies the
     * declaration
     */
    candidates: readonly string[];
    /**
     * the message for a box where none of them do
     */
    missing: string;
};
/**
 * One element of a shell-free command line: either a literal argument or a payload path the caller
 * resolves against the box root.
 */
export type BoxRuntimeArgument = {
    kind: "literal" | "payload-path";
    value: string;
};
export type BoxRuntimeInvocation = {
    /**
     * the runtime's own entry point
     */
    command: BoxRuntimeArgument;
    /**
     * everything the box declared, before the caller's
     * own arguments
     */
    args: readonly BoxRuntimeArgument[];
};
/**
 * What a self-test asks the box to prove, plus the builder-only extension a scroll may add.
 *
 * `imports` asks the runtime's loader a question and only means something to a runtime that has
 * one. `commands` asks the box's declared execution a question, which every runtime can answer and
 * a native one can answer *only* that way. A probe carries whichever apply; `code` never travels on
 * the wire, because signing it would claim a consumer had repeated a check it cannot see.
 */
export type BoxRuntimeSelfTestProbe = {
    /**
     * modules the runtime must be able to load
     */
    imports?: readonly string[];
    commands?: readonly {
        args: readonly string[];
        expectExitCode?: number;
    }[];
    /**
     * builder-only extra source in the runtime's own language
     */
    code?: string | null;
};
/**
 * One command the self-test runs, and the status it must exit with.
 */
export type BoxRuntimeSelfTestInvocation = {
    command: BoxRuntimeArgument;
    args: readonly BoxRuntimeArgument[];
    expectExitCode: number;
};
