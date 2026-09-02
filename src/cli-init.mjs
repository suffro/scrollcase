/**
 * Orders the optional work performed by `scrollcase init`.
 *
 * Every answer is collected before the first installer runs. Besides making the interaction easier
 * to review, this prevents an early download or package install from interrupting the remaining
 * questions and leaving the user's choices only half collected.
 */

/** Interprets an interactive `[Y/n]` answer without treating arbitrary input as consent. */
export function defaultYesConfirmation(value) {
  const answer = value.trim();
  return answer === '' || /^y(es)?$/i.test(answer);
}

/**
 * Decides whether `init` scaffolds the disposable example scroll.
 *
 * `--no-example` answers without asking. Without a terminal the example is kept rather than
 * dropped — unlike an install, writing a disposable scaffold is not the kind of consent that
 * silence withholds, and a non-interactive `init` keeps producing exactly what it produced before
 * there was a question.
 */
export async function resolveExampleChoice({ noExample, interactive, confirmExample }) {
  if (noExample) return false;
  if (!interactive) return true;
  return confirmExample();
}

/**
 * Decides whether `init` writes the consumer templates, which is a separate question.
 *
 * They were once part of the example, and declining a throwaway scroll took them with it. The two
 * answer different needs: the example exists to be run once and deleted, while the templates are
 * working starting points for the application that will consume this project's boxes, and that
 * application is written whether or not anyone wanted a demo. This is the question that decides
 * which later ones exist, since the consumer-dependency offers install what the templates need.
 */
export async function resolveTemplatesChoice({ noTemplates, interactive, confirmTemplates }) {
  if (noTemplates) return false;
  if (!interactive) return true;
  return confirmTemplates();
}

export async function resolvePythonConsumerSource({
  selectedSource,
  condaAvailable,
  confirmPyPIFallback,
}) {
  if (selectedSource !== 'conda-forge' || condaAvailable) return selectedSource;
  return await confirmPyPIFallback() ? 'pypi' : null;
}

/**
 * The consumer languages a template exists for, in the order their dependencies are offered.
 *
 * One list, used to build the menu and to read its answer back, so an entry cannot be offered
 * without an installer behind it.
 */
export const CONSUMER_LANGUAGES = Object.freeze(['typescript', 'python', 'rust']);

export async function runInitDependencySetup({
  hasTemplates,
  rustAvailable = true,
  chooseConsumerLanguages,
  choosePythonSource,
  installToolchain,
  installTypeScript,
  installPython,
  installRust,
}) {
  let pythonSource = null;

  // One question for the set rather than three yes/no prompts in a row: they are the same decision
  // asked about three languages, and most projects want one of them.
  const offered = CONSUMER_LANGUAGES.filter((language) => language !== 'rust' || rustAvailable);
  const selected = hasTemplates ? await chooseConsumerLanguages(offered) : [];
  const chose = (language) => offered.includes(language) && selected.includes(language);

  const shouldInstallTypeScript = chose('typescript');
  const shouldInstallRust = chose('rust');
  if (chose('python')) pythonSource = await choosePythonSource();

  const toolchain = await installToolchain();
  const typescript = shouldInstallTypeScript ? installTypeScript() : null;
  const python = pythonSource ? installPython(pythonSource) : null;
  const rust = shouldInstallRust ? installRust() : null;

  return {
    installTypeScript: shouldInstallTypeScript,
    pythonSource,
    rustAvailable,
    installRust: shouldInstallRust,
    toolchain,
    typescript,
    python,
    rust,
  };
}

/**
 * What `init` says about the build toolchain, as lines the CLI edge renders.
 *
 * Four outcomes, and every one of them reports. The last used to be silent: `init` looks for pixi
 * and conda-pack on every run and asks only when something is missing, so on a machine that already
 * had both, the question a reader had been told to expect never appeared and nothing said why —
 * silence there is indistinguishable from never having looked.
 *
 * Extracted from `cli.mjs` so the four branches can be asserted without a host that happens to have
 * the tools installed, which is the reason the silent one went unnoticed.
 *
 * @param {object} toolchain the result of `ensureToolchain`
 * @param {{ toolchainDir: string }} options
 * @returns {Array<[('success'|'info'|'warning'), string]>}
 */
export function toolchainReportLines(toolchain, { toolchainDir }) {
  if (toolchain.installed.length > 0) {
    const lines = [
      ['success', `Installed ${toolchain.installed.join(' and ')} into ${toolchainDir}`],
      ['info', 'Nothing was added to PATH; scrollcase finds them there on its own.'],
    ];
    if (toolchain.configPath) {
      lines.push(['success', `Recorded the toolchain pins in ${toolchain.configPath}`]);
    }
    return lines;
  }
  if (toolchain.unsupportedHost) {
    return [['warning', `pixi publishes no build for ${toolchain.unsupportedHost}; install ${toolchain.missing.join(' and ')} manually.`]];
  }
  if (toolchain.missing.length > 0) {
    return [
      ['warning', `Skipped installing ${toolchain.missing.join(' and ')}.`],
      ['info', 'Install them yourself, or re-run with --install-toolchain. `scrollcase doctor` reports what is missing.'],
    ];
  }
  if (toolchain.pixiVersion) {
    const lines = [['info', `Found pixi ${toolchain.pixiVersion} and conda-pack; nothing to install.`]];
    // Worth saying because of what happens next rather than as general news: `new scroll` records
    // the pixi it finds, and `build` refuses any other version for that scroll. Being behind here
    // means every scroll written from now on pins the old resolver.
    if (toolchain.newestPixiVersion && toolchain.newestPixiVersion !== toolchain.pixiVersion) {
      lines.push(['warning', `pixi ${toolchain.newestPixiVersion} is the newest release.`]);
      lines.push(['info', `A scroll created now would pin ${toolchain.pixiVersion}; pass --pixi-version to choose another.`]);
    }
    return lines;
  }
  return [];
}
