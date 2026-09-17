import { addDays, compareDates, isDateValue, rangeEnd, todayValue, toUtcDate } from "./date.js";
import { clampStart, moveFocus, normalizeDays, rangeDetail, slotValue, visibleDays } from "./model.js";
import { resolveMessages } from "./messages.js";
import { SlotSourceController } from "./source.js";

const PREV_ICON =
  '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const NEXT_ICON =
  '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m7.5 4 6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** @typedef {import("./model.js").SlotDay} SlotDay */

/**
 * Inline appointment slot chooser.
 *
 * Canonical public values:
 * - dates: YYYY-MM-DD
 * - times: HH:mm
 * - value: YYYY-MM-DDTHH:mm
 */
export class SlotPickerElement extends HTMLElement {
  static observedAttributes = ["start", "day-count", "min", "max", "value", "max-visible-rows", "expanded"];

  /** @type {SlotDay[]} */
  #days = [];
  #sourceController = new SlotSourceController();
  #messages = resolveMessages();
  #loading = false;
  #error = null;
  #focusedValue = "";
  #renderQueued = false;

  constructor() {
    super();
    this.addEventListener("click", (event) => this.#onClick(event));
    this.addEventListener("keydown", (event) => this.#onKeyDown(event));
  }

  connectedCallback() {
    if (!this.hasAttribute("start")) this.start = todayValue();
    if (!this.hasAttribute("day-count")) this.dayCount = 5;
    this.#queueRender();
    this.#load();
  }

  disconnectedCallback() {
    this.#sourceController.abort();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    this.#queueRender();
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

  #navigate(delta) {
    const requested = addDays(this.start, delta);
    const next = clampStart(requested, this.min, this.max, this.dayCount);
    if (next === this.start) return;
    this.start = next;
    this.dispatchEvent(new CustomEvent("rangechange", { detail: this.range }));
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
      const days = Array.isArray(result) ? result : result && typeof result === "object" && "days" in result ? result.days : [];
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

  #render() {
    const days = visibleDays(this.#days, this.start, this.dayCount);
    const locale = this.lang || document.documentElement.lang || "en";
    const formatterDay = new Intl.DateTimeFormat(locale, { weekday: "short" });
    const formatterDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" });
    const maxRows = Math.max(0, ...days.map((day) => day.slots.length));
    const visibleRows = this.expanded ? maxRows : Math.min(maxRows, this.maxVisibleRows);
    const hasOverflow = maxRows > this.maxVisibleRows;
    const canPrevious = !this.min || compareDates(this.start, this.min) > 0;
    const canNext = !this.max || compareDates(rangeEnd(this.start, this.dayCount), this.max) < 0;

    const firstSlot = days.flatMap((day) => day.slots.map((slot) => slotValue(day.date, slot.start)))[0] || "";
    const activeFocus = this.#focusedValue || this.value || firstSlot;

    const dayMarkup = days
      .map((day, dayIndex) => {
        const date = toUtcDate(day.date);
        const weekday = formatterDay.format(date);
        const displayDate = formatterDate.format(date);
        const slots = day.slots.slice(0, visibleRows);

        const slotMarkup = slots
          .map((slot, slotIndex) => {
            const value = slotValue(day.date, slot.start);
            const selected = value === this.value;
            const tabindex = value === activeFocus ? 0 : -1;
            const description = slot.description ? ` aria-description="${escapeAttr(slot.description)}"` : "";
            return `<button type="button" class="sp-slot" role="gridcell" data-day-index="${dayIndex}" data-slot-index="${slotIndex}" data-value="${value}" aria-selected="${selected}" tabindex="${tabindex}"${slot.disabled ? " disabled" : ""}${description}>${escapeHtml(slot.start)}</button>`;
          })
          .join("");

        const empties = Array.from({ length: Math.max(0, visibleRows - slots.length) }, () => '<span class="sp-empty" aria-hidden="true">–</span>').join("");

        const notice = day.notice
          ? `<button type="button" class="sp-notice" data-day-index="${dayIndex}" aria-label="${escapeAttr(day.notice.description || day.notice.label)}"><span class="sp-notice-dot" aria-hidden="true"></span><span class="sp-visually-hidden">${escapeHtml(day.notice.label)}</span></button>`
          : "";

        return `<section class="sp-day" role="row" data-date="${day.date}">
          <header class="sp-day-header">
            <span class="sp-weekday">${escapeHtml(weekday)}</span>
            <strong class="sp-date">${escapeHtml(displayDate)}</strong>
            ${notice}
          </header>
          <div class="sp-slots" role="presentation">${slotMarkup}${empties}</div>
        </section>`;
      })
      .join("");

    const status = this.#loading
      ? `<div class="sp-status" role="status">${escapeHtml(this.#messages.loading)}</div>`
      : this.#error
        ? `<div class="sp-status sp-status-error" role="status">${escapeHtml(String(this.#error))}</div>`
        : "";

    this.innerHTML = `<div class="sp-shell">
      <button type="button" class="sp-nav sp-nav-prev" aria-label="${escapeAttr(this.#messages.previous)}"${canPrevious ? "" : " disabled"}>${PREV_ICON}</button>
      <div class="sp-content">
        ${status}
        <div class="sp-grid" role="grid" aria-label="Appointment availability">${dayMarkup}</div>
        ${
          hasOverflow
            ? `<div class="sp-more"><button type="button" class="sp-more-button">${escapeHtml(this.expanded ? this.#messages.showLess : this.#messages.showMore)}</button></div>`
            : ""
        }
      </div>
      <button type="button" class="sp-nav sp-nav-next" aria-label="${escapeAttr(this.#messages.next)}"${canNext ? "" : " disabled"}>${NEXT_ICON}</button>
    </div>`;
  }

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

    const notice = target.closest(".sp-notice");
    if (notice instanceof HTMLElement) {
      const dayIndex = Number(notice.dataset.dayIndex);
      const day = visibleDays(this.#days, this.start, this.dayCount)[dayIndex];
      if (day?.notice) this.dispatchEvent(new CustomEvent("noticeactivate", { detail: { day, notice: day.notice } }));
      return;
    }

    const slotButton = target.closest(".sp-slot");
    if (slotButton instanceof HTMLButtonElement) this.#activateSlot(slotButton);
  }

  #onKeyDown(event) {
    if (!(event.target instanceof HTMLButtonElement) || !event.target.classList.contains("sp-slot")) return;
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

    const days = visibleDays(this.#days, this.start, this.dayCount);
    const current = {
      dayIndex: Number(event.target.dataset.dayIndex),
      slotIndex: Number(event.target.dataset.slotIndex),
    };
    const next = moveFocus(days, current, direction);
    const nextDay = days[next.dayIndex];
    const nextSlot = nextDay?.slots[next.slotIndex];
    if (!nextSlot) return;

    const value = slotValue(nextDay.date, nextSlot.start);
    this.#focusedValue = value;
    this.#render();
    const button = this.querySelector(`.sp-slot[data-value="${CSS.escape(value)}"]`);
    if (button instanceof HTMLButtonElement) button.focus();
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
    this.value = value;
    this.#focusedValue = value;
    this.dispatchEvent(new CustomEvent("slotactivate", { detail: { value, day, slot } }));
  }
}

/** @param {string} value */
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] || char);
}

/** @param {string} value */
function escapeAttr(value) {
  return escapeHtml(value);
}
