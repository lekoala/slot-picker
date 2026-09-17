# AGENTS.md

This repo is a small appointment-slot selection primitive. Keep it small.

## Product boundary

`slot-picker` displays a civil range of days and selectable appointment slots.

It is **not**:

- a scheduler;
- a booking workflow;
- a resource calendar;
- a timezone conversion engine;
- an authentication or payment component;
- a MyConsultation-specific adapter.

Application-specific rules belong outside the element.

## Non-negotiable model

Never merge these concepts:

- `start`: first civil day displayed;
- `dayCount`: number of civil days displayed;
- `focusedValue`: keyboard target;
- `value`: selected local slot value;
- `rangechange`: navigation intent;
- `slotactivate`: explicit user activation.

Changing the visible range or moving keyboard focus must not select a slot.

## Canonical values

Public dates are `YYYY-MM-DD`.

Public times are `HH:mm`.

The selected slot value is a local civil datetime: `YYYY-MM-DDTHH:mm`.

Do not silently convert to UTC or introduce timezone-bearing canonical values. A source may carry opaque
application metadata, but core logic must not inspect it.

## Layering

Keep pure rules out of the custom element:

- `date.js` — civil date math;
- `model.js` — normalization, grouping, range and keyboard helpers;
- `source.js` — source normalization and abortable loading;
- `messages.js` — localized UI strings;
- `slot-picker.js` — DOM, interaction and rendering.

If the element grows because of a pure rule, extract the rule instead of adding another branch.

## Data boundary

The primitive accepts normalized day/slot data.

It must not know about:

- doctor IDs;
- reason/motif IDs;
- security IDs;
- booking URLs;
- login/signup modals;
- appointment validation endpoints;
- Materialize/jQuery;
- FullCalendar class names.

Legacy formats are converted by application adapters before reaching the component.

## Accessibility

Accessibility changes are behavior changes.

Preserve:

- real buttons for appointment slots and navigation;
- one roving tabbable slot when slots exist;
- arrow-key navigation;
- Enter/Space activation;
- `aria-selected` for the selected slot;
- disabled slots remain discoverable but cannot activate;
- day notices have an accessible label;
- range navigation never mutates selection;
- no `aria-modal=true` because the component is inline.

## Async state

All supersedable source work must accept/use `AbortSignal`.

A stale response must never repaint the active range.

The source shape is data-oriented. Do not hard-code URL/query conventions into the element.

## CSS

Follow the visual conventions used by `@lekoala/date-picker`:

- light DOM;
- logical properties;
- `color-mix()` for derived colors;
- CSS custom properties as the theming surface;
- no hard-coded application palette;
- focus is visibly distinct from hover and selection;
- `currentColor` for SVG navigation glyphs.

## Tooling

Use the pinned repo tools:

```bash
bun run format
bun run test:syntax
bun run lint
bun run typecheck
bun run test
bun run test:browser
bun run build
```

Source remains JavaScript with JSDoc + TypeScript `checkJs`.

## Before expanding scope

A feature must clearly serve at least one documented use case in `docs/USE_CASES.md`.
Otherwise write the use case first or keep the behavior application-owned.
