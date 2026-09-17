/** @typedef {{start:string,end:string,dayCount:number,signal:AbortSignal}} SourceContext */
/** @typedef {(context:SourceContext) => Promise<unknown>|unknown} SlotSource */

export class SlotSourceController {
  /** @type {SlotSource|null} */
  #source = null;
  /** @type {AbortController|null} */
  #controller = null;
  #request = 0;

  /** @param {SlotSource|null} source */
  set source(source) {
    if (source !== null && typeof source !== "function") {
      throw new TypeError("source must be a function or null");
    }
    this.abort();
    this.#source = source;
  }

  get source() {
    return this.#source;
  }

  abort() {
    this.#controller?.abort();
    this.#controller = null;
  }

  /** @param {{start:string,end:string,dayCount:number}} range */
  async load(range) {
    if (!this.#source) return null;

    this.abort();
    const controller = new AbortController();
    this.#controller = controller;
    const request = ++this.#request;

    try {
      const result = await this.#source({ ...range, signal: controller.signal });
      if (request !== this.#request || controller.signal.aborted) return null;
      return result;
    } finally {
      if (this.#controller === controller) this.#controller = null;
    }
  }
}
