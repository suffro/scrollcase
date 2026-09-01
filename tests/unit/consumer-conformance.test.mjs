import { rm } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  loadConsumerConformanceSuite,
  runNodeConformanceCase,
} from '../helpers/consumer-conformance.mjs';

const suite = await loadConsumerConformanceSuite();

// Windows boxes are link-free, and creating a link there needs elevation, so a case that requires
// one cannot run on this host. Skipped rather than weakened: the rule it proves is real on the two
// platforms that carry links.
const symlinksSupported = process.platform !== 'win32';

// Windows carries no POSIX modes at all — `archiveFileMode` writes 0644 for every entry of a
// Windows box, and an extracted file reports no mode to read back. A case asserting one is not
// weaker there, it is inapplicable, so it is skipped for the same reason a link case is.
const posixModesSupported = process.platform !== 'win32';

describe('shared consumer conformance — Node', () => {
  for (const testCase of suite.cases) {
    const inapplicable = (testCase.requiresSymlinks && !symlinksSupported)
      || (testCase.requiresPosixModes && !posixModesSupported);
    it.skipIf(inapplicable)(testCase.id, async () => {
      const result = await runNodeConformanceCase({ ...testCase, suite });
      try {
        expect(result.actual).toEqual(result.expected);
      } finally {
        await rm(result.root, { recursive: true, force: true });
      }
    });
  }
});
