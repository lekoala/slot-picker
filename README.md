# @lekoala/slot-picker

A small, native-first Web Component for choosing appointment slots across a short civil date range.

It deliberately sits between `@lekoala/date-picker` and `@lekoala/calendar`:

- more structured than a date picker because it displays times;
- much smaller than a scheduler because it does not render events/resources;
- application-neutral: booking workflows stay outside.

## Basic usage

```html
<link rel="stylesheet" href="./src/slot-picker.css">
<script type="module" src="./src/define.js"></script>

<slot-picker id="slots" start="2026-11-17" day-count="5"></slot-picker>
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

The source returns normalized day data. Backend query conventions and business metadata stay outside core.

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
- `slotactivate` — the user explicitly chose a slot.
- `noticeactivate` — the user activated a day notice.
- `loadstart` / `loadend` / `loaderror` — optional remote-source lifecycle.

See `docs/USE_CASES.md` for the product contract.
