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

`start` and `end` are the inclusive civil envelope of the visible window. With
`hiddenDays` set it can be wider than `dayCount`, so load the whole envelope and
let the component pick the columns; days outside it are ignored. No adaptive
fetching is ever required: the envelope is known before the request.

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

- `day-count` is the maximum intention, counted in **columns**; `visibleDayCount` is the capacity actually resolved from `min`/`max` and the component's own width (opt-in via `responsive`, overridable with `responsiveBreakpoints`, observed with `ResizeObserver`).
- `min`/`max` are hard bounds. `min > max` is an invalid configuration: `range` becomes `{ start: "", end: "", dayCount: 0 }`, `data-invalid-range` is set, and the source is never called.
- `hiddenDays` removes weekdays from the calendar structure; it never costs a column.
- `home-date` is a reference date for `goHome()`, never confused with `min`.

At equal width and bounds the picker keeps its column capacity: only `min`/`max`
can really reduce it, and only when the interval itself holds too few
projectable days. `previous()`/`next()` move by projected days, so the count of
columns never changes as you navigate.

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

## Stable footprint and loading

Collapsed `columns` projection keeps a stable footprint derived from
`max-visible-rows`: a full, sparse or wholly empty range reserves the same
height, so `previous()`/`next()` never jerk the page. `expanded` content grows
past that floor. In `layout="day"`, only the empty state gets a baseline.

- `--sp-day-header-block-size` is a minimum, never a fixed height.
- `--sp-collapsed-rows` defaults to `max-visible-rows`.
- `--sp-collapsed-body-block-size`, `--sp-footer-block-size` and
  `--sp-collapsed-block-size` describe the reserved area.
- `--sp-panel-min-block-size` is the day baseline.

When `home-date` is configured, the `.sp-shortcuts` wrapper stays in the DOM
even while `homeDate` is already visible, so the shortcut appearing never shifts
the page. Its reserved height is `--sp-shortcuts-block-size` (default `2.5rem`).

While collapsed, the "show more" control floats inside the reserved footer band
instead of adding a row: a gradient (`--sp-more-fade-size`, `--sp-more-bg`)
rises above it to suggest the availability that is not rendered. Hidden slots
stay out of the DOM. Expanding returns the control to normal flow, with no
overlay and no gradient.

Loading is signalled by `aria-busy="true"` on the host plus a CSS fade that only
starts after `--sp-loading-fade-delay` (default `400ms`), so fast responses
never flicker. `messages.loading` stays announced through a visually hidden
`role="status"`, so there is no layout shift. The fade honours
`prefers-reduced-motion` (delay kept, animation removed).

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
  closed: false,
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

### Hidden days, closed days, empty days

Three separate ideas, deliberately not merged:

| | what it is | column? |
| --- | --- | --- |
| `hiddenDays` | calendar structure, known before loading | never rendered |
| `closed: true` | business state of a real date | rendered, says `Closed` |
| `slots: []` | open date with nothing bookable | rendered, says `No availability` |

#### hiddenDays

```js
picker.hiddenDays = [0, 6]; // Sunday and Saturday are never a column
```

Weekday indexes match `Date#getDay` (0 = Sunday). Because the rule is known
before any request, `dayCount` keeps meaning "columns": a hidden weekday widens
the civil envelope instead of eating a column.

```js
picker.configure({ start: "2026-11-19", dayCount: 5, hiddenDays: [0, 6] });
picker.range; // { start: "2026-11-19", end: "2026-11-25", dayCount: 5 }
```

Five columns (Thu, Fri, Mon, Tue, Wed) over a seven-day envelope; `source.load()`
receives `2026-11-19` to `2026-11-25`. `previous()`/`next()` step by five
projected days, so the grid never changes shape. A `start` landing on a hidden
weekday resolves forward to the first projected day, and `activeDate` resolves
to the next projected column. It is a property, like `days` and `source`, with no
matching attribute; `configure({ hiddenDays })` applies it inside a transaction.
Anything but integers `0`–`6` throws, and hiding all seven weekdays is rejected.

This is what makes a sparse weekly schedule usable. A practitioner working only
Tuesdays and Thursdays is calendar structure, not availability:

```js
picker.configure({ dayCount: 5, hiddenDays: [0, 1, 3, 5, 6] });
picker.range.dayCount; // 5 columns: Tue, Thu, Tue, Thu, Tue
picker.range;          // spanning about three weeks of civil time
```

Five columns are five real opening days, instead of a grid mostly made of
closed ones, and `next()` moves to the five following opening days. Without
`hiddenDays` the same consumer would have to page through weeks to find two
bookable columns.

Combined with `responsive`, this is what makes a narrow screen usable.
`day-count` is a ceiling, and the width resolves it: a phone may only fit two
columns, but they are two real opening days rather than two arbitrary civil
days. Width, bounds and `hiddenDays` are all resolved before the request, so the
capacity is known before any data arrives and a response can never change it.

#### closed

```js
picker.days = [{ date: "2026-11-22", slots: [], closed: true }];
```

```css
slot-picker .sp-day[data-closed] {
  --sp-closed-opacity: 0.4;
}
```

`closed` is set by the application (a holiday, an exceptional closure); the
component computes no opening hours and never derives a recurrence from the
data. It is a rendered state, exactly like `notice`: loaded data can never add
or remove a column, so a closed day keeps its place and explains why there is
nothing that day. A window made only of closed days still renders its columns.

`notice` remains reserved for exceptional information and may coexist with
`closed`. A closed day carrying slots is invalid input and is rejected by
normalization.

To jump between windows by real availability, let the source expose `next()`
and call `goToNextAvailability()`; the shape of a window never changes.

## Per-slot presentation

`slot.tone` is a neutral presentation token. The component never interprets it:
it is only surfaced as `data-tone`, and the core ships no palette.

```js
picker.days = [{ date: "2026-11-17", slots: [{ start: "13:35", tone: "video" }] }];
```

```html
<!-- rendered -->
<button type="button" role="option" class="sp-slot" data-tone="video" ...><span class="sp-slot-time">13:35</span></button>
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

An icon next to the time is theme-owned too. The time lives in a
`.sp-slot-time` inline-flex wrapper, so append the glyph to that wrapper with a
`::after` and a logical margin: it stays in flow, thus really adjacent to the
time, and readjusts in RTL. The slot is width-clamped (`min-inline-size: 0;
max-inline-size: 100%`), so the icon never widens the day column.

```css
slot-picker .sp-slot[data-tone="instant"] .sp-slot-time::after {
  content: "⚡";
  margin-inline-start: 0.35rem;
  font-size: 0.85em;
  line-height: 1;
}
```

A generated glyph can enter the accessible name ("13:35 ⚡"): keep the meaning
in `slot.description`, or use `content: ""` plus a background/mask when the
name must stay purely the time.

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

The same page is published from `master` at
<https://lekoala.github.io/slot-picker/> (GitHub Pages serves the repository
root and redirects to `demo/`). Pages publishes the committed `dist/` bundles,
so run `bun run build:bundle` and commit `dist/slot-picker.js` /
`dist/slot-picker.css` whenever `src/` changes; CI rejects a stale bundle.

