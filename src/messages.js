const DEFAULT_MESSAGES = {
  previous: "Previous days",
  next: "Next days",
  home: "Back to start",
  nextAvailability: "Next availability",
  showMore: "Show more availability",
  showLess: "Show less",
  loading: "Loading availability",
  error: "Availability could not be loaded",
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
 * Keep only string overrides: a dynamically built pack with a missing key
 * (`{ previous: t("…") }` resolving to `undefined`) must not wipe out the
 * accessible default with `"undefined"`.
 * @param {Partial<typeof DEFAULT_MESSAGES>|null|undefined} messages
 */
function cleanOverrides(messages) {
  if (!messages || typeof messages !== "object") return {};
  /** @type {Record<string,string>} */
  const cleaned = {};
  for (const [key, value] of Object.entries(messages)) {
    if (typeof value === "string") cleaned[key] = value;
  }
  return cleaned;
}

/**
 * Update the global defaults applied to every instance without its own
 * `messages` override. Merges into the current defaults.
 * @param {Partial<typeof DEFAULT_MESSAGES>|null|undefined} messages
 */
export function setDefaultMessages(messages) {
  defaults = { ...defaults, ...cleanOverrides(messages) };
}

/**
 * Resolution hierarchy: DEFAULT_MESSAGES -> global defaults -> instance.
 * @param {Partial<typeof DEFAULT_MESSAGES>|null|undefined} messages
 */
export function resolveMessages(messages) {
  return { ...defaults, ...cleanOverrides(messages) };
}

/**
 * First usable locale of the priority chain, canonicalized.
 * An invalid tag (for example `"en_US"` from a backend) falls through to
 * the next candidate instead of throwing inside `Intl.DateTimeFormat`.
 * @param {...string} candidates
 */
export function resolveLocale(...candidates) {
  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== "string") continue;
    try {
      const canonical = Intl.getCanonicalLocales(candidate);
      if (canonical.length) return canonical[0];
    } catch {
      // Invalid language tag: try the next candidate.
    }
  }
  return "en";
}

export { DEFAULT_MESSAGES };
