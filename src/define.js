import { SlotPickerElement } from "./slot-picker.js";

if (!customElements.get("slot-picker")) {
  customElements.define("slot-picker", SlotPickerElement);
}
