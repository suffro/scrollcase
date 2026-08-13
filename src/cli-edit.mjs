/**
 * The CLI edge of the editing commands: which box, which target, which field, which value.
 *
 * Every question a person answers lives here, and the build layer receives resolved values. The one
 * question these commands add to the tool is "where does this go?", because a box may keep its
 * shared declarations in a base and its differences in per-target fragments. Answering it wrong is
 * silent — a declaration lands on one target instead of all three, and nothing complains until a
 * build somewhere is missing a file — so it is never guessed: a flag, or a menu, or a refusal.
 */

import { ALL_TARGETS, readScrollFamily } from './build/scroll-edit.mjs';
import { fail } from './build/process.mjs';
import { selectCliMenu } from './cli-menu.mjs';

const EVERY_TARGET_LABEL = 'every target (shared)';

/**
 * Resolves which of a box's scrolls an edit applies to.
 *
 * `--target all` writes what the targets share: the base of a split scroll, or every target file of
 * a box that has no base. A target ID writes only that one, which is what a file specific to an
 * accelerator or a platform needs. Without a flag and without a terminal the command stops rather
 * than picking, because both answers are reasonable and only the author knows which was meant.
 *
 * @param {{ boxId: string, requested?: string | null, terminal?: boolean,
 *   menu?: typeof selectCliMenu }} options
 * @returns {Promise<string>} `all`, or one target ID
 */
export async function chooseEditTarget({
  boxId,
  requested = null,
  terminal = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  menu = selectCliMenu,
} = {}) {
  const family = await readScrollFamily(boxId);
  const targetIds = family.targets.map(({ targetId }) => targetId);
  if (requested) {
    if (requested !== ALL_TARGETS && !targetIds.includes(requested)) {
      fail(`Target ${requested} is not one of ${boxId}'s targets (${targetIds.join(', ')}).`);
    }
    return requested;
  }
  if (targetIds.length === 1) return targetIds[0];
  if (!terminal) {
    fail(`${boxId} has several targets (${targetIds.join(', ')}); pass --target <targetId> or --target ${ALL_TARGETS}.`);
  }
  const choices = [EVERY_TARGET_LABEL, ...targetIds];
  const selected = await menu('target', choices, {
    hint: `Where this goes: shared by every target of ${boxId}, or only one of them.`,
    initialIndex: 0,
  });
  if (!Number.isInteger(selected) || selected < 0 || selected >= choices.length) {
    fail('target menu returned an invalid selection.');
  }
  return selected === 0 ? ALL_TARGETS : choices[selected];
}

/**
 * Resolves which box a command acts on: the name given, or a menu of what the workspace holds.
 *
 * @param {{ name?: string | null, boxIds: string[], terminal?: boolean,
 *   menu?: typeof selectCliMenu }} options
 * @returns {Promise<string>}
 */
export async function chooseBox({
  name = null,
  boxIds,
  terminal = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  menu = selectCliMenu,
} = {}) {
  if (name) {
    if (!boxIds.includes(name)) fail(`Box not found: ${name}. This workspace has ${boxIds.join(', ') || 'none'}.`);
    return name;
  }
  if (boxIds.length === 0) fail('No scrolls found; run scrollcase init or scrollcase new scroll.');
  if (boxIds.length === 1) return boxIds[0];
  if (!terminal) fail(`Several boxes are available (${boxIds.join(', ')}); name the one to change.`);
  const selected = await menu('box', boxIds, { initialIndex: 0 });
  if (!Number.isInteger(selected) || selected < 0 || selected >= boxIds.length) {
    fail('box menu returned an invalid selection.');
  }
  return boxIds[selected];
}

/**
 * Resolves the field and value for `edit scroll`.
 *
 * The field comes from a menu built out of the schema, so a name that is not a field cannot be
 * typed in the first place — better than accepting one and explaining afterwards. A value that the
 * scroll then refuses is reported by the caller and the file is left as it was.
 *
 * @param {{ fields: { name: string, description: string, choices: string[] | null }[],
 *   requestedField?: string | null, requestedValue?: string | null, terminal?: boolean,
 *   ask: Function, menu?: typeof selectCliMenu }} options
 * @returns {Promise<{ field: string, value: string }>}
 */
export async function chooseScrollEdit({
  fields,
  requestedField = null,
  requestedValue = null,
  terminal = Boolean(process.stdin.isTTY && process.stdout.isTTY),
  ask,
  menu = selectCliMenu,
}) {
  let field = requestedField;
  if (!field) {
    if (!terminal) fail('edit scroll requires --field <name> without a terminal.');
    const labels = fields.map(({ name, description }) => (description ? `${name} — ${description}` : name));
    const selected = await menu('field', labels, { initialIndex: 0 });
    if (!Number.isInteger(selected) || selected < 0 || selected >= fields.length) {
      fail('field menu returned an invalid selection.');
    }
    field = fields[selected].name;
  }
  const declared = fields.find((candidate) => candidate.name === field);
  if (!declared) {
    fail(`${field} is not an editable scroll field. Editable: ${fields.map(({ name }) => name).join(', ')}.`);
  }
  if (requestedValue !== null) return { field, value: requestedValue };
  if (!terminal) fail(`edit scroll requires --value <value> without a terminal.`);
  if (declared.choices) {
    const selected = await menu(field, declared.choices, { initialIndex: 0 });
    if (!Number.isInteger(selected) || selected < 0 || selected >= declared.choices.length) {
      fail(`${field} menu returned an invalid selection.`);
    }
    return { field, value: declared.choices[selected] };
  }
  return { field, value: await ask(`New ${field}`, { hint: declared.description || undefined }) };
}
