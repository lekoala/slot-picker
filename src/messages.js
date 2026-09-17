const DEFAULT_MESSAGES = {
  previous: "Previous days",
  next: "Next days",
  home: "Back to start",
  nextAvailability: "Next availability",
  showMore: "Show more availability",
  showLess: "Show less",
  loading: "Loading availability",
  empty: "No availability",
  closed: "Closed",
  rangeEmptyTitle: "No availability in this period",
  rangeEmptyDescription: "From {start} to {end}",
  rangeEmptyNext: "See the next period",
  oneSlot: "1 slot",
  manySlots: "{n} slots",
  days: "Days",
};

let defaults = { ...DEFAULT_MESSAGES };

/** Copy of the current global message defaults. */
export function getDefaultMessages() {
  return { ...defaults };
}

/**
 * Update the global defaults applied to every instance without its own
 * `messages` override. Merges into the current defaults.
 * @param {Partial<typeof DEFAULT_MESSAGES>|null|undefined} messages
 */
export function setDefaultMessages(messages) {
  defaults = { ...defaults, ...(messages ?? {}) };
}

/**
 * Resolution hierarchy: DEFAULT_MESSAGES -> global defaults -> instance.
 * @param {Partial<typeof DEFAULT_MESSAGES>|null|undefined} messages
 */
export function resolveMessages(messages) {
  return { ...defaults, ...(messages ?? {}) };
}

export { DEFAULT_MESSAGES };
