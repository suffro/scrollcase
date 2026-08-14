/**
 * Runs the local LLM demo box through the typed Node consumer.
 *
 * SETUP (once, from this folder):
 *   npm install
 *
 * RUN:
 *   npx tsx run-box.ts
 *   npx tsx run-box.ts "a question of your own"
 *
 * The public key is not shipped with the box: download it first, as the guide describes. A
 * signature only proves where something came from if the key does not travel with it.
 *
 * This runs the box's one-shot mode, which answers once and exits. The box also has an
 * interactive chat, reached by running it with no arguments at all -- that one wants a terminal,
 * so it belongs to `scrollcase run <release>` rather than to a script like this.
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { runBox } from 'scrollcase/consumer';

// The release document is named for its own SHA-256, so it is found rather than hard-coded. The box
// archive is never named here: the consumer resolves it beside this document, under the hash the
// document commits to.
const release = readdirSync('box').find((name) => name.endsWith('.release.json'));
if (!release) throw new Error('No .release.json in box/ — unpack the downloaded archive first.');

// The prompt is supplied here because the release declares no `defaultArgs`. Passing none would
// not be "no prompt": it would reach the box with an empty argument list, which is how the box is
// told to open a chat instead.
const question = process.argv.slice(2);
const args = question.length > 0 ? question : ['What is the capital of France?'];

const result = await runBox(join('box', release), {
  publicPath: 'keys/example-signing-public.json',
  args,
  stdout: 'inherit',
  stderr: 'inherit',
  // Fires after the signature, the archive hash and the manifest have been checked, and before the
  // box interpreter starts, so an application can show what it is about to run without repeating
  // the trust chain itself.
  onPrepared: ({ boxId, version, targetId }) => {
    console.log(`Running ${boxId} ${version} (${targetId})`);
    console.log(`Prompt: ${args.join(' ')}`);
  },
});

if (result.signal) console.error(`Box exited after ${result.signal}.`);
process.exitCode = result.exitCode ?? 1;
