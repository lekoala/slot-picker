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

`configure()` is transactional: one reload and one final event pair, never one
per setting. Event order is stable: `rangechange`, then `daychange`, then any
reload. Resizing and navigating change the range but never `value`.

A window with no slot and no notice renders a range empty state
(`.sp-range-empty`) and a `next()` action. A window with a notice but no slots
keeps its normal projection, so "exceptionally unavailable" stays distinct from
"no availability".

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
`YYYY-MM-DDTHH:mm`. No timezone conversion is performed.

## Events

- `rangechange` — the visible civil range changed.
- `daychange` — the consulted day (`activeDate`) changed; never selects a slot.
- `slotactivate` — the user explicitly chose a slot (sets `activeDate` first).
- `noticeactivate` — the user activated a day notice.
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
