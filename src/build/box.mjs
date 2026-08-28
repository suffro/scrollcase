/**
 * `build` — assemble the environment, prove it works, archive it, sign it.
 *
 * In order: solve and pack the conda-forge environment from the committed lock, fetch and unpack the
 * declared assets, prune what is not needed at run time, audit dependency licences, self-test with
 * the payload's *own* interpreter, normalise timestamps, zip deterministically, and emit a signed
 * release plus a signed channel pointer.
 *
 * The self-test is the step that earns the box its name. The builder runs the platform assertion,
 * the probe the scroll declared, its file assertions and any extra source it named; the release
 * signs the probe alone, which is what a consumer can repeat after extraction. The distinction is
 * deliberate rather than pretending the narrower consumer check reproduces assertions it cannot
 * see.
 *
 * The archive is content-addressed by its own hash, so the release document can commit to it and any
 * consumer can verify it byte for byte.
 */

import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { assertNativeHost, boxTargetId } from '../contract/targets.mjs';
import { runtimeAdapter } from '../contract/runtimes.mjs';
import { BOX_SCHEMA_VERSION, CHANNELS, documentKinds } from '../contract/documents.mjs';
import { mergeEnvironmentLayers } from '../environment.mjs';
import {
  PAYLOAD_DIGEST_FILE,
  PAYLOAD_DIGEST_FORMAT,
  payloadDigestStream,
} from '../contract/payload-digest.mjs';
import { signDocument } from '../sign/index.mjs';
import { copyVerifiedLocalFile, downloadVerified, expandAssetArchive, moveIntoPlace } from './assets.mjs';
import { archiveMarksExecutable, createDeterministicZip } from './archive.mjs';
import {
  collectFiles,
  fileExists,
  normalizeTree,
  payloadDigestEntries,
  payloadSize,
  safeRelativePath,
  sha256File,
} from './filesystem.mjs';
import { assertExecutionFiles } from './execution.mjs';
import { boxReleaseObjectPrefix, boxReleaseStem, builderVersionFields } from './identity.mjs';
import {
  createCondaDependencyLicenseAudit,
  validateBundledLicenses,
  validateCondaDependencyLicenseAudit,
} from './licenses.mjs';
import { checkParity } from './parity.mjs';
import { findCondaPack, findPixi, installAndPackPixiEnvironment } from './pixi.mjs';
import { runtimeBuilder } from '../runtimes/index.mjs';
import { fail, run as runProcess } from './process.mjs';
import { readScroll, sourceBuildState, sourceBuildTime } from './scroll.mjs';
import { getWorkspace } from './workspace.mjs';

const SELF_TEST_TIMEOUT_SECONDS = 180;
const sha256Hex = (bytes) => createHash('sha256').update(bytes).digest('hex');

/**
 * The extra self-test source a scroll declares, read from the file it names or taken inline.
 *
 * A real self-test outgrows a JSON string quickly, so `script` points at a file in the project that
 * an editor, a linter and a diff can all see. It is read here rather than at scroll-read time
 * because it is build input, not part of the box format.
 */
async function selfTestExtraCode(scroll, projectRoot) {
  const { code, script } = scroll.selfTest;
  if (!script) return code ?? null;
  const path = join(projectRoot, safeRelativePath(script));
  if (!await fileExists(path)) fail(`Self-test script is missing: ${script}`);
  return readFile(path, 'utf8');
}

/**
 * Runs the scroll's self-test against the payload, under the target's validation environment.
 *
 * The builder's probe is the signed one plus whatever extra source the scroll declared, and the
 * runtime is the only thing that knows how to turn either into command lines. A probe may imply
 * several — an import check and any number of command invocations — and each is run from the
 * payload root with its own required exit status, because a check that passes by exiting non-zero
 * is a check that never ran.
 */
function runSelfTest({ adapter, scroll, payloadDir, run, extraCode = null }) {
  const invocations = runtimeAdapter(scroll.runtime.id).selfTestInvocations({
    probe: { ...scroll.selfTest, code: extraCode },
    execution: scroll.execution,
    target: adapter,
  });
  const env = mergeEnvironmentLayers(
    adapter.platform,
    scroll.environment ?? {},
    adapter.validationEnvironments[scroll.target.accelerator],
  );
  const resolve = (argument) => (argument.kind === 'payload-path'
    ? join(payloadDir, ...safeRelativePath(argument.value).split('/'))
    : argument.value);
  for (const invocation of invocations) {
    run(resolve(invocation.command), invocation.args.map(resolve), {
      cwd: payloadDir,
      env,
      expectExitCode: invocation.expectExitCode,
    });
  }
}

/** Writes one notices file, creating the directory the first of them needs. */
async function writeNotice(payloadDir, name, value) {
  const path = join(payloadDir, 'THIRD_PARTY_NOTICES', name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * Writes the licence inventories the box ships, after proving each still describes this box.
 *
 * Two halves, known two different ways — see `licenses.mjs`. Both land under `THIRD_PARTY_NOTICES/`,
 * because someone opening a box to answer a licence question looks in one place and half a notices
 * directory is worse than none. The declared half is also returned, because unlike the derived one
 * it travels in the signed release: a licence decision is made before an archive is downloaded, and
 * a list only a downloaded archive reveals is a list that arrives too late to act on.
 *
 * @returns {Promise<import('./licenses.mjs').BundledDependency[] | null>}
 */
async function writeLicenceInventories({ scroll, lockPath, payloadDir, projectRoot, carriedPaths }) {
  if (scroll.condaDependencyLicenseAudit) {
    const actual = createCondaDependencyLicenseAudit({
      lockBytes: await readFile(lockPath),
      targetId: boxTargetId(scroll.target),
    });
    const reviewedPath = join(projectRoot, safeRelativePath(scroll.condaDependencyLicenseAudit));
    const reviewed = JSON.parse(await readFile(reviewedPath, 'utf8'));
    validateCondaDependencyLicenseAudit(reviewed, actual);
    await writeNotice(payloadDir, 'conda-distributions.json', actual);
  }
  if (!scroll.bundledLicenseDeclaration) return null;
  const declarationPath = join(projectRoot, safeRelativePath(scroll.bundledLicenseDeclaration));
  if (!await fileExists(declarationPath)) {
    fail(`Bundled licence declaration is missing: ${scroll.bundledLicenseDeclaration}`);
  }
  const bundled = await validateBundledLicenses(
    JSON.parse(await readFile(declarationPath, 'utf8')),
    carriedPaths,
  );
  await writeNotice(payloadDir, 'bundled-dependencies.json', bundled);
  return bundled;
}

/**
 * Builds, self-tests, archives, and signs the box a scroll describes — the whole pipeline the
 * module header narrates. `name` is an exact scroll reference, or an unambiguous box shorthand;
 * options override signing, channel, namespace, and toolchain paths. `run`,
 * `runResult`, and `fetchImpl` are the injection seams the tests use to substitute the toolchain
 * and asset transport.
 */
export async function buildBox(name, options = {}) {
  const {
    allowDirty = false,
    channel = 'beta',
    assetBaseUrl: assetBaseUrlOverride = null,
    namespace,
    signerCommand = null,
    privatePath,
    publicPath,
    pixiPath = null,
    condaPackPath = null,
    run = runProcess,
    runResult = null,
    fetchImpl = fetch,
    log = console.log,
  } = options;
  // Tool discovery probes with its own runner; a caller may substitute one to drive a build without
  // the real toolchain on PATH.
  const probe = runResult ? { runResult } : {};
  const workspace = getWorkspace();
  const { adapter, dir, scroll } = await readScroll(name);
  if (!CHANNELS.includes(channel)) {
    fail(`Unsupported channel: ${channel}. Use ${CHANNELS.join(' or ')}.`);
  }
  // Whether an asset ships inside the archive is per entry and declared by the scroll, so there is
  // nothing to ask and nothing to override: a build-time override would silently repack a box under
  // an identity that no longer describes it. What the scroll decided is reported, not negotiated.
  const deferred = scroll.assets.filter((asset) => asset.embed === false);
  log(`Runtime: ${scroll.runtime.id}${scroll.runtime.version ? ` ${scroll.runtime.version}` : ''}`);
  log(`Assets:  ${scroll.assets.length - deferred.length} embedded, ${deferred.length} on demand`);
  // Wheels, native libraries, and the interpreter are proven on the exact OS/architecture they ship for.
  assertNativeHost(adapter);
  const pixi = findPixi({ requiredVersion: scroll.pixiVersion, path: pixiPath, ...probe });
  const condaPack = findCondaPack({ path: condaPackPath, ...probe });
  const lockPath = join(dir, 'pixi.lock');
  // A build installs from the lock and never resolves, so a missing lock is a hard error rather than
  // an invitation to resolve dependencies on the fly.
  if (!await fileExists(lockPath)) fail(`Missing dependency lock: ${lockPath}`);
  const lockSha = await sha256File(lockPath);

  const source = sourceBuildState(workspace.root);
  if (!source) fail('A box records the commit it was built from; run inside a git checkout.');
  // If the tree is dirty that record is a lie — the artefact would not be reproducible from that
  // revision — so refuse unless the caller explicitly accepts it for local development.
  if (source.dirty && !allowDirty) {
    fail('Refusing to build from a dirty source tree. Commit first, or pass --allow-dirty for local development.');
  }

  const buildDir = join(workspace.buildDir, scroll.scrollId);
  const payloadDir = join(buildDir, 'payload');
  // `dist` is laid out as the two things a publisher does with it, and nothing else. `boxes/` is
  // the tree that goes under the asset base URL verbatim — the same prefix the signed documents
  // write into their own URLs, so uploading it is a copy rather than a mapping. `channels/` is
  // separate because a channel is not part of any one version: it is a pointer that moves to the
  // next one, and filing it under 1.0.0 would leave a stale copy claiming to be current the moment
  // 1.0.1 ships. Nothing is written twice: what is on disk here is what gets published.
  const objectPrefix = boxReleaseObjectPrefix(scroll);
  const objectDir = join(workspace.distDir, ...objectPrefix.split('/'));
  const archivePath = join(buildDir, `${boxReleaseStem(scroll)}.zip`);
  // Always start from an empty tree: leftovers from a previous build would end up in the archive.
  await rm(buildDir, { recursive: true, force: true });
  await rm(objectDir, { recursive: true, force: true });
  await mkdir(payloadDir, { recursive: true });

  // `conda-pack` owns the progress bar a user sees. Its 100% means only that the relocatable
  // tarball is complete; extraction and repair still take real time. Report that handoff exactly
  // after the subprocess returns, without teaching the public pixi helper about terminal output.
  const runEnvironmentCommand = (command, args, runOptions) => {
    const result = run(command, args, runOptions);
    if (command === condaPack) log('Extracting and relocating packed environment');
    return result;
  };
  const { interpreter } = await installAndPackPixiEnvironment({
    pixi,
    condaPack,
    manifestPath: join(dir, 'pixi.toml'),
    lockPath,
    buildDir,
    payloadDir,
    adapter,
    run: runEnvironmentCommand,
    runtimeId: scroll.runtime.id,
  });

  log('Preparing payload');
  // An embedded asset is packed into the archive, so a box made only of them installs with no
  // network and works air-gapped. A deferred one is left out and its descriptor carried in the
  // signed release instead, for the caller's distribution layer to materialize; consumers verify
  // those bytes before execution, and the declared hash is what keeps that safe. The choice trades
  // archive size against an install-time dependency on the asset host, and it is per entry so that
  // a box can ship a small entry point and defer a large dataset.
  for (const asset of scroll.assets) {
    if (asset.embed === false) continue;
    log(`Downloading ${asset.relativePath}`);
    await downloadVerified(asset, join(payloadDir, safeRelativePath(asset.relativePath)), {
      fetchImpl,
      log,
    });
  }
  const deferredAssets = new Set(deferred.map((asset) => asset.relativePath));
  for (const file of scroll.localFiles ?? []) {
    await copyVerifiedLocalFile(file, payloadDir, workspace.root);
  }
  // An asset archive is expanded at build time and has no descriptor to defer, so the schema gives
  // it no `embed` field and there is nothing to skip here.
  for (const archive of scroll.assetArchives ?? []) {
    await expandAssetArchive(payloadDir, archive);
  }
  // Drops what is only needed to build (tests, docs, bundled sample data). A box is a multi-gigabyte
  // download for an end user, so pruning is a user-facing concern rather than tidiness.
  for (const prunePath of scroll.prunePaths ?? []) {
    await rm(join(payloadDir, safeRelativePath(prunePath)), { recursive: true, force: true });
  }
  // Whatever the runtime needs in the payload that nothing declares. It runs after the prunes, so
  // a project cannot prune a file the runtime is about to write, and before the payload is read,
  // so what it writes is archived and digested like everything else.
  for (const written of await runtimeBuilder(scroll.runtime.id).preparePayload?.(payloadDir) ?? []) {
    log(`Writing ${written}`);
  }
  // Read once, after every staging step and every prune: this is the payload as it will be
  // archived, and both the licence declaration and the execution check are questions about that
  // tree rather than about what the scroll asked for.
  const payloadFiles = new Set(await collectFiles(payloadDir));
  const bundledLicenses = await writeLicenceInventories({
    scroll,
    lockPath,
    payloadDir,
    projectRoot: workspace.root,
    carriedPaths: new Set([...payloadFiles, ...deferredAssets]),
  });
  // Guards against over-pruning: the files the box needs at run time must still be there.
  for (const requiredFile of scroll.selfTest.files ?? []) {
    // A deferred asset is legitimately absent from the payload; anything else missing means pruning
    // removed something the box needs at run time.
    if (deferredAssets.has(requiredFile)) continue;
    if (!await fileExists(join(payloadDir, safeRelativePath(requiredFile)))) {
      fail(`Missing self-test file: ${requiredFile}`);
    }
  }
  assertExecutionFiles({
    execution: scroll.execution,
    adapter,
    runtimeId: scroll.runtime.id,
    runtimeVersion: scroll.runtime.version,
    files: payloadFiles,
  });
  // Everything needed to answer "where did this box come from, and could I rebuild it?".
  const provenance = {
    scrollId: scroll.scrollId,
    scrollVersion: scroll.scrollVersion,
    builderRevision: source.revision,
    sourceTreeDirty: source.dirty,
    sourceRevision: scroll.sourceRevision,
    // Omitted rather than defaulted when the runtime has no version: an invented value is a
    // provenance record that lies about what was observed.
    ...(scroll.runtime.version === undefined ? {} : { runtimeVersion: scroll.runtime.version }),
    ...builderVersionFields(scroll),
    dependencyLockSha256: lockSha,
    builtAt: sourceBuildTime(workspace.root),
  };
  // The signed probe is what a consumer can repeat: the imports and commands, and neither the file
  // assertions nor the extra source, which no consumer can see to reproduce.
  const selfTest = {
    probe: {
      ...(scroll.selfTest.imports ? { imports: scroll.selfTest.imports } : {}),
      ...(scroll.selfTest.commands
        ? {
          commands: scroll.selfTest.commands.map(({ args, expectExitCode }) => ({
            args,
            expectExitCode: expectExitCode ?? 0,
          })),
        }
        : {}),
    },
    timeoutSeconds: SELF_TEST_TIMEOUT_SECONDS,
  };
  // Descriptors travel with the box only for the assets the consumer has to fetch itself.
  const deferredDescriptors = deferred.length === 0 ? {} : {
    assets: deferred.map(({ url, relativePath, sizeBytes, sha256, executable }) => ({
      url,
      relativePath,
      sizeBytes,
      sha256,
      ...(executable ? { executable: true } : {}),
    })),
  };
  const identity = {
    boxId: scroll.boxId,
    ...(scroll.labels === undefined ? {} : { labels: scroll.labels }),
    version: scroll.version,
  };
  const execution = scroll.execution ? { execution: scroll.execution } : {};
  const environment = scroll.environment === undefined ? {} : { environment: scroll.environment };
  // Absent rather than empty when the project declared nothing: an empty list would read as "this
  // box bundles no third-party code", which is a claim Scrollcase is in no position to make.
  const notices = bundledLicenses === null ? {} : { bundledLicenses };
  // box.json travels *inside* the archive. A consumer compares it field by field against the signed
  // release, which is what binds the archive's contents to its signed metadata.
  //
  // It is written *before* the self-test so that the test runs against the payload the box will
  // actually ship. Writing it afterwards meant an application that reads its own box.json — the
  // supported way to find where the model was placed, rather than hard-coding a path — could not be
  // self-tested at all: the check ran against a payload missing a file the box has. Nothing here
  // depends on the test or the parity gate, so there was never a reason for it to wait.
  await writeFile(join(payloadDir, 'box.json'), `${JSON.stringify({
    schemaVersion: BOX_SCHEMA_VERSION,
    ...identity,
    target: scroll.target,
    runtime: scroll.runtime,
    cacheSubdir: scroll.cacheSubdir,
    ...notices,
    selfTest,
    ...environment,
    ...execution,
    ...deferredDescriptors,
    provenance,
  }, null, 2)}\n`);

  log('Running self-test');
  runSelfTest({
    adapter,
    scroll,
    payloadDir,
    run,
    extraCode: await selfTestExtraCode(scroll, workspace.root),
  });
  // Parity runs after the self-test, on the same payload: there is no point comparing accelerators
  // in a box that cannot import its dependencies in the first place.
  if (scroll.parity) log('Running parity gate');
  const parity = await checkParity({
    parity: scroll.parity,
    adapter,
    interpreter,
    payloadDir,
    environment: scroll.environment,
    run,
  });
  if (parity) {
    log(`Parity passed on ${parity.comparisons.map((c) => c.accelerator).join(', ')} against ${parity.comparisons[0].reference}`);
  }

  log('Finalizing payload');
  // The entry list is the last thing written, because it describes everything already there and
  // cannot describe itself. It goes in before `normalizeTree` so it carries the same fixed mtime as
  // the rest, and before `payloadSize` so the size a consumer checks free space against is honest.
  // This costs one full sequential read of the payload — real minutes on a box carrying embedded
  // assets — and it is paid here rather than folded into the archive writer, which has no business
  // knowing a format rule that is not about archiving.
  const digestStream = payloadDigestStream(await payloadDigestEntries(payloadDir));
  await writeFile(join(payloadDir, PAYLOAD_DIGEST_FILE), digestStream);
  const payloadDigestValue = { format: PAYLOAD_DIGEST_FORMAT, sha256: sha256Hex(digestStream) };
  await normalizeTree(payloadDir);
  const installedSizeBytes = await payloadSize(payloadDir);
  await mkdir(workspace.distDir, { recursive: true });
  // Declared assets are the one thing a box carries that arrives already compressed, so they are
  // stored rather than deflated without the project having to say so. `uncompressedPaths` covers
  // what only the project can know: the tree an expanded archive left behind, a bundled corpus.
  // A deferred asset is not in the payload at all, and simply matches nothing.
  const uncompressedPaths = [
    ...scroll.assets.map((asset) => safeRelativePath(asset.relativePath)),
    ...(scroll.uncompressedPaths ?? []).map((path) => safeRelativePath(path)),
  ];
  // The executable bit is synthesised, never read off the build machine, so what carries it has to
  // be *declared*: the runtime's own rule covers the interpreter and the console scripts a conda
  // prefix generates, and the scroll covers everything it brought in itself. A downloaded file
  // arrives with no mode at all — HTTP carries content, not permissions — so without this a box
  // could not ship an asset that runs.
  const declaredExecutablePaths = [
    ...scroll.assets,
    ...(scroll.localFiles ?? []),
  ].filter((entry) => entry.executable && entry.embed !== false)
    .map((entry) => safeRelativePath(entry.relativePath));
  // Whatever the box starts has to come out of the archive runnable. For an interpreted runtime
  // that is the interpreter, and the runtime's own rule covers it; for a native one it is a file
  // the scroll brought in, and only the scroll can say the bit belongs on it. Asked through the
  // argv rule rather than by naming an execution kind here, so the guard holds for every runtime
  // and keeps holding for the next one.
  if (scroll.execution) {
    const { command } = runtimeAdapter(scroll.runtime.id).buildArgv({
      execution: scroll.execution,
      target: adapter,
    });
    const commandPath = safeRelativePath(command.value);
    if (!archiveMarksExecutable(adapter, scroll.runtime.id, declaredExecutablePaths, commandPath)) {
      fail(`This box runs ${commandPath}, which the archive would not mark executable. Declare it with "executable": true on the asset or local file that brings it in.`);
    }
  }
  log('Creating deterministic archive');
  await createDeterministicZip(payloadDir, archivePath, adapter, {
    uncompressedPaths,
    runtimeId: scroll.runtime.id,
    executablePaths: declaredExecutablePaths,
  });

  log('Hashing deterministic archive');
  const archiveSha = await sha256File(archivePath);
  const archiveSize = (await stat(archivePath)).size;
  // Content-addressed: the object is named after its own hash, so publishing is idempotent and an
  // object can never be replaced with different bytes under the same URL.
  const archiveObject = `${objectPrefix}/${archiveSha}.zip`;
  const assetBaseUrl = String(assetBaseUrlOverride || scroll.assetBaseUrl || '').replace(/\/$/, '');
  if (!assetBaseUrl) fail('No asset base URL: declare assetBaseUrl in the scroll or pass --asset-base-url.');
  const kinds = documentKinds(namespace);
  const signing = { signerCommand, privatePath, publicPath };
  log('Signing release and channel');

  const release = {
    schemaVersion: BOX_SCHEMA_VERSION,
    kind: kinds.release,
    ...identity,
    target: scroll.target,
    compatibility: scroll.compatibility,
    archive: { format: 'zip', url: `${assetBaseUrl}/${archiveObject}`, sha256: archiveSha, sizeBytes: archiveSize },
    installedSizeBytes,
    payloadDigest: payloadDigestValue,
    runtime: scroll.runtime,
    cacheSubdir: scroll.cacheSubdir,
    ...notices,
    selfTest,
    ...environment,
    ...execution,
    ...deferredDescriptors,
    provenance,
  };
  // Written beside the archive, under the same scratch rule: named for its own hash once it has one.
  const stagedReleasePath = join(buildDir, 'release.json');
  await writeFile(stagedReleasePath, `${JSON.stringify(await signDocument(release, signing), null, 2)}\n`);

  // The channel points at the release document by *its* hash too, so the whole chain is
  // content-addressed: channel -> release document -> archive.
  const releaseDocumentSha = await sha256File(stagedReleasePath);
  const channelDocument = {
    schemaVersion: BOX_SCHEMA_VERSION,
    kind: kinds.channel,
    channel,
    boxId: scroll.boxId,
    target: scroll.target,
    updatedAt: provenance.builtAt,
    // Derived from box and version rather than random, so rebuilding the same release reproduces the
    // same cohort assignment instead of reshuffling which users receive it.
    cohortSalt: sha256Hex(Buffer.from(`${scroll.boxId}:${scroll.version}`)).slice(0, 32),
    // A freshly built channel goes out at 100%; a staged rollout is arranged by editing this document
    // rather than by the builder.
    releases: [{
      version: scroll.version,
      releaseManifestUrl: `${assetBaseUrl}/${objectPrefix}/${releaseDocumentSha}.release.json`,
      rolloutPercentage: 100,
    }],
  };
  // One file per channel per target, filed by channel rather than by version: it is a pointer, and
  // the next release moves it rather than adding a second one.
  const channelDir = join(workspace.distDir, 'channels', scroll.boxId, channel);
  const channelPath = join(channelDir, `${boxTargetId(scroll.target)}.json`);
  await mkdir(channelDir, { recursive: true });
  await writeFile(channelPath, `${JSON.stringify(await signDocument(channelDocument, signing), null, 2)}\n`);

  // Both documents move — not copy — into the tree a publisher uploads, so the only copy that
  // exists is the one that gets published and there is no second name for the same bytes.
  await mkdir(objectDir, { recursive: true });
  const publishedArchive = join(objectDir, `${archiveSha}.zip`);
  const publishedRelease = join(objectDir, `${releaseDocumentSha}.release.json`);
  await moveIntoPlace(archivePath, publishedArchive);
  await moveIntoPlace(stagedReleasePath, publishedRelease);
  log(`Box:     ${publishedArchive}`);
  log(`Release: ${publishedRelease}`);
  log(`Channel: ${channelPath}`);
  log('');
  log(`Publish: upload ${join(workspace.distDir, 'boxes')} under ${assetBaseUrl}, keeping its paths,`);
  log('         then publish the channel document where your clients look for it.');
  return {
    archivePath: publishedArchive,
    releasePath: publishedRelease,
    channelPath,
    archiveSha256: archiveSha,
    installedSizeBytes,
    deferredAssets: deferred.length,
    parity,
  };
}
