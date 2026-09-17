/** @typedef {{start:string,end:string,dayCount:number,signal:AbortSignal}} SourceContext */
/** @typedef {{after:string,signal:AbortSignal}} NextContext */
/** @typedef {(context:SourceContext) => Promise<unknown>|unknown} SlotSourceFunction */
/** @typedef {{load:(context:SourceContext) => Promise<unknown>|unknown, next?:(context:NextContext) => Promise<string|null|undefined>|string|null|undefined}} SlotSourceObject */
/** @typedef {SlotSourceFunction|SlotSourceObject} SlotSource */

export class SlotSourceController {
  /** @type {SlotSource|null} */
  #source = null;
  /** @type {AbortController|null} */
  #controller = null;
  /** @type {AbortController|null} */
  #nextController = null;
  #request = 0;
  #nextRequest = 0;

  /** @param {SlotSource|null} source */
  set source(source) {
    const isFunction = typeof source === "function";
    const isObject = source !== null && typeof source === "object" && typeof source.load === "function";
    if (source !== null && !isFunction && !isObject) {
      throw new TypeError("source must be a function or an object with a load() method");
    }
    this.abort();
    this.#source = source;
  }

  get source() {
    return this.#source;
  }

  /** Whether the current source can resolve a date beyond the visible range. */
  get hasNext() {
    const source = this.#source;
    return Boolean(source && typeof source === "object" && typeof source.next === "function");
  }

  abort() {
    this.#controller?.abort();
    this.#controller = null;
    this.#nextController?.abort();
    this.#nextController = null;
  }

  /** @param {{start:string,end:string,dayCount:number}} range */
  async load(range) {
    const source = this.#source;
    if (!source) return null;
    const loader = typeof source === "function" ? source : source.load;

    this.abort();
    const controller = new AbortController();
    this.#controller = controller;
    const request = ++this.#request;

    try {
      const result = await loader({ ...range, signal: controller.signal });
      if (request !== this.#request || controller.signal.aborted) return null;
      return result;
    } finally {
      if (this.#controller === controller) this.#controller = null;
    }
  }

  /**
   * Ask the source for the next known availability after `after`.
   * Superseded calls are aborted; a stale response resolves to null.
   * @param {{after:string}} context
   */
  async next({ after }) {
    const source = this.#source;
    if (!source || typeof source !== "object" || typeof source.next !== "function") return null;

    this.#nextController?.abort();
    const controller = new AbortController();
    this.#nextController = controller;
    const request = ++this.#nextRequest;

    try {
      const result = await source.next({ after, signal: controller.signal });
      if (request !== this.#nextRequest || controller.signal.aborted) return null;
      return typeof result === "string" ? result : null;
    } finally {
      if (this.#nextController === controller) this.#nextController = null;
    }
  }
}
