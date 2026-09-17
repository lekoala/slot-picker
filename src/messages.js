const DEFAULT_MESSAGES = {
  previous: "Previous days",
  next: "Next days",
  showMore: "Show more availability",
  showLess: "Show less",
  unavailable: "Unavailable",
  loading: "Loading availability",
  empty: "No availability",
};

/** @param {Partial<typeof DEFAULT_MESSAGES>|null|undefined} messages */
export function resolveMessages(messages) {
  return { ...DEFAULT_MESSAGES, ...(messages ?? {}) };
}

export { DEFAULT_MESSAGES };
