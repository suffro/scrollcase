/**
 * Types for the scrollcase box format, generated from the JSON Schemas in
 * src/contract/schema/. Do not edit by hand: run `npm run types` instead.
 *
 * The schemas are the source of truth. These types are a projection of them, and the test suite
 * fails if the two disagree.
 */

export type BoxTarget = {
  [k: string]: unknown;
} & {
  /**
   * Operating system the box runs on.
   */
  platform: 'macos' | 'linux' | 'windows';
  /**
   * CPU architecture the box runs on; supported combinations are constrained below.
   */
  arch: 'aarch64' | 'x86_64';
  /**
   * Acceleration backend built into the environment.
   */
  accelerator: 'cpu' | 'metal' | 'cuda';
  /**
   * CUDA ABI as major.minor, for example "12.8". Required for a CUDA target and forbidden for any other, so an identifier can never be ambiguous.
   */
  cudaVersion?: string;
};

/**
 * The optional, shell-free application entry point shared by a scroll, the signed release, and box.json. Its absence means the box is intentionally library-only.
 *
 * Each kind is named <runtime>-<shape>, and the runtime half must be the one the box declares: a python-script in a box whose runtime is native describes something that cannot be run, and is refused rather than guessed at.
 */
export type BoxExecution = PythonScript | PythonModule | NodeScript | NativeBinary;
/**
 * Arguments placed before caller-supplied arguments. Every item is passed directly without a shell.
 */
export type DefaultArgs = string[];

/**
 * Run one regular payload file with the box's own Python interpreter.
 */
export interface PythonScript {
  /**
   * Selects direct script execution.
   */
  kind: 'python-script';
  /**
   * Safe path to a regular Python file inside the box.
   */
  script: string;
  defaultArgs: DefaultArgs;
}
/**
 * Run an importable dotted module with Python's -m option.
 */
export interface PythonModule {
  /**
   * Selects dotted-module execution.
   */
  kind: 'python-module';
  /**
   * Strict Python dotted-module name, without command-line syntax or shell fragments.
   */
  module: string;
  defaultArgs: DefaultArgs;
}
/**
 * Run one regular payload file with the box's own Node runtime.
 */
export interface NodeScript {
  /**
   * Selects direct script execution.
   */
  kind: 'node-script';
  /**
   * Safe path to a regular JavaScript file inside the box.
   */
  script: string;
  defaultArgs: DefaultArgs;
}
/**
 * Run a compiled executable that the box carries directly, with no interpreter in front of it. The only shape a runtime with no module system has.
 */
export interface NativeBinary {
  /**
   * Selects direct execution of a payload file.
   */
  kind: 'native-binary';
  /**
   * Safe path to the executable inside the box. It carries the executable bit because the scroll declared it, not because the build machine happened to have it set.
   */
  binary: string;
  defaultArgs: DefaultArgs;
}

export type Identifier = string;
/**
 * The (platform, arch, accelerator) triple this box is built for. Required in every scroll a build reads, and absent from a base: a base holds what its targets share, so declaring one there would name a target the box does not build. Enforced when the scroll is read rather than here, so a base file still validates in an editor.
 */
export type PayloadPath = string;
export type Sha256 = string;
/**
 * The optional, shell-free application entry point shared by a scroll, the signed release, and box.json. Its absence means the box is intentionally library-only.
 *
 * Each kind is named <runtime>-<shape>, and the runtime half must be the one the box declares: a python-script in a box whose runtime is native describes something that cannot be run, and is refused rather than guessed at.
 */
export interface BoxScroll {
  /**
   * Associates this file with the published Scrollcase v3 schema for editor validation, completion, and hover help.
   */
  $schema?: 'https://scrollcase.dev/schema/v3/scroll.schema.json';
  /**
   * Marks this file as one target's fragment of a box whose shared declarations live in scrolls/<boxId>/scroll.json. The value is fixed: a base is always the box directory's own scroll.json, so there is no path to get wrong and no chain to follow. The base and the fragment are joined into one effective scroll before anything else happens, and that effective scroll is what the build reads and what provenance records.
   */
  extends?: '../scroll.json';
  /**
   * Scrollcase wire version. Version 3 is the only active format.
   */
  schemaVersion: 3;
  /**
   * Optional provenance identity. When omitted, Scrollcase derives it deterministically from boxId and the canonical target.
   */
  scrollId?: string;
  /**
   * Version of this declarative build input, recorded in provenance. Defaults to 1.0.0, which is what an authoring version means before anyone has had reason to change it.
   */
  scrollVersion?: string;
  boxId: Identifier;
  labels?: Labels;
  /**
   * Version of the box this scroll produces, as it will appear in the release manifest.
   */
  version: string;
  /**
   * Upstream revision of the packaged source, recorded verbatim into provenance.
   */
  sourceRevision: string;
  target?: BoxTarget;
  /**
   * Constraints the installing host must satisfy. Copied through into the release manifest verbatim and never interpreted by the builder, so a project may declare its own alongside these. Defaults to empty: declaring no constraint is a legitimate answer, and inventing one would be a claim the project never made.
   */
  compatibility?: {
    /**
     * Lowest version of the installing application this box supports.
     */
    minHostAppVersion?: string;
    maxHostAppVersionExclusive?: string;
    minMacosVersion?: string;
    minRamGb?: number;
    minNvidiaDriverVersion?: string;
    [k: string]: unknown;
  };
  runtime: Runtime;
  /**
   * Pins the pixi release used to solve and install the conda-forge environment from the committed pixi.lock.
   */
  pixiVersion: string;
  /**
   * Path to the reviewed licence inventory derived from pixi.lock, which carries an SPDX licence per package. The build fails if the lock no longer matches what was reviewed.
   */
  condaDependencyLicenseAudit?: string;
  /**
   * Payload directory the box's own large files live under — the destination a scroll's assets conventionally share. Defaults to cache/<boxId>.
   */
  cacheSubdir?: string;
  /**
   * Environment variables the box requires when its interpreter runs. The declaration is copied into box.json and the signed release; its values override both the inherited host environment and caller-supplied values.
   */
  environment?: {
    [k: string]: string;
  };
  /**
   * Base URL of the mirror the built archive and its objects are published under.
   */
  assetBaseUrl?: string;
  /**
   * Files fetched during the build. Every entry is size- and hash-checked before use, so a moved or replaced upstream file fails the build instead of silently changing the box. May be empty, and defaults to empty.
   */
  assets?: {
    url: string;
    relativePath: PayloadPath;
    sizeBytes: number;
    sha256: Sha256;
    /**
     * Whether this file is packed into the archive. True, the default, makes the box self-contained: it installs with no network and works air-gapped. False leaves it out and carries its descriptor in the signed release instead, for the caller's distribution layer to materialize. The choice is per entry, so a box may ship a small entry point and defer a large dataset; consumers verify what was materialized before execution and never download it themselves.
     */
    embed?: boolean;
    /**
     * Whether the file needs the executable bit. HTTP carries content and not permissions, so a downloaded file arrives with none; declaring it here is the only way a box can ship one that runs. The bit is synthesised into the archive from this declaration, never read off the build machine.
     */
    executable?: boolean;
  }[];
  /**
   * Downloaded archives to expand into the payload. Extraction preserves files already present in the destination and refuses to overwrite them.
   */
  assetArchives?: {
    relativePath: PayloadPath;
    format: 'zip' | 'tar.gz';
    destination: PayloadPath;
    stripComponents?: number;
    removeAfterExtract?: boolean;
  }[];
  /**
   * Files copied from the consumer's own repository into the payload. A file already under the project's own version control needs no second copy of its identity here, and what ships is hashed into the signed release either way; declaring sha256 pins one that must not change without review, which suits a licence notice and not a script still being written.
   */
  localFiles?: {
    sourcePath: string;
    relativePath: PayloadPath;
    /**
     * Optional pin. When present the build refuses a file whose contents no longer match.
     */
    sha256?: string;
    /**
     * Whether the file needs the executable bit. A copy does not carry the source file's mode, because a mode read off the build machine would vary with its umask and break the byte-identical rebuild; the bit is synthesised into the archive from this declaration instead.
     */
    executable?: boolean;
  }[];
  /**
   * Payload paths deleted before packing, to keep the box to what it actually needs at run time. Pruning a distribution the lock requires is rejected.
   */
  prunePaths?: PayloadPath[];
  /**
   * Payload paths stored in the archive instead of deflated, because their bytes are already compressed and re-compressing them costs build time while making the archive marginally larger. A path matches itself and everything beneath it, so one entry can name a single large file or the directory an expanded asset archive landed in. Declared assets are stored automatically; this is for anything else the project knows to be already compressed.
   */
  uncompressedPaths?: PayloadPath[];
  /**
   * Builder checks run against the payload before archiving. The signed release carries the probe — the imports and commands a consumer can repeat after extraction — while file assertions and the optional extra source stay builder-only. At least one of imports and commands is required: a box that proves nothing about itself is not a box worth signing.
   */
  selfTest: {
    [k: string]: unknown;
  };
  execution?: BoxExecution;
  /**
   * An optional numerical gate: run a check inside the box on more than one accelerator and require the results to agree. This catches a mis-solved environment — CPU-only wheels shipped as CUDA, a broken BLAS — on the build machine rather than on a user's. The tool runs the check and enforces the thresholds; what the check computes, and what closeness is acceptable, belong to the project.
   */
  parity?: {
    /**
     * Path inside the box, run with the box's own interpreter. It must print a JSON array of numbers, or an object with a "values" array.
     */
    script: string;
    /**
     * Accelerators to run under, each with its target's validation environment. The first is the reference the others are compared against — conventionally cpu, being the one available everywhere.
     *
     * @minItems 2
     */
    accelerators: ['cpu' | 'metal' | 'cuda', 'cpu' | 'metal' | 'cuda', ...('cpu' | 'metal' | 'cuda')[]];
    /**
     * At least one bound. Absolute guards entries near zero, where relative error is meaningless; cosine similarity catches a result that drifted in direction rather than magnitude.
     */
    tolerances: {
      absolute?: number;
      relative?: number;
      minimumCosine?: number;
    };
  };
}
/**
 * Free-form annotations carried through into the signed release untouched. Scrollcase never reads a label; it exists so a project can record what it needs to record — the upstream model a box packages, the team that owns it, the ticket it came from — without the format having to grow a field, and without the format claiming to know what any project's boxes are about.
 */
export interface Labels {
  [k: string]: string;
}
/**
 * What runs inside the box. A target says which machine the box is for; this says what executes on it — which is a different question, and until version 3 the format never asked it: a box declared a Python interpreter path and Python execution kinds and nothing that said "Python".
 */
export interface Runtime {
  /**
   * The runtime the box carries. The list is closed rather than free-form: each id implies a payload layout, a set of execution kinds and an argv rule that a consumer has to already know, so an unrecognised one is a box that cannot be run, not a box with an unusual label.
   */
  id: 'python' | 'node' | 'native';
  /**
   * The runtime's own version, solved into the box and recorded in provenance. Required by any runtime whose layout depends on it — Python names its standard library after major.minor — and legitimately absent for one that has no interpreter to version, which is why the format does not demand it.
   */
  version?: string;
  /**
   * The runtime's own executable, relative to the box root. The runtime's layout for a given target admits exactly one value, so this is derived when omitted and still checked against the layout when declared. Absent for a runtime that has no separate executable to name.
   */
  entryPoint?: string;
}
/**
 * Run one regular payload file with the box's own Python interpreter.
 */
export type DeferredAssets = [
  {
    url: string;
    relativePath: string;
    sizeBytes: number;
    sha256: string;
    /**
     * Present and true when the scroll declared the file executable. Whoever materializes it owns setting the bit: the file never passes through the archive, so nothing Scrollcase writes can carry a mode for it.
     */
    executable?: boolean;
  },
  ...{
    url: string;
    relativePath: string;
    sizeBytes: number;
    sha256: string;
    /**
     * Present and true when the scroll declared the file executable. Whoever materializes it owns setting the bit: the file never passes through the archive, so nothing Scrollcase writes can carry a mode for it.
     */
    executable?: boolean;
  }[]
];

/**
 * The manifest packed inside the archive at box.json. It restates the box's identity, layout and provenance so an extracted box is self-describing: a consumer that has the directory but not the release document can still tell what it is holding and how it was built.
 */
export interface BoxManifest {
  schemaVersion: 3;
  boxId: string;
  labels?: Labels;
  version: string;
  target: BoxTarget;
  runtime: Runtime;
  cacheSubdir: string;
  /**
   * Environment variables repeated from the signed release. Scrollcase consumers compare this declaration before execution and apply it over inherited and caller-supplied values.
   */
  environment?: {
    [k: string]: string;
  };
  selfTest: SelfTest;
  execution?: BoxExecution;
  provenance: Provenance;
  assets?: DeferredAssets;
}
/**
 * Free-form annotations the publishing project declared, signed and carried through untouched. Scrollcase attaches no meaning to any key; a consumer that reads one is reading its own project's convention, not the box format.
 */
export interface SelfTest {
  probe: SelfTestProbe;
  timeoutSeconds: number;
}
/**
 * What the box proves about itself, in whichever shapes its runtime supports. The runtime turns this into command lines; nothing here is a command line, and nothing here is source in any language.
 */
export interface SelfTestProbe {
  /**
   * Modules the runtime must be able to load.
   *
   * @minItems 1
   */
  imports?: [string, ...string[]];
  /**
   * Invocations of the box's declared execution and the exit status each must produce.
   *
   * @minItems 1
   */
  commands?: [
    {
      args: string[];
      expectExitCode: number;
    },
    ...{
      args: string[];
      expectExitCode: number;
    }[]
  ];
}
/**
 * Run one regular payload file with the box's own Python interpreter.
 */
export interface Provenance {
  scrollId: string;
  scrollVersion: string;
  /**
   * Exact commit of the builder source that produced the box.
   */
  builderRevision: string;
  /**
   * Whether the builder's working tree carried uncommitted changes. True means the build is not reproducible from the recorded revision alone.
   */
  sourceTreeDirty: boolean;
  /**
   * Upstream revision of the packaged source, as declared by the scroll.
   */
  sourceRevision: string;
  /**
   * The runtime version the environment was solved with, repeated from runtime.version. Absent exactly when the runtime has none: provenance records what was observed and never invents a value to fill a field.
   */
  runtimeVersion?: string;
  pixiVersion: string;
  /**
   * Hash of the pixi.lock the environment was solved from.
   */
  dependencyLockSha256: string;
  builtAt: string;
}

export interface BoxReleaseManifest {
  schemaVersion: 3;
  /**
   * Wire discriminator, "<namespace>.release". The namespace belongs to the publishing project — a project with boxes already in the field must keep emitting the one its clients recognise — and defaults to scrollcase.box for a new one.
   */
  kind: string;
  boxId: Identifier;
  labels?: Labels;
  version: string;
  target: BoxTarget;
  /**
   * What the host must satisfy before this box may be installed. The builder copies these constraints through verbatim and never interprets them, so a project may add its own alongside the ones defined here. A consumer that cannot evaluate a constraint must refuse the box rather than assume it passes.
   */
  compatibility: {
    /**
     * Lowest version of the installing application this box supports.
     */
    minHostAppVersion?: string;
    maxHostAppVersionExclusive?: string;
    minMacosVersion?: string;
    /**
     * Installed memory in decimal gigabytes (1 GB = 1,000,000,000 bytes).
     */
    minRamGb?: number;
    minNvidiaDriverVersion?: string;
    /**
     * Host environments this payload was validated on.
     *
     * @minItems 1
     */
    hostEnvironments?: ['native' | 'windows-wsl2', ...('native' | 'windows-wsl2')[]];
    [k: string]: unknown;
  };
  archive: {
    format: 'zip';
    url: string;
    sha256: Sha256;
    sizeBytes: number;
  };
  /**
   * Sum of extracted payload file sizes before activation metadata is written, so a consumer can check free space before downloading.
   */
  installedSizeBytes?: number;
  /**
   * SHA-256 of the canonical entry list carried at payload-digest.v1 inside the payload, letting a consumer re-identify an extracted installation once the archive is gone. Optional: boxes built before it exists carry no such commitment.
   */
  payloadDigest?: {
    format: 'sha256-path-list-v1';
    sha256: Sha256;
  };
  runtime: Runtime;
  /**
   * Directory relative to the extracted box root holding the box's own large files.
   */
  cacheSubdir: string;
  /**
   * Signed environment variables applied whenever Scrollcase runs the box interpreter. These values override both the inherited host environment and caller-supplied values.
   */
  environment?: {
    [k: string]: string;
  };
  selfTest: SelfTest;
  execution?: BoxExecution;
  provenance: Provenance;
  assets?: DeferredAssets;
}
/**
 * Free-form annotations the publishing project declared, signed and carried through untouched. Scrollcase attaches no meaning to any key; a consumer that reads one is reading its own project's convention, not the box format.
 */
export interface BoxChannelManifest {
  schemaVersion: 3;
  /**
   * Wire discriminator, "<namespace>.channel", carrying the same namespace as the releases it refers to.
   */
  kind: string;
  channel: 'nightly' | 'beta' | 'stable';
  boxId: string;
  target: BoxTarget;
  updatedAt: string;
  /**
   * Salt mixed into a client's rollout hash. It makes cohort assignment stable per client and unpredictable across channels, so a staged rollout cannot be gamed by reinstalling.
   */
  cohortSalt: string;
  /**
   * Candidate releases in evaluation order. A client takes the first entry whose rollout cohort it falls into.
   *
   * @minItems 1
   */
  releases: [
    {
      version: string;
      releaseManifestUrl: string;
      rolloutPercentage: number;
    },
    ...{
      version: string;
      releaseManifestUrl: string;
      rolloutPercentage: number;
    }[]
  ];
}

/**
 * Omitted when every target of that version is revoked.
 */
export interface BoxRevocationsManifest {
  schemaVersion: 3;
  /**
   * Wire discriminator, "<namespace>.revocations", carrying the same namespace as the releases it refers to.
   */
  kind: string;
  updatedAt: string;
  /**
   * May be empty: an empty signed list is a positive statement that nothing is revoked, which a client can distinguish from a missing or withheld document.
   */
  revocations: {
    boxId: string;
    version: string;
    target?: BoxTarget;
    reason: string;
    revokedAt: string;
  }[];
}

/**
 * The envelope wrapping every signed document. The payload travels as exact base64-encoded JSON so that verifying a signature means hashing the bytes as transmitted, with no canonical-JSON implementation to keep in sync across languages. Passing this schema means the envelope is well-formed, never that its signature is valid.
 */
export interface SignedBoxDocument {
  schemaVersion: 3;
  payloadEncoding: 'base64-json-utf8';
  /**
   * The document payload: UTF-8 JSON, base64-encoded, signed and hashed exactly as it appears here.
   */
  payloadBase64: string;
  /**
   * SHA-256 of the decoded payload bytes.
   */
  payloadSha256: string;
  /**
   * Detached signatures over the decoded payload bytes. A verifier accepts the document when any one signature verifies against a trusted key, which is what allows a key to be rotated without reissuing every document.
   *
   * @minItems 1
   */
  signatures: [
    {
      algorithm: 'ed25519';
      keyId: string;
      signatureBase64: string;
    },
    ...{
      algorithm: 'ed25519';
      keyId: string;
      signatureBase64: string;
    }[]
  ];
}
