/**
 * Navigable choices at the CLI edge.
 *
 * Closed choices use one raw-key menu instead of several subtly different text prompts. Free-form
 * values and safety consent remain explicit flags or text input: a menu must not pretend they are
 * finite choices.
 */

import { emitKeypressEvents } from 'node:readline';
import { fail } from './build/process.mjs';
import { promptHeading } from './cli-output.mjs';

/**
 * Shows a raw-key menu and resolves to the selected index.
 *
 * `hint` is one line of prose printed under the question, for a choice whose option names do not
 * say what the choice decides. It sits outside the redrawn frame, so arrowing through the options
 * never scrolls it away.
 */
export function selectCliMenu(question, choices, {
  hint = null,
  docs = null,
  initialIndex = null,
  input = process.stdin,
  output = process.stdout,
} = {}) {
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    fail(`${question} selection requires an interactive terminal.`);
  }

  return new Promise((resolve, reject) => {
    let selectedIndex = initialIndex;
    const previousRawMode = Boolean(input.isRaw);
    const frameLines = choices.length + 1;
    let firstFrame = true;

    const render = () => {
      if (!firstFrame) output.write(`\x1b[${frameLines}A`);
      for (let index = 0; index < choices.length; index += 1) {
        const marker = index === selectedIndex ? '❯' : ' ';
        output.write(`\x1b[2K\r${marker} ${choices[index]}\n`);
      }
      output.write('\x1b[2K\rUse ↑/↓ to move, Enter to select.\n');
      firstFrame = false;
    };

    const cleanup = () => {
      input.removeListener('keypress', onKeypress);
      input.setRawMode(previousRawMode);
      input.pause();
      output.write('\x1b[?25h');
    };

    const onKeypress = (_character, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        reject(new Error(`${question} selection cancelled.`));
        return;
      }
      if (key.name === 'up') {
        selectedIndex = selectedIndex === null
          ? choices.length - 1
          : (selectedIndex - 1 + choices.length) % choices.length;
        render();
      } else if (key.name === 'down') {
        selectedIndex = selectedIndex === null ? 0 : (selectedIndex + 1) % choices.length;
        render();
      } else if ((key.name === 'return' || key.name === 'enter') && selectedIndex !== null) {
        cleanup();
        resolve(selectedIndex);
      }
    };

    emitKeypressEvents(input);
    input.on('keypress', onKeypress);
    input.setRawMode(true);
    input.resume();
    output.write(promptHeading(`Which ${question}?`, { hint, docs, stream: output }));
    output.write('\x1b[?25l');
    render();
  });
}

/**
 * Shows a raw-key menu where any number of entries can be selected, and resolves to their indices.
 *
 * The single-select menu answers *which one*; this answers *which of these*, which is a different
 * question and deserves a different shape rather than a run of yes/no prompts that a user has to
 * hold in their head. Nothing is selected to begin with: the entries here are optional extras, and
 * a pre-ticked box turns a confirmation into something a user has to notice and undo.
 */
export function selectCliMultiMenu(question, choices, {
  hint = null,
  docs = null,
  input = process.stdin,
  output = process.stdout,
} = {}) {
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    fail(`${question} selection requires an interactive terminal.`);
  }

  return new Promise((resolve, reject) => {
    let cursorIndex = 0;
    const selected = new Set();
    const previousRawMode = Boolean(input.isRaw);
    const frameLines = choices.length + 1;
    let firstFrame = true;

    const render = () => {
      if (!firstFrame) output.write(`\x1b[${frameLines}A`);
      for (let index = 0; index < choices.length; index += 1) {
        const marker = index === cursorIndex ? '❯' : ' ';
        const box = selected.has(index) ? '[x]' : '[ ]';
        output.write(`\x1b[2K\r${marker} ${box} ${choices[index]}\n`);
      }
      output.write('\x1b[2K\rUse ↑/↓ to move, Space to select, Enter to confirm.\n');
      firstFrame = false;
    };

    const cleanup = () => {
      input.removeListener('keypress', onKeypress);
      input.setRawMode(previousRawMode);
      input.pause();
      output.write('\x1b[?25h');
    };

    const onKeypress = (character, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        reject(new Error(`${question} selection cancelled.`));
        return;
      }
      if (key.name === 'up') {
        cursorIndex = (cursorIndex - 1 + choices.length) % choices.length;
        render();
      } else if (key.name === 'down') {
        cursorIndex = (cursorIndex + 1) % choices.length;
        render();
      } else if (key.name === 'space' || character === ' ') {
        if (selected.has(cursorIndex)) selected.delete(cursorIndex);
        else selected.add(cursorIndex);
        render();
      } else if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        // An empty selection is an answer: it means none of these, not an unfinished question.
        resolve([...selected].sort((left, right) => left - right));
      }
    };

    emitKeypressEvents(input);
    input.on('keypress', onKeypress);
    input.setRawMode(true);
    input.resume();
    output.write(promptHeading(question, { hint, docs, stream: output }));
    output.write('\x1b[?25l');
    render();
  });
}

/**
 * Resolves a CLI choice from a flag, a menu, or the reported non-terminal default.
 *
 * `open` applies only to explicit flags; custom values cannot be represented by a finite menu.
 */
export async function chooseCliValue(question, choices, {
  flag = null,
  hint = null,
  docs = null,
  open = false,
  terminal = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  menu = selectCliMenu,
  log = console.log,
} = {}) {
  const [fallback] = choices;
  if (flag) {
    if (!open && !choices.includes(flag)) {
      fail(`Unsupported ${question}: ${flag}. Use ${choices.join(' or ')}.`);
    }
    return flag;
  }
  if (!terminal) {
    log(`scrollcase: no terminal to ask which ${question}; using ${fallback}.`);
    return fallback;
  }
  const selectedIndex = await menu(question, choices, { hint, docs, initialIndex: 0 });
  if (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= choices.length) {
    fail(`${question} menu returned an invalid selection.`);
  }
  return choices[selectedIndex];
}

/**
 * Resolves an optional set of choices from one multi-select menu.
 *
 * Used for the questions where the answer is a set of optional extras rather than one required
 * value, so there is no non-terminal default to report: without a terminal nobody selected
 * anything, and an empty set is exactly what silence means. A caller that wants one of these
 * without a terminal passes the flag for it instead.
 */
export async function chooseCliValues(question, choices, {
  hint = null,
  docs = null,
  terminal = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  menu = selectCliMultiMenu,
} = {}) {
  if (choices.length === 0 || !terminal) return [];
  const selectedIndices = await menu(question, choices, { hint, docs });
  if (!Array.isArray(selectedIndices)
    || selectedIndices.some((index) => !Number.isInteger(index)
      || index < 0
      || index >= choices.length)) {
    fail(`${question} menu returned an invalid selection.`);
  }
  return selectedIndices.map((index) => choices[index]);
}
