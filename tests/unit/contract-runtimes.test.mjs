import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fixtureUrl } from '../../src/contract/index.mjs';
import { boxTargetAdapters } from '../../src/contract/targets.mjs';
import {
  RUNTIME_IDS,
  executionAffectingVariables,
  isExecutablePayloadPath,
  isImplementedRuntime,
  runtimeAdapter,
  runtimeAdapters,
  unimplementedRuntimeMessage,
} from '../../src/contract/runtimes.mjs';

const PYTHON = 'python';

/**
 * The Node half of the shared runtime vectors.
 *
 * `src/contract/fixtures/runtime-contract.json` is what the Python and Rust mirrors validate
 * themselves against, and this suite is what keeps the reference implementation honest about the
 * same file. Every case here is one another language runs too; a change that only satisfies this
 * one is a change that has broken the mirrors.
 */
const contract = JSON.parse(readFileSync(fixtureUrl('runtime-contract'), 'utf8'));

/** A target the layout rules can be asked about, from a platform name alone. */
function targetFor(platform) {
  const adapter = boxTargetAdapters().find((candidate) => candidate.platform === platform);
  if (!adapter) throw new Error(`No target adapter for platform ${platform}`);
  return adapter;
}

describe('runtime adapters', () => {
  it('exposes exactly the runtimes the fixture describes', () => {
    expect(runtimeAdapters().map((runtime) => runtime.id))
      .toEqual(contract.runtimes.map((fixture) => fixture.id));
  });

  it('names every runtime the format defines, whether or not it implements one', () => {
    // Two different lists on purpose: the wire vocabulary was fixed once, in the version 3 break, so
    // that implementing a second runtime is code rather than another format change.
    expect([...RUNTIME_IDS]).toEqual(contract.runtimeIds);
    for (const id of RUNTIME_IDS) {
      expect(isImplementedRuntime(id), id).toBe(runtimeAdapters().some((r) => r.id === id));
    }
  });

  it('refuses a runtime it has no adapter for, and says which kind of refusal it is', () => {
    for (const id of ['node', 'native']) {
      expect(() => runtimeAdapter(id), id).toThrow(TypeError);
      expect(isImplementedRuntime(id), id).toBe(false);
      expect(unimplementedRuntimeMessage(id)).toContain('not implemented by this version');
    }
    for (const id of ['', undefined, null, 42, 'ruby']) {
      expect(() => runtimeAdapter(id), String(id)).toThrow(TypeError);
      expect(isImplementedRuntime(id), String(id)).toBe(false);
      expect(unimplementedRuntimeMessage(id)).toContain('Unknown runtime');
    }
  });

  it('reproduces every golden layout and executable-path rule', () => {
    for (const fixture of contract.runtimes) {
      const runtime = runtimeAdapter(fixture.id);
      expect([...runtime.executionKinds], fixture.id).toEqual(fixture.executionKinds);
      expect([...runtime.executionEnvironmentVariables], fixture.id)
        .toEqual(fixture.executionEnvironmentVariables);
      for (const platform of fixture.layouts) {
        const target = targetFor(platform.platform);
        expect({ ...runtime.layout(target) }, platform.platform).toEqual(platform.layout);
        const rule = runtime.executablePayloadPaths(target);
        expect({ files: [...rule.files], directories: [...rule.directories] }, platform.platform)
          .toEqual(platform.executablePayloadPaths);
      }
    }
  });

  it('answers the executable question the same way for every golden path', () => {
    for (const testCase of contract.executableMatches) {
      const runtime = runtimeAdapter(testCase.runtime);
      const rule = runtime.executablePayloadPaths(targetFor(testCase.platform));
      expect(isExecutablePayloadPath(rule, testCase.path), testCase.name)
        .toBe(testCase.executable);
    }
  });

  it('derives exactly the golden candidate list for every declared execution', () => {
    for (const testCase of contract.executionDiscovery) {
      const runtime = runtimeAdapter(testCase.runtime);
      const { candidates } = runtime.resolveExecutionFiles({
        execution: testCase.execution,
        runtimeVersion: testCase.runtimeVersion,
        target: targetFor(testCase.platform),
      });
      expect([...candidates], testCase.name).toEqual(testCase.candidates);
    }
  });

  it('refuses a runtime version that cannot name a standard library', () => {
    const target = targetFor('linux');
    for (const runtimeVersion of contract.invalidRuntimeVersions) {
      expect(() => runtimeAdapter('python').resolveExecutionFiles({
        execution: { kind: 'python-module', module: 'pkg', defaultArgs: [] },
        runtimeVersion,
        target,
      }), JSON.stringify(runtimeVersion)).toThrow(/Invalid Python version/);
    }
  });

  it('builds exactly the golden shell-free command line', () => {
    for (const testCase of contract.argv) {
      const runtime = runtimeAdapter(testCase.runtime);
      const invocation = runtime.buildArgv({
        execution: testCase.execution,
        target: targetFor(testCase.platform),
      });
      expect({ ...invocation.command }, testCase.name).toEqual(testCase.command);
      expect(invocation.args.map((argument) => ({ ...argument })), testCase.name)
        .toEqual(testCase.args);
    }
  });

  it('turns every golden self-test probe into the same invocations', () => {
    for (const testCase of contract.selfTest) {
      const runtime = runtimeAdapter(testCase.runtime);
      const invocations = runtime.selfTestInvocations({
        probe: testCase.probe,
        execution: testCase.execution,
        target: targetFor(testCase.platform),
      });
      expect(invocations.map((invocation) => ({
        command: { ...invocation.command },
        args: invocation.args.map((argument) => ({ ...argument })),
        expectExitCode: invocation.expectExitCode,
      })), testCase.name).toEqual(testCase.invocations);
    }
  });

  it('refuses a command probe with no execution to invoke', () => {
    expect(() => runtimeAdapter(PYTHON).selfTestInvocations({
      probe: { commands: [{ args: [], expectExitCode: 0 }] },
      execution: null,
      target: targetFor('linux'),
    })).toThrow(/needs a declared execution/);
  });

  it('rejects a target no runtime has a layout for', () => {
    const runtime = runtimeAdapter(PYTHON);
    expect(() => runtime.layout({ platform: 'plan9' })).toThrow(/No python runtime layout/);
    expect(() => runtime.selfTestInvocations({
      probe: { imports: ['json'] },
      execution: null,
      target: { platform: 'plan9' },
    })).toThrow(/No python self-test assertion/);
  });
});

describe('execution-affecting variables', () => {
  it('joins the runtime half to the target half, runtime first', () => {
    // The order is what a diagnostic report is printed in, so it is part of the answer rather than
    // an accident of how the two lists happened to be concatenated.
    for (const adapter of boxTargetAdapters()) {
      const merged = executionAffectingVariables(PYTHON, adapter);
      expect([...merged], adapter.id).toEqual([
        ...runtimeAdapter(PYTHON).executionEnvironmentVariables,
        ...adapter.executionAffectingEnvironmentVariables,
      ]);
      // Neither half may be dropped: this is the list that decides which inherited values a report
      // calls out, and a short one is a quiet one.
      expect(merged, adapter.id).toContain('PYTHONPATH');
    }
  });

  it('names the operating system control each platform actually has', () => {
    const named = new Map(boxTargetAdapters()
      .map((adapter) => [adapter.platform, executionAffectingVariables(PYTHON, adapter)]));
    expect(named.get('macos')).toContain('DYLD_INSERT_LIBRARIES');
    expect(named.get('linux')).toContain('LD_PRELOAD');
    expect(named.get('windows')).not.toContain('LD_PRELOAD');
  });
});
