import { addDays, compareDates, isDateValue, rangeEnd, todayValue } from "./date.js";
import { resolveMessages } from "./messages.js";
import {
  boundedDayCount,
  clampStart,
  collapsedDays,
  ensureVisible,
  hasDayContent,
  isValidRange,
  moveFocus,
  normalizeBreakpoints,
  normalizeDays,
  RESPONSIVE_BREAKPOINTS,
  rangeDetail,
  resolveActiveDate,
  resolveVisibleDayCount,
  slotValue,
  visibleDays,
} from "./model.js";
import { SlotSourceController } from "./source.js";
import { renderColumns } from "./views/columns.js";
import { renderDay } from "./views/day.js";
import { escapeAttr, escapeHtml, rangeEmpty } from "./views/shared.js";

const PREV_ICON =
  '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const NEXT_ICON =
  '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Attributes that change the resolved visible range. */
const RANGE_ATTRIBUTES = new Set(["start", "min", "max", "day-count", "responsive"]);

/** @typedef {import("./model.js").SlotDay} SlotDay */
/** @typedef {"up"|"down"|"left"|"right"|"home"|"end"} FocusDirection */
/** @typedef {{minWidth:number,dayCount:number}} ResponsiveBreakpoint */
/**
 * @typedef {Partial<{
 *   min: string,
 *   max: string,
 *   start: string,
 *   dayCount: number,
 *   layout: "columns"|"day",
 *   value: string,
 *   maxVisibleRows: number,
 *   responsive: boolean,
 *   homeDate: string|null,
 *   responsiveBreakpoints: ResponsiveBreakpoint[]|null,
 * }>} ConfigureOptions
 */

/**
 * Inline appointment slot chooser.
 *
 * Canonical public values:
 * - dates: YYYY-MM-DD
 * - times: HH:mm
 * - value: YYYY-MM-DDTHH:mm
 *
 * State:
 * - dayCount: consumer's maximum intention
 * - visibleDayCount: capacity actually resolved from bounds + width
 * - start/range: visible civil range
 * - activeDate: consulted day
 * - focusedValue: keyboard target, never a selection
 * - value: selected local slot value
 * - homeDate: reference date for `goHome()`, unrelated to `min`
 *
 * Invariants:
 * - resize changes the range, never `value`;
 * - navigation changes the range, never `value`;
 * - day activation changes `activeDate`, never `value`;
 * - slot activation changes `activeDate` and `value`;
 * - event order is stable: `rangechange` then `daychange`, then any reload.
 */
export class SlotPickerElement extends HTMLElement {
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
    "lang",
  ];

  /** @type {SlotDay[]} */
  #days = [];
  #sourceController = new SlotSourceController();
  /** @type {Partial<typeof import("./messages.js").DEFAULT_MESSAGES>|null} */
  #messages = null;
  #loading = false;
  /** @type {unknown} */
  #error = null;
  #focusedValue = "";
  #renderQueued = false;
  #initializing = false;
  #batching = false;
  #pendingFocus = "";
  /** @type {ResizeObserver|null} */
  #resizeObserver = null;
  /** @type {number|null} */
  #measuredWidth = null;
  /** @type {ResponsiveBreakpoint[]|null} */
  #breakpoints = null;
  /** @type {{start:string,end:string,dayCount:number}|null} */
  #lastRange = null;
  /** @type {string|null} */
  #lastActiveDate = null;

  constructor() {
    super();
    this.addEventListener("click", /** @param {MouseEvent} event */ (event) => this.#onClick(event));
    this.addEventListener("keydown", /** @param {KeyboardEvent} event */ (event) => this.#onKeyDown(event));
  }

  connectedCallback() {
    this.#initializing = true;
    if (!this.hasAttribute("start")) this.setAttribute("start", todayValue());
    if (!this.hasAttribute("day-count")) this.setAttribute("day-count", "5");
    if (!this.hasAttribute("layout")) this.setAttribute("layout", "columns");
    this.#initializing = false;

    // Without a ResizeObserver the projection width can never be measured
    // accurately; fall back to the host width so `responsive` still resolves.
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
  }

  /**
   * @param {string} name
   * @param {string|null} oldValue
   * @param {string|null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    if (this.#initializing || this.#batching) return;
    if (RANGE_ATTRIBUTES.has(name)) this.#reconcile({ pinActive: name !== "start" });
    else this.#queueRender();
  }

  get start() {
    const value = this.getAttribute("start") || todayValue();
    return isDateValue(value) ? value : todayValue();
  }

  set start(value) {
    if (!isDateValue(value)) throw new TypeError("start must be YYYY-MM-DD");
    const count = this.visibleDayCount;
    this.setAttribute("start", count > 0 ? clampStart(value, this.min, this.max, count) : value);
  }

  get dayCount() {
    const value = Number.parseInt(this.getAttribute("day-count") || "5", 10);
    return Number.isFinite(value) ? Math.max(1, Math.min(14, value)) : 5;
  }

  /** @param {number} value */
  set dayCount(value) {
    const next = Math.max(1, Math.min(14, Number(value) || 5));
    this.setAttribute("day-count", String(next));
  }

  /**
   * Consumer's maximum intention.
   * @see visibleDayCount for the resolved value.
   */
  get visibleDayCount() {
    if (!isValidRange(this.min, this.max)) return 0;
    const bounded = boundedDayCount(this.dayCount, this.min, this.max);
    if (!this.responsive || this.#measuredWidth === null) return bounded;
    return resolveVisibleDayCount(bounded, this.#measuredWidth, this.#breakpoints ?? RESPONSIVE_BREAKPOINTS);
  }

  get responsive() {
    return this.hasAttribute("responsive");
  }

  set responsive(value) {
    this.toggleAttribute("responsive", Boolean(value));
  }

  /** @returns {readonly ResponsiveBreakpoint[]} */
  get responsiveBreakpoints() {
    return this.#breakpoints ?? RESPONSIVE_BREAKPOINTS;
  }

  /** @param {ResponsiveBreakpoint[]|null} value */
  set responsiveBreakpoints(value) {
    this.#breakpoints = value?.length ? normalizeBreakpoints(value) : null;
    if (!this.isConnected || this.#batching) return;
    this.#reconcile({ pinActive: true });
  }

  get min() {
    const value = this.getAttribute("min");
    return value && isDateValue(value) ? value : "";
  }

  set min(value) {
    if (!value) this.removeAttribute("min");
    else if (isDateValue(value)) this.setAttribute("min", value);
    else throw new TypeError("min must be YYYY-MM-DD");
  }

  get max() {
    const value = this.getAttribute("max");
    return value && isDateValue(value) ? value : "";
  }

  set max(value) {
    if (!value) this.removeAttribute("max");
    else if (isDateValue(value)) this.setAttribute("max", value);
    else throw new TypeError("max must be YYYY-MM-DD");
  }

  get value() {
    return this.getAttribute("value") || "";
  }

  set value(value) {
    if (!value) this.removeAttribute("value");
    else if (/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
      this.setAttribute("value", value);
    } else {
      throw new TypeError("value must be YYYY-MM-DDTHH:mm or empty");
    }
  }

  get activeDate() {
    const count = this.visibleDayCount;
    if (!count) return "";
    const raw = this.getAttribute("active-date") || "";
    const base = isDateValue(raw) ? raw : this.start;
    return resolveActiveDate(this.start, count, base);
  }

  set activeDate(value) {
    if (!value) this.removeAttribute("active-date");
    else if (isDateValue(value)) this.setAttribute("active-date", value);
    else throw new TypeError("active-date must be YYYY-MM-DD or empty");
  }

  /** Reference date used by `goHome()`. Never confused with `min`. */
  get homeDate() {
    const raw = this.getAttribute("home-date") || "";
    if (isDateValue(raw)) return raw;
    return this.min || todayValue();
  }

  set homeDate(value) {
    if (!value) this.removeAttribute("home-date");
    else if (isDateValue(value)) this.setAttribute("home-date", value);
    else throw new TypeError("home-date must be YYYY-MM-DD or empty");
  }

  get layout() {
    const value = this.getAttribute("layout") || "columns";
    return value === "day" ? "day" : "columns";
  }

  set layout(value) {
    if (value !== "columns" && value !== "day") throw new TypeError('layout must be "columns" or "day"');
    this.setAttribute("layout", value);
  }

  /**
   * Notice projection strategy:
   * - `action` (default) renders only an accessible control that emits
   *   `noticeactivate`, so the application owns the detailed presentation;
   * - `inline` additionally renders the readable notice content, which stays
   *   non-interactive;
   * - `none` renders nothing.
   */
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

  /** @returns {SlotDay[]} */
  get days() {
    return this.#days.map((day) => ({ ...day, slots: day.slots.map((slot) => ({ ...slot })) }));
  }

  /** @param {SlotDay[]} value */
  set days(value) {
    this.#days = normalizeDays(value);
    this.#error = null;
    this.#queueRender();
  }

  /** @param {import("./source.js").SlotSource|null} source */
  set source(source) {
    this.#sourceController.source = source;
    if (this.isConnected) this.#load();
  }

  get source() {
    return this.#sourceController.source;
  }

  /**
   * Instance overrides only. Global defaults from `setDefaultMessages()` are
   * resolved at render time, so they also reach already-created instances.
   * @param {Partial<typeof import("./messages.js").DEFAULT_MESSAGES>|null} value
   */
  set messages(value) {
    this.#messages = value ? { ...value } : null;
    this.#queueRender();
  }

  /**
   * Locale used for `Intl` formatting. `locale` wins over the native `lang`,
   * then the document language, then the browser language.
   */
  get locale() {
    const value = this.getAttribute("locale") || this.lang;
    return value || document.documentElement.lang || navigator.language || "en";
  }

  set locale(value) {
    if (!value) this.removeAttribute("locale");
    else this.setAttribute("locale", value);
  }

  /** Resolved visible civil range. Empty and invalid when count is 0. */
  get range() {
    const count = this.visibleDayCount;
    if (!count) return { start: "", end: "", dayCount: 0 };
    return rangeDetail(this.start, count);
  }

  previous() {
    this.#navigate(-this.visibleDayCount);
  }

  next() {
    this.#navigate(this.visibleDayCount);
  }

  /**
   * Bring `date` into the visible range and consult it.
   * Event order: `rangechange` then `daychange`.
   * @param {string} date
   * @returns {string} the resolved active date, or "" when the range is invalid
   */
  goTo(date) {
    const count = this.visibleDayCount;
    if (!count) return "";
    const target = isDateValue(date) ? this.#clampToBounds(date) : this.start;
    this.#mutate(() => this.#moveTo(target, count));
    this.#commit();
    return this.activeDate;
  }

  /** Return to the reference window. Distinct from `min` and from `previous()`. */
  goHome() {
    return this.goTo(this.homeDate);
  }

  /**
   * Ask the source (or, failing that, the `nextrequest` event) for the next
   * known availability beyond the visible range. Never merged with `next()`.
   * @param {{after?:string}} [options]
   * @returns {Promise<string|null>}
   */
  async goToNextAvailability(options = {}) {
    if (!this.visibleDayCount) return null;
    const after = options.after ?? this.range.end;
    if (this.#sourceController.hasNext) {
      const date = await this.#sourceController.next({ after });
      if (date && isDateValue(date)) {
        this.goTo(date);
        return date;
      }
      return null;
    }
    this.dispatchEvent(new CustomEvent("nextrequest", { detail: { after } }));
    return null;
  }

  /**
   * Apply several settings as one transaction: no intermediate load or event.
   * @param {ConfigureOptions} [options]
   */
  configure(options = {}) {
    this.#mutate(() => {
      if (options.min !== undefined) this.min = options.min;
      if (options.max !== undefined) this.max = options.max;
      if (options.start !== undefined) this.start = options.start;
      if (options.dayCount !== undefined) this.dayCount = options.dayCount;
      if (options.layout !== undefined) this.layout = options.layout;
      if (options.value !== undefined) this.value = options.value;
      if (options.maxVisibleRows !== undefined) this.maxVisibleRows = options.maxVisibleRows;
      if (options.responsive !== undefined) this.responsive = options.responsive;
      if (options.homeDate !== undefined) this.homeDate = options.homeDate ?? "";
      if (options.responsiveBreakpoints !== undefined)
        this.responsiveBreakpoints = options.responsiveBreakpoints;
    });
    this.#reconcile({ pinActive: true });
  }

  async reload() {
    await this.#load();
  }

  /** @param {number} delta */
  #navigate(delta) {
    const count = this.visibleDayCount;
    if (!count) return;
    const next = clampStart(addDays(this.start, delta), this.min, this.max, count);
    if (next === this.start) return;
    this.#mutate(() => this.setAttribute("start", next));
    this.#commit();
  }

  /**
   * Move the window just enough to make `target` visible.
   * @param {string} target
   * @param {number} count
   */
  #moveTo(target, count) {
    const nextStart = ensureVisible(this.start, count, target, this.min, this.max);
    if (nextStart !== this.getAttribute("start")) this.setAttribute("start", nextStart);
    const nextActive = resolveActiveDate(nextStart, count, target);
    if (this.getAttribute("active-date") !== nextActive) this.setAttribute("active-date", nextActive);
  }

  /** @param {string} date */
  #clampToBounds(date) {
    let next = date;
    if (this.min && compareDates(next, this.min) < 0) next = this.min;
    if (this.max && compareDates(next, this.max) > 0) next = this.max;
    return next;
  }

  /**
   * @param {() => void} fn
   */
  #mutate(fn) {
    const wasBatching = this.#batching;
    this.#batching = true;
    try {
      fn();
    } finally {
      this.#batching = wasBatching;
    }
  }

  /**
   * Single reconciliation pass: normalize -> resolve count -> clamp/ensure
   * visible -> commit (render + load + events).
   * @param {{pinActive?:boolean,reload?:boolean}} [options]
   */
  #reconcile(options = {}) {
    const pinActive = options.pinActive ?? true;
    const reload = options.reload ?? true;
    const wasBatching = this.#batching;
    this.#batching = true;
    try {
      const count = this.visibleDayCount;
      const invalid = count === 0;
      this.toggleAttribute("data-invalid-range", invalid);
      if (!invalid) {
        const rawActive = this.getAttribute("active-date") || "";
        const previous = this.#lastRange;
        // Resolve the anchor against the *previous* range so a shrink cannot
        // clamp the consulted day to the new, shorter end before we move start.
        let anchor = this.start;
        if (pinActive) {
          if (previous?.dayCount && isDateValue(rawActive)) {
            anchor = resolveActiveDate(previous.start, previous.dayCount, rawActive);
          } else if (isDateValue(rawActive)) {
            anchor = rawActive;
          } else if (previous?.start) {
            anchor = previous.start;
          }
        }
        const nextStart = ensureVisible(this.start, count, anchor, this.min, this.max);
        if (nextStart !== this.getAttribute("start")) this.setAttribute("start", nextStart);
        if (pinActive && isDateValue(anchor)) {
          const nextActive = resolveActiveDate(nextStart, count, anchor);
          if (this.getAttribute("active-date") !== nextActive) this.setAttribute("active-date", nextActive);
        }
      }
    } finally {
      this.#batching = wasBatching;
    }
    if (wasBatching) return;
    this.#commit({ reload });
  }

  /**
   * Publish state: render, then `rangechange`, `daychange`, then reload.
   * @param {{reload?:boolean}} [options]
   */
  #commit(options = {}) {
    const reload = options.reload ?? true;
    const range = this.range;
    const count = this.visibleDayCount;
    const active = count ? this.activeDate : "";
    const previousRange = this.#lastRange;
    const first = previousRange === null;
    const rangeChanged =
      first ||
      range.start !== previousRange.start ||
      range.end !== previousRange.end ||
      range.dayCount !== previousRange.dayCount;
    const activeChanged = !first && this.#lastActiveDate !== null && active !== this.#lastActiveDate;
    this.#lastRange = range;
    this.#lastActiveDate = active;
    this.#queueRender();
    if (!first && rangeChanged) this.dispatchEvent(new CustomEvent("rangechange", { detail: range }));
    if (!first && activeChanged) {
      this.dispatchEvent(new CustomEvent("daychange", { detail: { activeDate: active } }));
    }
    if (reload && rangeChanged && count > 0) this.#load();
  }

  /** @param {ResizeObserverEntry[]} entries */
  #onResize(entries) {
    const entry = entries[entries.length - 1];
    const box = entry?.contentBoxSize?.[0];
    const hostWidth = box ? box.inlineSize : (entry?.contentRect.width ?? 0);
    // Capacity follows the projection's own width, not the host: the nav rail
    // is chrome and must not inflate the resolved day count.
    const width = this.#contentWidth() ?? hostWidth;
    const previous = this.visibleDayCount;
    this.#measuredWidth = width;
    if (this.visibleDayCount !== previous) this.#reconcile({ pinActive: true });
  }

  /** Width actually available to the projection, inside the nav rail. */
  #contentWidth() {
    const content = this.querySelector(".sp-content");
    return content ? content.getBoundingClientRect().width : null;
  }

  /** @param {string} date @param {boolean} emit */
  #setActiveDate(date, emit = true) {
    const count = this.visibleDayCount;
    if (!count) return;
    const resolved = resolveActiveDate(this.start, count, date);
    const before = this.activeDate;
    if (resolved === before && this.getAttribute("active-date") === resolved) return;
    this.setAttribute("active-date", resolved);
    this.#lastActiveDate = resolved;
    if (emit && resolved !== before) {
      this.dispatchEvent(new CustomEvent("daychange", { detail: { activeDate: resolved } }));
    }
  }

  async #load() {
    if (!this.source) return;
    if (!this.visibleDayCount) return;
    const range = this.range;
    this.#loading = true;
    this.#error = null;
    this.#queueRender();
    this.dispatchEvent(new CustomEvent("loadstart", { detail: range }));

    try {
      const result = await this.#sourceController.load(range);
      if (result === null) return;
      const days = Array.isArray(result)
        ? result
        : result && typeof result === "object" && "days" in result
          ? result.days
          : [];
      this.#days = normalizeDays(/** @type {SlotDay[]} */ (days));
      this.dispatchEvent(new CustomEvent("loadend", { detail: { ...range, days: this.days } }));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      this.#error = error;
      this.dispatchEvent(new CustomEvent("loaderror", { detail: { ...range, error } }));
    } finally {
      this.#loading = false;
      this.#queueRender();
    }
  }

  #queueRender() {
    if (this.#renderQueued) return;
    this.#renderQueued = true;
    queueMicrotask(() => {
      this.#renderQueued = false;
      if (this.isConnected) this.#render();
    });
  }

  /** @param {Element} element */
  #focusSelector(element) {
    if (element.classList.contains("sp-slot")) {
      const value = element.getAttribute("data-value") || "";
      return value ? `.sp-slot[data-value="${CSS.escape(value)}"]` : "";
    }
    if (element.classList.contains("sp-strip-day")) {
      const date = element.getAttribute("data-date") || "";
      return date ? `.sp-strip-day[data-date="${CSS.escape(date)}"]` : "";
    }
    if (element.classList.contains("sp-nav-prev")) return ".sp-nav-prev";
    if (element.classList.contains("sp-nav-next")) return ".sp-nav-next";
    if (element.classList.contains("sp-home")) return ".sp-home";
    if (element.classList.contains("sp-range-empty-availability")) return ".sp-range-empty-availability";
    if (element.classList.contains("sp-range-empty-next")) return ".sp-range-empty-next";
    if (element.classList.contains("sp-more-button")) return ".sp-more-button";
    if (element.classList.contains("sp-notice")) {
      const index = element.getAttribute("data-day-index") || "";
      return index ? `.sp-notice[data-day-index="${CSS.escape(index)}"]` : "";
    }
    return "";
  }

  #render() {
    const focused = document.activeElement;
    const fallbackSelector =
      focused instanceof Element && this.contains(focused) ? this.#focusSelector(focused) : "";
    const pendingSelector = this.#pendingFocus;
    this.#pendingFocus = "";

    const count = this.visibleDayCount;
    const invalid = count === 0;
    const days = count ? visibleDays(this.#days, this.start, count) : [];
    // Resolve at render time so `setDefaultMessages()` reaches live instances.
    const messages = resolveMessages(this.#messages);
    const locale = this.locale;
    const canPrevious = !invalid && (!this.min || compareDates(this.start, this.min) > 0);
    const canNext = !invalid && (!this.max || compareDates(rangeEnd(this.start, count), this.max) < 0);

    // A range is "empty" only when it has no meaningful day content at all.
    // A notice without slots keeps the projection so the exception stays visible.
    const empty = !this.#loading && !this.#error && !hasDayContent(days);

    let content;
    let hasOverflow = false;
    if (empty) {
      content = rangeEmpty({
        start: this.range.start,
        end: this.range.end,
        invalid,
        canNext,
        nextAvailability: this.hasAttribute("next-availability"),
        locale,
        messages,
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
        locale,
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
        locale,
      });
      content = rendered.html;
      hasOverflow = rendered.hasOverflow;
    }

    const status = this.#loading
      ? `<div class="sp-status" role="status">${escapeHtml(messages.loading)}</div>`
      : this.#error
        ? `<div class="sp-status sp-status-error" role="status">${escapeHtml(String(this.#error))}</div>`
        : "";

    // `home` is a shortcut to a reference date, not the mirror of `next`: it
    // stays out of the symmetric prev/next rail and only appears when the
    // reference date is actually outside the visible range.
    const homeInRange =
      !invalid &&
      compareDates(this.homeDate, this.range.start) >= 0 &&
      compareDates(this.homeDate, this.range.end) <= 0;
    const home = this.hasAttribute("home-date") && !invalid && !homeInRange;

    this.style.setProperty("--_sp-day-count", String(Math.max(1, count)));
    this.innerHTML = `<div class="sp-shell" data-layout="${this.layout}">
      <div class="sp-projection">
        <button type="button" class="sp-nav sp-nav-prev" aria-label="${escapeAttr(messages.previous)}"${canPrevious ? "" : " disabled"}>${PREV_ICON}</button>
        <div class="sp-content">
          ${status}
          ${content}
          ${
            hasOverflow
              ? `<div class="sp-more"><button type="button" class="sp-more-button">${escapeHtml(this.expanded ? messages.showLess : messages.showMore)}</button></div>`
              : ""
          }
        </div>
        <button type="button" class="sp-nav sp-nav-next" aria-label="${escapeAttr(messages.next)}"${canNext ? "" : " disabled"}>${NEXT_ICON}</button>
      </div>
      ${home ? `<div class="sp-shortcuts"><button type="button" class="sp-home">${escapeHtml(messages.home)}</button></div>` : ""}
    </div>`;

    const selector = pendingSelector || fallbackSelector;
    if (selector) {
      const target = this.querySelector(selector);
      if (target instanceof HTMLElement) target.focus({ preventScroll: true });
    }
  }

  /** @param {MouseEvent} event */
  #onClick(event) {
    const target = /** @type {Element|null} */ (event.target instanceof Element ? event.target : null);
    if (!target) return;

    if (target.closest(".sp-nav-prev")) return this.previous();
    if (target.closest(".sp-nav-next")) return this.next();
    if (target.closest(".sp-home")) {
      // The shortcut disappears once the reference date is back in range, so
      // hand focus to the roving slot instead of losing it with the button.
      this.#pendingFocus = '.sp-slot[tabindex="0"]';
      return this.goHome();
    }
    if (target.closest(".sp-nav-availability")) {
      void this.goToNextAvailability();
      return;
    }
    if (target.closest(".sp-range-empty-availability")) {
      void this.goToNextAvailability();
      return;
    }
    if (target.closest(".sp-range-empty-next")) return this.next();

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

    // `noticeactivate` belongs to the explicit control, never to displayed
    // text, so there is no mouse-only activation.
    const notice = target.closest(".sp-notice[data-day-index]");
    if (notice instanceof HTMLElement) {
      const dayIndex = Number(notice.getAttribute("data-day-index"));
      const day = visibleDays(this.#days, this.start, this.visibleDayCount)[dayIndex];
      if (day?.notice) {
        this.dispatchEvent(
          new CustomEvent("noticeactivate", {
            detail: { day, notice: day.notice, anchor: notice },
            bubbles: true,
          }),
        );
      }
      return;
    }

    const slotButton = target.closest(".sp-slot");
    if (slotButton instanceof HTMLButtonElement) this.#activateSlot(slotButton);
  }

  /** @param {KeyboardEvent} event */
  #onKeyDown(event) {
    if (!(event.target instanceof HTMLButtonElement)) return;
    const button = event.target;
    if (button.classList.contains("sp-strip-day")) return this.#onStripKeyDown(event);
    if (!button.classList.contains("sp-slot")) return;

    /** @type {Record<string,FocusDirection>} */
    const map = {
      ArrowUp: "up",
      ArrowDown: "down",
      ArrowLeft: "left",
      ArrowRight: "right",
      Home: "home",
      End: "end",
    };
    const direction = map[event.key];
    if (!direction) return;
    event.preventDefault();

    const allDays = visibleDays(this.#days, this.start, this.visibleDayCount);
    if (this.layout === "day") {
      this.#onPanelKeyDown(event, allDays, direction);
      return;
    }

    // Move focus within the rendered rows only, otherwise the target button
    // does not exist in the DOM and focus would be lost.
    const { days } = collapsedDays(allDays, this.maxVisibleRows, this.expanded);
    const current = {
      dayIndex: Number(button.dataset.dayIndex),
      slotIndex: Number(button.dataset.slotIndex),
    };
    const next = moveFocus(days, current, direction);
    const nextDay = days[next.dayIndex];
    const nextSlot = nextDay?.slots[next.slotIndex];
    if (!nextSlot || nextSlot.disabled) return;

    const value = slotValue(nextDay.date, nextSlot.start);
    this.#focusedValue = value;
    this.#pendingFocus = `.sp-slot[data-value="${CSS.escape(value)}"]`;
    this.#render();
  }

  /** @param {KeyboardEvent} event */
  #onStripKeyDown(event) {
    /** @type {Record<string,number|string>} */
    const map = { ArrowLeft: -1, ArrowRight: 1, Home: "home", End: "end" };
    const action = map[event.key];
    if (action === undefined) return;
    event.preventDefault();

    const days = visibleDays(this.#days, this.start, this.visibleDayCount);
    const currentIndex = Math.max(
      0,
      days.findIndex((day) => day.date === this.activeDate),
    );
    let nextIndex = currentIndex;
    if (action === "home") nextIndex = 0;
    else if (action === "end") nextIndex = days.length - 1;
    else if (typeof action === "number")
      nextIndex = Math.max(0, Math.min(days.length - 1, currentIndex + action));

    const next = days[nextIndex];
    if (!next || next.date === this.activeDate) {
      const same = this.querySelector(`.sp-strip-day[data-date="${CSS.escape(this.activeDate)}"]`);
      if (same instanceof HTMLButtonElement) same.focus();
      return;
    }
    this.#pendingFocus = `.sp-strip-day[data-date="${CSS.escape(next.date)}"]`;
    this.#setActiveDate(next.date);
  }

  /**
   * @param {KeyboardEvent} event
   * @param {SlotDay[]} days
   * @param {string} direction
   */
  #onPanelKeyDown(event, days, direction) {
    if (!(event.target instanceof HTMLButtonElement)) return;
    const button = event.target;
    const activeIndex = Math.max(
      0,
      days.findIndex((day) => day.date === this.activeDate),
    );
    const active = days[activeIndex];
    if (!active) return;
    const enabled = active.slots
      .map((slot, slotIndex) => ({ slot, slotIndex }))
      .filter(({ slot }) => !slot.disabled);
    if (!enabled.length) return;

    const currentSlotIndex = Number(button.dataset.slotIndex);
    let position = enabled.findIndex(({ slotIndex }) => slotIndex === currentSlotIndex);
    if (position < 0) {
      const currentValue = button.getAttribute("data-value") || "";
      position = Math.max(
        0,
        enabled.findIndex(
          ({ slot }) =>
            slotValue(active.date, slot.start) === (this.#focusedValue || this.value || currentValue),
        ),
      );
    }
    let nextPosition = position;
    if (direction === "home") nextPosition = 0;
    else if (direction === "end") nextPosition = enabled.length - 1;
    else if (direction === "left" || direction === "up") nextPosition = Math.max(0, position - 1);
    else nextPosition = Math.min(enabled.length - 1, position + 1);

    const next = enabled[nextPosition];
    if (!next) return;
    const value = slotValue(active.date, next.slot.start);
    this.#focusedValue = value;
    this.#pendingFocus = `.sp-slot[data-value="${CSS.escape(value)}"]`;
    this.#render();
  }

  /** @param {HTMLButtonElement} button */
  #activateSlot(button) {
    if (button.disabled) return;
    const dayIndex = Number(button.dataset.dayIndex);
    const slotIndex = Number(button.dataset.slotIndex);
    const day = visibleDays(this.#days, this.start, this.visibleDayCount)[dayIndex];
    const slot = day?.slots[slotIndex];
    if (!day || !slot || slot.disabled) return;

    const value = slotValue(day.date, slot.start);
    this.#pendingFocus = `.sp-slot[data-value="${CSS.escape(value)}"]`;
    // The consulted day follows the last explicitly targeted slot,
    // so switching projections keeps showing the selected day.
    this.#setActiveDate(day.date);
    this.value = value;
    this.#focusedValue = value;
    this.dispatchEvent(new CustomEvent("slotactivate", { detail: { value, day, slot } }));
  }
}
