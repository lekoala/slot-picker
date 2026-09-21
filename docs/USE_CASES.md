# Use cases

These cases define the product more strongly than a feature checklist.

## U1 — Inline appointment availability

A consumer provides five civil days containing zero or more appointment slots.

Acceptance:

- each day is clearly labelled;
- slots render chronologically;
- activating a slot dispatches `slotactivate`;
- the selected value is a local civil datetime (`YYYY-MM-DDTHH:mm`);
- empty days remain visible;
- `slot.tone` is a neutral presentation token surfaced as `data-tone`; the core defines no palette and never interprets the token;
- `slot.description` carries accessible detail; a tooltip or popover remains application-owned.

## U2 — Controlled range navigation

The consumer can show three or five days depending on its layout.

Acceptance:

- `dayCount` means exactly N projected columns; without hidden weekdays those are N consecutive civil days;
- previous/next navigation changes `start`, not `value`, and moves by projected days so the column count is preserved;
- `rangechange` exposes the first and last projected day plus the column count; the civil envelope between them may be wider;
- min/max bounds disable impossible navigation;
- responsive policy remains consumer-owned.

## U3 — Remote availability

A source function loads availability for the visible range.

Acceptance:

- the source receives the exact civil envelope of the visible window (`start` to `end`, inclusive), which is known before the request: no adaptive or repeated fetching is ever required;
- superseded requests are aborted;
- stale responses never repaint the current range;
- source/backend URL conventions are application-owned;
- loading and error states do not mutate selection;
- loading is signalled without layout shift: `aria-busy="true"` on the host, the loading text announced through a visually hidden `role="status"`, and only a delayed CSS fade once the response is actually slow;

## U4 — Day notice / exceptional unavailability

A day can carry a notice such as "exceptionally unavailable".

Acceptance:

- the notice is distinct from an appointment slot;
- it does not become a fake slot;
- `notice-display` selects the projection strategy: `action` (default), `inline`, or `none`;
- `action` renders only a real control (the dot button) with an accessible name; no inline text is shown;
- `inline` additionally renders the readable notice content, by layout: compact label in `columns` (description kept in the DOM, revealed by themes) and full label + description in `day`;
- `inline` never overflows its column, even with an unbroken long label;
- displayed notice text is never interactive: `noticeactivate` belongs to an explicit control only, so there is no mouse-only activation;
- `notice-display="action"` renders the control in the day header (`columns`) or the panel header (`day`); `inline` keeps it in `columns` and relies on the text in `day`;
- `none` renders nothing; the application owns the notice elsewhere;
- activating the control dispatches `noticeactivate` with `{ day, notice, anchor }`, bubbling, without a default behavior and without selecting a slot;
- the component never owns a tooltip, popover or floating engine; the application decides (modal, popover, drawer or nothing).

## U5 — Collapsed availability

A dense range can initially show only the first N slot rows.

Acceptance:

- collapsing is presentation only;
- hidden slots remain part of the loaded model;
- "show more" expands without fetching again;
- selection remains stable across expand/collapse;
- while collapsed, "show more" floats inside the reserved footer band and a gradient hints at the availability that is not rendered; expanding returns it to normal flow with no overlay;
- hidden slots are not rendered in the DOM while collapsed, so no invisible button can be focused.

## U6 — Keyboard-only slot choice

A user can navigate and select without a pointing device.

Acceptance:

- one slot is in the Tab sequence;
- ArrowUp/ArrowDown move within a day;
- ArrowLeft/ArrowRight move to the nearest row in the adjacent day;
- Home/End move to the first/last slot of the current day;
- Enter/Space activates;
- focus movement never changes `value`;
- `slotactivate` bubbles, so one ancestor listener can delegate several pickers.

## U7 — Controlled selection

An application can set or clear `value`.

Acceptance:

- `value` is `YYYY-MM-DDTHH:mm` or empty;
- an impossible civil date (for example `2026-02-31T10:00`) is rejected by the property setter;
- a malformed `value` attribute is ignored and reads as empty, so imperfect markup never breaks the element upgrade;
- setting `value` only changes visual selection;
- programmatic assignment does not emit `slotactivate`;
- selecting a disabled slot is impossible.

## U8 — Legacy application adapter

A legacy application converts its existing event payload to normalized days/slots.

Acceptance:

- FullCalendar class names never enter the component;
- booking URLs and domain metadata can be retained as opaque `meta`;
- the adapter maps its domain status to a neutral `slot.tone`; the core never interprets it;
- the application owns post-selection booking behavior;
- replacing the legacy backend does not require changing the picker.

## U9 — Day projection of the same model

The same selection model can be projected as a day strip plus the slots of one consulted day.

Acceptance:

- `layout` is `columns` (default) or `day`; the consumer chooses it explicitly;
- there is no automatic `columns` to `day` breakpoint on viewport size;
- `activeDate` is the last day explicitly targeted by the user (day click or slot activation);
- `activeDate` resolution is civil-only: absent maps to the first projected day, before-range maps to it, after-range maps to the last projected day, and a hidden weekday maps to the next projected column; loaded slots never influence it;
- activating a slot sets `activeDate` to that slot's day before dispatching `slotactivate`;
- changing `layout` preserves `activeDate` and `value`;
- the active day uses `aria-pressed`, never `aria-current="date"`;
- today remains independently discoverable from the consulted day;
- empty days render a real DOM empty state driven by `messages.empty`, never CSS-generated text;
- keyboard offers two comprehensible tab stops (day strip, then day slots) with roving tabindex in each zone;
- Left/Right/Home/End on the strip change `activeDate` without selecting a slot.

## U10 — Bounded and responsive navigation

A consumer can bound the visible range, adapt the number of days to the
component's own width, and navigate by window, by reference date, or to the
next known availability. A wholly empty window is a distinct state.

Acceptance:

- `min`/`max` are hard bounds: `min <= start` and `end <= max`;
- at equal width and bounds the picker keeps its column capacity; only the bounds can really reduce it, and only when the interval itself holds too few projectable days;
- `dayCount`, the measured width, `min`/`max` and `hiddenDays` are all resolved before the request, so the capacity is known before any data arrives and a response can never change it;
- when the requested `dayCount` does not fit the bounds, the resolved `visibleDayCount` shrinks instead of showing out-of-bounds days;
- a window sitting at the upper bound keeps its capacity by extending backwards rather than losing a column;
- `min > max` is an explicit invalid configuration: `range` is `{ start: "", end: "", dayCount: 0 }`, `data-invalid-range` is set, navigation is disabled, and the source is never called;
- `dayCount` is the consumer's maximum intention; `visibleDayCount` is the capacity resolved from bounds and the width available to the projection;
- responsive resolution is opt-in via `responsive`, uses `ResizeObserver`, and never reads `window.innerWidth`; it measures the projection width (inside the navigation rail), not the host width; `responsiveBreakpoints` is overridable;
- changing `visibleDayCount` keeps `activeDate` visible by shifting `start` just enough, within the bounds;
- `previous()`/`next()` move to the adjacent window of `visibleDayCount` days and never select;
- `goTo(date)` brings `date` into the window and consults it, respecting the bounds;
- `goHome()` returns to `homeDate`, a reference date that is never confused with `min`;
- `goToNextAvailability()` asks the source (`source.next`) or falls back to a `nextrequest` event; it may skip several windows and is never merged with `next()`; it returns the destination actually reached (clamped to `min`/`max`), never the raw source proposal;
- `configure()` validates all options before applying any: an invalid option throws and leaves the component unchanged;
- navigation controls are a symmetric `previous`/`next` pair framing the projection; they are the only range-navigation chrome;
- `goHome()` (opt-in via `home-date`) is a persistent capability but an auxiliary shortcut, kept outside the prev/next rail; it is offered only while `homeDate` is outside the visible range; its wrapper reserves its height whenever `home-date` is set, so the shortcut appearing later never shifts the content;
- there is no "go to end" action;
- `goToNextAvailability()` is a contextual action, never permanent chrome: it is surfaced in the range empty state when `next-availability` is set;
- a window with no slot, no notice and no closed day renders a range empty state (`.sp-range-empty` replacing the projection, with a `next()` action, plus the contextual availability action when `next-availability` is set);
- a window with a notice or a closed day but no slots keeps the normal projection, so the exception or the closure stays visible;
- navigation controls are offered only when stepping would really move the window, so a bound sitting on a non-projected day never leaves an inert arrow enabled;
- resize changes the range, never `value`; event order is stable (`rangechange`, then `daychange`, then any reload);
- collapsed `columns` projection keeps a stable footprint derived from `max-visible-rows`: full, sparse and wholly empty ranges reserve the same height, so navigating between equivalent ranges never causes avoidable vertical layout shift;
- `expanded` content may grow naturally past that floor; in `layout="day"`, only the empty state gets a baseline.

## U11 — Hidden days, closed days, sparse availability

The consumer can remove weekdays from the calendar structure, and the source
can distinguish a closed date from an open date with no availability, without
the component knowing any opening-hours rule.

Acceptance:

- three states stay distinct and are never merged: a hidden weekday (no column at all), `closed: true` (a column saying `messages.closed`), and `slots: []` on an open day (a column saying `messages.empty`);
- `hiddenDays` is calendar structure, resolved from the civil date alone before any data is loaded: it is a `Date#getDay` index list on the JS property (no attribute), never inferred from a `SlotDay`, and `configure({ hiddenDays })` applies it transactionally;
- `dayCount` counts columns: a hidden weekday widens the civil envelope handed to `source.load()` instead of costing a column, so `end - start + 1` may exceed `dayCount`;
- `previous()`/`next()` step by projected days, `start` landing on a hidden weekday resolves forward to the first projected day, and `activeDate` on a hidden weekday resolves to the next projected column;
- a sparse weekly schedule (a practitioner opening one or two weekdays) therefore projects as N real opening days spread over several weeks, instead of a grid mostly made of closed columns the user has to page through;
- with `responsive`, a narrow screen lowers the ceiling but not the kind of column: the fewer columns that fit are still real opening days, and `dayCount` itself is untouched;
- invalid `hiddenDays` input throws: non-integers, indexes outside `0`–`6`, a non-array, or all seven weekdays hidden;
- `closed: true` is the business state of one date (a holiday, an exceptional or recurring closure decided by the application); the component never computes opening hours, recurrence or "Monday only";
- loaded data never adds or removes a column: a closed day keeps its place, exactly like a day carrying a `notice`;
- a closed day is stylable through `[data-closed]` on the day, the panel and the day strip; `--sp-closed-opacity` is the default theming hook;
- `notice` stays reserved for exceptional information and may coexist with `closed`;
- a window whose only content is closed days keeps the normal projection instead of collapsing into the range empty state;
- `source.next()` / `goToNextAvailability()` let the application jump to the next real availability between windows; they never change the shape of a window;
- `closed: true` with bookable slots is invalid input and is rejected by normalization;
- no availability recurrence or opening-hours rule enters the core: `hiddenDays` is a structural weekday filter on the calendar, not a statement about what is bookable.

## Not a use case for this package

Keep these outside the component:

- booking confirmation flows;
- login/signup;
- doctor/reason/security identifiers;
- "anti swiss cheese" booking rules;
- payment;
- resource scheduling;
- drag/drop;
- event rendering;
- recurrence;
- timezone conversion;
- tooltip/flyout positioning frameworks.
