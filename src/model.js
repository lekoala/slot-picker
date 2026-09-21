import { addDays, compareDates, isDateValue, weekdayIndex } from "./date.js";

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

/**
 * `tone` is a neutral presentation token surfaced as `data-tone`; the core
 * never interprets it. `meta` stays opaque and is never inspected.
 * @typedef {{start:string,end?:string,disabled?:boolean,description?:string,tone?:string,meta?:unknown}} Slot
 */
/** @typedef {{label:string,description?:string,meta?:unknown}} DayNotice */
/**
 * `closed` is the business state of one date: it exists in the projection,
 * keeps its column and simply is not open. It is never calendar structure —
 * a weekday that should not be a column at all belongs to `hiddenDays` — and
 * stays distinct from `notice` and from an open day with no availability.
 * @typedef {{date:string,slots:Slot[],closed?:boolean,notice?:DayNotice}} SlotDay
 */

const SLOT_RE = /^(\d{4}-\d{2}-\d{2})T((?:[01]\d|2[0-3]):[0-5]\d)$/;

/** @param {string} value */
export function isTimeValue(value) {
  return TIME_RE.test(value);
}

/**
 * Canonical slot value: a civil date and a time, no timezone.
 * Rejects impossible dates such as 2026-02-31.
 * @param {string} value
 */
export function isSlotValue(value) {
  const match = SLOT_RE.exec(value);
  return match !== null && isDateValue(match[1]) && isTimeValue(match[2]);
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
          if (slot.tone !== undefined && (typeof slot.tone !== "string" || slot.tone.trim() === "")) {
            throw new TypeError(`Invalid slot tone on ${day.date}`);
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
      if (day.closed !== undefined && typeof day.closed !== "boolean") {
        throw new TypeError(`Invalid day closed on ${day.date}`);
      }
      // `closed: true` promises no bookable slot: a contradictory payload is a
      // source bug, never silently hidden by the projection policy.
      if (day.closed === true && normalizedSlots.length > 0) {
        throw new TypeError(`Closed day cannot have slots: ${day.date}`);
      }

      return {
        date: day.date,
        slots: normalizedSlots,
        ...(day.closed ? { closed: true } : {}),
        ...(notice ? { notice } : {}),
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Fill missing days so an empty day remains visible.
 * The projected dates decide which columns exist; loaded data never does.
 * @param {SlotDay[]} days
 * @param {string[]} dates
 */
export function visibleDays(days, dates) {
  const normalized = normalizeDays(days);
  const byDate = new Map(normalized.map((day) => [day.date, day]));

  return dates.map((date) => byDate.get(date) ?? { date, slots: [] });
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
 * Keep a civil date inside an inclusive interval. Empty bounds are open.
 * @param {string} date
 * @param {string} min
 * @param {string} max
 */
export function clampDate(date, min, max) {
  if (min && compareDates(date, min) < 0) return min;
  if (max && compareDates(date, max) > 0) return max;
  return date;
}

/**
 * Weekdays that are never projected as a column, as `Date#getDay` indexes
 * (0 = Sunday). This is calendar structure, known before any data is loaded:
 * it is not an availability rule and never inspects a `SlotDay`.
 * @param {readonly number[]|null|undefined} input
 * @returns {number[]}
 */
export function normalizeHiddenDays(input) {
  if (input === null || input === undefined) return [];
  if (!Array.isArray(input)) throw new TypeError("hiddenDays must be an array of weekday indexes");
  const indexes = input.map((value) => {
    const index = Number(value);
    if (!Number.isInteger(index) || index < 0 || index > 6) {
      throw new TypeError("hiddenDays entries must be integers from 0 (Sunday) to 6 (Saturday)");
    }
    return index;
  });
  const hidden = [...new Set(indexes)].sort((a, b) => a - b);
  // Hiding every weekday would leave no day to project at all.
  if (hidden.length === 7) throw new TypeError("hiddenDays cannot hide every weekday");
  return hidden;
}

/**
 * Collect up to `count` projected days walking one civil day at a time.
 * `step` is 1 or -1; `bound` is the civil date the walk must not cross.
 * @param {string} from
 * @param {number} count
 * @param {number[]} hidden
 * @param {1|-1} step
 * @param {string} bound
 */
function walk(from, count, hidden, step, bound) {
  /** @type {string[]} */
  const dates = [];
  let date = from;
  // `hidden` can never hold all seven weekdays, so the walk always advances.
  while (dates.length < count) {
    if (bound && (step > 0 ? compareDates(date, bound) > 0 : compareDates(date, bound) < 0)) break;
    if (!hidden.includes(weekdayIndex(date))) dates.push(date);
    date = addDays(date, step);
  }
  return dates;
}

/**
 * The projection: the civil dates actually rendered as columns.
 *
 * `dayCount` counts columns, never civil days. A hidden weekday widens the
 * civil envelope instead of eating a column, so at equal width and bounds a
 * window always keeps its capacity. Only `min`/`max` can return fewer dates
 * than requested, because the interval itself holds too few projectable days.
 * @param {string} start
 * @param {number} dayCount
 * @param {readonly number[]} [hiddenDays]
 * @param {string} [min]
 * @param {string} [max]
 * @returns {string[]}
 */
export function projectDates(start, dayCount, hiddenDays = [], min = "", max = "") {
  const count = Math.max(0, Math.trunc(Number(dayCount) || 0));
  if (!count || !isDateValue(start) || !isValidRange(min, max)) return [];
  const hidden = normalizeHiddenDays(hiddenDays);
  const from = clampDate(start, min, max);
  const forward = walk(from, count, hidden, 1, max);
  if (forward.length === count) return forward;
  // The upper bound truncated the window: recover the missing columns before
  // `from`, so bounds reduce the capacity only when the interval really is
  // too short, never because the window happens to sit at the end.
  const backward = walk(addDays(forward[0] ?? from, -1), count - forward.length, hidden, -1, min);
  return [...backward.reverse(), ...forward];
}

/**
 * Adjacent window, stepping by projected days so navigation preserves the
 * column capacity. `direction` is 1 or -1.
 * @param {string[]} dates
 * @param {1|-1} direction
 * @param {readonly number[]} [hiddenDays]
 * @param {string} [min]
 * @param {string} [max]
 */
export function stepStart(dates, direction, hiddenDays = [], min = "", max = "") {
  if (!dates.length) return "";
  const hidden = normalizeHiddenDays(hiddenDays);
  const count = dates.length;
  if (direction > 0) {
    return projectDates(addDays(dates[count - 1], 1), count, hidden, min, max)[0] ?? dates[0];
  }
  const backward = walk(addDays(dates[0], -1), count, hidden, -1, min);
  return projectDates(backward[backward.length - 1] ?? dates[0], count, hidden, min, max)[0] ?? dates[0];
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
 * First projected day of the window `start` belongs to, inside the bounds.
 * @param {string} start
 * @param {string} min
 * @param {string} max
 * @param {number} dayCount
 * @param {readonly number[]} [hiddenDays]
 */
export function clampStart(start, min, max, dayCount, hiddenDays = []) {
  return projectDates(start, dayCount, hiddenDays, min, max)[0] ?? clampDate(start, min, max);
}

/**
 * Stable range adjustment: keep `start` when `date` is already projected,
 * otherwise shift just enough to bring `date` back into the window.
 * Shared by resize, `goTo`, and min/max/day-count/hidden-day changes.
 * @param {string} start
 * @param {number} dayCount
 * @param {string} date
 * @param {string} min
 * @param {string} max
 * @param {readonly number[]} [hiddenDays]
 */
export function ensureVisible(start, dayCount, date, min, max, hiddenDays = []) {
  const hidden = normalizeHiddenDays(hiddenDays);
  const count = Math.max(1, dayCount);
  const dates = projectDates(start, count, hidden, min, max);
  if (!dates.length) return clampDate(start, min, max);
  const first = dates[0];
  if (!isDateValue(date)) return first;
  if (compareDates(date, first) < 0) return projectDates(date, count, hidden, min, max)[0] ?? first;
  if (compareDates(date, dates[dates.length - 1]) <= 0) return first;
  // After the window: align it on the first projected day at or after `date`,
  // without moving further than necessary.
  const target = walk(date, 1, hidden, 1, max)[0];
  if (!target) return first;
  const backward = walk(target, count, hidden, -1, min);
  return projectDates(backward[backward.length - 1] ?? target, count, hidden, min, max)[0] ?? first;
}

/**
 * Any appointment slot in the visible window.
 * @param {SlotDay[]} days
 */
export function hasSlots(days) {
  return days.some((day) => Array.isArray(day.slots) && day.slots.length > 0);
}

/**
 * Any meaningful day content: a slot, a notice or a closed day. A window with
 * no slot but a notice or a closed state must keep its projection, so an
 * exception or a recurring closure stays visible and is not collapsed into
 * "no availability".
 * @param {SlotDay[]} days
 */
export function hasDayContent(days) {
  return days.some(
    (day) => (Array.isArray(day.slots) && day.slots.length > 0) || Boolean(day.notice) || Boolean(day.closed),
  );
}

/**
 * Public range of a projection: first and last rendered day plus the number
 * of columns. `end` is the last projected day, so the civil envelope
 * (`start` to `end`) may span more days than `dayCount` when weekdays are
 * hidden. That envelope is exactly what a source has to load.
 * @param {string[]} dates
 */
export function rangeDetail(dates) {
  if (!dates.length) return { start: "", end: "", dayCount: 0 };
  return { start: dates[0], end: dates[dates.length - 1], dayCount: dates.length };
}

/**
 * Civil-only active day resolution against the projected dates.
 * Loaded slots never influence the consulted day: absent/invalid maps to the
 * first column, out-of-range clamps to the window, and a date falling on a
 * hidden weekday resolves to the next projected column.
 * @param {string[]} dates
 * @param {string} activeDate
 */
export function resolveActiveDate(dates, activeDate) {
  if (!dates.length) return "";
  const last = dates[dates.length - 1];
  if (!isDateValue(activeDate)) return dates[0];
  if (compareDates(activeDate, dates[0]) <= 0) return dates[0];
  if (compareDates(activeDate, last) >= 0) return last;
  return dates.find((date) => compareDates(date, activeDate) >= 0) ?? last;
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
