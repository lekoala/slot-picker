# Use cases

These cases define the product more strongly than a feature checklist.

## U1 — Inline appointment availability

A consumer provides five civil days containing zero or more appointment slots.

Acceptance:

- each day is clearly labelled;
- slots render chronologically;
- activating a slot dispatches `slotactivate`;
- the selected value is a local civil datetime (`YYYY-MM-DDTHH:mm`);
- empty days remain visible.

## U2 — Controlled range navigation

The consumer can show three or five days depending on its layout.

Acceptance:

- `dayCount` means exactly N consecutive civil days;
- previous/next navigation changes `start`, not `value`;
- `rangechange` exposes the requested start/end range;
- min/max bounds disable impossible navigation;
- responsive policy remains consumer-owned.

## U3 — Remote availability

A source function loads availability for the visible range.

Acceptance:

- the source receives the exact visible range;
- superseded requests are aborted;
- stale responses never repaint the current range;
- source/backend URL conventions are application-owned;
- loading and error states do not mutate selection.

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
- selection remains stable across expand/collapse.

## U6 — Keyboard-only slot choice

A user can navigate and select without a pointing device.

Acceptance:

- one slot is in the Tab sequence;
- ArrowUp/ArrowDown move within a day;
- ArrowLeft/ArrowRight move to the nearest row in the adjacent day;
- Home/End move to the first/last slot of the current day;
- Enter/Space activates;
- focus movement never changes `value`.

## U7 — Controlled selection

An application can set or clear `value`.

Acceptance:

- `value` is `YYYY-MM-DDTHH:mm` or empty;
- setting `value` only changes visual selection;
- programmatic assignment does not emit `slotactivate`;
- selecting a disabled slot is impossible.

## U8 — Legacy application adapter

A legacy application converts its existing event payload to normalized days/slots.

Acceptance:

- FullCalendar class names never enter the component;
- booking URLs and domain metadata can be retained as opaque `meta`;
- the application owns post-selection booking behavior;
- replacing the legacy backend does not require changing the picker.

## U9 — Day projection of the same model

The same selection model can be projected as a day strip plus the slots of one consulted day.

Acceptance:

- `layout` is `columns` (default) or `day`; the consumer chooses it explicitly;
- there is no automatic `columns` to `day` breakpoint on viewport size;
- `activeDate` is the last day explicitly targeted by the user (day click or slot activation);
- `activeDate` resolution is civil-only: absent maps to `start`, before-range maps to `start`, after-range maps to `end`; loaded slots never influence it;
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
- when the requested `dayCount` does not fit the bounds, the resolved `visibleDayCount` shrinks instead of showing out-of-bounds days;
- `min > max` is an explicit invalid configuration: `range` is `{ start: "", end: "", dayCount: 0 }`, `data-invalid-range` is set, navigation is disabled, and the source is never called;
- `dayCount` is the consumer's maximum intention; `visibleDayCount` is the capacity resolved from bounds and the component's own inline width;
- responsive resolution is opt-in via `responsive`, uses `ResizeObserver`, and never reads `window.innerWidth`; `responsiveBreakpoints` is overridable;
- changing `visibleDayCount` keeps `activeDate` visible by shifting `start` just enough, within the bounds;
- `previous()`/`next()` move to the adjacent window of `visibleDayCount` days and never select;
- `goTo(date)` brings `date` into the window and consults it, respecting the bounds;
- `goHome()` returns to `homeDate`, a reference date that is never confused with `min`;
- `goToNextAvailability()` asks the source (`source.next`) or falls back to a `nextrequest` event; it may skip several windows and is never merged with `next()`;
- a window with no slot and no notice renders a range empty state (`.sp-range-empty` replacing the projection, with a `next()` action);
- a window with a notice but no slots keeps the normal projection so the exception stays visible;
- resize changes the range, never `value`; event order is stable (`rangechange`, then `daychange`, then any reload).

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
