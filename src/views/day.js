import { toUtcDate } from "../date.js";
import { slotValue } from "../model.js";
import {
  dayEmpty,
  escapeAttr,
  escapeHtml,
  noticeButton,
  rovingValue,
  slotButton,
  slotCountText,
} from "./shared.js";

const UTC_FORMAT = { timeZone: "UTC" };

/** @typedef {import("../model.js").SlotDay} SlotDay */
/** @typedef {import("./shared.js").SlotCountMessages & {empty:string,days:string}} DayMessages */

/**
 * Day projection: a strip of days plus the slots of the consulted day.
 * The strip uses aria-pressed (consulted day), never aria-current="date".
 * Today stays independently discoverable via data-today.
 * @param {{visible:SlotDay[],activeDate:string,today:string,value:string,focusedValue:string,messages:DayMessages,locale:string}} options
 */
export function renderDay({ visible, activeDate, today, value, focusedValue, messages, locale }) {
  const formatterStripDay = new Intl.DateTimeFormat(locale, { weekday: "short", ...UTC_FORMAT });
  const formatterStripDate = new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    ...UTC_FORMAT,
  });
  const formatterPanelDay = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...UTC_FORMAT,
  });

  const activeIndex = Math.max(
    0,
    visible.findIndex((day) => day.date === activeDate),
  );
  const active = visible[activeIndex];

  const strip = visible
    .map(
      /** @param {SlotDay} day @param {number} dayIndex */ (day, dayIndex) => {
        const date = toUtcDate(day.date);
        const pressed = day.date === active.date;
        const isToday = day.date === today;
        const count = slotCountText(day.slots.length, messages);
        return `<button type="button" class="sp-strip-day" data-date="${escapeAttr(day.date)}" data-day-index="${dayIndex}" aria-pressed="${pressed ? "true" : "false"}"${isToday ? " data-today" : ""} tabindex="${pressed ? 0 : -1}">
        <span class="sp-strip-weekday">${escapeHtml(formatterStripDay.format(date))}</span>
        <strong class="sp-strip-date">${escapeHtml(formatterStripDate.format(date))}</strong>
        <span class="sp-strip-count" aria-hidden="true">${escapeHtml(count)}</span>
        <span class="sp-visually-hidden">${escapeHtml(`${formatterPanelDay.format(date)}: ${count}`)}</span>
      </button>`;
      },
    )
    .join("");

  const enabled = active.slots
    .filter(/** @param {import("../model.js").Slot} slot */ (slot) => !slot.disabled)
    .map(/** @param {import("../model.js").Slot} slot */ (slot) => slotValue(active.date, slot.start));
  const firstEnabled = enabled[0] || "";
  const activeFocus = rovingValue(enabled, focusedValue, value, firstEnabled);

  let panelBody;
  if (active.slots.length === 0) {
    const notice = active.notice
      ? `<div class="sp-panel-notice"><strong class="sp-panel-notice-label">${escapeHtml(active.notice.label)}</strong>${active.notice.description ? `<p>${escapeHtml(active.notice.description)}</p>` : ""}</div>`
      : "";
    panelBody = `${notice}${dayEmpty(messages.empty)}`;
  } else {
    const slots = active.slots
      .map(
        /** @param {import("../model.js").Slot} slot @param {number} slotIndex */ (slot, slotIndex) => {
          const slotVal = slotValue(active.date, slot.start);
          return slotButton({
            date: active.date,
            slot,
            dayIndex: activeIndex,
            slotIndex,
            selected: slotVal === value,
            tabbed: slotVal === activeFocus && !slot.disabled,
          });
        },
      )
      .join("");
    panelBody = `<div class="sp-panel-slots">${slots}</div>`;
  }

  const panelNoticeDot =
    active.slots.length > 0 && active.notice ? noticeButton({ dayIndex: activeIndex, ...active.notice }) : "";

  const html = `<div class="sp-daystrip" role="group" aria-label="${escapeAttr(messages.days)}">${strip}</div>
    <section class="sp-panel" data-date="${escapeAttr(active.date)}">
      <header class="sp-panel-header">
        <strong class="sp-panel-title">${escapeHtml(formatterPanelDay.format(toUtcDate(active.date)))}</strong>
        ${panelNoticeDot}
      </header>
      ${panelBody}
    </section>`;

  return { html };
}
