import { describe, expect, it, vi } from 'vitest';
import {
  defaultYesConfirmation,
  resolveExampleChoice,
  resolvePythonConsumerSource,
  resolveTemplatesChoice,
  runInitDependencySetup,
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
