/**
 * Runs the sentiment demo box through the typed Node consumer.
 *
 * SETUP (once, from this folder):
 *   npm install
 *
 * RUN:
 *   npx tsx run-box.ts
 *   npx tsx run-box.ts "a sentence of your own"
 *
 * The public key is not shipped with the box: download it first, as the guide describes. A
 * signature only proves where something came from if the key does not travel with it.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runBox } from 'scrollcase/consumer';

// The release document is named for its own SHA-256, so it is found rather than hard-coded. The box
// archive is never named here: the consumer resolves it beside this document, under the hash the
// document commits to.
const release = readdirSync('box').find((name) => name.endsWith('.release.json'));
if (!release) throw new Error('No .release.json in box/ — unpack the downloaded archive first.');

// This box classifies a sentence, so it needs one. The release declares no `defaultArgs`, and the
// entrypoint exits with a usage message rather than inventing an input, so the sentence is supplied
// here — from the command line when given, otherwise the example from the guide.
const sentence = process.argv.slice(2);
const args = sentence.length > 0 ? sentence : ['This product is surprisingly easy to use.'];

const result = await runBox(join('box', release), {
  publicPath: 'keys/example-signing-public.json',
  args,
  stdout: 'inherit',
  stderr: 'inherit',
  // Fires after the signature, the archive hash and the manifest have been checked, and before the
  // box interpreter starts, so an application can show what it is about to run without repeating
  // the trust chain itself.
  // On stderr, not stdout: the box writes its verdict to this process's stdout, and the promise
  // that redirecting it gives you a file with the verdict and nothing else is one a script wrapping
  // the box has to keep too.
  onPrepared: ({ boxId, version, targetId }) => {
    console.error(`Running ${boxId} ${version} (${targetId})`);
    console.error(`Sentence: ${args.join(' ')}`);
  },
});

if (result.signal) console.error(`Box exited after ${result.signal}.`);
process.exitCode = result.exitCode ?? 1;
