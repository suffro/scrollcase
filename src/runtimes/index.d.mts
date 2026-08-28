/**
 * Returns the builder-side adapter for a runtime id.
 *
 * @param {string} runtimeId
 * @returns {RuntimeBuilder}
 * @throws {TypeError} when Scrollcase cannot build boxes for that runtime
 */
export function runtimeBuilder(runtimeId: string): RuntimeBuilder;
/**
 * Lists every runtime the builder can pack, for the CLI's own listings and for contract tests.
 *
 * @returns {RuntimeBuilder[]} every builder, as a fresh array
 */
export function runtimeBuilders(): RuntimeBuilder[];
/**
 * What the builder needs from a runtime, beyond what the contract already states.
 */
export type RuntimeBuilder = {
    id: string;
    /**
     * the pure half, so a
     * caller holding a builder never has to look the same runtime up twice
     */
    contract: import("../contract/runtimes.mjs").BoxRuntimeAdapter;
    /**
     * the
     * `[dependencies]` entry a generated pixi manifest declares for this runtime, or null for a
     * runtime that installs nothing of its own
     */
    pixiDependency: (runtimeVersion: string) => {
        name: string;
        spec: string;
    } | null;
    /**
     * makes generated console
     * scripts stop pointing at the build machine — by rewriting them where the runtime's trampoline
     * is understood, and by refusing the box where it is not
     */
    repairLaunchers: (layout: import("../contract/runtimes.mjs").BoxRuntimeLayout, payloadDir: string, forbiddenPaths: readonly string[]) => Promise<void>;
    /**
     * the source `new scroll` writes, or null for a
     * runtime whose entry point Scrollcase cannot generate
     */
    templates: RuntimeTemplates | null;
    /**
     * writes the files
     * this runtime needs in the payload that nothing declares, returning what it wrote. Optional:
     * most runtimes need none.
     */
    preparePayload?: (payloadDir: string) => Promise<readonly string[]>;
};
export type RuntimeTemplates = {
    /**
     * the application entry point a generated scroll points at
     */
    script: string;
    /**
     * the self-test a generated scroll runs
     */
    selfTest: string;
    /**
     * what the generated entry point is called
     */
    scriptFileName: string;
    /**
     * what the generated self-test is called
     */
    selfTestFileName: string;
    /**
     * a module every box of this runtime can load, for the probe a
     * generated scroll starts with
     */
    starterImport: string;
};
