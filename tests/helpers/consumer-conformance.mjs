import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createWriteStream } from 'node:fs';
import {
  chmod,
  mkdir,
  readFile,
  readlink,
  readdir,
  rename,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';
import {
  collectFiles,
  payloadDigestEntries,
  payloadSize,
  sha256File,
} from '../../src/build/filesystem.mjs';
import {
  PAYLOAD_DIGEST_FILE,
  PAYLOAD_DIGEST_FORMAT,
  payloadDigestStream,
} from '../../src/contract/payload-digest.mjs';
import { boxTargetAdapter, boxTargetId } from '../../src/contract/targets.mjs';
import { runtimeAdapter } from '../../src/contract/runtimes.mjs';
import {
  attachExtractedBox,
  runBox,
  runExtractedBox,
  verifyAndExtractBox,
  verifyExtractedPayload,
} from '../../src/consumer/index.mjs';
import { parseTrustedKeys } from '../../src/sign/index.mjs';
import {
  createConsumerBoxFixture,
  nativeTarget,
  writeSignedRelease,
} from './consumer-box-fixture.mjs';

const ASSET_BYTES = Buffer.from('trusted on-demand bytes');
const TARGETS = {
  'macos-aarch64-cpu': { platform: 'macos', arch: 'aarch64', accelerator: 'cpu' },
  'linux-x86_64-cpu': { platform: 'linux', arch: 'x86_64', accelerator: 'cpu' },
  'windows-x86_64-cpu': { platform: 'windows', arch: 'x86_64', accelerator: 'cpu' },
};

const POST_EXTRACTION_MUTATIONS = new Set([
  'attach-missing-root',
  'attach-file-root',
  'attach-symlink-root',
  'add-root-files',
  'chmod-script',
  'touch-script',
  'tamper-script',
  'remove-interpreter',
  'remove-script',
  'retarget-interpreter-link',
  'remove-payload-digest-list',
  'tamper-payload-digest-list',
]);

export async function loadConsumerConformanceSuite() {
  return JSON.parse(await readFile(
    new URL('../../src/contract/fixtures/consumer-conformance.json', import.meta.url),
    'utf8',
  ));
}

function fakeSpawn(runtime = {}) {
  const calls = [];
  const children = [];
  const spawn = (command, args, options) => {
    if (runtime.spawnError) {
      const child = new EventEmitter();
      queueMicrotask(() => child.emit('error', new Error('fixture spawn failed')));
      calls.push({ command, args, options });
      children.push(child);
      return child;
    }
    const child = new EventEmitter();
    child.kill = (signal) => {
      child.forwardedSignal = signal;
      queueMicrotask(() => child.emit('close', null, signal));
      return true;
    };
    calls.push({ command, args, options });
    children.push(child);
    if (!runtime.signal) {
      queueMicrotask(() => child.emit('close', runtime.exitCode ?? 0, null));
    }
    return child;
  };
  return { spawn, calls, children };
}

async function writeZip(path, payload, extra = null) {
  const zip = new yazl.ZipFile();
  const output = pipeline(zip.outputStream, createWriteStream(path));
  for (const file of await collectFiles(payload)) {
    zip.addFile(join(payload, ...file.split('/')), file);
  }
  if (extra) zip.addBuffer(Buffer.from(extra.contents ?? 'hostile'), extra.path, extra.options);
  zip.end();
  await output;
}

async function refreshArchiveIdentity(fixture) {
  const metadata = await stat(fixture.archivePath);
  fixture.release.archive.sha256 = await sha256File(fixture.archivePath);
  fixture.release.archive.sizeBytes = metadata.size;
  await writeSignedRelease(fixture, fixture.release);
}

async function refreshPayloadDigest(fixture, extraEntries = []) {
  const stream = payloadDigestStream([
    ...await payloadDigestEntries(fixture.payload),
    ...extraEntries,
  ]);
  await writeFile(join(fixture.payload, PAYLOAD_DIGEST_FILE), stream);
  fixture.release.payloadDigest = {
    format: PAYLOAD_DIGEST_FORMAT,
    sha256: createHash('sha256').update(stream).digest('hex'),
  };
}

async function replaceZipEntryName(path, from, to) {
  if (Buffer.byteLength(from) !== Buffer.byteLength(to)) {
    throw new Error('Conformance ZIP path replacements must preserve byte length.');
  }
  const bytes = await readFile(path);
  const source = Buffer.from(from);
  const replacement = Buffer.from(to);
  let count = 0;
  for (let offset = bytes.indexOf(source); offset !== -1; offset = bytes.indexOf(source, offset + source.length)) {
    replacement.copy(bytes, offset);
    count += 1;
  }
  if (count !== 2) throw new Error(`Expected two ZIP path records for ${from}, found ${count}.`);
  await writeFile(path, bytes);
}

async function mutateFixture(fixture, mutation, destination) {
  if (!mutation) return;
  if (mutation === 'alter-signature' || mutation === 'alter-payload') {
    const signed = JSON.parse(await readFile(fixture.releasePath, 'utf8'));
    if (mutation === 'alter-signature') signed.signatures[0].signatureBase64 = 'AA==';
    else signed.payloadBase64 = Buffer.from('altered payload').toString('base64');
    await writeFile(fixture.releasePath, `${JSON.stringify(signed, null, 2)}\n`);
    return;
  }
  if (mutation === 'downgrade-envelope-version') {
    // The envelope's own version is outside the signed payload, so this is what a genuine v1
    // document looks like to a v3 consumer: refusable by name before any signature is checked.
    const signed = JSON.parse(await readFile(fixture.releasePath, 'utf8'));
    signed.schemaVersion = 1;
    await writeFile(fixture.releasePath, `${JSON.stringify(signed, null, 2)}\n`);
    return;
  }
  if (mutation === 'alter-archive-bytes') {
    const bytes = await readFile(fixture.archivePath);
    bytes[bytes.length - 1] ^= 0x01;
    await writeFile(fixture.archivePath, bytes);
    return;
  }
  if (mutation === 'alter-archive-size') {
    fixture.release.archive.sizeBytes += 1;
    await writeSignedRelease(fixture, fixture.release);
    return;
  }
  if (mutation === 'alter-release-labels') {
    fixture.release.labels = { model: 'altered-model' };
    await writeSignedRelease(fixture, fixture.release);
    return;
  }
  if (mutation === 'alter-release-runtime-version') {
    fixture.release.runtime = { ...fixture.release.runtime, version: '3.99.0' };
    await writeSignedRelease(fixture, fixture.release);
    return;
  }
  if (mutation === 'alter-release-runtime-id') {
    // A Python box relabelled as native after it was built. Everything about the payload still
    // says Python, so the consumer must refuse it rather than read the declaration as the truth
    // about a box that disagrees with it.
    fixture.release.runtime = { ...fixture.release.runtime, id: 'native' };
    await writeSignedRelease(fixture, fixture.release);
    return;
  }
  if (mutation === 'alter-release-execution') {
    fixture.release.execution = {
      ...fixture.release.execution,
      defaultArgs: ['--altered'],
    };
    await writeSignedRelease(fixture, fixture.release);
    return;
  }
  if (mutation === 'alter-release-environment') {
    fixture.release.environment = { SCROLLCASE_CHANGED_AFTER_BUILD: '1' };
    await writeSignedRelease(fixture, fixture.release);
    return;
  }
  if (mutation === 'alter-release-bundled-licenses') {
    // A licence inventory added to the signed release after the box was built. It is signed, so the
    // signature still verifies; what refuses it is that box.json says something else, which is the
    // whole reason the inventory is compared field by field rather than merely carried.
    fixture.release.bundledLicenses = [{"name": "zlib", "version": "1.3.1", "declaredLicense": "Zlib", "linkedInto": ["box.json"]}];
    await writeSignedRelease(fixture, fixture.release);
    return;
  }
  if (mutation === 'add-unknown-compatibility-constraint') {
    // Not a tamper: a signed constraint in a publishing project's own vocabulary, which the schema
    // allows and the builder copies through. The consumer must carry it, not refuse the document —
    // refusing it is what takes the decision away from the application that has to make it.
    fixture.release.compatibility = {
      ...fixture.release.compatibility,
      'org.example.minVramGb': 24,
    };
    await writeSignedRelease(fixture, fixture.release);
    return;
  }
  if (mutation === 'create-destination') {
    await mkdir(destination);
    return;
  }
  const removePath = {
    'remove-interpreter': fixture.release.runtime.entryPoint,
    'remove-script': fixture.release.execution?.script,
    'remove-module': fixture.release.execution?.module?.split('.').join('/') + '.py',
  }[mutation];
  if (removePath) {
    await rm(join(fixture.payload, ...removePath.split('/')));
    await writeZip(fixture.archivePath, fixture.payload);
    await refreshArchiveIdentity(fixture);
    return;
  }
  // The other side of the link rule. A real box reaches its interpreter through exactly this shape
  // — `venv/bin/python` is a link to the versioned binary beside it — so a consumer that only
  // accepts regular files here rejects every box the builder produces on macOS and Linux.
  if (mutation === 'link-interpreter') {
    const parts = fixture.release.runtime.entryPoint.split('/');
    const linkTarget = `${parts[parts.length - 1]}-real`;
    const directory = join(fixture.payload, ...parts.slice(0, -1));
    await rename(join(fixture.payload, ...parts), join(directory, linkTarget));
    await refreshPayloadDigest(fixture, [{
      path: fixture.release.runtime.entryPoint,
      kind: 'link',
      contentSha256: createHash('sha256').update(linkTarget, 'utf8').digest('hex'),
    }]);
    await writeZip(fixture.archivePath, fixture.payload, {
      path: fixture.release.runtime.entryPoint,
      contents: linkTarget,
      options: { mode: 0o120777 },
    });
    // The link lives only as an archive entry, so the extracted tree weighs what the payload
    // directory weighs plus the link itself — `lstat` sizes a link by its target string. Stated
    // here rather than copied from the result, so the signed size still has to be earned.
    fixture.release.installedSizeBytes =
      await payloadSize(fixture.payload) + Buffer.byteLength(linkTarget);
    await refreshArchiveIdentity(fixture);
    return;
  }
  const hostile = {
    'add-traversal-entry': { path: 'safe', replacement: '../x' },
    'add-absolute-entry': { path: 'safe', replacement: '/abs' },
    // A link whose target climbs out of the payload: the escape the rule exists to stop.
    'add-link-entry': { path: 'link', contents: '../../../../etc/passwd', options: { mode: 0o120777 } },
    'add-special-entry': { path: 'fifo', options: { mode: 0o010644 } },
    'duplicate-entry': { path: 'box.json', contents: '{}' },
    'file-directory-collision': { path: 'venv', contents: 'collision' },
  }[mutation];
  if (hostile) {
    await writeZip(fixture.archivePath, fixture.payload, hostile);
    if (hostile.replacement) {
      await replaceZipEntryName(fixture.archivePath, hostile.path, hostile.replacement);
    }
    await refreshArchiveIdentity(fixture);
    return;
  }
  if (mutation === 'encrypt-entry') {
    await writeZip(fixture.archivePath, fixture.payload);
    const bytes = await readFile(fixture.archivePath);
    const local = bytes.indexOf(Buffer.from('PK\x03\x04'));
    const central = bytes.indexOf(Buffer.from('PK\x01\x02'));
    if (local < 0 || central < 0) throw new Error('Conformance ZIP lacks required headers.');
    bytes.writeUInt16LE(bytes.readUInt16LE(local + 6) | 0x1, local + 6);
    bytes.writeUInt16LE(bytes.readUInt16LE(central + 8) | 0x1, central + 8);
    await writeFile(fixture.archivePath, bytes);
    await refreshArchiveIdentity(fixture);
    return;
  }
  throw new Error(`Unknown conformance mutation: ${mutation}`);
}

async function mutateExtractedRoot(fixture, mutation, root) {
  if (!mutation) return root;
  if (mutation === 'attach-missing-root') return join(fixture.root, 'missing-root');
  if (mutation === 'attach-file-root') return fixture.archivePath;
  if (mutation === 'attach-symlink-root') {
    const linkedRoot = join(fixture.root, 'linked-root');
    await symlink(root, linkedRoot);
    return linkedRoot;
  }
  if (mutation === 'add-root-files') {
    await writeFile(join(root, 'output.log'), 'application output');
    await mkdir(join(root, '__pycache__'));
    await writeFile(join(root, '__pycache__', 'cached.pyc'), 'compiled');
    return root;
  }
  const script = join(root, 'app', 'main.py');
  if (mutation === 'chmod-script') {
    await chmod(script, 0o600);
    return root;
  }
  if (mutation === 'touch-script') {
    await utimes(script, new Date(0), new Date(0));
    return root;
  }
  if (mutation === 'tamper-script') {
    await writeFile(script, `${await readFile(script, 'utf8')} `);
    return root;
  }
  if (mutation === 'remove-interpreter') {
    await rm(join(root, ...fixture.release.runtime.entryPoint.split('/')));
    return root;
  }
  if (mutation === 'remove-script') {
    await rm(join(root, ...fixture.release.execution.script.split('/')));
    return root;
  }
  if (mutation === 'retarget-interpreter-link') {
    const interpreter = join(root, ...fixture.release.runtime.entryPoint.split('/'));
    const target = await readlink(interpreter);
    await rm(interpreter);
    await symlink(`${target}-retargeted`, interpreter);
    return root;
  }
  const listPath = join(root, PAYLOAD_DIGEST_FILE);
  if (mutation === 'remove-payload-digest-list') {
    await rm(listPath);
    return root;
  }
  if (mutation === 'tamper-payload-digest-list') {
    const bytes = await readFile(listPath);
    bytes[bytes.length - 2] ^= 0x01;
    await writeFile(listPath, bytes);
    return root;
  }
  throw new Error(`Unknown extracted-root mutation: ${mutation}`);
}

function foreignTarget() {
  const nativeId = boxTargetId(nativeTarget());
  const target = Object.entries(TARGETS).find(([id]) => id !== nativeId)?.[1];
  if (!target) throw new Error('Conformance fixture has no foreign target.');
  return target;
}

function fixtureOptions(spec = {}) {
  const target = spec.target === 'foreign'
    ? foreignTarget()
    : spec.target ? TARGETS[spec.target] : nativeTarget();
  const execution = spec.execution === 'module'
    ? { kind: 'python-module', module: 'example.application', defaultArgs: ['--default'] }
    : undefined;
  const executablePaths = spec.executableAsset ? ['bin/tool'] : [];
  const requiredAsset = spec.requiredAsset ? {
    url: 'https://assets.example.org/data.bin',
    relativePath: 'cache/consumer-fixture/data.bin',
    sizeBytes: ASSET_BYTES.length,
    sha256: createHash('sha256').update(ASSET_BYTES).digest('hex'),
  } : null;
  return {
    target,
    signer: spec.signer ?? 'local',
    ...(execution ? { execution } : {}),
    requiredAsset,
    payloadDigest: spec.payloadDigest !== false,
    environment: spec.environment,
    executablePaths,
    ...(spec.executableAsset ? { extraFiles: { 'bin/tool': '#!/bin/sh\nexit 0\n' } } : {}),
    ...(spec.labels ? { labels: spec.labels } : {}),
  };
}

async function trustOptions(fixture, spec = {}) {
  const source = spec.source ?? 'file';
  const shape = spec.shape ?? 'single';
  const key = JSON.parse(await readFile(fixture.publicPath, 'utf8'));
  if (shape === 'missing-file') {
    if (source !== 'file') throw new Error('A missing trust file is only a file-source case.');
    await rm(fixture.publicPath);
    return { publicPath: fixture.publicPath };
  }
  let raw;
  if (shape === 'single') raw = JSON.stringify(key);
  else if (shape === 'bundle') raw = JSON.stringify({ keys: [key] });
  else if (shape === 'empty-bundle') raw = JSON.stringify({ keys: [] });
  else if (shape === 'non-array-bundle') raw = JSON.stringify({ keys: key });
  else if (shape === 'invalid-bundle-entry') raw = JSON.stringify({ keys: [null] });
  else if (shape === 'malformed-json') raw = '{';
  else if (shape === 'malformed-pem') raw = JSON.stringify({ ...key, publicKeyPem: 'not a PEM key' });
  else throw new Error(`Unknown conformance trust shape: ${shape}`);

  if (source === 'file') {
    await writeFile(fixture.publicPath, raw);
    return { publicPath: fixture.publicPath };
  }
  if (source === 'memory') return { trustedKeys: parseTrustedKeys(raw) };
  throw new Error(`Unknown conformance trust source: ${source}`);
}

function environmentReport(report, names = []) {
  const selected = new Set(names);
  return {
    mode: report.mode,
    hostValuesRevealed: report.hostValuesRevealed,
    releaseVariableCount: report.releaseVariableCount,
    conflictCount: report.conflictCount,
    variables: report.variables
      .filter((variable) => selected.has(variable.name))
      .map((variable) => ({
        name: variable.name,
        source: variable.source,
        value: variable.value,
        executionAffecting: variable.executionAffecting,
        conflict: variable.conflict,
        sources: variable.sources,
      })),
  };
}

function replaceTokens(value, root = null) {
  if (typeof value === 'string') {
    const adapter = boxTargetAdapter(nativeTarget());
    return value
      .replaceAll('$NATIVE_ENTRY_POINT', runtimeAdapter('python').layout(adapter).entryPoint)
      .replaceAll('$NATIVE_TARGET', boxTargetId(nativeTarget()))
      .replaceAll('$BOX', root ?? '$BOX');
  }
  if (Array.isArray(value)) return value.map((item) => replaceTokens(item, root));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceTokens(item, root)]));
  }
  return value;
}

function classifyError(message, patterns) {
  for (const [code, pattern] of Object.entries(patterns)) {
    if (new RegExp(pattern, 'i').test(message)) return code;
  }
  return `unclassified: ${message}`;
}

function normalizePath(root, value) {
  if (!isAbsolute(value) || (value !== root && !value.startsWith(`${root}${sep}`))) return value;
  const suffix = relative(root, value).split(sep).join('/');
  return suffix ? `$BOX/${suffix}` : '$BOX';
}

async function materializeAsset(prepared, state) {
  if (!state || state === 'missing') return;
  const asset = prepared.requiredAssets[0];
  const path = join(prepared.root, ...asset.relativePath.split('/'));
  await mkdir(dirname(path), { recursive: true });
  if (state === 'wrong-size') await writeFile(path, ASSET_BYTES.subarray(1));
  else if (state === 'wrong-hash') await writeFile(path, Buffer.alloc(ASSET_BYTES.length, 0x78));
  else await writeFile(path, ASSET_BYTES);
}

export async function runNodeConformanceCase(testCase) {
  const fixture = await createConsumerBoxFixture(fixtureOptions(testCase.fixture));
  const destination = join(fixture.root, 'prepared');
  const temporaryDirectory = join(fixture.root, 'temporary');
  const expected = replaceTokens(testCase.expected);
  let prepared;
  let fake;
  let streams;
  const runtime = testCase.runtime ?? {};
  const previousHostEnvironment = new Map();
  for (const [name, value] of Object.entries(runtime.hostEnvironment ?? {})) {
    previousHostEnvironment.set(name, process.env[name]);
    process.env[name] = value;
  }
  // A restrictive umask is the condition under which the three consumers used to disagree: two
  // applied the archive's mode through open(2) and lost it, one chmod'd and kept it.
  const previousUmask = runtime.umask === undefined || process.platform === 'win32'
    ? null
    : process.umask(Number.parseInt(runtime.umask, 8));
  try {
    if (testCase.fixture?.linkedInterpreter) {
      await mutateFixture(fixture, 'link-interpreter', destination);
    }
    const postExtractionMutation = (
      testCase.action === 'attach' || testCase.action === 'verify-payload'
    ) && POST_EXTRACTION_MUTATIONS.has(testCase.mutation);
    if (!postExtractionMutation) {
      await mutateFixture(fixture, testCase.mutation, destination);
    }
    const trust = await trustOptions(fixture, testCase.trust);
    if (testCase.action === 'prepare') {
      prepared = await verifyAndExtractBox(fixture.releasePath, {
        ...trust,
        archive: fixture.archivePath,
        destination,
        envReport: Boolean(runtime.envReport),
        envReportValues: Boolean(runtime.envReportValues),
      });
      const receipt = {
        status: prepared.status,
        boxId: prepared.boxId,
        executionKind: prepared.execution?.kind ?? null,
        requiredAssetCount: prepared.requiredAssets.length,
        runtimeId: prepared.runtime.id,
        entryPoint: prepared.runtime.entryPoint,
        targetId: prepared.targetId,
      };
      if (testCase.expected.receipt?.executableModes) {
        receipt.executableModes = await executableModes(
          prepared.root,
          testCase.expected.receipt.executableModes,
        );
      }
      if (testCase.expected.receipt?.environmentReport) {
        receipt.environmentReport = environmentReport(
          prepared.environmentReport,
          runtime.reportVariables,
        );
      }
      return {
        actual: {
          outcome: 'prepared',
          receipt,
        },
        expected,
        root: fixture.root,
      };
    }

    if (testCase.action === 'attach' || testCase.action === 'verify-payload') {
      prepared = await verifyAndExtractBox(fixture.releasePath, {
        ...trust,
        archive: fixture.archivePath,
        destination,
        envReport: Boolean(runtime.envReport),
        envReportValues: Boolean(runtime.envReportValues),
      });
      await materializeAsset(prepared, testCase.runtime?.assetState);
      const root = await mutateExtractedRoot(
        fixture,
        postExtractionMutation ? testCase.mutation : null,
        prepared.root,
      );
      if (testCase.action === 'attach') {
        const attached = await attachExtractedBox(fixture.releasePath, {
          ...trust,
          root,
          envReport: Boolean(runtime.envReport),
          envReportValues: Boolean(runtime.envReportValues),
        });
        const receipt = {
          status: attached.status,
          boxId: attached.boxId,
          executionKind: attached.execution?.kind ?? null,
          requiredAssetCount: attached.requiredAssets.length,
          runtimeId: attached.runtime.id,
          entryPoint: attached.runtime.entryPoint,
          targetId: attached.targetId,
        };
        if (testCase.expected.receipt?.environmentReport) {
          receipt.environmentReport = environmentReport(
            attached.environmentReport,
            runtime.reportVariables,
          );
        }
        return {
          actual: {
            outcome: 'attached',
            receipt,
          },
          expected,
          root: fixture.root,
        };
      }
      const verified = await verifyExtractedPayload(fixture.releasePath, {
        ...trust,
        root,
        envReport: Boolean(runtime.envReport),
        envReportValues: Boolean(runtime.envReportValues),
      });
      const verificationResult = {
        status: verified.status,
        boxId: verified.boxId,
        targetId: verified.targetId,
        entryCount: verified.entryCount,
      };
      if (testCase.expected.result?.environmentReport) {
        verificationResult.environmentReport = environmentReport(
          verified.environmentReport,
          runtime.reportVariables,
        );
      }
      return {
        actual: {
          outcome: 'verified',
          result: verificationResult,
        },
        expected,
        root: fixture.root,
      };
    }

    fake = fakeSpawn(testCase.runtime);
    const signalSource = runtime.signal ? new EventEmitter() : undefined;
    if (runtime.streams) {
      streams = {
        stdin: new EventEmitter(),
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
      };
    }
    let result;
    if (testCase.action === 'run-prepared') {
      prepared = await verifyAndExtractBox(fixture.releasePath, {
        ...trust,
        archive: fixture.archivePath,
        destination,
      });
      await materializeAsset(prepared, runtime.assetState);
      if (runtime.attach) {
        prepared = await attachExtractedBox(fixture.releasePath, {
          ...trust,
          root: prepared.root,
        });
      }
      const running = runExtractedBox(prepared, {
        args: runtime.args ?? [],
        spawn: fake.spawn,
        signalSource,
        env: runtime.env,
        envReport: Boolean(runtime.envReport),
        envReportValues: Boolean(runtime.envReportValues),
        ...streams,
      });
      if (runtime.signal) {
        while (fake.calls.length === 0) await new Promise((resolve) => setImmediate(resolve));
        signalSource.emit(runtime.signal);
      }
      result = await running;
    } else if (testCase.action === 'run-box') {
      await mkdir(temporaryDirectory);
      const running = runBox(fixture.releasePath, {
        ...trust,
        archive: fixture.archivePath,
        temporaryDirectory,
        args: runtime.args ?? [],
        spawn: fake.spawn,
        signalSource,
        env: runtime.env,
        envReport: Boolean(runtime.envReport),
        envReportValues: Boolean(runtime.envReportValues),
        ...streams,
      });
      if (runtime.signal) {
        while (fake.calls.length === 0) await new Promise((resolve) => setImmediate(resolve));
        signalSource.emit(runtime.signal);
      }
      result = await running;
    } else {
      throw new Error(`Unknown conformance action: ${testCase.action}`);
    }
    const actual = {
      outcome: 'completed',
      result: {
        exitCode: result.exitCode,
        signal: result.signal,
      },
    };
    if (expected.result?.environmentReport) {
      actual.result.environmentReport = environmentReport(
        result.environmentReport,
        runtime.reportVariables,
      );
    }
    if ('effectiveEnvironment' in expected) {
      actual.effectiveEnvironment = Object.fromEntries(
        Object.keys(expected.effectiveEnvironment).map((name) => [name, fake.calls[0].options.env[name]]),
      );
    }
    if ('persistentRootExists' in expected) actual.persistentRootExists = await pathExists(prepared.root);
    if ('spawned' in expected) actual.spawned = fake.calls.length > 0;
    if ('temporaryDirectoryEmpty' in expected) {
      actual.temporaryDirectoryEmpty = (await readdir(temporaryDirectory)).length === 0;
    }
    if ('forwardedSignal' in expected) actual.forwardedSignal = fake.children[0].forwardedSignal;
    if ('streamsPreserved' in expected) {
      const options = fake.calls[0].options;
      actual.streamsPreserved = options.stdio[0] === streams.stdin
        && options.stdio[1] === streams.stdout
        && options.stdio[2] === streams.stderr;
    }
    if ('argv' in expected) {
      const call = fake.calls[0];
      actual.argv = [call.command, ...call.args].map((value) => normalizePath(prepared.root, value));
      actual.cwd = normalizePath(prepared.root, call.options.cwd);
      actual.shell = call.options.shell;
    }
    return { actual, expected, root: fixture.root };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const actual = {
      outcome: 'rejected',
      error: classifyError(message, testCase.suite.errorPatterns),
    };
    if ('message' in expected) actual.message = message;
    if ('destinationExists' in expected) actual.destinationExists = await pathExists(destination);
    if ('spawned' in expected) actual.spawned = (fake?.calls.length ?? 0) > 0;
    if ('temporaryDirectoryEmpty' in expected) {
      actual.temporaryDirectoryEmpty = await pathExists(temporaryDirectory)
        && (await readdir(temporaryDirectory)).length === 0;
    }
    return { actual, expected, root: fixture.root };
  } finally {
    if (previousUmask !== null) process.umask(previousUmask);
    for (const [name, value] of previousHostEnvironment) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

/**
 * The permission bits an extracted box actually carries, for the paths a case names.
 *
 * Windows has no bit to read, so every path reports the same value there and the fixture says so
 * rather than the driver quietly skipping the case.
 */
async function executableModes(root, paths) {
  const modes = {};
  for (const path of Object.keys(paths)) {
    const details = await stat(join(root, ...path.split('/')));
    modes[path] = process.platform === 'win32' ? null : (details.mode & 0o777).toString(8);
  }
  return modes;
}

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}
