/* Print settings for receipts: thermal roll (58 / 80 mm) or a sheet (A4 / A5). Browser only. */

export type PrinterType = "thermal" | "sheet";
export type PaperSize = "58" | "80" | "a4" | "a5";
export type PrintPrefs = { type: PrinterType; size: PaperSize };

export const DEFAULT_PREFS: PrintPrefs = { type: "thermal", size: "80" };

export const SIZES: Record<PrinterType, { key: PaperSize; label: string }[]> = {
  thermal: [
    { key: "58", label: "58 mm" },
    { key: "80", label: "80 mm" },
  ],
  sheet: [
    { key: "a4", label: "A4" },
    { key: "a5", label: "A5" },
  ],
};

/** Keeps a saved or URL value only if it is a real combination. */
export function cleanPrefs(type: unknown, size: unknown): PrintPrefs | null {
  if (type !== "thermal" && type !== "sheet") return null;
  return SIZES[type].some((s) => s.key === size) ? { type, size: size as PaperSize } : null;
}

export function loadPrefs(): PrintPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem("print_prefs") || "null");
    return cleanPrefs(raw?.type, raw?.size) ?? DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}
export function savePrefs(p: PrintPrefs) {
  try {
    localStorage.setItem("print_prefs", JSON.stringify(p));
  } catch {}
}

/** CSS that sizes the paper and tightens the invoice to fit it. */
export function printCss(p: PrintPrefs): string {
  if (p.type === "thermal") {
    const mm = p.size === "58" ? 58 : 80;
    // The same layout as the invoice, drawn 600px wide and scaled to fit the roll.
    const zoom = (((mm - 4) * 96) / 25.4 / 600).toFixed(3);
    return `
@media print {
  @page { size: ${mm}mm auto; margin: 2mm; }
  body, body > div { background: #fff !important; padding: 0 !important; }
  #invoice-doc { width: 600px !important; max-width: 600px !important; zoom: ${zoom}; box-shadow: none !important; border: 0 !important; border-radius: 0 !important; padding: 8px !important; }
}`;
  }
  const page = p.size === "a5" ? "A5" : "A4";
  return `
@media print {
  @page { size: ${page}; margin: 10mm; }
  #invoice-doc { max-width: 100% !important; }
}`;
}

export function applyPrintStyle(p: PrintPrefs) {
  let el = document.getElementById("print-mode-style") as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = "print-mode-style";
    document.head.appendChild(el);
  }
  el.textContent = printCss(p);
}
