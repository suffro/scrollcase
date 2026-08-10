import { describe, expect, it, vi } from 'vitest';
import {
  defaultYesConfirmation,
  resolvePythonConsumerSource,
  runInitDependencySetup,
} from '../../src/cli-init.mjs';

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
      hasExample: true,
      confirmTypeScript: async () => {
        events.push('answer:typescript');
        return true;
      },
      confirmPython: async () => {
        events.push('answer:python');
        return true;
      },
      confirmRust: async () => {
        events.push('answer:rust');
        return true;
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
      'answer:typescript',
      'answer:python',
      'answer:python-source',
      'answer:rust',
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

  it('asks no consumer questions when no example was generated', async () => {
    const confirmTypeScript = vi.fn();
    const confirmPython = vi.fn();
    const confirmRust = vi.fn();
    const choosePythonSource = vi.fn();
    const installTypeScript = vi.fn();
    const installPython = vi.fn();
    const installRust = vi.fn();

    await runInitDependencySetup({
      hasExample: false,
      confirmTypeScript,
      confirmPython,
      confirmRust,
      choosePythonSource,
      installToolchain: async () => ({ installed: [] }),
      installTypeScript,
      installPython,
      installRust,
    });

    expect(confirmTypeScript).not.toHaveBeenCalled();
    expect(confirmPython).not.toHaveBeenCalled();
    expect(confirmRust).not.toHaveBeenCalled();
    expect(choosePythonSource).not.toHaveBeenCalled();
    expect(installTypeScript).not.toHaveBeenCalled();
    expect(installPython).not.toHaveBeenCalled();
    expect(installRust).not.toHaveBeenCalled();
  });
});
