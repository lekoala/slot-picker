import { addDays, compareDates, isDateValue, rangeEnd, todayValue } from "./date.js";
import { resolveMessages } from "./messages.js";
import {
  clampStart,
  collapsedDays,
  moveFocus,
  normalizeDays,
  rangeDetail,
  resolveActiveDate,
  slotValue,
  visibleDays,
} from "./model.js";
import { SlotSourceController } from "./source.js";
import { renderColumns } from "./views/columns.js";
import { renderDay } from "./views/day.js";
import { escapeAttr, escapeHtml } from "./views/shared.js";

const PREV_ICON =
  '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const NEXT_ICON =
  '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** @typedef {import("./model.js").SlotDay} SlotDay */
/** @typedef {"up"|"down"|"left"|"right"|"home"|"end"} FocusDirection */

/**
 * Inline appointment slot chooser.
 *
 * Canonical public values:
 * - dates: YYYY-MM-DD
 * - times: HH:mm
 * - value: YYYY-MM-DDTHH:mm
 *
 * State:
 * - start/dayCount: visible civil range
 * - activeDate: last day explicitly targeted (day click or slot activation)
 * - focusedValue: keyboard target, never a selection
 * - value: selected local slot value
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
  ];

  /** @type {SlotDay[]} */
  #days = [];
  #sourceController = new SlotSourceController();
  #messages = resolveMessages();
  #loading = false;
  /** @type {unknown} */
  #error = null;
  #focusedValue = "";
  #renderQueued = false;
  #initializing = false;
  #pendingFocus = "";

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
    this.#queueRender();
    this.#load();
  }

  disconnectedCallback() {
    this.#sourceController.abort();
  }

  /**
   * @param {string} name
   * @param {string|null} oldValue
   * @param {string|null} newValue
   */
  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    this.#queueRender();
    if (this.#initializing) return;
    if (this.isConnected && ["start", "day-count", "min", "max"].includes(name)) this.#load();
  }

  get start() {
    const value = this.getAttribute("start") || todayValue();
    return isDateValue(value) ? value : todayValue();
  }

  set start(value) {
    if (!isDateValue(value)) throw new TypeError("start must be YYYY-MM-DD");
    const next = clampStart(value, this.min, this.max, this.dayCount);
    this.setAttribute("start", next);
  }

  get dayCount() {
    const value = Number.parseInt(this.getAttribute("day-count") || "5", 10);
    return Number.isFinite(value) ? Math.max(1, Math.min(14, value)) : 5;
  }

  set dayCount(value) {
    const next = Math.max(1, Math.min(14, Number(value) || 5));
    this.setAttribute("day-count", String(next));
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
    const raw = this.getAttribute("active-date") || "";
    const base = isDateValue(raw) ? raw : this.start;
    return resolveActiveDate(this.start, this.dayCount, base);
  }

  set activeDate(value) {
    if (!value) this.removeAttribute("active-date");
    else if (isDateValue(value)) this.setAttribute("active-date", value);
    else throw new TypeError("active-date must be YYYY-MM-DD or empty");
  }

  get layout() {
    const value = this.getAttribute("layout") || "columns";
    return value === "day" ? "day" : "columns";
  }

  set layout(value) {
    if (value !== "columns" && value !== "day") throw new TypeError('layout must be "columns" or "day"');
    this.setAttribute("layout", value);
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

  /** @param {Record<string,string>|null} value */
  set messages(value) {
    this.#messages = resolveMessages(value);
    this.#queueRender();
  }

  get range() {
    return rangeDetail(this.start, this.dayCount);
  }

  previous() {
    this.#navigate(-this.dayCount);
  }

  next() {
    this.#navigate(this.dayCount);
  }

  async reload() {
    await this.#load();
  }

  /** @param {number} delta */
  #navigate(delta) {
    const before = this.activeDate;
    const requested = addDays(this.start, delta);
    const next = clampStart(requested, this.min, this.max, this.dayCount);
    if (next === this.start) return;
    this.start = next;
    this.dispatchEvent(new CustomEvent("rangechange", { detail: this.range }));
    const after = this.activeDate;
    if (after !== before) {
      this.dispatchEvent(new CustomEvent("daychange", { detail: { activeDate: after } }));
    }
  }

  /** @param {string} date @param {boolean} emit */
  #setActiveDate(date, emit = true) {
    const resolved = resolveActiveDate(this.start, this.dayCount, date);
    const before = this.activeDate;
    if (resolved === before && this.getAttribute("active-date") === resolved) return;
    this.setAttribute("active-date", resolved);
    if (emit && resolved !== before) {
      this.dispatchEvent(new CustomEvent("daychange", { detail: { activeDate: resolved } }));
    }
  }

  async #load() {
    if (!this.source) return;
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

    const days = visibleDays(this.#days, this.start, this.dayCount);
    const locale = this.lang || document.documentElement.lang || "en";
    const canPrevious = !this.min || compareDates(this.start, this.min) > 0;
    const canNext = !this.max || compareDates(rangeEnd(this.start, this.dayCount), this.max) < 0;

    let content;
    let hasOverflow = false;
    if (this.layout === "day") {
      content = renderDay({
        visible: days,
        activeDate: this.activeDate,
        today: todayValue(),
        value: this.value,
        focusedValue: this.#focusedValue,
        messages: this.#messages,
        locale,
      }).html;
    } else {
      const rendered = renderColumns({
        visible: days,
        value: this.value,
        focusedValue: this.#focusedValue,
        maxVisibleRows: this.maxVisibleRows,
        expanded: this.expanded,
        messages: this.#messages,
        locale,
      });
      content = rendered.html;
      hasOverflow = rendered.hasOverflow;
    }

    const status = this.#loading
      ? `<div class="sp-status" role="status">${escapeHtml(this.#messages.loading)}</div>`
      : this.#error
        ? `<div class="sp-status sp-status-error" role="status">${escapeHtml(String(this.#error))}</div>`
        : "";

    this.style.setProperty("--_sp-day-count", String(this.dayCount));
    this.innerHTML = `<div class="sp-shell" data-layout="${this.layout}">
      <button type="button" class="sp-nav sp-nav-prev" aria-label="${escapeAttr(this.#messages.previous)}"${canPrevious ? "" : " disabled"}>${PREV_ICON}</button>
      <div class="sp-content">
        ${status}
        ${content}
        ${
          hasOverflow
            ? `<div class="sp-more"><button type="button" class="sp-more-button">${escapeHtml(this.expanded ? this.#messages.showLess : this.#messages.showMore)}</button></div>`
            : ""
        }
      </div>
      <button type="button" class="sp-nav sp-nav-next" aria-label="${escapeAttr(this.#messages.next)}"${canNext ? "" : " disabled"}>${NEXT_ICON}</button>
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

    const notice = target.closest(".sp-notice");
    if (notice instanceof HTMLElement) {
      const dayIndex = Number(notice.getAttribute("data-day-index"));
      const day = visibleDays(this.#days, this.start, this.dayCount)[dayIndex];
      if (day?.notice)
        this.dispatchEvent(new CustomEvent("noticeactivate", { detail: { day, notice: day.notice } }));
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

    const allDays = visibleDays(this.#days, this.start, this.dayCount);
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

    const days = visibleDays(this.#days, this.start, this.dayCount);
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
    const day = visibleDays(this.#days, this.start, this.dayCount)[dayIndex];
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
