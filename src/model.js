import { addDays, compareDates, daysBetween, isDateValue, rangeEnd } from "./date.js";

const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

/**
 * Default width-to-capacity ladder for `responsive` projection.
 * Resolved against the component's own inline size, never the viewport.
 * Calibrated after navigation stopped reserving grid tracks: each step is the
 * width at which a column still measures ~110px in the fixtures.
 * @type {readonly {minWidth:number,dayCount:number}[]}
 */
export const RESPONSIVE_BREAKPOINTS = Object.freeze([
  Object.freeze({ minWidth: 600, dayCount: 5 }),
  Object.freeze({ minWidth: 480, dayCount: 4 }),
  Object.freeze({ minWidth: 360, dayCount: 3 }),
  Object.freeze({ minWidth: 260, dayCount: 2 }),
  Object.freeze({ minWidth: 0, dayCount: 1 }),
]);

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
      const seenStarts = new Set();
      const normalizedSlots = slots
        .map((slot) => {
          if (!slot || !isTimeValue(slot.start)) {
            throw new TypeError(`Invalid slot start on ${day.date}`);
          }
          if (slot.end && !isTimeValue(slot.end)) {
            throw new TypeError(`Invalid slot end on ${day.date}`);
          }
          // The public value identifies a slot by date and time: a duplicate
          // would break the single roving focus and the single selection.
          if (seenStarts.has(slot.start)) {
            throw new TypeError(`Duplicate slot: ${day.date}T${slot.start}`);
          }
          seenStarts.add(slot.start);
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
 * True when `min`/`max` describe a consistent bound. Both empty is valid
 * (unbounded); `min > max` is an explicit invalid configuration.
 * @param {string} min
 * @param {string} max
 */
export function isValidRange(min, max) {
  return !min || !max || compareDates(min, max) <= 0;
}

/**
 * Reduce a requested day count to the days actually available inside the
 * bounds. Step 2 of the pipeline: requested count -> bounded count.
 * Invalid bounds (`min > max`) resolve to 0, never a magic window.
 * @param {number} dayCount
 * @param {string} min
 * @param {string} max
 */
export function boundedDayCount(dayCount, min, max) {
  const requested = Math.max(1, Number(dayCount) || 1);
  if (!min || !max) return requested;
  if (compareDates(min, max) > 0) return 0;
  return Math.min(requested, daysBetween(min, max) + 1);
}

/**
 * Normalize an override ladder: descending widths, sane counts.
 * @param {{minWidth?:number,dayCount?:number}[]} breakpoints
 * @returns {{minWidth:number,dayCount:number}[]}
 */
export function normalizeBreakpoints(breakpoints) {
  return breakpoints
    .map((breakpoint) => ({
      minWidth: Math.max(0, Number(breakpoint?.minWidth) || 0),
      dayCount: Math.max(1, Math.min(14, Number(breakpoint?.dayCount) || 1)),
    }))
    .sort((a, b) => b.minWidth - a.minWidth);
}

/**
 * Step 3 of the pipeline: adapt the bounded count to the component's own
 * inline size. Never exceeds the bounded count, never exceeds a breakpoint.
 * @param {number} dayCount
 * @param {number} width
 * @param {readonly {minWidth:number,dayCount:number}[]} [breakpoints]
 */
export function resolveVisibleDayCount(dayCount, width, breakpoints = RESPONSIVE_BREAKPOINTS) {
  const requested = Math.max(0, Number(dayCount) || 0);
  if (requested === 0) return 0;
  const ladder = breakpoints.length ? breakpoints : RESPONSIVE_BREAKPOINTS;
  const size = Number.isFinite(width) ? width : 0;
  const match = ladder.find((breakpoint) => size >= breakpoint.minWidth) ?? ladder[ladder.length - 1];
  return Math.min(requested, match.dayCount);
}

/**
 * Keep a window inside its bounds without shrinking it below the requested
 * count unless the interval itself is shorter.
 * @param {string} start
 * @param {string} min
 * @param {string} max
 * @param {number} dayCount
 */
export function clampStart(start, min, max, dayCount) {
  let next = start;
  if (min && compareDates(next, min) < 0) next = min;
  const count = Math.max(1, dayCount);
  if (max) {
    const latest = addDays(max, -(count - 1));
    if (compareDates(latest, min || next) < 0) next = min || latest;
    else if (compareDates(next, latest) > 0) next = latest;
  }
  return next;
}

/**
 * Stable range adjustment: keep `start` when `date` is already visible,
 * otherwise shift just enough to bring `date` back into the window.
 * Shared by resize, `goTo`, and min/max/day-count changes.
 * @param {string} start
 * @param {number} dayCount
 * @param {string} date
 * @param {string} min
 * @param {string} max
 */
export function ensureVisible(start, dayCount, date, min, max) {
  const count = Math.max(1, dayCount);
  const bounded = clampStart(start, min, max, count);
  if (!isDateValue(date)) return bounded;
  const end = rangeEnd(bounded, count);
  if (compareDates(date, bounded) >= 0 && compareDates(date, end) <= 0) return bounded;
  const candidate = compareDates(date, bounded) < 0 ? date : addDays(date, -(count - 1));
  return clampStart(candidate, min, max, count);
}

/**
 * Any appointment slot in the visible window.
 * @param {SlotDay[]} days
 */
export function hasSlots(days) {
  return days.some((day) => Array.isArray(day.slots) && day.slots.length > 0);
}

/**
 * Any meaningful day content: a slot or a notice. A window with no slot but
 * a notice must keep its projection, so a medical exception stays visible
 * and is not collapsed into "no availability".
 * @param {SlotDay[]} days
 */
export function hasDayContent(days) {
  return days.some((day) => (Array.isArray(day.slots) && day.slots.length > 0) || Boolean(day.notice));
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
