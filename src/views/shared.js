import { toUtcDate } from "../date.js";
import { slotValue } from "../model.js";

/** @typedef {import("../model.js").Slot} Slot */
/** @typedef {{oneSlot:string,manySlots:string}} SlotCountMessages */
/** @typedef {{rangeEmptyTitle:string,rangeEmptyDescription:string,rangeEmptyNext:string,nextAvailability:string}} RangeEmptyMessages */

/** @type {Record<string,string>} */
const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** @param {string} value */
export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, /** @param {string} char */ (char) => ENTITIES[char] || char);
}

/** @param {string} value */
export function escapeAttr(value) {
  return escapeHtml(value);
}

/**
 * Ordered values of enabled slots only. Disabled slots stay discoverable
 * in the DOM but never take the roving tabindex.
 * @param {{date:string,slots:Slot[]}[]} days
 */
export function enabledValues(days) {
  /** @type {string[]} */
  const values = [];
  for (const day of days) {
    for (const slot of day.slots) {
      if (!slot.disabled) values.push(slotValue(day.date, slot.start));
    }
  }
  return values;
}

/**
 * Pick the single roving value: first preferred value that is enabled,
 * otherwise the first enabled value, otherwise "".
 * @param {string[]} enabled
 * @param {...string} preferred
 */
export function rovingValue(enabled, ...preferred) {
  for (const value of preferred) {
    if (value && enabled.includes(value)) return value;
  }
  return enabled[0] || "";
}

/**
 * Single slot button. Semantics must stay identical across projections.
 * @param {{date:string,slot:Slot,dayIndex:number,slotIndex:number,selected:boolean,tabbed:boolean}} options
 */
export function slotButton({ date, slot, dayIndex, slotIndex, selected, tabbed }) {
  const value = slotValue(date, slot.start);
  const description = slot.description ? ` aria-description="${escapeAttr(slot.description)}"` : "";
  // `option` backs the `aria-selected` contract: browsers ignore selection on
  // a plain button role. The element stays a real <button> with native
  // activation; `aria-disabled` keeps a disabled slot discoverable.
  const disabled = slot.disabled ? ' disabled aria-disabled="true"' : "";
  // Neutral presentation hook: a theme maps tones to color, the core does not.
  const tone = slot.tone ? ` data-tone="${escapeAttr(slot.tone)}"` : "";
  // The time sits in its own inline-flex wrapper so a theme can append an icon
  // that stays in flow next to it without leaking width into the day column.
  return `<button type="button" role="option" class="sp-slot" data-day-index="${dayIndex}" data-slot-index="${slotIndex}" data-value="${escapeAttr(value)}"${tone} aria-selected="${selected ? "true" : "false"}" tabindex="${tabbed ? 0 : -1}"${disabled}${description}><span class="sp-slot-time">${escapeHtml(slot.start)}</span></button>`;
}

/**
 * Per-day notice indicator. Without options it is purely decorative. With
 * `interactive: true` it is the only control that emits `noticeactivate`:
 * the accessible name carries the description, the native `title` is a
 * desktop-only bonus.
 * @param {{interactive?:boolean,dayIndex?:number,label?:string,description?:string}} [options]
 */
export function noticeIndicator(options = {}) {
  if (options.interactive) {
    const accessible = options.description || options.label || "";
    const title = options.label ? ` title="${escapeAttr(options.label)}"` : "";
    return `<button type="button" class="sp-notice" data-day-index="${options.dayIndex ?? 0}" aria-label="${escapeAttr(accessible)}"${title}><span class="sp-notice-dot" aria-hidden="true"></span></button>`;
  }
  return '<span class="sp-notice" aria-hidden="true"><span class="sp-notice-dot"></span></span>';
}

/**
 * Readable day notice. Deliberately non-interactive: `noticeactivate` belongs
 * to the explicit control, never to displayed text, so there is no mouse-only
 * activation.
 * @param {{label:string,description?:string}} notice
 */
export function noticeBlock({ label, description }) {
  const body = `<strong class="sp-day-notice-label">${escapeHtml(label)}</strong>${
    description ? `<span class="sp-day-notice-description">${escapeHtml(description)}</span>` : ""
  }`;
  return `<div class="sp-day-notice">${body}</div>`;
}

/**
 * Real DOM empty state. Text comes from messages, never from CSS.
 * @param {string} message
 */
export function dayEmpty(message) {
  return `<div class="sp-day-empty">${escapeHtml(message)}</div>`;
}

/**
 * Localized slot count for the day strip. Zero renders as an en dash,
 * keeping the indicator distinct from a real sentence.
 * @param {number} count
 * @param {SlotCountMessages} messages
 */
export function slotCountText(count, messages) {
  if (count <= 0) return "–";
  if (count === 1) return messages.oneSlot;
  return messages.manySlots.replace("{n}", String(count));
}

/**
 * Range-level empty state, distinct from per-day empty days.
 * Rendered only when the whole window has no slot and no notice; the theme
 * decides how prominent it is. Two actions stay distinct: `next()` moves to
 * the immediately following window, while `next availability` (opt-in via
 * `next-availability`) is the contextual business search that may skip
 * several windows through the source. They are never merged.
 *
 * A closed day is day content, so a window holding one never reaches this
 * state: it keeps its columns and says "Closed" in each of them.
 * @param {{start:string,end:string,invalid:boolean,canNext:boolean,nextAvailability:boolean,locale:string,messages:RangeEmptyMessages}} options
 */
export function rangeEmpty({ start, end, invalid, canNext, nextAvailability, locale, messages }) {
  const showDescription = !invalid && Boolean(start);
  let description = "";
  if (showDescription) {
    const formatter = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    const text = messages.rangeEmptyDescription
      .replace("{start}", formatter.format(toUtcDate(start)))
      .replace("{end}", formatter.format(toUtcDate(end)));
    description = `<p class="sp-range-empty-description">${escapeHtml(text)}</p>`;
  }
  const actions = [];
  if (canNext) {
    actions.push(
      `<button type="button" class="sp-range-empty-next">${escapeHtml(messages.rangeEmptyNext)}</button>`,
    );
  }
  if (nextAvailability && !invalid) {
    actions.push(
      `<button type="button" class="sp-range-empty-availability">${escapeHtml(messages.nextAvailability)}</button>`,
    );
  }
  const action = actions.length ? `<div class="sp-range-empty-actions">${actions.join("")}</div>` : "";
  return `<div class="sp-range-empty">
    <strong class="sp-range-empty-title">${escapeHtml(messages.rangeEmptyTitle)}</strong>
    ${description}
    ${action}
  </div>`;
}
