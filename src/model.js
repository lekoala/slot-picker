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

      const notice =
        day.notice && typeof day.notice.label === "string"
          ? { ...day.notice }
          : undefined;

      return { date: day.date, slots: normalizedSlots, ...(notice ? { notice } : {}) };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Fill missing days so an empty day remains visible. */
export function visibleDays(days, start, dayCount) {
  const normalized = normalizeDays(days);
  const byDate = new Map(normalized.map((day) => [day.date, day]));

  return Array.from({ length: dayCount }, (_, index) => {
    const date = addDays(start, index);
    return byDate.get(date) ?? { date, slots: [] };
  });
}

export function clampStart(start, min, max, dayCount) {
  let next = start;
  if (min && compareDates(next, min) < 0) next = min;
  if (max) {
    const latest = addDays(max, -(Math.max(1, dayCount) - 1));
    if (compareDates(next, latest) > 0) next = latest;
  }
  return next;
}

export function rangeDetail(start, dayCount) {
  return { start, end: rangeEnd(start, dayCount), dayCount };
}

/**
 * @param {SlotDay[]} days
 * @returns {{dayIndex:number, slotIndex:number, value:string}[]}
 */
export function focusableSlots(days) {
  const result = [];
  days.forEach((day, dayIndex) => {
    day.slots.forEach((slot, slotIndex) => {
      result.push({ dayIndex, slotIndex, value: slotValue(day.date, slot.start) });
    });
  });
  return result;
}

/**
 * @param {SlotDay[]} days
 * @param {{dayIndex:number,slotIndex:number}} current
 * @param {"up"|"down"|"left"|"right"|"home"|"end"} direction
 */
export function moveFocus(days, current, direction) {
  const currentDay = days[current.dayIndex];
  if (!currentDay) return current;

  if (direction === "home") return { dayIndex: current.dayIndex, slotIndex: 0 };
  if (direction === "end") {
    return { dayIndex: current.dayIndex, slotIndex: Math.max(0, currentDay.slots.length - 1) };
  }

  if (direction === "up" || direction === "down") {
    const delta = direction === "up" ? -1 : 1;
    const next = Math.max(0, Math.min(currentDay.slots.length - 1, current.slotIndex + delta));
    return { dayIndex: current.dayIndex, slotIndex: next };
  }

  const delta = direction === "left" ? -1 : 1;
  for (let dayIndex = current.dayIndex + delta; dayIndex >= 0 && dayIndex < days.length; dayIndex += delta) {
    const day = days[dayIndex];
    if (!day.slots.length) continue;
    return {
      dayIndex,
      slotIndex: Math.min(current.slotIndex, day.slots.length - 1),
    };
  }

  return current;
}
