/**
 * Restrained terminal presentation for the human CLI.
 *
 * Symbols keep redirected logs readable on their own; ANSI colour is an optional enhancement only
 * for a real terminal, and `NO_COLOR` always wins. The library modules remain presentation-free.
 */

import { dirname, relative, sep } from 'node:path';

const styles = Object.freeze({
  success: { symbol: '✓', ansi: 32 },
  step: { symbol: '→', ansi: 36 },
  info: { symbol: '·', ansi: 90 },
  warning: { symbol: '⚠', ansi: 33 },
  error: { symbol: '✗', ansi: 31 },
});

/**
 * The two colours the interactive questions use.
 *
 * Both are palette entries rather than 24-bit values, so the terminal's own theme supplies them and
 * a title stays legible on a light scheme and a dark one alike. Magenta is the one hue that keeps
 * its contrast against both a white and a black background — yellow disappears on the first, blue
 * on the second — and bright black is the muted entry every scheme defines, which is exactly the
 * weight the answer marker wants: present, and behind the answer typed next to it.
 */
const promptStyles = Object.freeze({ title: 35, marker: 90 });

/**
 * The command a tip asks the reader to type, and the placeholder they replace before typing it.
 *
 * Same two palette entries as the questions, for the same reasons: magenta holds its contrast on a
 * light scheme and a dark one, so the command stands out of the sentence around it, and bright black
 * is muted enough that `<dependency_module>` reads as a slot to fill rather than a word to copy.
 */
const tipStyles = Object.freeze({ command: 35, placeholder: 90 });

/** True when the stream is a terminal whose user has not asked for plain output. */
const colourAvailable = (stream, env) =>
  Boolean(stream.isTTY && !Object.hasOwn(env, 'NO_COLOR') && env.TERM !== 'dumb');

const paint = (text, ansi, stream, env) =>
  (colourAvailable(stream, env) ? `\x1b[${ansi}m${text}\x1b[0m` : text);

/**
 * Ends the line that sits directly above the answer with a colon.
 *
 * A trailing full stop becomes the colon rather than preceding it: the sentence is no longer a
 * remark, it is the lead-in to the field being asked for. A line that already ends in `?` or `:` is
 * left alone, because a menu title is a question in its own right.
 */
const asLead = (line) => (/[?:]$/.test(line) ? line : `${line.replace(/\.$/, '')}:`);

/** Formats one CLI status line, colouring only its symbol when the terminal supports it. */
export function statusLine(kind, message, {
  stream = process.stdout,
  env = process.env,
} = {}) {
  const style = styles[kind];
  return `${paint(style.symbol, style.ansi, stream, env)} ${message}`;
}

/**
 * Formats the heading that introduces one interactive question.
 *
 * Every question in the CLI is a title, an explanation, and an answer, in that order, and the block
 * opens with a blank line. Run together, a `new scroll` session printed a hint, a question and an
 * answer on adjacent lines nine times over, and the result was a wall in which the explanations
 * were indistinguishable from the things being asked. The title carries the colour so the eye can
 * find where each question starts; the explanation stays plain because it is prose, not a label.
 */
export function promptHeading(title, {
  hint = null,
  stream = process.stdout,
  env = process.env,
} = {}) {
  const heading = paint(hint ? title : asLead(title), promptStyles.title, stream, env);
  return hint ? `\n${heading}\n${asLead(hint)}\n` : `\n${heading}\n`;
}

/** The soft marker an answer is typed after, so the answer reads as the reply to the line above. */
export function promptMarker({ stream = process.stdout, env = process.env } = {}) {
  return paint(' ↳ ', promptStyles.marker, stream, env);
}

/**
 * Formats a command inside a tip, with the part the reader has to substitute held back.
 *
 * The only place a status line's message carries colour rather than leaving it to the symbol: a tip
 * exists to be retyped, so the command has to be findable in the sentence that suggests it.
 */
export function commandTip(command, placeholder, {
  stream = process.stdout,
  env = process.env,
} = {}) {
  return `${paint(command, tipStyles.command, stream, env)} `
    + `${paint(placeholder, tipStyles.placeholder, stream, env)}`;
}

/** Builds the concise, relative distribution instruction printed after a successful build. */
export function buildDistributionSummary({ archivePath, channelPath }, distDir) {
  const displayPath = (path) => relative(distDir, path).split(sep).join('/');
  return `Build complete — you can distribute the 2 files under ${displayPath(dirname(archivePath))}/ `
    + `and ${displayPath(channelPath)}`;
}
