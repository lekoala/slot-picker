const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** @param {string} value */
export function isDateValue(value) {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** @param {string} value */
function parts(value) {
  if (!isDateValue(value)) throw new TypeError(`Invalid civil date: ${value}`);
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

/** @param {string} value @param {number} amount */
export function addDays(value, amount) {
  const { year, month, day } = parts(value);
  const date = new Date(Date.UTC(year, month - 1, day + amount));
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

/** @param {string} a @param {string} b */
export function compareDates(a, b) {
  return a.localeCompare(b);
}

/**
 * Inclusive visible civil range.
 * @param {string} start
 * @param {number} dayCount
 */
export function rangeEnd(start, dayCount) {
  return addDays(start, Math.max(1, dayCount) - 1);
}

/** @param {string} value */
export function toUtcDate(value) {
  const { year, month, day } = parts(value);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Local civil "today" without timezone conversion of public values. */
export function todayValue() {
  const now = new Date();
  return [
    String(now.getFullYear()).padStart(4, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}
