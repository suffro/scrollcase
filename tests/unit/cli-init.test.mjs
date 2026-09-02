import { describe, expect, it, vi } from 'vitest';
import {
  defaultYesConfirmation,
  resolveExampleChoice,
  resolvePythonConsumerSource,
  resolveTemplatesChoice,
  runInitDependencySetup,
  toolchainReportLines,
} from '../../src/cli-init.mjs';

describe('init example choice', () => {
  it('asks an interactive caller, and takes the answer', async () => {
    const confirmExample = vi.fn(async () => true);
    await expect(resolveExampleChoice({
      noExample: false,
      interactive: true,
      confirmExample,
    })).resolves.toBe(true);
    expect(confirmExample).toHaveBeenCalledOnce();

    await expect(resolveExampleChoice({
      noExample: false,
      interactive: true,
      confirmExample: async () => false,
    })).resolves.toBe(false);
  });

  it('keeps the example without a terminal, and drops it for --no-example', async () => {
    const confirmExample = vi.fn();

    await expect(resolveExampleChoice({
      noExample: false,
      interactive: false,
      confirmExample,
    })).resolves.toBe(true);
    await expect(resolveExampleChoice({
      noExample: true,
      interactive: true,
      confirmExample,
    })).resolves.toBe(false);
    expect(confirmExample).not.toHaveBeenCalled();
  });
});

describe('init consumer template choice', () => {
  it('is answered independently of the example', async () => {
    const confirmTemplates = vi.fn(async () => true);

    // Declining the example says nothing about the templates: they are what a real consumer
    // application starts from, and the demo is what gets deleted.
    await expect(resolveTemplatesChoice({
      noTemplates: false,
      interactive: true,
      confirmTemplates,
    })).resolves.toBe(true);
    expect(confirmTemplates).toHaveBeenCalledOnce();

    await expect(resolveTemplatesChoice({
      noTemplates: false,
      interactive: true,
      confirmTemplates: async () => false,
    })).resolves.toBe(false);
  });

  it('keeps the templates without a terminal, and drops them for --no-templates', async () => {
    const confirmTemplates = vi.fn();

    await expect(resolveTemplatesChoice({
      noTemplates: false,
      interactive: false,
      confirmTemplates,
    })).resolves.toBe(true);
    await expect(resolveTemplatesChoice({
      noTemplates: true,
      interactive: true,
      confirmTemplates,
    })).resolves.toBe(false);
    expect(confirmTemplates).not.toHaveBeenCalled();
  });
});

describe('init dependency setup', () => {
  it('accepts an empty answer as the default yes choice', () => {
    expect(defaultYesConfirmation('')).toBe(true);
    expect(defaultYesConfirmation('  ')).toBe(true);
    expect(defaultYesConfirmation('y')).toBe(true);
    expect(defaultYesConfirmation('YES')).toBe(true);
    expect(defaultYesConfirmation('n')).toBe(false);
    expect(defaultYesConfirmation('no')).toBe(false);
    expect(defaultYesConfirmation('later')).toBe(false);
  });

  it('offers PyPI when conda-forge was selected but Conda is unavailable', async () => {
    const confirmPyPIFallback = vi.fn(async () => true);

    await expect(resolvePythonConsumerSource({
      selectedSource: 'conda-forge',
      condaAvailable: false,
      confirmPyPIFallback,
    })).resolves.toBe('pypi');
    expect(confirmPyPIFallback).toHaveBeenCalledOnce();
  });

  it('skips Python installation when the PyPI fallback is declined', async () => {
    await expect(resolvePythonConsumerSource({
      selectedSource: 'conda-forge',
      condaAvailable: false,
      confirmPyPIFallback: async () => false,
    })).resolves.toBeNull();
  });

  it('collects every answer before starting any installation', async () => {
    const events = [];

    const result = await runInitDependencySetup({
      hasTemplates: true,
      chooseConsumerLanguages: async (offered) => {
        events.push(`answer:languages:${offered.join(',')}`);
        return ['typescript', 'python', 'rust'];
      },
      choosePythonSource: async () => {
        events.push('answer:python-source');
        return 'pypi';
      },
      installToolchain: async () => {
        events.push('answer:toolchain');
        events.push('install:toolchain');
        return { installed: ['pixi'] };
      },
      installTypeScript: () => {
        events.push('install:typescript');
        return { scrollcaseVersion: '0.4.6' };
      },
      installPython: (source) => {
        events.push(`install:python:${source}`);
        return { source };
      },
      installRust: () => {
        events.push('install:rust');
        return { command: 'cargo' };
      },
    });

    expect(events).toEqual([
      'answer:languages:typescript,python,rust',
      'answer:python-source',
      'answer:toolchain',
      'install:toolchain',
      'install:typescript',
      'install:python:pypi',
      'install:rust',
    ]);
    expect(result).toMatchObject({
      installTypeScript: true,
      pythonSource: 'pypi',
      installRust: true,
      toolchain: { installed: ['pixi'] },
    });
  });

  it('installs only what the one menu selected', async () => {
    const installTypeScript = vi.fn();
    const installRust = vi.fn();

    const result = await runInitDependencySetup({
      hasTemplates: true,
      chooseConsumerLanguages: async () => ['python'],
      choosePythonSource: async () => 'pypi',
      installToolchain: async () => ({ installed: [] }),
      installTypeScript,
      installPython: (source) => ({ source }),
      installRust,
    });

    expect(installTypeScript).not.toHaveBeenCalled();
    expect(installRust).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      installTypeScript: false,
      pythonSource: 'pypi',
      installRust: false,
      python: { source: 'pypi' },
    });
  });

  it('asks no consumer questions when no templates were generated', async () => {
    const chooseConsumerLanguages = vi.fn();
    const choosePythonSource = vi.fn();
    const installTypeScript = vi.fn();
    const installPython = vi.fn();
    const installRust = vi.fn();

    await runInitDependencySetup({
      hasTemplates: false,
      chooseConsumerLanguages,
      choosePythonSource,
      installToolchain: async () => ({ installed: [] }),
      installTypeScript,
      installPython,
      installRust,
    });

    expect(chooseConsumerLanguages).not.toHaveBeenCalled();
    expect(choosePythonSource).not.toHaveBeenCalled();
    expect(installTypeScript).not.toHaveBeenCalled();
    expect(installPython).not.toHaveBeenCalled();
    expect(installRust).not.toHaveBeenCalled();
  });

  it('never offers Rust when Cargo is unavailable, even if it is selected', async () => {
    const installRust = vi.fn();
    let offered = null;

    const result = await runInitDependencySetup({
      hasTemplates: true,
      rustAvailable: false,
      chooseConsumerLanguages: async (languages) => {
        offered = languages;
        return ['rust'];
      },
      choosePythonSource: vi.fn(),
      installToolchain: async () => ({ installed: [] }),
      installTypeScript: vi.fn(),
      installPython: vi.fn(),
      installRust,
    });

    expect(offered).toEqual(['typescript', 'python']);
    expect(installRust).not.toHaveBeenCalled();
    expect(result).toMatchObject({ rustAvailable: false, installRust: false, rust: null });
  });
});

/**
 * Every outcome of the toolchain step says something.
 *
 * The "already there" branch used to say nothing at all: `init` looks for pixi and conda-pack on
 * every run and asks only when one is missing, so on a machine that had both, the question a reader
 * had been told to expect never appeared and nothing explained why. Silence there is
 * indistinguishable from never having looked, and it was reported as a bug for exactly that reason.
 */
describe('the toolchain report', () => {
  const lines = (toolchain) =>
    toolchainReportLines(toolchain, { toolchainDir: '/p/.scrollcase/toolchain' });
  const text = (toolchain) => lines(toolchain).map(([, message]) => message).join('\n');

  it('says so when nothing was missing', () => {
    const reported = lines({ installed: [], missing: [], pixiVersion: '0.77.0' });
    expect(reported.length).toBeGreaterThan(0);
    expect(text({ installed: [], missing: [], pixiVersion: '0.77.0' }))
      .toContain('Found pixi 0.77.0 and conda-pack');
  });

  it('names the newer pixi, and what pinning it would mean', () => {
    const reported = lines({
      installed: [], missing: [], pixiVersion: '0.73.0', newestPixiVersion: '0.78.0',
    });
    expect(reported.some(([level]) => level === 'warning')).toBe(true);
    // The consequence, not the news: `new scroll` records the pixi it finds and `build` refuses any
    // other for that scroll, so being behind decides what every scroll written next pins.
    expect(reported.map(([, message]) => message).join('\n')).toContain('would pin 0.73.0');
  });

  it('stays quiet about the newest release when it is current or unknown', () => {
    for (const newestPixiVersion of ['0.77.0', null, undefined]) {
      const reported = lines({ installed: [], missing: [], pixiVersion: '0.77.0', newestPixiVersion });
      expect(reported.some(([level]) => level === 'warning'), String(newestPixiVersion)).toBe(false);
    }
  });

  it('still reports an install, an unsupported host and a decline', () => {
    expect(text({ installed: ['pixi 0.78.0'], missing: [], configPath: '/p/scrollcase.config.json' }))
      .toContain('Installed pixi 0.78.0 into /p/.scrollcase/toolchain');
    expect(text({ installed: [], missing: ['pixi'], unsupportedHost: 'aix/ppc64' }))
      .toContain('publishes no build for aix/ppc64');
    expect(text({ installed: [], missing: ['pixi', 'conda-pack'], declined: true }))
      .toContain('Skipped installing pixi and conda-pack');
  });
});
