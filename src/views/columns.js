import { toUtcDate } from "../date.js";
import { collapsedDays, slotValue } from "../model.js";
import {
  dayEmpty,
  enabledValues,
  escapeAttr,
  escapeHtml,
  noticeButton,
  rovingValue,
  slotButton,
} from "./shared.js";

const UTC_FORMAT = { timeZone: "UTC" };

/** @typedef {import("../model.js").SlotDay} SlotDay */
/** @typedef {import("./shared.js").SlotCountMessages & {empty:string}} ColumnsMessages */

/**
 * Columns projection: N civil days side by side with their slots.
 * Empty days render a real DOM empty state (messages.empty); alignment
 * placeholders are aria-hidden and only used when the day has slots
 * but fewer rows than the visible grid.
 * @param {{visible:SlotDay[],value:string,focusedValue:string,maxVisibleRows:number,expanded:boolean,messages:ColumnsMessages,locale:string}} options
 */
export function renderColumns({ visible, value, focusedValue, maxVisibleRows, expanded, messages, locale }) {
  const formatterDay = new Intl.DateTimeFormat(locale, { weekday: "short", ...UTC_FORMAT });
  const formatterDate = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", ...UTC_FORMAT });
  // Collapse before computing roving focus: the single tabbable value must be
  // one of the rendered buttons, never a slot hidden by the visible row limit.
  const { days: collapsed, rows, hasOverflow } = collapsedDays(visible, maxVisibleRows, expanded);

  const enabled = enabledValues(collapsed);
  const firstEnabled = enabled[0] || "";
  const activeFocus = rovingValue(enabled, focusedValue, value, firstEnabled);

  const html = collapsed
    .map(
      /** @param {SlotDay} day @param {number} dayIndex */ (day, dayIndex) => {
        const date = toUtcDate(day.date);
        const weekday = formatterDay.format(date);
        const displayDate = formatterDate.format(date);
        const notice = day.notice ? noticeButton({ dayIndex, ...day.notice }) : "";

        let body;
        if (day.slots.length === 0) {
          body = dayEmpty(messages.empty);
        } else {
          const slots = day.slots;
          const slotMarkup = slots
            .map(
              /** @param {import("../model.js").Slot} slot @param {number} slotIndex */ (slot, slotIndex) => {
                const slotVal = slotValue(day.date, slot.start);
                return slotButton({
                  date: day.date,
                  slot,
                  dayIndex,
                  slotIndex,
                  selected: slotVal === value,
                  tabbed: slotVal === activeFocus && !slot.disabled,
                });
              },
            )
            .join("");
          const empties = Array.from(
            { length: Math.max(0, rows - slots.length) },
            () => '<span class="sp-empty" aria-hidden="true">–</span>',
          ).join("");
          body = `<div class="sp-slots">${slotMarkup}${empties}</div>`;
        }

        return `<section class="sp-day" data-date="${escapeAttr(day.date)}">
        <header class="sp-day-header">
          <span class="sp-weekday">${escapeHtml(weekday)}</span>
          <strong class="sp-date">${escapeHtml(displayDate)}</strong>
          ${notice}
        </header>
        ${body}
      </section>`;
      },
    )
    .join("");

  return {
    html: `<div class="sp-grid" role="presentation">${html}</div>`,
    hasOverflow,
  };
}
