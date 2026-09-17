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
- it has an accessible label;
- activation dispatches `noticeactivate`;
- presentation can stay compact without embedding a tooltip positioning engine.

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
