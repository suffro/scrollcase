import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildDistributionSummary,
  commandTip,
  promptHeading,
  promptMarker,
  statusLine,
} from '../../src/cli-output.mjs';

describe('CLI output presentation', () => {
  it('keeps symbols but omits ANSI escapes outside a terminal', () => {
    expect(statusLine('success', 'Build complete', {
      stream: { isTTY: false },
      env: {},
    })).toBe('✓ Build complete');
  });

  it('colours only the symbol in an interactive terminal', () => {
    expect(statusLine('step', 'Running self-test', {
      stream: { isTTY: true },
      env: {},
    })).toBe('\x1b[36m→\x1b[0m Running self-test');
  });

  it('honours NO_COLOR even when it is empty', () => {
    expect(statusLine('warning', 'Check this', {
      stream: { isTTY: true },
      env: { NO_COLOR: '' },
    })).toBe('⚠ Check this');
  });

  it('separates a question from the answer above it, title first and explanation second', () => {
    expect(promptHeading('Box ID', {
      hint: 'Name of the box across all its versions.',
      stream: { isTTY: false },
      env: {},
    })).toBe('\nBox ID\nName of the box across all its versions:\n');
  });

  it('leads a question without an explanation with its own colon, and a menu title with none', () => {
    const plain = { stream: { isTTY: false }, env: {} };
    expect(promptHeading('Script path', plain)).toBe('\nScript path:\n');
    expect(promptHeading('Which weights mode?', plain)).toBe('\nWhich weights mode?\n');
  });

  it('colours the title and the answer marker differently, and neither the explanation', () => {
    const terminal = { stream: { isTTY: true }, env: {} };
    expect(promptHeading('Box ID', { ...terminal, hint: 'Name of the box.' }))
      .toBe('\n\x1b[35mBox ID\x1b[0m\nName of the box:\n');
    expect(promptMarker(terminal)).toBe('\x1b[90m ↳ \x1b[0m');
  });

  it('keeps the question readable when the terminal asked for no colour', () => {
    const plain = { stream: { isTTY: true }, env: { NO_COLOR: '' } };
    expect(promptHeading('Box ID', plain)).toBe('\nBox ID:\n');
    expect(promptMarker(plain)).toBe(' ↳ ');
  });

  it('sets a tip apart from its placeholder, and drops both colours when asked to', () => {
    expect(commandTip('scrollcase add import', '<dependency_module>', {
      stream: { isTTY: true },
      env: {},
    })).toBe('\x1b[35mscrollcase add import\x1b[0m \x1b[90m<dependency_module>\x1b[0m');
    expect(commandTip('scrollcase add import', '<dependency_module>', {
      stream: { isTTY: true },
      env: { NO_COLOR: '' },
    })).toBe('scrollcase add import <dependency_module>');
  });

  it('summarises distribution with relative paths and without content hashes', () => {
    const distDir = join(process.cwd(), '.scrollcase', 'dist');
    expect(buildDistributionSummary({
      archivePath: join(distDir, 'boxes', 'demo', '1.2.3', 'macos-aarch64-metal', 'abc123.zip'),
      channelPath: join(distDir, 'channels', 'demo', 'beta', 'macos-aarch64-metal.json'),
    }, distDir)).toBe(
      'Build complete — you can distribute the 2 files under boxes/demo/1.2.3/macos-aarch64-metal/ '
      + 'and channels/demo/beta/macos-aarch64-metal.json',
    );
  });
});
