import { addDays, compareDates, isDateValue, rangeEnd } from "./date.js";

const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/** @typedef {{start:string,end?:string,disabled?:boolean,description?:string,meta?:unknown}} Slot */
/** @typedef {{label:string,description?:string,meta?:unknown}} DayNotice */
/** @typedef {{date:string,slots:Slot[],notice?:DayNotice}} SlotDay */

/** @param {string} value */
export function isTimeValue(value) {
  return TIME_RE.test(value);
}

/** @param {string} date @param {string} time */
export function slotValue(date, time) {
  if (!isDateValue(date) || !isTimeValue(time)) throw new TypeError("Invalid slot date/time");
  return `${date}T${time}`;
}

/** @param {SlotDay[]} input */
export function normalizeDays(input) {
  if (!Array.isArray(input)) throw new TypeError("days must be an array");

  const seen = new Set();
  return input
    .map((day) => {
      if (!day || !isDateValue(day.date)) throw new TypeError("Each day needs a YYYY-MM-DD date");
      if (seen.has(day.date)) throw new TypeError(`Duplicate day: ${day.date}`);
      seen.add(day.date);

      const slots = Array.isArray(day.slots) ? day.slots : [];
      const normalizedSlots = slots
        .map((slot) => {
          if (!slot || !isTimeValue(slot.start)) {
            throw new TypeError(`Invalid slot start on ${day.date}`);
          }
          if (slot.end && !isTimeValue(slot.end)) {
            throw new TypeError(`Invalid slot end on ${day.date}`);
          }
          return { ...slot };
        })
        .sort((a, b) => a.start.localeCompare(b.start));

      const notice = day.notice && typeof day.notice.label === "string" ? { ...day.notice } : undefined;

      return { date: day.date, slots: normalizedSlots, ...(notice ? { notice } : {}) };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Fill missing days so an empty day remains visible.
 * @param {SlotDay[]} days
 * @param {string} start
 * @param {number} dayCount
 */
export function visibleDays(days, start, dayCount) {
  const normalized = normalizeDays(days);
  const byDate = new Map(normalized.map((day) => [day.date, day]));

  return Array.from({ length: dayCount }, (_, index) => {
    const date = addDays(start, index);
    return byDate.get(date) ?? { date, slots: [] };
  });
}

/**
 * Presentation-only collapse: keep the first N slot rows.
 * Hidden slots stay part of the loaded model, so selection is unaffected;
 * rendering and keyboard navigation must agree on this exact subset.
 * @param {SlotDay[]} days
 * @param {number} maxVisibleRows
 * @param {boolean} expanded
 */
export function collapsedDays(days, maxVisibleRows, expanded) {
  const maxRows = Math.max(0, ...days.map((day) => day.slots.length));
  const rows = expanded ? maxRows : Math.min(maxRows, maxVisibleRows);
  return {
    rows,
    hasOverflow: maxRows > maxVisibleRows,
    days: days.map((day) => ({ ...day, slots: day.slots.slice(0, rows) })),
  };
}

/**
 * @param {string} start
 * @param {string} min
 * @param {string} max
 * @param {number} dayCount
 */
export function clampStart(start, min, max, dayCount) {
  let next = start;
  if (min && compareDates(next, min) < 0) next = min;
  if (max) {
    const latest = addDays(max, -(Math.max(1, dayCount) - 1));
    if (compareDates(next, latest) > 0) next = latest;
  }
  return next;
}

/**
 * @param {string} start
 * @param {number} dayCount
 */
export function rangeDetail(start, dayCount) {
  return { start, end: rangeEnd(start, dayCount), dayCount };
}

/**
 * Civil-only active day resolution.
 * Loaded slots never influence the consulted day:
 * absent/invalid maps to start, out-of-range clamps to the visible range.
 * @param {string} start
 * @param {number} dayCount
 * @param {string} activeDate
 */
export function resolveActiveDate(start, dayCount, activeDate) {
  if (!isDateValue(activeDate)) return start;
  if (compareDates(activeDate, start) < 0) return start;
  const end = rangeEnd(start, dayCount);
  if (compareDates(activeDate, end) > 0) return end;
  return activeDate;
}

/**
 * @param {SlotDay[]} days
 * @returns {{dayIndex:number, slotIndex:number, value:string}[]}
 */
export function focusableSlots(days) {
  /** @type {{dayIndex:number, slotIndex:number, value:string}[]} */
  const result = [];
  days.forEach((day, dayIndex) => {
    day.slots.forEach((slot, slotIndex) => {
      result.push({ dayIndex, slotIndex, value: slotValue(day.date, slot.start) });
    });
  });
  return result;
}

/** @param {SlotDay} day */
function firstEnabledIndex(day) {
  return day.slots.findIndex((slot) => !slot.disabled);
}

/** @param {SlotDay} day */
function lastEnabledIndex(day) {
  for (let index = day.slots.length - 1; index >= 0; index--) {
    if (!day.slots[index].disabled) return index;
  }
  return -1;
}

/**
 * Keyboard focus movement. Disabled slots are skipped: they stay visible
 * and activatable-guarded, but never take keyboard focus.
 * @param {SlotDay[]} days
 * @param {{dayIndex:number,slotIndex:number}} current
 * @param {"up"|"down"|"left"|"right"|"home"|"end"} direction
 */
export function moveFocus(days, current, direction) {
  const currentDay = days[current.dayIndex];
  if (!currentDay) return current;

  if (direction === "home") {
    const index = firstEnabledIndex(currentDay);
    return index < 0 ? current : { dayIndex: current.dayIndex, slotIndex: index };
  }
  if (direction === "end") {
    const index = lastEnabledIndex(currentDay);
    return index < 0 ? current : { dayIndex: current.dayIndex, slotIndex: index };
  }

  if (direction === "up" || direction === "down") {
    const delta = direction === "up" ? -1 : 1;
    let index = current.slotIndex + delta;
    while (index >= 0 && index < currentDay.slots.length) {
      if (!currentDay.slots[index].disabled) return { dayIndex: current.dayIndex, slotIndex: index };
      index += delta;
    }
    return current;
  }

  const delta = direction === "left" ? -1 : 1;
  for (let dayIndex = current.dayIndex + delta; dayIndex >= 0 && dayIndex < days.length; dayIndex += delta) {
    const day = days[dayIndex];
    if (!day.slots.length || firstEnabledIndex(day) < 0) continue;
    const clamped = Math.min(current.slotIndex, day.slots.length - 1);
    if (!day.slots[clamped].disabled) return { dayIndex, slotIndex: clamped };
    // Nearest enabled row to the clamped position.
    for (let distance = 1; distance < day.slots.length; distance++) {
      const before = clamped - distance;
      const after = clamped + distance;
      if (before >= 0 && !day.slots[before].disabled) return { dayIndex, slotIndex: before };
      if (after < day.slots.length && !day.slots[after].disabled) return { dayIndex, slotIndex: after };
    }
  }

  return current;
}
