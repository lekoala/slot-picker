# @lekoala/slot-picker

A small, native-first Web Component for choosing appointment slots across a short civil date range.

It deliberately sits between `@lekoala/date-picker` and `@lekoala/calendar`:

- more structured than a date picker because it displays times;
- much smaller than a scheduler because it does not render events/resources;
- application-neutral: booking workflows stay outside.

## Basic usage

```html
<link rel="stylesheet" href="./dist/slot-picker.css">
<script src="./dist/slot-picker.js"></script>

<slot-picker id="slots" start="2026-11-17" day-count="5"></slot-picker>
<slot-picker id="day" start="2026-11-17" day-count="5" layout="day"></slot-picker>
```

```js
const picker = document.querySelector("#slots");

picker.days = [
  {
    date: "2026-11-17",
    slots: [
      { start: "13:35", end: "14:05" },
      { start: "19:00", end: "19:30" }
    ]
  },
  {
    date: "2026-11-21",
    slots: [],
    notice: {
      label: "Exceptionally unavailable",
      description: "The practitioner is exceptionally unavailable that day."
    }
  }
];

picker.addEventListener("slotactivate", ({ detail }) => {
  console.log(detail.value, detail.slot);
});
```

## Remote source

```js
picker.source = async ({ start, end, signal }) => {
  const response = await fetch(`/availability?start=${start}&end=${end}`, { signal });
  return response.json();
};
```

A source may also be an object that additionally resolves the next known
availability beyond the visible range:

```js
picker.source = {
  load({ start, end, signal }) {
    // availability for the visible window
  },
  async next({ after, signal }) {
    // a date after `after`, or null
  }
};

await picker.goToNextAvailability(); // -> source.next({ after: picker.range.end })
```

Without `source.next`, `goToNextAvailability()` dispatches `nextrequest`
(`{ after }`) and returns `null`; the consumer then calls `picker.goTo(date)`.
When the source does answer, it resolves to the destination actually reached
(clamped to `min`/`max`), never the raw source proposal.
The source returns normalized day data. Backend query conventions and business
metadata stay outside core.

## Navigation

```html
<slot-picker
  start="2026-11-17"
  day-count="7"
  responsive
  min="2026-11-17"
  max="2027-03-31"
  home-date="2026-11-17"
></slot-picker>
```

- `day-count` is the maximum intention; `visibleDayCount` is the capacity actually resolved from `min`/`max` and the component's own width (opt-in via `responsive`, overridable with `responsiveBreakpoints`, observed with `ResizeObserver`).
- `min`/`max` are hard bounds. `min > max` is an invalid configuration: `range` becomes `{ start: "", end: "", dayCount: 0 }`, `data-invalid-range` is set, and the source is never called.
- `home-date` is a reference date for `goHome()`, never confused with `min`.

```js
picker.goTo("2026-12-08");   // bring a date into view and consult it
picker.goHome();             // reference window
picker.goToNextAvailability(); // next known availability (may skip windows)
picker.previous();           // adjacent window
picker.next();
picker.configure({ min: "2026-11-17", max: "2027-03-31", dayCount: 7, responsive: true, homeDate: "2026-11-17" });
```

`configure()` is transactional: it validates every option before applying, so an
invalid option throws and leaves the component unchanged. A valid batch applies
as one pass: one reload and one final event pair, never one per setting. Event
order is stable: `rangechange`, then `daychange`, then any reload. Resizing and
navigating change the range but never `value`.

Navigation chrome is a symmetric `previous`/`next` pair framing the projection.
`home` is a persistent capability but not their mirror: it lives in an
auxiliary, start-aligned shortcut and only appears while `homeDate` is outside
the visible range, so it never clutters the initial window. There is no "go to
end". `goToNextAvailability()` is contextual and appears in the range empty
state when `next-availability` is set, because that is exactly where a real
business search makes sense. It is never merged with `next()`. The responsive
capacity is resolved from the projection's own width, inside the rail.

A window with no slot and no notice renders a range empty state
(`.sp-range-empty`) with a `next()` action, plus the availability action when
`next-availability` is set. A window with a notice but no slots keeps its
normal projection, so "exceptionally unavailable" stays distinct from
"no availability".

A day notice is never a fake slot. `notice-display` chooses how it projects:

- `action` (default) renders only a real control (the dot button) with an
  accessible name; no inline text. It emits `noticeactivate` so the
  application opens a modal, a popover or anything else.
- `inline` additionally renders the readable notice content: a compact label in
  `columns` (description kept in the DOM, revealed by themes) and the full
  label + description in `day`. The text itself is never interactive, and it
  never overflows its column.
- `none` renders nothing; the application owns the notice elsewhere.

```js
picker.addEventListener("noticeactivate", ({ detail }) => {
  // detail = { day, notice, anchor }
  openModal({ title: detail.notice.label, body: detail.notice.description });
  // or: showPopover({ anchor: detail.anchor, ...detail.notice });
});
```

`noticeactivate` bubbles, has no default behavior, and is only emitted from an
explicit control. The component never embeds a tooltip, popover or floating
engine.

## Locales

`Intl` already localizes weekday and month names from the component's `locale`
(or `lang`). Message packs only provide the UI strings:

```js
import fr from "@lekoala/slot-picker/locales/fr";

picker.messages = fr;
```

Or set a global default once:

```js
import { setDefaultMessages } from "@lekoala/slot-picker";
import fr from "@lekoala/slot-picker/locales/fr";

setDefaultMessages(fr);
```

Resolution order: `DEFAULT_MESSAGES`, then global defaults, then the instance
`messages`. Global defaults are resolved at render time, so
`setDefaultMessages()` also reaches instances that already exist on their next
render. Packs are never auto-imported, which keeps them tree-shakable.

Included packs: `ar`, `de`, `en`, `es`, `fr`, `hi`, `id`, `it`, `ja`, `ko`,
`nl`, `pl`, `pt-BR`, `pt-PT`, `ru`, `tr`, `zh-CN`.

These are provided message packs to review, not fully localized copy:
pluralization is intentionally simple (`oneSlot` / `manySlots` with `{n}`) and
does not use `Intl.PluralRules`.

Locale priority for formatting: `locale` attribute, then `lang`, then
`document.documentElement.lang`, then `navigator.language`. Only `locale`/`lang`
set on the component is observed; changing the document language does not
re-render existing pickers, and no global `MutationObserver` is used.

## Data shape

```js
{
  date: "2026-11-17",
  slots: [
    {
      start: "13:35",
      end: "14:05",
      disabled: false,
      description: "Optional accessible detail",
      tone: "video",
      meta: {}
    }
  ],
  notice: {
    label: "Unavailable",
    description: "Optional longer explanation",
    meta: {}
  }
}
```

Dates are civil `YYYY-MM-DD`, times are `HH:mm`, and the selected value is
`YYYY-MM-DDTHH:mm`. No timezone conversion is performed. The `value` property
setter rejects an impossible civil date such as `2026-02-31T10:00`; a malformed
`value` attribute is ignored and reads as empty, so imperfect markup never
breaks the element upgrade.

## Per-slot presentation

`slot.tone` is a neutral presentation token. The component never interprets it:
it is only surfaced as `data-tone`, and the core ships no palette.

```js
picker.days = [{ date: "2026-11-17", slots: [{ start: "13:35", tone: "video" }] }];
```

```html
<!-- rendered -->
<button type="button" role="option" class="sp-slot" data-tone="video" ...>13:35</button>
```

Map tones to color with the dedicated slot tokens, so a tone never touches the
focus ring (`--sp-focus`) or the rest of the picker:

```css
slot-picker .sp-slot[data-tone="video"] {
  --sp-slot-bg: #e0f2fe;
  --sp-slot-fg: #075985;
}
```

The slot surface is `--sp-slot-bg`, `--sp-slot-fg`, `--sp-slot-border`,
`--sp-slot-hover-bg`, `--sp-slot-selected-bg`, `--sp-slot-selected-fg`.

Accessible detail stays on `slot.description` (`aria-description`). The
component deliberately ships no tooltip or popover engine (see U4 in
`docs/USE_CASES.md`): a hover/focus tooltip is application-owned. Because the
DOM is light, an application can delegate on `.sp-slot` and read
`data-value`/`data-tone` for advanced enrichments, but the primary workflow
only needs `slotactivate`.

## Events

- `rangechange` — the visible civil range changed.
- `daychange` — the consulted day (`activeDate`) changed; never selects a slot.
- `slotactivate` — the user explicitly chose a slot (sets `activeDate` first); bubbles.
- `noticeactivate` — the user activated a day notice control (bubbles, detail `{ day, notice, anchor }`, no default behavior).
- `nextrequest` — no `source.next` was available; detail is `{ after }`.
- `loadstart` / `loadend` / `loaderror` — optional remote-source lifecycle.

See `docs/USE_CASES.md` for the product contract.

## Demo

The demo page points at the built artifacts, so no web server is required:

```bash
bun run build
```

Then open `demo/index.html` directly, or serve it with `bun run dev`.
It shows both `columns` and `day` projections, wide and in narrow
phone-like containers, plus bounded/responsive navigation and the range empty
state.
