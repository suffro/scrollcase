/**
 * Runs the local LLM demo box through the typed Node consumer.
 *
 * SETUP (once, from this folder):
 *   npm install
 *
 * RUN:
 *   npx tsx run-box.ts "a question of your own"   answer once and exit
 *   npx tsx run-box.ts                            open the box's interactive chat
 *
 * The public key is not shipped with the box: download it first, as the guide describes. A
 * signature only proves where something came from if the key does not travel with it.
 *
 * Both modes are the box's, not this script's, and reaching them takes no extra code: `runBox`
 * inherits this process's streams, so the chat reads the terminal you started it from. Started
 * without one -- a pipe, a CI step -- the chat meets end of input and exits, which is why a script
 * that has to produce an answer passes a question rather than relying on the mode.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runBox } from 'scrollcase/consumer';

// The release document is named for its own SHA-256, so it is found rather than hard-coded. The box
// archive is never named here: the consumer resolves it beside this document, under the hash the
// document commits to.
const release = readdirSync('box').find((name) => name.endsWith('.release.json'));
if (!release) throw new Error('No .release.json in box/ — unpack the downloaded archive first.');

// Straight through, with nothing substituted for an empty list. The release declares no
// `defaultArgs`, so what arrives here is what decides the mode: words are a question answered once,
// and no words at all is how the box is told to open a chat. A template that supplied a prompt of
// its own would always run and would teach the wrong rule — that a box needs one.
const args = process.argv.slice(2);

const result = await runBox(join('box', release), {
  publicPath: 'keys/example-signing-public.json',
  args,
  stdout: 'inherit',
  stderr: 'inherit',
  // Fires after the signature, the archive hash and the manifest have been checked, and before the
  // box interpreter starts, so an application can show what it is about to run without repeating
  // the trust chain itself.
  // On stderr, not stdout: the box writes its answer to this process's stdout, and the promise that
  // redirecting it gives you a file with the answer and nothing else is one a script wrapping the
  // box has to keep too.
  onPrepared: ({ boxId, version, targetId }) => {
    console.error(`Running ${boxId} ${version} (${targetId})`);
    console.error(args.length > 0 ? `Prompt: ${args.join(' ')}` : 'No prompt: opening the chat');
  },
});

if (result.signal) console.error(`Box exited after ${result.signal}.`);
process.exitCode = result.exitCode ?? 1;
