/**
 * The build layer: everything needed to turn a scroll into a packed, relocatable box.
 *
 * One substrate only — pixi solves a conda-forge environment from a committed `pixi.lock`, conda-pack
 * relocates it, and the result is extracted into the box's `venv/`. There is deliberately no second
 * dependency backend: a packaging tool with two substrates has to prove every guarantee twice.
 *
 * What the substrate packs is a separate question, and it is answered under `src/runtimes/<id>/`.
 * `repairPosixLaunchers` is re-exported from there rather than owned here: the conda shebang
 * trampoline it rewrites is a Python fact, and the export name is what a caller depends on.
 */

export { createDeterministicZip, extractZipArchive, listZipEntries } from './archive.mjs';
export { collectFiles, fileExists, payloadDigest, sha256File } from './filesystem.mjs';
export { boxReleaseObjectPrefix, boxReleaseStem, builderVersionFields } from './identity.mjs';
export { repairPosixLaunchers } from '../runtimes/python/launchers.mjs';
export {
  createCondaDependencyLicenseAudit,
  lockedCondaDistributions,
  parseCondaPackageReference,
  validateCondaDependencyLicenseAudit,
} from './licenses.mjs';
export {
  condaPackArguments,
  findCondaPack,
  findPixi,
  installAndPackPixiEnvironment,
  pixiInstallArguments,
  pixiLockArguments,
} from './pixi.mjs';
export { fail, run, runResult } from './process.mjs';
export { CONDA_PACK_VERSION } from './toolchain.mjs';
export {
  DEFAULT_WORKSPACE_PATHS,
  SCROLLCASE_CONFIG_FILENAME,
  configureWorkspace,
  findWorkspaceConfig,
  getWorkspace,
  resolveWorkspace,
  workspaceOverridesFromArgv,
  workspaceOverridesFromFlags,
} from './workspace.mjs';
