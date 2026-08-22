#!/usr/bin/env node

/**
 * The Scrollcase command line.
 *
 * One job: turn a scroll into a portable, locked, self-contained box and prove it works. `init`
 * prepares the workspace, `new scroll` authors one input, `doctor` checks the machine, `lock`
 * resolves dependencies once so a human can review and commit the result, `audit` reports what
 * licences that pulls in, `build` installs only from the lock, `verify` re-runs a consumer's
 * install-time checks, `run` executes one caller-supplied local release through that consumer, and
 * `keygen` produces the signing key that makes any of it trustworthy.
 *
 * Every command resolves its paths through the workspace, so the tool runs from anywhere against any
 * project that declares a scrollcase.config.json.
 */

import { createInterface } from 'node:readline/promises';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { auditScroll } from './build/audit.mjs';
import {
  createScroll,
  ensureConsumerTemplates,
  ensureExampleScroll,
  EXAMPLE_PIXI_VERSION,
} from './build/authoring.mjs';
import { buildBox } from './build/box.mjs';
import {
  isCargoAvailable,
  isCondaAvailable,
  installPythonConsumerDependency,
  installRustConsumerDependency,
  installTypeScriptConsumerDependencies,
  SCROLLCASE_NPM_VERSION,
} from './build/consumer-setup.mjs';
import { addDependency, readRequirements } from './build/dependencies.mjs';
import { findPixi, pixiLockArguments } from './build/pixi.mjs';
import { fail, run } from './build/process.mjs';
import { diagnose, ensureToolchain, initProject } from './build/project.mjs';
import { scrollCandidates, readScroll } from './build/scroll.mjs';
import {
  ALL_TARGETS,
  addAsset,
  addFile,
  addSelfTestImport,
  editableScrollFields,
  readScrollFamily,
  refreshScroll,
  removeEnvironmentVariable,
  removeScrollEntry,
  removeSelfTestImport,
  setEnvironmentVariable,
  setScrollField,
} from './build/scroll-edit.mjs';
import { chooseBox, chooseEditTarget, chooseScrollEdit } from './cli-edit.mjs';
import { verifyBox } from './build/verify.mjs';
import {
  configureWorkspace,
  getWorkspace,
  SCROLLCASE_CONFIG_FILENAME,
  workspaceOverridesFromFlags,
} from './build/workspace.mjs';
import { collectNewScrollOptions, promptText } from './cli-authoring.mjs';
import { parseArgs } from './cli-args.mjs';
import {
  defaultYesConfirmation,
  resolveExampleChoice,
  resolvePythonConsumerSource,
  resolveTemplatesChoice,
  runInitDependencySetup,
} from './cli-init.mjs';
import { chooseCliValue, chooseCliValues } from './cli-menu.mjs';
import {
  buildDistributionSummary,
  commandTip,
  promptHeading,
  promptMarker,
  statusLine,
} from './cli-output.mjs';
import { runCliBox } from './cli-run.mjs';
import { ensureBuildSigningKeys } from './cli-signing.mjs';
import { chooseScroll, chooseTarget, nativeExampleTarget } from './cli-targets.mjs';
import { verifyExtractedPayload } from './consumer/index.mjs';
import { CHANNELS } from './contract/index.mjs';
import { formatEnvironmentReport, shouldReportEnvironment } from './environment.mjs';
import { generateSigningKey } from './sign/index.mjs';

const success = (message) => console.log(statusLine('success', message));
const step = (message) => console.log(statusLine('step', message));
const info = (message) => console.log(statusLine('info', message));
const warning = (message) => console.log(statusLine('warning', message));

/** Writes one status line completely before later work can write to the same terminal stream. */
function flushedStep(stream, message) {
  const line = message ? statusLine('step', message, { stream }) : '';
  return new Promise((resolveWrite, rejectWrite) => {
    stream.write(`${line}\n`, (error) => {
      if (error) rejectWrite(error);
      else resolveWrite();
    });
  });
}

const flushedRunStatus = (message) => flushedStep(process.stderr, message);

const text = (flags, name) => (flags.has(name) ? String(flags.get(name)) : null);

/** Signing key locations, defaulting into the workspace's key directory. */
function keyPaths(flags) {
  const keysDir = getWorkspace().keysDir;
  return {
    privatePath: resolve(text(flags, 'private-key') || join(keysDir, 'signing-private.pem')),
    publicPath: resolve(text(flags, 'public-key') || join(keysDir, 'signing-public.json')),
  };
}

async function keygen(flags) {
  const { privatePath, publicPath } = keyPaths(flags);
  const created = await generateSigningKey({
    privatePath,
    publicPath,
    keyId: text(flags, 'key-id'),
    force: Boolean(flags.get('force')),
  });
  success(`Created signing key ${created.keyId}`);
  info(`Private: ${created.privatePath}`);
  info(`Public:  ${created.publicPath}`);
}

/**
 * `lock` — resolve the scroll's pixi manifest into a fully pinned lock file.
 *
 * Run by a human when dependencies change; the result is committed and reviewed. Builds then only
 * *install* from it, so what ships is exactly what was reviewed. The manifest pins the channels and
 * the single target platform, which is what makes resolution independent of the machine doing it.
 */
async function lock(name, flags) {
  const reference = await selectScrollReference(name, flags);
  const { dir, scroll } = await readScroll(reference);
  const pixi = findPixi({ requiredVersion: scroll.pixiVersion, path: text(flags, 'pixi') });
  run(pixi, pixiLockArguments(join(dir, 'pixi.toml')));
  success(`Updated ${join(dir, 'pixi.lock')}`);
}

/**
 * Asks a yes/no question, defaulting to yes in an interactive terminal.
 *
 * Only ever asks when both ends are a terminal. Without one — CI, a pipe — there is nobody to
 * answer, and silence must not be read as consent, so the answer is no. `hint` is the sentence
 * explaining why it is being asked, printed under the question like every other prompt's
 * explanation: consent questions are laid out the same way as the rest, so a person reading a
 * session sees one shape throughout.
 */
async function confirm(question, hint = null) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    process.stdout.write(promptHeading(question, { hint }));
    return defaultYesConfirmation(await readline.question(`${promptMarker()}[Y/n] `));
  } finally {
    readline.close();
  }
}

/** Resolves a box shorthand at the CLI edge, where an ambiguous target can be asked about. */
async function selectScrollReference(name, flags) {
  const candidates = await scrollCandidates(name);
  if (!name) return (await chooseScroll(candidates)).reference;
  return (await chooseTarget(candidates, { requested: text(flags, 'target') })).reference;
}

/**
 * `init` — scaffold the workspace, its consumer templates and its disposable runnable example,
 * then offer the dependencies those templates need.
 *
 * Real scroll creation remains separate: the fixed `example-box` is onboarding material, never a
 * guess at the project's identity. The templates are the other half, and a separate question:
 * declining a demo says nothing about wanting a starting point for the application that will run
 * this project's boxes. Toolchain and consumer installs each require explicit consent.
 */
async function init(flags) {
  const workspace = getWorkspace();
  const authoringFlags = [
    'target',
    'platform',
    'accelerator',
    'cuda-version',
    'box-id',
    'model-id',
    'runtime-id',
  ].filter((name) => flags.has(name));
  if (authoringFlags.length > 0) {
    fail(`init accepts only the fixed example; pass ${authoringFlags.map((name) => `--${name}`).join(', ')} to scrollcase new scroll.`);
  }
  const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  // Both asked before anything is written, so the first things a person answers are what they get.
  const wantsExample = await resolveExampleChoice({
    noExample: Boolean(flags.get('no-example')),
    interactive,
    confirmExample: () => confirm(
      'Include the runnable example?',
      'A disposable example-box scroll for trying the whole workflow once.',
    ),
  });
  const wantsTemplates = await resolveTemplatesChoice({
    noTemplates: Boolean(flags.get('no-templates')),
    interactive,
    confirmTemplates: () => confirm(
      'Include the consumer templates?',
      'Working Node, Python and Rust starting points for the application that runs your boxes.',
    ),
  });
  const exampleTarget = wantsExample ? nativeExampleTarget() : null;
  const result = await initProject({ root: workspace.root, scrollsDir: workspace.scrollsDir });
  for (const path of result.written) success(`Created ${path}`);
  for (const path of result.skipped) info(`Kept ${path} (already present)`);

  if (wantsTemplates) {
    const templates = await ensureConsumerTemplates({ workspace });
    for (const path of templates.written) success(`Created ${path}`);
  }

  let example = null;
  const pixiVersion = text(flags, 'pixi-version')
    ?? (exampleTarget ? EXAMPLE_PIXI_VERSION : null);
  if (exampleTarget) {
    const initializedWorkspace = workspace.configPath
      ? workspace
      : { ...workspace, configPath: join(workspace.root, SCROLLCASE_CONFIG_FILENAME) };
    example = await ensureExampleScroll({
      workspace: initializedWorkspace,
      target: exampleTarget,
      pixiVersion,
    });
    if (example.created) {
      success(`Created example scroll ${example.scrollRef}`);
    } else {
      info(`Kept example scroll ${example.scrollRef} (already present)`);
    }
    for (const path of example.written) info(path);
  }

  const always = Boolean(flags.get('install-toolchain'));
  const never = Boolean(flags.get('no-install-toolchain'));
  const cargoAvailable = !wantsTemplates || !interactive || isCargoAvailable({ root: workspace.root });
  if (wantsTemplates && interactive && !cargoAvailable) {
    warning('Cargo was not found; kept the Rust consumer template without adding its dependency.');
    info('Install Rust, then run `cargo add --manifest-path consumer-templates/rust/Cargo.toml scrollcase-consumer`.');
  }
  const setup = await runInitDependencySetup({
    hasTemplates: wantsTemplates,
    rustAvailable: cargoAvailable,
    // One menu for the set: these are the same question asked about three languages, and a project
    // wants the ones it writes its consumer in. Nothing is preselected, and Enter with nothing
    // ticked installs nothing.
    chooseConsumerLanguages: async (offered) => {
      const labels = {
        typescript: 'TypeScript — scrollcase, tsx and typescript',
        python: 'Python — scrollcase-consumer, from PyPI or conda-forge',
        rust: 'Rust — scrollcase-consumer, added to the template crate',
      };
      const chosen = await chooseCliValues(
        'Install dependencies for which consumer templates?',
        offered.map((language) => labels[language]),
        {
          hint: `What consumer-templates/ needs to run, installed in ${workspace.root}. `
            + 'Selecting none is a valid answer.',
        },
      );
      return offered.filter((language) => chosen.includes(labels[language]));
    },
    choosePythonSource: async () => {
      const selectedSource = await chooseCliValue(
        'Python consumer package source',
        ['PyPI with pip', 'conda-forge with conda'],
      );
      const source = selectedSource.startsWith('PyPI') ? 'pypi' : 'conda-forge';
      return resolvePythonConsumerSource({
        selectedSource: source,
        condaAvailable: source === 'pypi' || isCondaAvailable({ root: workspace.root }),
        confirmPyPIFallback: () => confirm(
          'Install scrollcase-consumer from PyPI with pip instead?',
          'Conda is not installed, so the conda-forge package cannot be installed here.',
        ),
      });
    },
    installToolchain: () => ensureToolchain({
      workspace,
      pixiVersion,
      confirm: async (missing) => {
        if (never) return false;
        if (always) return true;
        return confirm(
          `Install ${missing.join(' and ')} into ${workspace.toolchainDir}?`,
          `This project needs ${missing.length > 1 ? 'them' : 'it'} to build a box.`,
        );
      },
    }),
    installTypeScript: () => installTypeScriptConsumerDependencies({ root: workspace.root }),
    installPython: (source) => installPythonConsumerDependency({
      root: workspace.root,
      source,
    }),
    installRust: () => installRustConsumerDependency({ root: workspace.root }),
  });
  const { toolchain } = setup;

  if (toolchain.installed.length > 0) {
    success(`Installed ${toolchain.installed.join(' and ')} into ${workspace.toolchainDir}`);
    info('Nothing was added to PATH; scrollcase finds them there on its own.');
    if (toolchain.configPath) success(`Recorded the toolchain pins in ${toolchain.configPath}`);
  } else if (toolchain.unsupportedHost) {
    warning(`pixi publishes no build for ${toolchain.unsupportedHost}; install ${toolchain.missing.join(' and ')} manually.`);
  } else if (toolchain.missing.length > 0) {
    warning(`Skipped installing ${toolchain.missing.join(' and ')}.`);
    info('Install them yourself, or re-run with --install-toolchain. `scrollcase doctor` reports what is missing.');
  }

  if (setup.typescript) {
    const installed = setup.typescript;
    success(
      `Installed scrollcase ${installed.scrollcaseVersion}, TypeScript, and tsx in ${workspace.root}`,
    );
  }

  if (setup.python) {
    const installed = setup.python;
    success(
      `Installed scrollcase-consumer from ${installed.source} using ${installed.command}`,
    );
  }

  if (setup.rust) {
    success(
      `Added scrollcase-consumer to ${join(workspace.root, 'consumer-templates', 'rust', 'Cargo.toml')} using ${setup.rust.command}`,
    );
  }

  success('Workspace initialized');
  if (example) step(`Example: scrollcase lock ${example.scrollRef}`);
  step(example ? 'Create your own: scrollcase new scroll' : 'Next: scrollcase new scroll');
}

/** `new scroll` — collect one complete authoring decision and create it atomically. */
async function newScroll(flags) {
  const workspace = getWorkspace();
  const options = await collectNewScrollOptions(flags);
  const result = await createScroll({ workspace, ...options });
  success(`Created scroll ${result.scrollRef}`);
  for (const path of result.written) info(path);
  step(`Next: scrollcase lock ${result.scrollRef}`);
}

/** Every box the workspace holds, for the commands that act on one. */
async function boxIds() {
  const candidates = await scrollCandidates();
  return [...new Set(candidates.map(({ reference }) => reference.split('/')[0]))];
}

/** Box and target, resolved the same way for every editing command. */
async function editScope(name, flags) {
  const boxId = await chooseBox({ name: name ?? null, boxIds: await boxIds() });
  const target = await chooseEditTarget({ boxId, requested: text(flags, 'target') });
  return { boxId, target };
}

const reportWritten = (written) => {
  for (const path of written) info(path);
};

/** `add asset|file|dep` — record something in a scroll, or in a box's pixi manifests. */
async function add(kind, positional, flags) {
  const [name, value] = positional;
  if (kind === 'dep') return addDep(name, value, flags);
  if (kind === 'env' || kind === 'import') return addDeclaration(kind, name, value, flags);
  if (!value) fail(`Usage: scrollcase add ${kind} <box> <${kind === 'asset' ? 'url' : 'path'}> [--to <payload path>] [--target <targetId>|all]`);
  const { boxId, target } = await editScope(name, flags);
  const to = text(flags, 'to');
  const result = kind === 'asset'
    ? await addAsset({ boxId, target, url: value, to, log: (message) => step(message) })
    : await addFile({ boxId, target, sourcePath: value, to });
  success(`Added ${result.entry.relativePath} to ${boxId}${target === ALL_TARGETS ? '' : `/${target}`}`);
  if (kind === 'asset') info(`${result.entry.sizeBytes} bytes, sha256 ${result.entry.sha256}`);
  reportWritten(result.written);
}

/** `add env NAME=VALUE` and `add import <module>` — the two declarations that are not a file. */
async function addDeclaration(kind, name, value, flags) {
  if (!value) {
    fail(`Usage: scrollcase add ${kind} <box> <${kind === 'env' ? 'NAME=VALUE' : 'module'}> [--target <targetId>|all]`);
  }
  const { boxId, target } = await editScope(name, flags);
  if (kind === 'import') {
    const result = await addSelfTestImport({ boxId, target, module: value });
    success(`Added ${result.module} to the self-test imports`);
    return reportWritten(result.written);
  }
  const separator = value.indexOf('=');
  if (separator < 1) fail(`Usage: scrollcase add env <box> NAME=VALUE (got ${JSON.stringify(value)}).`);
  const result = await setEnvironmentVariable({
    boxId,
    target,
    name: value.slice(0, separator),
    value: value.slice(separator + 1),
  });
  success(`Set ${result.name} in the box environment`);
  return reportWritten(result.written);
}

/** `add dep` — one dependency, or a whole `requirements.txt`, into every manifest of a box. */
async function addDep(name, dependency, flags) {
  const requirements = text(flags, 'from-requirements');
  if (!dependency && !requirements) {
    fail('Usage: scrollcase add dep <box> <name> [--version <spec>] | scrollcase add dep <box> --from-requirements <file>');
  }
  // A dependency is per environment: every target has its own manifest and its own lock, so where
  // it goes is the same question the other editing commands ask, answered the same way.
  const { boxId, target } = await editScope(name, flags);
  const family = await readScrollFamily(boxId);
  const manifests = (target === ALL_TARGETS
    ? family.targets
    : family.targets.filter(({ targetId }) => targetId === target))
    .map(({ path }) => join(dirname(path), 'pixi.toml'));

  const wanted = [];
  if (dependency) wanted.push({ name: dependency, spec: text(flags, 'version') || '*' });
  if (requirements) {
    const parsed = readRequirements(await readFile(resolve(getWorkspace().root, requirements), 'utf8'));
    wanted.push(...parsed.dependencies);
    // Reported, never silent: a name translated wrongly gives a lock that resolves and a box that
    // cannot import what it was built for.
    for (const { from, to } of parsed.renamed) info(`Renamed ${from} to its conda-forge name ${to}`);
    for (const { line, reason } of parsed.skipped) warning(`Skipped ${line}: ${reason}`);
  }
  if (wanted.length === 0) fail(`Nothing to add from ${requirements}.`);

  const written = new Set();
  for (const { name: packageName, spec } of wanted) {
    const result = await addDependency({ manifests, name: packageName, spec });
    for (const path of result.written) written.add(path);
    success(`${result.replaced ? 'Updated' : 'Added'} ${packageName} = "${spec}"`);
  }
  reportWritten([...written]);
  // A dependency the box installs but never imports is not proven by anything. What the module is
  // called is the author's to say — package name and import name disagree often enough that guessing
  // one here would write a signed self-test claim nobody checked — so this reminds, and stops there.
  step(`Remember to import your dependency modules with ${commandTip('scrollcase add import', '<dependency_module>')}`);
  step(`Next: scrollcase lock ${boxId}`);
}

/** `remove asset|file` — the inverse of `add`, so leaving is as easy as arriving. */
async function remove(kind, positional, flags) {
  const [name, value] = positional;
  if (!value) {
    const argument = { env: 'NAME', import: 'module' }[kind] ?? 'payload path';
    fail(`Usage: scrollcase remove ${kind} <box> <${argument}> [--target <targetId>|all]`);
  }
  if (kind === 'env' || kind === 'import') {
    const { boxId, target } = await editScope(name, flags);
    const result = kind === 'env'
      ? await removeEnvironmentVariable({ boxId, target, name: value })
      : await removeSelfTestImport({ boxId, target, module: value });
    success(`Removed ${value} from ${boxId}`);
    return reportWritten(result.written);
  }
  const { boxId, target } = await editScope(name, flags);
  const { written, removed } = await removeScrollEntry({
    boxId,
    target,
    field: kind === 'asset' ? 'assets' : 'localFiles',
    relativePath: value,
  });
  success(`Removed ${removed} ${kind}${removed === 1 ? '' : 's'} at ${value}`);
  reportWritten(written);
}

/** `edit scroll` — change one field of an existing scroll, with the same checks a build applies. */
async function editScroll(positional, flags) {
  if (positional[0] !== 'scroll' || positional.length > 2) {
    fail('Usage: scrollcase edit scroll [<box>] [--field <name> --value <value>] [--target <targetId>|all]');
  }
  const { boxId, target } = await editScope(positional[1], flags);
  const { field, value } = await chooseScrollEdit({
    fields: await editableScrollFields(),
    requestedField: text(flags, 'field'),
    requestedValue: flags.has('value') ? text(flags, 'value') : null,
    ask: promptText,
  });
  const result = await setScrollField({ boxId, target, field, value });
  success(`Set ${result.field} to ${result.value}`);
  reportWritten(result.written);
}

/** `refresh` — recompute what a scroll pins about the project, and report what upstream changed. */
async function refresh(name, flags) {
  const boxId = await chooseBox({ name: name ?? null, boxIds: await boxIds() });
  const repin = Boolean(flags.get('repin'));
  const result = await refreshScroll({
    boxId,
    repin,
    checkAssets: Boolean(flags.get('check-assets')),
    log: (message) => step(message),
  });
  for (const sourcePath of result.updated) success(`Re-pinned ${sourcePath}`);
  for (const relativePath of result.repinned) warning(`Accepted a changed upstream asset: ${relativePath}`);
  if (result.checked > 0) info(`Checked ${result.checked} remote asset(s)`);
  if (result.written.length === 0) success(`${boxId} is already in step with the project`);
  reportWritten(result.written);
}

/** `doctor` — report whether this machine can build a box. Reads only; never writes. */
async function doctor(flags) {
  let pixiVersion = text(flags, 'pixi-version');
  const scrollName = text(flags, 'scroll');
  if (!pixiVersion && scrollName) {
    const reference = await selectScrollReference(scrollName, flags);
    pixiVersion = (await readScroll(reference)).scroll.pixiVersion;
  }
  const { checks, ok } = await diagnose({
    workspace: getWorkspace(),
    pixiVersion,
    pixiPath: text(flags, 'pixi'),
    condaPackPath: text(flags, 'conda-pack'),
  });
  for (const check of checks) {
    console.log(statusLine(check.ok ? 'success' : 'error', `${check.name.padEnd(11)} ${check.detail}`));
    if (!check.ok && check.remedy) console.log(`  ${statusLine('step', check.remedy)}`);
  }
  if (!ok) fail('Some checks failed; see the remedies above.');
}

/** `audit` — the dependency licence inventory, derived from the lock without building. */
async function audit(name, flags) {
  const reference = await selectScrollReference(name, flags);
  const write = Boolean(flags.get('write'));
  const { summary, reviewed, written, recorded = [] } = await auditScroll(reference, {
    write,
    namespace: text(flags, 'namespace') || undefined,
  });
  info(`${summary.packageCount} packages for ${summary.scrollId} (${summary.targetId})`);
  for (const entry of summary.licenses) console.log(`  ${String(entry.count).padStart(4)}  ${entry.license}`);
  if (written) success(`Wrote reviewed audit: ${reviewed}`);
  else if (reviewed) success(`Matches the reviewed audit: ${reviewed}`);
  // Writing the audit also switches the build's check on, so say which file now declares it.
  for (const path of recorded) success(`Declared condaDependencyLicenseAudit in ${path}`);
}

async function build(name, flags) {
  const reference = await selectScrollReference(name, flags);
  const signing = {
    ...keyPaths(flags),
    signerCommand: text(flags, 'signer-command'),
  };
  await ensureBuildSigningKeys(signing);
  // Asked at the CLI edge and passed down: buildBox never reads a terminal itself.
  const channel = await chooseCliValue(
    'channel',
    ['beta', ...CHANNELS.filter((value) => value !== 'beta')],
    { flag: text(flags, 'channel') },
  );
  // The weights mode is not asked. The scroll declares it, and a menu preselected on `embed` in
  // front of every build was an override waiting to happen: pressing Enter silently repacked a box
  // whose scroll said `on-demand`. `--weights` still overrides deliberately.
  const weights = text(flags, 'weights');
  step(`Building ${reference} (${channel}${weights ? `, ${weights}` : ''})`);
  const built = await buildBox(reference, {
    ...signing,
    allowDirty: Boolean(flags.get('allow-dirty')),
    channel,
    weights,
    assetBaseUrl: text(flags, 'asset-base-url'),
    namespace: text(flags, 'namespace') || undefined,
    pixiPath: text(flags, 'pixi'),
    condaPackPath: text(flags, 'conda-pack'),
    log: (message) => {
      if (!message || /^(Box:|Release:|Channel:|Publish:| {9}then )/.test(message)) return;
      step(message);
    },
  });
  const workspace = getWorkspace();
  success(buildDistributionSummary(built, workspace.distDir));
}

async function verify(path, flags) {
  const hasExtracted = flags.has('extracted');
  if (hasExtracted && (flags.has('archive') || flags.has('self-test'))) {
    fail('--extracted cannot be combined with --archive or --self-test.');
  }
  const extracted = flags.get('extracted');
  if (hasExtracted && (typeof extracted !== 'string' || extracted.trim() === '')) {
    fail('--extracted requires a directory path.');
  }
  if (typeof extracted === 'string') {
    await flushedStep(process.stdout, '');
    await flushedStep(process.stdout, 'Verifying extracted payload');
    const result = await verifyExtractedPayload(path, {
      publicPath: keyPaths(flags).publicPath,
      root: extracted,
      envReport: Boolean(flags.get('env-report')),
      envReportValues: Boolean(flags.get('env-report-values')),
    });
    if (flags.has('env-report') || flags.has('env-report-values')) {
      for (const line of formatEnvironmentReport(result.environmentReport)) console.error(line);
    }
    console.log(
      `Verified extracted payload ${result.boxId} ${result.version} `
      + `(${result.targetId}, ${result.entryCount} entries)`,
    );
    return;
  }
  await flushedStep(process.stdout, '');
  await flushedStep(process.stdout, 'Verifying box');
  await verifyBox(path, {
    publicPath: keyPaths(flags).publicPath,
    archive: text(flags, 'archive'),
    selfTest: Boolean(flags.get('self-test')),
    envReport: Boolean(flags.get('env-report')),
    envReportValues: Boolean(flags.get('env-report-values')),
    onEnvironmentReport: (report) => {
      if (!shouldReportEnvironment(report)) return;
      for (const line of formatEnvironmentReport(report)) console.error(line);
    },
  });
}

async function runRelease(path, flags, args) {
  await flushedRunStatus('');
  await flushedRunStatus('Preparing box for execution');
  return runCliBox(path, {
    publicPath: keyPaths(flags).publicPath,
    archive: text(flags, 'archive'),
    args,
    envReport: Boolean(flags.get('env-report')),
    envReportValues: Boolean(flags.get('env-report-values')),
    // Every other command owns stdout; `run` hands it to the box. A status line written there
    // would land in whatever file or process the caller piped the application's output into.
    log: flushedRunStatus,
  });
}

function usage() {
  console.log(`Usage: scrollcase <command> [options]
       scrollcase -v | --version

Commands:
  init                       Initialize a workspace with a runnable example
  new scroll                 Create one guided target-specific scroll
  add asset|file|dep|env|import <box> <value>
                             Record a remote file with the size and hash it has, a file from
                             this project, a dependency in the box's pixi manifests, an
                             environment variable (NAME=VALUE), or a self-test import
  remove asset|file|env|import <box> <value>
                             Drop what add recorded
  edit scroll [<box>]        Change one field of an existing scroll
  refresh [<box>]            Re-pin what the scroll declares about this project
  doctor                     Report whether this machine can build a box
  keygen                     Create a local ed25519 signing key
  lock [<scroll>]            Resolve the scroll's pixi manifest into pixi.lock
  audit <scroll>             Dependency licence inventory, derived from the lock
  build [<scroll>]           Build, self-test, archive, and sign a box
  verify <release.json>      Verify a signed archive or extracted payload
  run <release.json>         Verify, temporarily extract, and run a local box

Init options:
  --pixi-version <version>   Install this pixi release when setup is approved
  --no-example               Initialize a workspace without the example-box scroll
  --no-templates             Initialize a workspace without the consumer templates
                             Without them, init asks about each, defaulting to yes; without
                             a terminal both are included. Passing both leaves an empty
                             workspace.
  --install-toolchain        Install missing pixi/conda-pack without asking
  --no-install-toolchain     Never install them; just report what is missing
                             With neither flag, init asks before downloading anything, and
                             installs into <toolchain> after a verified checksum check.
                             When the templates are present, one multi-select menu offers
                             their TypeScript, Python and Rust dependencies. Missing Conda
                             offers a PyPI fallback.

New scroll options:
                             Interactively it asks four things — target, box id, upstream
                             revision, and where boxes will be published — plus the execution
                             kind, and derives the rest. Every derived value below is a flag.
  --target <targetId>        Complete target, including the CUDA ABI when applicable
  --box-id <id>              Box identity
  --source-revision <rev>    Upstream source revision recorded in provenance
  --asset-base-url <url>     Base URL used in built release documents
  --model-id <id>            Identity of what the box packages (default: the box id)
  --runtime-id <id>          Runtime identity (default: <box-id>-runtime)
  --version <version>        Box version (default 1.0.0)
  --scroll-version <version> Scroll authoring version (default 1.0.0)
  --python-version <version> Python dependency version, or latest
  --pixi-version <version>   pixi resolver version (default: the installed pixi)
  --min-host-app-version <v> Minimum compatible host application version
  --weights <mode>           embed (default) or on-demand; only matters once the box declares
                             assets, so it is a flag rather than a question
  --execution <kind>         python-script, python-module, or library-only
  --script <path>            Existing project script for python-script
  --generate-script          Generate a minimal project script instead
  --script-destination <path> Payload path for the script (default entrypoint.py)
  --generated-script-path <path> Project path for a generated starter
  --module <name>            Dotted module name for python-module
  --default-args <json>      JSON array of default application arguments
  --max-host-app-version-exclusive <v>
  --min-macos-version <v>
  --min-ram-gb <number>
  --min-nvidia-driver-version <v>
                             Without a terminal, every value without a default must be supplied.

Add, remove and edit options:
  --target <targetId>|all    Which of the box's scrolls to change. "all" means what the targets
                             share: the base of a split scroll, or every target file when there
                             is no base. Without it, a box with one target uses that one and a
                             box with several asks; without a terminal it stops instead.
  --to <payload path>        Where the file lands inside the box. Defaults to the URL's last
                             segment under the model cache, or the file's own name at the root.
  --version <spec>           Version constraint for add dep (default *, letting the lock pin it)
  --from-requirements <file> Read dependencies from a pip requirements.txt instead
  --field <name>             Field for edit scroll; without it, a menu built from the schema
  --value <value>            Its new value

Refresh options:
  --check-assets             Also re-fetch remote assets and report any that changed. Off by
                             default because it downloads every one of them.
  --repin                    Accept those changes into the scroll. Check why upstream changed
                             before using it: a hash is what makes a substituted file fail.

Doctor options:
  --scroll <name>            Take the required pixi version from this scroll
  --target <targetId>        Select a target when <name> is a box with several scrolls
  --pixi-version <version>   Check for this pixi release

Keygen options:
  --key-id <id>              Identifier recorded in signatures (default derived from key)
  --force                    Overwrite both named key files; unsafe for rotation

Audit options:
  --target <targetId>        Select a target when <scroll> names a box
  --write                    Write the inventory to the scroll's reviewed audit path
  --namespace <ns>           Document kind namespace (default scrollcase.box)

Build options:
  --target <targetId>        Select a target when <scroll> names a box
  --channel <name>           Channel the signed pointer names (nightly, beta, or stable;
                             default beta)
  --weights <mode>           embed (assets packed in, works air-gapped) or on-demand
                             (caller-materialized; verified before execution). Overrides the
                             scroll for this build; without it the scroll's own mode is used.
  --asset-base-url <url>     Override the scroll's published base URL
  --namespace <ns>           Document kind namespace (default scrollcase.box)
  --allow-dirty              Permit a build from an uncommitted source tree
  --pixi <path>              Use this pixi executable
  --conda-pack <path>        Use this conda-pack executable (managed installs pin 0.9.2)

Scroll targets:
  lock, audit and build accept either <boxId>/<targetId> or a box ID plus
  --target <targetId>. With only a box ID, a terminal shows an arrow-key menu.
  lock and build also let an interactive terminal choose from every workspace
  scroll when the argument is omitted; non-interactive callers must name one.
  A sole target for this host is the default; Metal is preferred on macOS.
  Without a terminal, any other ambiguous target is an error.

Verify options:
  --archive <path>           Archive to check, if not beside the release document
  --self-test                Extract and import with the box's own interpreter
  --env-report               Expand the environment report
  --env-report-values        Also reveal inherited host values
  --extracted <dir>          Verify an existing extracted payload against its signed digest;
                             cannot be combined with --archive or --self-test

Run:
  scrollcase run <release.json> [--archive <box.zip>] -- [application args]
  --archive <path>           Local archive, if not beside the release document
  --env-report               Expand the execution environment report
  --env-report-values        Also reveal inherited host values
                             Uses --public-key from Signing below, attaches terminal stdio,
                             forwards signals, and exits with the application result.

Signing:
  --private-key <path>       Local signing key (default <keys>/signing-private.pem)
  --public-key <path>        Trusted key set (default <keys>/signing-public.json)
  --signer-command <cmd>     Sign through an external command instead of a local key.
                             It receives the payload on stdin and returns the signed
                             document as JSON on stdout; the result is verified locally.
                             Before build work starts, missing local keys fail with an
                             explicit instruction to run scrollcase keygen.

Workspace:
  Paths come from scrollcase.config.json at the project root, discovered by walking
  up from the working directory, and can be overridden per invocation:
  --config <file>            Use this workspace config explicitly
  --project-root <dir>       Treat this directory as the project root
  --scrolls-dir <dir>        Where scrolls live (default scrolls)
  --build-dir <dir>          Payload scratch space (default .scrollcase/build)
  --out-dir <dir>            Built artefacts (default .scrollcase/dist)
  --keys-dir <dir>           Local signing keys (default .scrollcase/keys)
  --toolchain-dir <dir>      Project-local pixi/conda-pack (default .scrollcase/toolchain)
`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  if (command === '-v' || command === '--version') {
    console.log(SCROLLCASE_NPM_VERSION);
    return;
  }
  const { positional, flags, passthrough } = parseArgs(rest);
  if (!command || command === 'help' || command === '--help') return usage();
  // Resolve the workspace before any command touches a path, so flags win over the project config.
  configureWorkspace({ overrides: workspaceOverridesFromFlags(flags) });
  if (command === 'init') return init(flags);
  if (command === 'new') {
    if (positional[0] !== 'scroll' || positional.length !== 1) {
      fail('Usage: scrollcase new scroll [options]');
    }
    return newScroll(flags);
  }
  if (command === 'add') {
    const [kind, ...rest2] = positional;
    if (!['asset', 'file', 'dep', 'env', 'import'].includes(kind)) {
      fail('Usage: scrollcase add asset|file|dep|env|import <box> <value> [options]');
    }
    return add(kind, rest2, flags);
  }
  if (command === 'remove') {
    const [kind, ...rest2] = positional;
    if (!['asset', 'file', 'env', 'import'].includes(kind)) {
      fail('Usage: scrollcase remove asset|file|env|import <box> <value> [options]');
    }
    return remove(kind, rest2, flags);
  }
  if (command === 'edit') return editScroll(positional, flags);
  if (command === 'refresh') return refresh(positional[0], flags);
  if (command === 'doctor') return doctor(flags);
  if (command === 'keygen') return keygen(flags);
  if (command === 'audit') return audit(positional[0] || fail('audit requires a scroll name.'), flags);
  if (command === 'lock') return lock(positional[0], flags);
  if (command === 'build') return build(positional[0], flags);
  if (command === 'verify') return verify(positional[0] || fail('verify requires a signed release document.'), flags);
  if (command === 'run') {
    if (positional.length !== 1) fail('Usage: scrollcase run <release.json> [--archive <box.zip>] -- [application args]');
    return runRelease(positional[0], flags, passthrough);
  }
  fail(`Unknown command: ${command}`);
}

// Single failure path: every `fail()` anywhere lands here as a one-line message and a non-zero exit
// code, so CI and shell callers can rely on the status.
main().catch((error) => {
  console.error(statusLine(
    'error',
    `scrollcase: ${error instanceof Error ? error.message : String(error)}`,
    { stream: process.stderr },
  ));
  process.exitCode = 1;
});
