/*** @lekoala/slot-picker v0.1.2 - https://github.com/lekoala/slot-picker ***/
(() => {
  // src/date.js
  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  function isDateValue(value) {
    if (!DATE_RE.test(value))
      return false;
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  }
  function parts(value) {
    if (!isDateValue(value))
      throw new TypeError(`Invalid civil date: ${value}`);
    const [year, month, day] = value.split("-").map(Number);
    return { year, month, day };
  }
  function addDays(value, amount) {
    const { year, month, day } = parts(value);
    const date = new Date(Date.UTC(year, month - 1, day + amount));
    return [
      String(date.getUTCFullYear()).padStart(4, "0"),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0")
    ].join("-");
  }
  function compareDates(a, b) {
    return a.localeCompare(b);
  }
  function weekdayIndex(value) {
    return toUtcDate(value).getUTCDay();
  }
  function toUtcDate(value) {
    const { year, month, day } = parts(value);
    return new Date(Date.UTC(year, month - 1, day));
  }
  function todayValue() {
    const now = new Date;
    return [
      String(now.getFullYear()).padStart(4, "0"),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0")
    ].join("-");
  }

  // src/messages.js
  var DEFAULT_MESSAGES = {
    previous: "Previous days",
    next: "Next days",
    home: "Back to start",
    nextAvailability: "Next availability",
    showMore: "Show more availability",
    showLess: "Show less",
    loading: "Loading availability",
    empty: "No availability",
    closed: "Closed",
    rangeEmptyTitle: "No availability in this period",
    rangeEmptyDescription: "From {start} to {end}",
    rangeEmptyNext: "See the next period",
    oneSlot: "1 slot",
    manySlots: "{n} slots",
    days: "Days"
  };
  var defaults = { ...DEFAULT_MESSAGES };
  function resolveMessages(messages) {
    return { ...defaults, ...messages ?? {} };
  }

  // src/model.js
  var TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  var RESPONSIVE_BREAKPOINTS = Object.freeze([
    Object.freeze({ minWidth: 600, dayCount: 5 }),
    Object.freeze({ minWidth: 480, dayCount: 4 }),
    Object.freeze({ minWidth: 360, dayCount: 3 }),
    Object.freeze({ minWidth: 260, dayCount: 2 }),
    Object.freeze({ minWidth: 0, dayCount: 1 })
  ]);
  var SLOT_RE = /^(\d{4}-\d{2}-\d{2})T((?:[01]\d|2[0-3]):[0-5]\d)$/;
  function isTimeValue(value) {
    return TIME_RE.test(value);
  }
  function isSlotValue(value) {
    const match = SLOT_RE.exec(value);
    return match !== null && isDateValue(match[1]) && isTimeValue(match[2]);
  }
  function slotValue(date, time) {
    if (!isDateValue(date) || !isTimeValue(time))
      throw new TypeError("Invalid slot date/time");
    return `${date}T${time}`;
  }
  function normalizeDays(input) {
    if (!Array.isArray(input))
      throw new TypeError("days must be an array");
    const seen = new Set;
    return input.map((day) => {
      if (!day || !isDateValue(day.date))
        throw new TypeError("Each day needs a YYYY-MM-DD date");
      if (seen.has(day.date))
        throw new TypeError(`Duplicate day: ${day.date}`);
      seen.add(day.date);
      const slots = Array.isArray(day.slots) ? day.slots : [];
      const seenStarts = new Set;
      const normalizedSlots = slots.map((slot) => {
        if (!slot || !isTimeValue(slot.start)) {
          throw new TypeError(`Invalid slot start on ${day.date}`);
        }
        if (slot.end && !isTimeValue(slot.end)) {
          throw new TypeError(`Invalid slot end on ${day.date}`);
        }
        if (slot.tone !== undefined && (typeof slot.tone !== "string" || slot.tone.trim() === "")) {
          throw new TypeError(`Invalid slot tone on ${day.date}`);
        }
        if (seenStarts.has(slot.start)) {
          throw new TypeError(`Duplicate slot: ${day.date}T${slot.start}`);
        }
        seenStarts.add(slot.start);
        return { ...slot };
      }).sort((a, b) => a.start.localeCompare(b.start));
      const notice = day.notice && typeof day.notice.label === "string" ? { ...day.notice } : undefined;
      if (day.closed !== undefined && typeof day.closed !== "boolean") {
        throw new TypeError(`Invalid day closed on ${day.date}`);
      }
      if (day.closed === true && normalizedSlots.length > 0) {
        throw new TypeError(`Closed day cannot have slots: ${day.date}`);
      }
      return {
        date: day.date,
        slots: normalizedSlots,
        ...day.closed ? { closed: true } : {},
        ...notice ? { notice } : {}
      };
    }).sort((a, b) => a.date.localeCompare(b.date));
  }
  function visibleDays(days, dates) {
    const normalized = normalizeDays(days);
    const byDate = new Map(normalized.map((day) => [day.date, day]));
    return dates.map((date) => byDate.get(date) ?? { date, slots: [] });
  }
  function collapsedDays(days, maxVisibleRows, expanded) {
    const maxRows = Math.max(0, ...days.map((day) => day.slots.length));
    const rows = expanded ? maxRows : Math.min(maxRows, maxVisibleRows);
    return {
      rows,
      hasOverflow: maxRows > maxVisibleRows,
      days: days.map((day) => ({ ...day, slots: day.slots.slice(0, rows) }))
    };
  }
  function isValidRange(min, max) {
    return !min || !max || compareDates(min, max) <= 0;
  }
  function clampDate(date, min, max) {
    if (min && compareDates(date, min) < 0)
      return min;
    if (max && compareDates(date, max) > 0)
      return max;
    return date;
  }
  function normalizeHiddenDays(input) {
    if (input === null || input === undefined)
      return [];
    if (!Array.isArray(input))
      throw new TypeError("hiddenDays must be an array of weekday indexes");
    const indexes = input.map((value) => {
      const index = Number(value);
      if (!Number.isInteger(index) || index < 0 || index > 6) {
        throw new TypeError("hiddenDays entries must be integers from 0 (Sunday) to 6 (Saturday)");
      }
      return index;
    });
    const hidden = [...new Set(indexes)].sort((a, b) => a - b);
    if (hidden.length === 7)
      throw new TypeError("hiddenDays cannot hide every weekday");
    return hidden;
  }
  function walk(from, count, hidden, step, bound) {
    const dates = [];
    let date = from;
    while (dates.length < count) {
      if (bound && (step > 0 ? compareDates(date, bound) > 0 : compareDates(date, bound) < 0))
        break;
      if (!hidden.includes(weekdayIndex(date)))
        dates.push(date);
      date = addDays(date, step);
    }
    return dates;
  }
  function projectDates(start, dayCount, hiddenDays = [], min = "", max = "") {
    const count = Math.max(0, Math.trunc(Number(dayCount) || 0));
    if (!count || !isDateValue(start) || !isValidRange(min, max))
      return [];
    const hidden = normalizeHiddenDays(hiddenDays);
    const from = clampDate(start, min, max);
    const forward = walk(from, count, hidden, 1, max);
    if (forward.length === count)
      return forward;
    const backward = walk(addDays(forward[0] ?? from, -1), count - forward.length, hidden, -1, min);
    return [...backward.reverse(), ...forward];
  }
  function stepStart(dates, direction, hiddenDays = [], min = "", max = "") {
    if (!dates.length)
      return "";
    const hidden = normalizeHiddenDays(hiddenDays);
    const count = dates.length;
    if (direction > 0) {
      return projectDates(addDays(dates[count - 1], 1), count, hidden, min, max)[0] ?? dates[0];
    }
    const backward = walk(addDays(dates[0], -1), count, hidden, -1, min);
    return projectDates(backward[backward.length - 1] ?? dates[0], count, hidden, min, max)[0] ?? dates[0];
  }
  function normalizeBreakpoints(breakpoints) {
    return breakpoints.map((breakpoint) => ({
      minWidth: Math.max(0, Number(breakpoint?.minWidth) || 0),
      dayCount: Math.max(1, Math.min(14, Number(breakpoint?.dayCount) || 1))
    })).sort((a, b) => b.minWidth - a.minWidth);
  }
  function resolveVisibleDayCount(dayCount, width, breakpoints = RESPONSIVE_BREAKPOINTS) {
    const requested = Math.max(0, Number(dayCount) || 0);
    if (requested === 0)
      return 0;
    const ladder = breakpoints.length ? breakpoints : RESPONSIVE_BREAKPOINTS;
    const size = Number.isFinite(width) ? width : 0;
    const match = ladder.find((breakpoint) => size >= breakpoint.minWidth) ?? ladder[ladder.length - 1];
    return Math.min(requested, match.dayCount);
  }
  function clampStart(start, min, max, dayCount, hiddenDays = []) {
    return projectDates(start, dayCount, hiddenDays, min, max)[0] ?? clampDate(start, min, max);
  }
  function ensureVisible(start, dayCount, date, min, max, hiddenDays = []) {
    const hidden = normalizeHiddenDays(hiddenDays);
    const count = Math.max(1, dayCount);
    const dates = projectDates(start, count, hidden, min, max);
    if (!dates.length)
      return clampDate(start, min, max);
    const first = dates[0];
    if (!isDateValue(date))
      return first;
    if (compareDates(date, first) < 0)
      return projectDates(date, count, hidden, min, max)[0] ?? first;
    if (compareDates(date, dates[dates.length - 1]) <= 0)
      return first;
    const target = walk(date, 1, hidden, 1, max)[0];
    if (!target)
      return first;
    const backward = walk(target, count, hidden, -1, min);
    return projectDates(backward[backward.length - 1] ?? target, count, hidden, min, max)[0] ?? first;
  }
  function hasDayContent(days) {
    return days.some((day) => Array.isArray(day.slots) && day.slots.length > 0 || Boolean(day.notice) || Boolean(day.closed));
  }
  function rangeDetail(dates) {
    if (!dates.length)
      return { start: "", end: "", dayCount: 0 };
    return { start: dates[0], end: dates[dates.length - 1], dayCount: dates.length };
  }
  function resolveActiveDate(dates, activeDate) {
    if (!dates.length)
      return "";
    const last = dates[dates.length - 1];
    if (!isDateValue(activeDate))
      return dates[0];
    if (compareDates(activeDate, dates[0]) <= 0)
      return dates[0];
    if (compareDates(activeDate, last) >= 0)
      return last;
    return dates.find((date) => compareDates(date, activeDate) >= 0) ?? last;
  }
  function firstEnabledIndex(day) {
    return day.slots.findIndex((slot) => !slot.disabled);
  }
  function lastEnabledIndex(day) {
    for (let index = day.slots.length - 1;index >= 0; index--) {
      if (!day.slots[index].disabled)
        return index;
    }
    return -1;
  }
  function moveFocus(days, current, direction) {
    const currentDay = days[current.dayIndex];
    if (!currentDay)
      return current;
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
        if (!currentDay.slots[index].disabled)
          return { dayIndex: current.dayIndex, slotIndex: index };
        index += delta;
      }
      return current;
    }
    const delta = direction === "left" ? -1 : 1;
    for (let dayIndex = current.dayIndex + delta;dayIndex >= 0 && dayIndex < days.length; dayIndex += delta) {
      const day = days[dayIndex];
      if (!day.slots.length || firstEnabledIndex(day) < 0)
        continue;
      const clamped = Math.min(current.slotIndex, day.slots.length - 1);
      if (!day.slots[clamped].disabled)
        return { dayIndex, slotIndex: clamped };
      for (let distance = 1;distance < day.slots.length; distance++) {
        const before = clamped - distance;
        const after = clamped + distance;
        if (before >= 0 && !day.slots[before].disabled)
          return { dayIndex, slotIndex: before };
        if (after < day.slots.length && !day.slots[after].disabled)
          return { dayIndex, slotIndex: after };
      }
    }
    return current;
  }

  // src/source.js
  class SlotSourceController {
    #source = null;
    #controller = null;
    #nextController = null;
    #request = 0;
    #nextRequest = 0;
    set source(source) {
      const isFunction = typeof source === "function";
      const isObject = source !== null && typeof source === "object" && typeof source.load === "function";
      if (source !== null && !isFunction && !isObject) {
        throw new TypeError("source must be a function or an object with a load() method");
      }
      this.abort();
      this.#source = source;
    }
    get source() {
      return this.#source;
    }
    get hasNext() {
      const source = this.#source;
      return Boolean(source && typeof source === "object" && typeof source.next === "function");
    }
    abort() {
      this.#controller?.abort();
      this.#controller = null;
      this.#nextController?.abort();
      this.#nextController = null;
    }
    async load(range) {
      const source = this.#source;
      if (!source)
        return null;
      const loader = typeof source === "function" ? source : source.load;
      this.abort();
      const controller = new AbortController;
      this.#controller = controller;
      const request = ++this.#request;
      try {
        const result = await loader({ ...range, signal: controller.signal });
        if (request !== this.#request || controller.signal.aborted)
          return null;
        return result;
      } finally {
        if (this.#controller === controller)
          this.#controller = null;
      }
    }
    async next({ after }) {
      const source = this.#source;
      if (!source || typeof source !== "object" || typeof source.next !== "function")
        return null;
      this.#nextController?.abort();
      const controller = new AbortController;
      this.#nextController = controller;
      const request = ++this.#nextRequest;
      try {
        const result = await source.next({ after, signal: controller.signal });
        if (request !== this.#nextRequest || controller.signal.aborted)
          return null;
        return typeof result === "string" ? result : null;
      } finally {
        if (this.#nextController === controller)
          this.#nextController = null;
      }
    }
  }

  // src/views/shared.js
  var ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ENTITIES[char] || char);
  }
  function escapeAttr(value) {
    return escapeHtml(value);
  }
  function enabledValues(days) {
    const values = [];
    for (const day of days) {
      for (const slot of day.slots) {
        if (!slot.disabled)
          values.push(slotValue(day.date, slot.start));
      }
    }
    return values;
  }
  function rovingValue(enabled, ...preferred) {
    for (const value of preferred) {
      if (value && enabled.includes(value))
        return value;
    }
    return enabled[0] || "";
  }
  function slotButton({ date, slot, dayIndex, slotIndex, selected, tabbed }) {
    const value = slotValue(date, slot.start);
    const description = slot.description ? ` aria-description="${escapeAttr(slot.description)}"` : "";
    const disabled = slot.disabled ? ' disabled aria-disabled="true"' : "";
    const tone = slot.tone ? ` data-tone="${escapeAttr(slot.tone)}"` : "";
    return `<button type="button" role="option" class="sp-slot" data-day-index="${dayIndex}" data-slot-index="${slotIndex}" data-value="${escapeAttr(value)}"${tone} aria-selected="${selected ? "true" : "false"}" tabindex="${tabbed ? 0 : -1}"${disabled}${description}><span class="sp-slot-time">${escapeHtml(slot.start)}</span></button>`;
  }
  function noticeIndicator(options = {}) {
    if (options.interactive) {
      const accessible = options.description || options.label || "";
      const title = options.label ? ` title="${escapeAttr(options.label)}"` : "";
      return `<button type="button" class="sp-notice" data-day-index="${options.dayIndex ?? 0}" aria-label="${escapeAttr(accessible)}"${title}><span class="sp-notice-dot" aria-hidden="true"></span></button>`;
    }
    return '<span class="sp-notice" aria-hidden="true"><span class="sp-notice-dot"></span></span>';
  }
  function noticeBlock({ label, description }) {
    const body = `<strong class="sp-day-notice-label">${escapeHtml(label)}</strong>${description ? `<span class="sp-day-notice-description">${escapeHtml(description)}</span>` : ""}`;
    return `<div class="sp-day-notice">${body}</div>`;
  }
  function dayEmpty(message) {
    return `<div class="sp-day-empty">${escapeHtml(message)}</div>`;
  }
  function slotCountText(count, messages) {
    if (count <= 0)
      return "–";
    if (count === 1)
      return messages.oneSlot;
    return messages.manySlots.replace("{n}", String(count));
  }
  function rangeEmpty({ start, end, invalid, canNext, nextAvailability, locale, messages }) {
    const showDescription = !invalid && Boolean(start);
    let description = "";
    if (showDescription) {
      const formatter = new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "short",
        timeZone: "UTC"
      });
      const text = messages.rangeEmptyDescription.replace("{start}", formatter.format(toUtcDate(start))).replace("{end}", formatter.format(toUtcDate(end)));
      description = `<p class="sp-range-empty-description">${escapeHtml(text)}</p>`;
    }
    const actions = [];
    if (canNext) {
      actions.push(`<button type="button" class="sp-range-empty-next">${escapeHtml(messages.rangeEmptyNext)}</button>`);
    }
    if (nextAvailability && !invalid) {
      actions.push(`<button type="button" class="sp-range-empty-availability">${escapeHtml(messages.nextAvailability)}</button>`);
    }
    const action = actions.length ? `<div class="sp-range-empty-actions">${actions.join("")}</div>` : "";
    return `<div class="sp-range-empty">
    <strong class="sp-range-empty-title">${escapeHtml(messages.rangeEmptyTitle)}</strong>
    ${description}
    ${action}
  </div>`;
  }

  // src/views/columns.js
  var UTC_FORMAT = { timeZone: "UTC" };
  function renderColumns({
    visible,
    value,
    focusedValue,
    maxVisibleRows,
    expanded,
    noticeDisplay,
    messages,
    locale
  }) {
    const formatterDay = new Intl.DateTimeFormat(locale, { weekday: "short", ...UTC_FORMAT });
    const formatterDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", ...UTC_FORMAT });
    const { days: collapsed, rows, hasOverflow } = collapsedDays(visible, maxVisibleRows, expanded);
    const enabled = enabledValues(collapsed);
    const firstEnabled = enabled[0] || "";
    const activeFocus = rovingValue(enabled, focusedValue, value, firstEnabled);
    const html = collapsed.map((day, dayIndex) => {
      const date = toUtcDate(day.date);
      const weekday = formatterDay.format(date);
      const displayDate = formatterDate.format(date);
      const inline = noticeDisplay === "inline";
      const action = noticeDisplay === "action";
      const headerNotice = day.notice && (inline || action) ? noticeIndicator({ interactive: true, dayIndex, ...day.notice }) : "";
      const noticeContent = day.notice && inline ? noticeBlock(day.notice) : "";
      const closed = Boolean(day.closed);
      let body;
      if (day.slots.length === 0) {
        body = `${noticeContent}${dayEmpty(closed ? messages.closed : messages.empty)}`;
      } else {
        const slots = day.slots;
        const slotMarkup = slots.map((slot, slotIndex) => {
          const slotVal = slotValue(day.date, slot.start);
          return slotButton({
            date: day.date,
            slot,
            dayIndex,
            slotIndex,
            selected: slotVal === value,
            tabbed: slotVal === activeFocus && !slot.disabled
          });
        }).join("");
        const empties = Array.from({ length: Math.max(0, rows - slots.length) }, () => '<span class="sp-empty" aria-hidden="true">–</span>').join("");
        body = `${noticeContent}<div class="sp-slots" role="listbox" aria-label="${escapeAttr(`${weekday} ${displayDate}`)}">${slotMarkup}${empties}</div>`;
      }
      return `<section class="sp-day" data-date="${escapeAttr(day.date)}"${closed ? " data-closed" : ""}>
        <header class="sp-day-header">
          <span class="sp-weekday">${escapeHtml(weekday)}</span>
          <strong class="sp-date">${escapeHtml(displayDate)}</strong>
          ${headerNotice}
        </header>
        ${body}
      </section>`;
    }).join("");
    return {
      html: `<div class="sp-grid" role="presentation">${html}</div>`,
      hasOverflow
    };
  }

  // src/views/day.js
  var UTC_FORMAT2 = { timeZone: "UTC" };
  function renderDay({
    visible,
    activeDate,
    today,
    value,
    focusedValue,
    noticeDisplay,
    messages,
    locale
  }) {
    const formatterStripDay = new Intl.DateTimeFormat(locale, { weekday: "short", ...UTC_FORMAT2 });
    const formatterStripDate = new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "short",
      ...UTC_FORMAT2
    });
    const formatterPanelDay = new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      ...UTC_FORMAT2
    });
    const activeIndex = Math.max(0, visible.findIndex((day) => day.date === activeDate));
    const active = visible[activeIndex];
    const strip = visible.map((day, dayIndex) => {
      const date = toUtcDate(day.date);
      const pressed = day.date === active.date;
      const isToday = day.date === today;
      const closed = Boolean(day.closed);
      const count = closed ? messages.closed : slotCountText(day.slots.length, messages);
      return `<button type="button" class="sp-strip-day" data-date="${escapeAttr(day.date)}" data-day-index="${dayIndex}" aria-pressed="${pressed ? "true" : "false"}"${isToday ? " data-today" : ""}${closed ? " data-closed" : ""} tabindex="${pressed ? 0 : -1}">
        <span class="sp-strip-weekday">${escapeHtml(formatterStripDay.format(date))}</span>
        <strong class="sp-strip-date">${escapeHtml(formatterStripDate.format(date))}</strong>
        <span class="sp-strip-count" aria-hidden="true">${escapeHtml(count)}</span>
        <span class="sp-visually-hidden">${escapeHtml(`${formatterPanelDay.format(date)}: ${count}`)}</span>
      </button>`;
    }).join("");
    const enabled = active.slots.filter((slot) => !slot.disabled).map((slot) => slotValue(active.date, slot.start));
    const firstEnabled = enabled[0] || "";
    const activeFocus = rovingValue(enabled, focusedValue, value, firstEnabled);
    const inline = noticeDisplay === "inline";
    const notice = active.notice && inline ? noticeBlock(active.notice) : "";
    const headerNotice = active.notice && noticeDisplay === "action" ? noticeIndicator({ interactive: true, dayIndex: activeIndex, ...active.notice }) : "";
    const panelLabel = formatterPanelDay.format(toUtcDate(active.date));
    const activeClosed = Boolean(active.closed);
    let panelBody;
    if (active.slots.length === 0) {
      panelBody = `${notice}${dayEmpty(activeClosed ? messages.closed : messages.empty)}`;
    } else {
      const slots = active.slots.map((slot, slotIndex) => {
        const slotVal = slotValue(active.date, slot.start);
        return slotButton({
          date: active.date,
          slot,
          dayIndex: activeIndex,
          slotIndex,
          selected: slotVal === value,
          tabbed: slotVal === activeFocus && !slot.disabled
        });
      }).join("");
      panelBody = `${notice}<div class="sp-panel-slots" role="listbox" aria-label="${escapeAttr(panelLabel)}">${slots}</div>`;
    }
    const html = `<div class="sp-daystrip" role="group" aria-label="${escapeAttr(messages.days)}">${strip}</div>
    <section class="sp-panel" data-date="${escapeAttr(active.date)}"${activeClosed ? " data-closed" : ""}>
      <header class="sp-panel-header">
        <strong class="sp-panel-title">${escapeHtml(panelLabel)}</strong>
        ${headerNotice}
      </header>
      ${panelBody}
    </section>`;
    return { html };
  }

  // src/slot-picker.js
  var PREV_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var NEXT_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var RANGE_ATTRIBUTES = new Set(["start", "min", "max", "day-count", "responsive"]);

  class SlotPickerElement extends HTMLElement {
    static observedAttributes = [
      "start",
      "day-count",
      "min",
      "max",
      "value",
      "active-date",
      "layout",
      "max-visible-rows",
      "expanded",
      "responsive",
      "home-date",
      "next-availability",
      "notice-display",
      "locale",
      "lang"
    ];
    #days = [];
    #hiddenDays = [];
    #sourceController = new SlotSourceController;
    #messages = null;
    #loading = false;
    #error = null;
    #focusedValue = "";
    #renderQueued = false;
    #initializing = false;
    #batching = false;
    #pendingFocus = "";
    #resizeObserver = null;
    #measuredWidth = null;
    #breakpoints = null;
    #lastRange = null;
    #lastActiveDate = null;
    #loadedKey = null;
    #loadRequest = 0;
    constructor() {
      super();
      this.addEventListener("click", (event) => this.#onClick(event));
      this.addEventListener("keydown", (event) => this.#onKeyDown(event));
    }
    connectedCallback() {
      this.#initializing = true;
      if (!this.hasAttribute("start"))
        this.setAttribute("start", todayValue());
      if (!this.hasAttribute("day-count"))
        this.setAttribute("day-count", "5");
      if (!this.hasAttribute("layout"))
        this.setAttribute("layout", "columns");
      this.#initializing = false;
      this.#measuredWidth = typeof ResizeObserver === "undefined" ? this.getBoundingClientRect().width : null;
      if (!this.#resizeObserver && typeof ResizeObserver !== "undefined") {
        this.#resizeObserver = new ResizeObserver((entries) => this.#onResize(entries));
      }
      this.#resizeObserver?.observe(this);
      this.#reconcile({ pinActive: false });
    }
    disconnectedCallback() {
      this.#sourceController.abort();
      this.#resizeObserver?.disconnect();
      this.#loadedKey = null;
    }
    attributeChangedCallback(name, oldValue, newValue) {
      if (oldValue === newValue)
        return;
      if (this.#initializing || this.#batching)
        return;
      if (RANGE_ATTRIBUTES.has(name))
        this.#reconcile({ pinActive: name !== "start" });
      else
        this.#queueRender();
    }
    get start() {
      const value = this.getAttribute("start") || todayValue();
      return isDateValue(value) ? value : todayValue();
    }
    set start(value) {
      if (!isDateValue(value))
        throw new TypeError("start must be YYYY-MM-DD");
      const count = this.visibleDayCount;
      this.setAttribute("start", count > 0 ? clampStart(value, this.min, this.max, count, this.#hiddenDays) : value);
    }
    get dayCount() {
      const value = Number.parseInt(this.getAttribute("day-count") || "5", 10);
      return Number.isFinite(value) ? Math.max(1, Math.min(14, value)) : 5;
    }
    set dayCount(value) {
      const next = Math.max(1, Math.min(14, Number(value) || 5));
      this.setAttribute("day-count", String(next));
    }
    get hiddenDays() {
      return [...this.#hiddenDays];
    }
    set hiddenDays(value) {
      this.#hiddenDays = normalizeHiddenDays(value);
      if (!this.isConnected || this.#batching)
        return;
      this.#reconcile({ pinActive: true });
    }
    #requestedDayCount() {
      if (!this.responsive || this.#measuredWidth === null)
        return this.dayCount;
      return resolveVisibleDayCount(this.dayCount, this.#measuredWidth, this.#breakpoints ?? RESPONSIVE_BREAKPOINTS);
    }
    #projection() {
      return projectDates(this.start, this.#requestedDayCount(), this.#hiddenDays, this.min, this.max);
    }
    get visibleDayCount() {
      return this.#projection().length;
    }
    get responsive() {
      return this.hasAttribute("responsive");
    }
    set responsive(value) {
      this.toggleAttribute("responsive", Boolean(value));
    }
    get responsiveBreakpoints() {
      return this.#breakpoints ?? RESPONSIVE_BREAKPOINTS;
    }
    set responsiveBreakpoints(value) {
      this.#breakpoints = value?.length ? normalizeBreakpoints(value) : null;
      if (!this.isConnected || this.#batching)
        return;
      this.#reconcile({ pinActive: true });
    }
    get min() {
      const value = this.getAttribute("min");
      return value && isDateValue(value) ? value : "";
    }
    set min(value) {
      if (!value)
        this.removeAttribute("min");
      else if (isDateValue(value))
        this.setAttribute("min", value);
      else
        throw new TypeError("min must be YYYY-MM-DD");
    }
    get max() {
      const value = this.getAttribute("max");
      return value && isDateValue(value) ? value : "";
    }
    set max(value) {
      if (!value)
        this.removeAttribute("max");
      else if (isDateValue(value))
        this.setAttribute("max", value);
      else
        throw new TypeError("max must be YYYY-MM-DD");
    }
    get value() {
      const value = this.getAttribute("value") || "";
      return isSlotValue(value) ? value : "";
    }
    set value(value) {
      if (!value) {
        this.removeAttribute("value");
        return;
      }
      if (isSlotValue(value))
        this.setAttribute("value", value);
      else
        throw new TypeError("value must be a valid YYYY-MM-DDTHH:mm or empty");
    }
    get activeDate() {
      const dates = this.#projection();
      if (!dates.length)
        return "";
      return resolveActiveDate(dates, this.getAttribute("active-date") || "");
    }
    set activeDate(value) {
      if (!value)
        this.removeAttribute("active-date");
      else if (isDateValue(value))
        this.setAttribute("active-date", value);
      else
        throw new TypeError("active-date must be YYYY-MM-DD or empty");
    }
    get homeDate() {
      const raw = this.getAttribute("home-date") || "";
      if (isDateValue(raw))
        return raw;
      return this.min || todayValue();
    }
    set homeDate(value) {
      if (!value)
        this.removeAttribute("home-date");
      else if (isDateValue(value))
        this.setAttribute("home-date", value);
      else
        throw new TypeError("home-date must be YYYY-MM-DD or empty");
    }
    get layout() {
      const value = this.getAttribute("layout") || "columns";
      return value === "day" ? "day" : "columns";
    }
    set layout(value) {
      if (value !== "columns" && value !== "day")
        throw new TypeError('layout must be "columns" or "day"');
      this.setAttribute("layout", value);
    }
    get noticeDisplay() {
      const value = this.getAttribute("notice-display");
      return value === "inline" || value === "none" ? value : "action";
    }
    set noticeDisplay(value) {
      if (value !== "inline" && value !== "action" && value !== "none") {
        throw new TypeError('notice-display must be "inline", "action" or "none"');
      }
      this.setAttribute("notice-display", value);
    }
    get expanded() {
      return this.hasAttribute("expanded");
    }
    set expanded(value) {
      this.toggleAttribute("expanded", Boolean(value));
    }
    get maxVisibleRows() {
      const value = Number.parseInt(this.getAttribute("max-visible-rows") || "5", 10);
      return Number.isFinite(value) ? Math.max(1, value) : 5;
    }
    set maxVisibleRows(value) {
      this.setAttribute("max-visible-rows", String(Math.max(1, Number(value) || 5)));
    }
    get days() {
      return this.#days.map((day) => ({ ...day, slots: day.slots.map((slot) => ({ ...slot })) }));
    }
    set days(value) {
      this.#days = normalizeDays(value);
      this.#error = null;
      this.#queueRender();
    }
    set source(source) {
      this.#sourceController.source = source;
      if (this.isConnected)
        this.#load();
    }
    get source() {
      return this.#sourceController.source;
    }
    set messages(value) {
      this.#messages = value ? { ...value } : null;
      this.#queueRender();
    }
    get locale() {
      const value = this.getAttribute("locale") || this.lang;
      return value || document.documentElement.lang || navigator.language || "en";
    }
    set locale(value) {
      if (!value)
        this.removeAttribute("locale");
      else
        this.setAttribute("locale", value);
    }
    get range() {
      return rangeDetail(this.#projection());
    }
    previous() {
      this.#navigate(-1);
    }
    next() {
      this.#navigate(1);
    }
    goTo(date) {
      if (!this.visibleDayCount)
        return "";
      const target = isDateValue(date) ? clampDate(date, this.min, this.max) : this.start;
      this.#mutate(() => this.#moveTo(target));
      this.#commit();
      return this.activeDate;
    }
    goHome() {
      return this.goTo(this.homeDate);
    }
    async goToNextAvailability(options = {}) {
      if (!this.visibleDayCount)
        return null;
      const after = options.after ?? this.range.end;
      if (this.#sourceController.hasNext) {
        const date = await this.#sourceController.next({ after });
        if (date && isDateValue(date)) {
          return this.goTo(date) || null;
        }
        return null;
      }
      this.dispatchEvent(new CustomEvent("nextrequest", { detail: { after } }));
      return null;
    }
    configure(options = {}) {
      this.#validateConfigure(options);
      this.#mutate(() => {
        if (options.min !== undefined)
          this.min = options.min;
        if (options.max !== undefined)
          this.max = options.max;
        if (options.start !== undefined)
          this.start = options.start;
        if (options.dayCount !== undefined)
          this.dayCount = options.dayCount;
        if (options.layout !== undefined)
          this.layout = options.layout;
        if (options.value !== undefined)
          this.value = options.value;
        if (options.maxVisibleRows !== undefined)
          this.maxVisibleRows = options.maxVisibleRows;
        if (options.responsive !== undefined)
          this.responsive = options.responsive;
        if (options.homeDate !== undefined)
          this.homeDate = options.homeDate ?? "";
        if (options.responsiveBreakpoints !== undefined)
          this.responsiveBreakpoints = options.responsiveBreakpoints;
        if (options.hiddenDays !== undefined)
          this.hiddenDays = options.hiddenDays;
      });
      this.#reconcile({ pinActive: options.start === undefined });
    }
    #validateConfigure(options) {
      if (options.min && !isDateValue(options.min))
        throw new TypeError("min must be YYYY-MM-DD");
      if (options.max && !isDateValue(options.max))
        throw new TypeError("max must be YYYY-MM-DD");
      if (options.start !== undefined && !isDateValue(options.start)) {
        throw new TypeError("start must be YYYY-MM-DD");
      }
      if (options.layout !== undefined && options.layout !== "columns" && options.layout !== "day") {
        throw new TypeError('layout must be "columns" or "day"');
      }
      if (options.value && !isSlotValue(options.value)) {
        throw new TypeError("value must be a valid YYYY-MM-DDTHH:mm or empty");
      }
      if (options.homeDate && !isDateValue(options.homeDate)) {
        throw new TypeError("homeDate must be YYYY-MM-DD or empty");
      }
      if (options.responsiveBreakpoints != null && !Array.isArray(options.responsiveBreakpoints)) {
        throw new TypeError("responsiveBreakpoints must be an array or null");
      }
      if (options.hiddenDays !== undefined)
        normalizeHiddenDays(options.hiddenDays);
    }
    async reload() {
      await this.#load();
    }
    #navigate(direction) {
      const dates = this.#projection();
      if (!dates.length)
        return;
      const next = stepStart(dates, direction, this.#hiddenDays, this.min, this.max);
      if (!next || next === this.start)
        return;
      this.#mutate(() => this.setAttribute("start", next));
      this.#commit();
    }
    #moveTo(target) {
      const count = this.#requestedDayCount();
      const nextStart = ensureVisible(this.start, count, target, this.min, this.max, this.#hiddenDays);
      if (nextStart !== this.getAttribute("start"))
        this.setAttribute("start", nextStart);
      const dates = projectDates(nextStart, count, this.#hiddenDays, this.min, this.max);
      const nextActive = resolveActiveDate(dates, target);
      if (this.getAttribute("active-date") !== nextActive)
        this.setAttribute("active-date", nextActive);
    }
    #mutate(fn) {
      const wasBatching = this.#batching;
      this.#batching = true;
      try {
        fn();
      } finally {
        this.#batching = wasBatching;
      }
    }
    #reconcile(options = {}) {
      const pinActive = options.pinActive ?? true;
      const reload = options.reload ?? true;
      const wasBatching = this.#batching;
      this.#batching = true;
      try {
        const count = this.#requestedDayCount();
        const invalid = this.visibleDayCount === 0;
        this.toggleAttribute("data-invalid-range", invalid);
        if (!invalid) {
          const rawActive = this.getAttribute("active-date") || "";
          const previous = this.#lastRange;
          let anchor = this.start;
          if (pinActive) {
            if (previous?.dayCount && isDateValue(rawActive)) {
              anchor = clampDate(rawActive, previous.start, previous.end);
            } else if (isDateValue(rawActive)) {
              anchor = rawActive;
            } else if (previous?.start) {
              anchor = previous.start;
            }
          }
          const nextStart = ensureVisible(this.start, count, anchor, this.min, this.max, this.#hiddenDays);
          if (nextStart !== this.getAttribute("start"))
            this.setAttribute("start", nextStart);
          if (pinActive && isDateValue(anchor)) {
            const dates = projectDates(nextStart, count, this.#hiddenDays, this.min, this.max);
            const nextActive = resolveActiveDate(dates, anchor);
            if (this.getAttribute("active-date") !== nextActive)
              this.setAttribute("active-date", nextActive);
          }
        }
      } finally {
        this.#batching = wasBatching;
      }
      if (wasBatching)
        return;
      this.#commit({ reload });
    }
    #commit(options = {}) {
      const reload = options.reload ?? true;
      const range = this.range;
      const count = this.visibleDayCount;
      const active = count ? this.activeDate : "";
      const previousRange = this.#lastRange;
      const first = previousRange === null;
      const rangeChanged = first || range.start !== previousRange.start || range.end !== previousRange.end || range.dayCount !== previousRange.dayCount;
      const activeChanged = !first && this.#lastActiveDate !== null && active !== this.#lastActiveDate;
      this.#lastRange = range;
      this.#lastActiveDate = active;
      this.#queueRender();
      if (!first && rangeChanged)
        this.dispatchEvent(new CustomEvent("rangechange", { detail: range }));
      if (!first && activeChanged) {
        this.dispatchEvent(new CustomEvent("daychange", { detail: { activeDate: active } }));
      }
      if (!count) {
        this.#sourceController.abort();
        this.#loadRequest += 1;
        this.#loadedKey = null;
        this.#loading = false;
        this.#error = null;
      } else if (reload && this.#loadedKey !== this.#rangeKey(range)) {
        this.#load();
      }
    }
    #rangeKey(range) {
      return `${range.start}|${range.end}|${range.dayCount}`;
    }
    #onResize(entries) {
      const entry = entries[entries.length - 1];
      const box = entry?.contentBoxSize?.[0];
      const hostWidth = box ? box.inlineSize : entry?.contentRect.width ?? 0;
      const width = this.#contentWidth() ?? hostWidth;
      const previous = this.visibleDayCount;
      this.#measuredWidth = width;
      if (this.visibleDayCount !== previous)
        this.#reconcile({ pinActive: true });
    }
    #contentWidth() {
      const content = this.querySelector(".sp-content");
      return content ? content.getBoundingClientRect().width : null;
    }
    #setActiveDate(date, emit = true) {
      const dates = this.#projection();
      if (!dates.length)
        return;
      const resolved = resolveActiveDate(dates, date);
      const before = this.activeDate;
      if (resolved === before && this.getAttribute("active-date") === resolved)
        return;
      this.setAttribute("active-date", resolved);
      this.#lastActiveDate = resolved;
      if (emit && resolved !== before) {
        this.dispatchEvent(new CustomEvent("daychange", { detail: { activeDate: resolved } }));
      }
    }
    async#load() {
      const request = ++this.#loadRequest;
      if (!this.source || !this.visibleDayCount) {
        this.#loading = false;
        this.#error = null;
        this.#queueRender();
        return;
      }
      const range = this.range;
      this.#loadedKey = this.#rangeKey(range);
      this.#loading = true;
      this.#error = null;
      this.#queueRender();
      this.dispatchEvent(new CustomEvent("loadstart", { detail: range }));
      try {
        const result = await this.#sourceController.load(range);
        if (request !== this.#loadRequest || result === null)
          return;
        const days = Array.isArray(result) ? result : result && typeof result === "object" && ("days" in result) ? result.days : [];
        this.#days = normalizeDays(days);
        if (request !== this.#loadRequest)
          return;
        this.dispatchEvent(new CustomEvent("loadend", { detail: { ...range, days: this.days } }));
      } catch (error) {
        if (request !== this.#loadRequest)
          return;
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        this.#error = error;
        this.dispatchEvent(new CustomEvent("loaderror", { detail: { ...range, error } }));
      } finally {
        if (request === this.#loadRequest) {
          this.#loading = false;
          this.#queueRender();
        }
      }
    }
    #queueRender() {
      if (this.#renderQueued)
        return;
      this.#renderQueued = true;
      queueMicrotask(() => {
        this.#renderQueued = false;
        if (this.isConnected)
          this.#render();
      });
    }
    #focusSelector(element) {
      if (element.classList.contains("sp-slot")) {
        const value = element.getAttribute("data-value") || "";
        return value ? `.sp-slot[data-value="${CSS.escape(value)}"]` : "";
      }
      if (element.classList.contains("sp-strip-day")) {
        const date = element.getAttribute("data-date") || "";
        return date ? `.sp-strip-day[data-date="${CSS.escape(date)}"]` : "";
      }
      if (element.classList.contains("sp-nav-prev"))
        return ".sp-nav-prev";
      if (element.classList.contains("sp-nav-next"))
        return ".sp-nav-next";
      if (element.classList.contains("sp-home"))
        return ".sp-home";
      if (element.classList.contains("sp-range-empty-availability"))
        return ".sp-range-empty-availability";
      if (element.classList.contains("sp-range-empty-next"))
        return ".sp-range-empty-next";
      if (element.classList.contains("sp-more-button"))
        return ".sp-more-button";
      if (element.classList.contains("sp-notice")) {
        const index = element.getAttribute("data-day-index") || "";
        return index ? `.sp-notice[data-day-index="${CSS.escape(index)}"]` : "";
      }
      return "";
    }
    #focusFallback() {
      return this.querySelector('.sp-slot[tabindex="0"]') ?? this.querySelector('.sp-strip-day[tabindex="0"]');
    }
    #projectedDays() {
      return visibleDays(this.#days, this.#projection());
    }
    #render() {
      const focused = document.activeElement;
      const fallbackSelector = focused instanceof Element && this.contains(focused) ? this.#focusSelector(focused) : "";
      const pendingSelector = this.#pendingFocus;
      this.#pendingFocus = "";
      const dates = this.#projection();
      const range = rangeDetail(dates);
      const invalid = range.dayCount === 0;
      const days = visibleDays(this.#days, dates);
      const messages = resolveMessages(this.#messages);
      const locale = this.locale;
      const canPrevious = !invalid && stepStart(dates, -1, this.#hiddenDays, this.min, this.max) !== range.start;
      const canNext = !invalid && stepStart(dates, 1, this.#hiddenDays, this.min, this.max) !== range.start;
      const empty = !this.#loading && !this.#error && !hasDayContent(days);
      let content;
      let hasOverflow = false;
      if (empty) {
        content = rangeEmpty({
          start: range.start,
          end: range.end,
          invalid,
          canNext,
          nextAvailability: this.hasAttribute("next-availability"),
          locale,
          messages
        });
      } else if (this.layout === "day") {
        content = renderDay({
          visible: days,
          activeDate: this.activeDate,
          today: todayValue(),
          value: this.value,
          focusedValue: this.#focusedValue,
          noticeDisplay: this.noticeDisplay,
          messages,
          locale
        }).html;
      } else {
        const rendered = renderColumns({
          visible: days,
          value: this.value,
          focusedValue: this.#focusedValue,
          maxVisibleRows: this.maxVisibleRows,
          expanded: this.expanded,
          noticeDisplay: this.noticeDisplay,
          messages,
          locale
        });
        content = rendered.html;
        hasOverflow = rendered.hasOverflow;
      }
      const status = this.#loading ? `<div class="sp-status sp-visually-hidden" role="status">${escapeHtml(messages.loading)}</div>` : this.#error ? `<div class="sp-status sp-status-error" role="status">${escapeHtml(String(this.#error))}</div>` : "";
      const homeAvailable = this.hasAttribute("home-date") && !invalid;
      const homeInRange = homeAvailable && compareDates(this.homeDate, range.start) >= 0 && compareDates(this.homeDate, range.end) <= 0;
      this.style.setProperty("--_sp-day-count", String(Math.max(1, days.length)));
      this.style.setProperty("--_sp-max-visible-rows", String(this.maxVisibleRows));
      if (this.#loading)
        this.setAttribute("aria-busy", "true");
      else
        this.removeAttribute("aria-busy");
      this.innerHTML = `<div class="sp-shell" data-layout="${this.layout}">
      <div class="sp-projection">
        <button type="button" class="sp-nav sp-nav-prev" aria-label="${escapeAttr(messages.previous)}"${canPrevious ? "" : " disabled"}>${PREV_ICON}</button>
        <div class="sp-content">
          ${status}
          ${content}
          ${hasOverflow ? `<div class="sp-more"><button type="button" class="sp-more-button">${escapeHtml(this.expanded ? messages.showLess : messages.showMore)}</button></div>` : ""}
        </div>
        <button type="button" class="sp-nav sp-nav-next" aria-label="${escapeAttr(messages.next)}"${canNext ? "" : " disabled"}>${NEXT_ICON}</button>
      </div>
      ${homeAvailable ? `<div class="sp-shortcuts">${homeInRange ? "" : `<button type="button" class="sp-home">${escapeHtml(messages.home)}</button>`}</div>` : ""}
    </div>`;
      const selector = pendingSelector || fallbackSelector;
      if (selector) {
        const target = this.querySelector(selector) ?? this.#focusFallback();
        if (target instanceof HTMLElement)
          target.focus({ preventScroll: true });
      }
    }
    #onClick(event) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target)
        return;
      if (target.closest(".sp-nav-prev"))
        return this.previous();
      if (target.closest(".sp-nav-next"))
        return this.next();
      if (target.closest(".sp-home")) {
        this.#pendingFocus = '.sp-slot[tabindex="0"]';
        return this.goHome();
      }
      if (target.closest(".sp-nav-availability")) {
        this.goToNextAvailability();
        return;
      }
      if (target.closest(".sp-range-empty-availability")) {
        this.goToNextAvailability();
        return;
      }
      if (target.closest(".sp-range-empty-next"))
        return this.next();
      const more = target.closest(".sp-more-button");
      if (more) {
        this.expanded = !this.expanded;
        return;
      }
      const stripDay = target.closest(".sp-strip-day");
      if (stripDay instanceof HTMLButtonElement) {
        const date = stripDay.getAttribute("data-date") || "";
        if (isDateValue(date)) {
          this.#pendingFocus = `.sp-strip-day[data-date="${CSS.escape(date)}"]`;
          this.#setActiveDate(date);
        }
        return;
      }
      const notice = target.closest(".sp-notice[data-day-index]");
      if (notice instanceof HTMLElement) {
        const dayIndex = Number(notice.getAttribute("data-day-index"));
        const day = this.#projectedDays()[dayIndex];
        if (day?.notice) {
          this.dispatchEvent(new CustomEvent("noticeactivate", {
            detail: { day, notice: day.notice, anchor: notice },
            bubbles: true
          }));
        }
        return;
      }
      const slotButton = target.closest(".sp-slot");
      if (slotButton instanceof HTMLButtonElement)
        this.#activateSlot(slotButton);
    }
    #onKeyDown(event) {
      if (!(event.target instanceof HTMLButtonElement))
        return;
      const button = event.target;
      if (button.classList.contains("sp-strip-day"))
        return this.#onStripKeyDown(event);
      if (!button.classList.contains("sp-slot"))
        return;
      const map = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
        Home: "home",
        End: "end"
      };
      const direction = map[event.key];
      if (!direction)
        return;
      event.preventDefault();
      const allDays = this.#projectedDays();
      if (this.layout === "day") {
        this.#onPanelKeyDown(event, allDays, direction);
        return;
      }
      const { days } = collapsedDays(allDays, this.maxVisibleRows, this.expanded);
      const current = {
        dayIndex: Number(button.dataset.dayIndex),
        slotIndex: Number(button.dataset.slotIndex)
      };
      const next = moveFocus(days, current, direction);
      const nextDay = days[next.dayIndex];
      const nextSlot = nextDay?.slots[next.slotIndex];
      if (!nextSlot || nextSlot.disabled)
        return;
      const value = slotValue(nextDay.date, nextSlot.start);
      this.#focusedValue = value;
      this.#pendingFocus = `.sp-slot[data-value="${CSS.escape(value)}"]`;
      this.#render();
    }
    #onStripKeyDown(event) {
      const map = { ArrowLeft: -1, ArrowRight: 1, Home: "home", End: "end" };
      const action = map[event.key];
      if (action === undefined)
        return;
      event.preventDefault();
      const days = this.#projectedDays();
      const currentIndex = Math.max(0, days.findIndex((day) => day.date === this.activeDate));
      let nextIndex = currentIndex;
      if (action === "home")
        nextIndex = 0;
      else if (action === "end")
        nextIndex = days.length - 1;
      else if (typeof action === "number")
        nextIndex = Math.max(0, Math.min(days.length - 1, currentIndex + action));
      const next = days[nextIndex];
      if (!next || next.date === this.activeDate) {
        const same = this.querySelector(`.sp-strip-day[data-date="${CSS.escape(this.activeDate)}"]`);
        if (same instanceof HTMLButtonElement)
          same.focus();
        return;
      }
      this.#pendingFocus = `.sp-strip-day[data-date="${CSS.escape(next.date)}"]`;
      this.#setActiveDate(next.date);
    }
    #onPanelKeyDown(event, days, direction) {
      if (!(event.target instanceof HTMLButtonElement))
        return;
      const button = event.target;
      const activeIndex = Math.max(0, days.findIndex((day) => day.date === this.activeDate));
      const active = days[activeIndex];
      if (!active)
        return;
      const enabled = active.slots.map((slot, slotIndex) => ({ slot, slotIndex })).filter(({ slot }) => !slot.disabled);
      if (!enabled.length)
        return;
      const currentSlotIndex = Number(button.dataset.slotIndex);
      let position = enabled.findIndex(({ slotIndex }) => slotIndex === currentSlotIndex);
      if (position < 0) {
        const currentValue = button.getAttribute("data-value") || "";
        position = Math.max(0, enabled.findIndex(({ slot }) => slotValue(active.date, slot.start) === (this.#focusedValue || this.value || currentValue)));
      }
      let nextPosition = position;
      if (direction === "home")
        nextPosition = 0;
      else if (direction === "end")
        nextPosition = enabled.length - 1;
      else if (direction === "left" || direction === "up")
        nextPosition = Math.max(0, position - 1);
      else
        nextPosition = Math.min(enabled.length - 1, position + 1);
      const next = enabled[nextPosition];
      if (!next)
        return;
      const value = slotValue(active.date, next.slot.start);
      this.#focusedValue = value;
      this.#pendingFocus = `.sp-slot[data-value="${CSS.escape(value)}"]`;
      this.#render();
    }
    #activateSlot(button) {
      if (button.disabled)
        return;
      const dayIndex = Number(button.dataset.dayIndex);
      const slotIndex = Number(button.dataset.slotIndex);
      const day = this.#projectedDays()[dayIndex];
      const slot = day?.slots[slotIndex];
      if (!day || !slot || slot.disabled)
        return;
      const value = slotValue(day.date, slot.start);
      this.#pendingFocus = `.sp-slot[data-value="${CSS.escape(value)}"]`;
      this.#setActiveDate(day.date);
      this.value = value;
      this.#focusedValue = value;
      this.dispatchEvent(new CustomEvent("slotactivate", { detail: { value, day, slot }, bubbles: true }));
    }
  }

  // src/define.js
  if (!customElements.get("slot-picker")) {
    customElements.define("slot-picker", SlotPickerElement);
  }
})();
