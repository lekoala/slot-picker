import { toUtcDate } from "../date.js";
import { slotValue } from "../model.js";

/** @typedef {import("../model.js").Slot} Slot */
/** @typedef {{oneSlot:string,manySlots:string}} SlotCountMessages */
/** @typedef {{rangeEmptyTitle:string,rangeEmptyDescription:string,rangeEmptyNext:string}} RangeEmptyMessages */

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
  const disabled = slot.disabled ? " disabled" : "";
  return `<button type="button" class="sp-slot" data-day-index="${dayIndex}" data-slot-index="${slotIndex}" data-value="${escapeAttr(value)}" aria-selected="${selected ? "true" : "false"}" tabindex="${tabbed ? 0 : -1}"${disabled}${description}>${escapeHtml(slot.start)}</button>`;
}

/**
 * Day notice indicator. Never a fake slot.
 * @param {{dayIndex:number,label:string,description?:string}} options
 */
export function noticeButton({ dayIndex, label, description }) {
  return `<button type="button" class="sp-notice" data-day-index="${dayIndex}" aria-label="${escapeAttr(description || label)}"><span class="sp-notice-dot" aria-hidden="true"></span><span class="sp-visually-hidden">${escapeHtml(label)}</span></button>`;
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
 * decides how prominent it is. The action stays `next()` (next window), never
 * "next availability" (which may skip several windows through the source).
 * @param {{start:string,end:string,invalid:boolean,canNext:boolean,locale:string,messages:RangeEmptyMessages}} options
 */
export function rangeEmpty({ start, end, invalid, canNext, locale, messages }) {
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
  const action = canNext
    ? `<button type="button" class="sp-range-empty-next">${escapeHtml(messages.rangeEmptyNext)}</button>`
    : "";
  return `<div class="sp-range-empty">
    <strong class="sp-range-empty-title">${escapeHtml(messages.rangeEmptyTitle)}</strong>
    ${description}
    ${action}
  </div>`;
}
