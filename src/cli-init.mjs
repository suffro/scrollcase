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

export async function resolvePythonConsumerSource({
  selectedSource,
  condaAvailable,
  confirmPyPIFallback,
}) {
  if (selectedSource !== 'conda-forge' || condaAvailable) return selectedSource;
  return await confirmPyPIFallback() ? 'pypi' : null;
}

export async function runInitDependencySetup({
  hasExample,
  rustAvailable = true,
  confirmTypeScript,
  confirmPython,
  confirmRust,
  choosePythonSource,
  installToolchain,
  installTypeScript,
  installPython,
  installRust,
}) {
  let shouldInstallTypeScript = false;
  let pythonSource = null;
  let shouldInstallRust = false;

  if (hasExample) {
    shouldInstallTypeScript = await confirmTypeScript();
    if (await confirmPython()) pythonSource = await choosePythonSource();
    if (rustAvailable) shouldInstallRust = await confirmRust();
  }

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
