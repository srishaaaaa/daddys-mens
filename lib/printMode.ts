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
    const fs = p.size === "58" ? 10 : 12; // px
    return `
@media print {
  @page { size: ${mm}mm auto; margin: 0; }
  html, body { width: ${mm}mm !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
  body > div { background: #fff !important; padding: 0 !important; min-height: 0 !important; display: block !important; width: ${mm}mm !important; }
  #invoice-doc { display: none !important; }
  #thermal-receipt, #thermal-receipt * { box-sizing: border-box; }
  #thermal-receipt { display: block !important; width: ${mm}mm !important; padding: 3mm 4mm !important; font-size: ${fs}px; line-height: 1.35; }
  #thermal-receipt p { margin: 0; word-break: break-word; }
  #thermal-receipt hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
  #thermal-receipt .rc-name { font-size: ${fs + 6}px; font-weight: 800; text-transform: uppercase; }
  #thermal-receipt .rc-row { display: flex; justify-content: space-between; gap: 6px; }
  #thermal-receipt .rc-row span:last-child { text-align: right; white-space: nowrap; }
  #thermal-receipt .rc-item { margin-bottom: 3px; }
  #thermal-receipt .rc-total { font-size: ${fs + 4}px; font-weight: 800; }
  #thermal-receipt .rc-small { font-size: ${fs - 2}px; }
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
