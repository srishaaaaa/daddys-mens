"use client";

import { useState } from "react";
import { Printer, X } from "lucide-react";
import { SIZES, loadPrefs, savePrefs, type PrintPrefs, type PrinterType } from "@/lib/printMode";

/* "Print settings": pick thermal roll or sheet, then the paper size. The choice is remembered on this device. */
export default function PrintSettingsModal({ onCancel, onPrint }: { onCancel: () => void; onPrint: (p: PrintPrefs) => void }) {
  const [prefs, setPrefs] = useState<PrintPrefs>(() => (typeof window === "undefined" ? { type: "thermal", size: "80" } : loadPrefs()));

  const setType = (type: PrinterType) =>
    setPrefs((p) => (p.type === type ? p : { type, size: SIZES[type].some((s) => s.key === p.size) ? p.size : SIZES[type][type === "thermal" ? 1 : 0].key }));

  const choice = (active: boolean) =>
    `rounded-xl border-2 px-3 text-center font-extrabold cursor-pointer transition ${active ? "border-[#C1272D] bg-[#FBEFEF] text-[#C1272D]" : "border-black/10 bg-white text-slate-700 hover:border-black/25"}`;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[340px] overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between bg-[#111] px-5 py-3 text-white">
          <h3 className="flex items-center gap-2 text-[14px] font-black uppercase tracking-wide">
            <Printer className="h-4 w-4" /> Print Settings
          </h3>
          <button onClick={onCancel} aria-label="Close" className="grid h-7 w-7 place-items-center rounded-md bg-white/10 hover:bg-white/20 cursor-pointer">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-black">Printer type</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setType("thermal")} className={`${choice(prefs.type === "thermal")} h-11 text-[13px]`}>
                Thermal Roll
              </button>
              <button type="button" onClick={() => setType("sheet")} className={`${choice(prefs.type === "sheet")} h-11 text-[13px]`}>
                Sheet (A4/A5)
              </button>
            </div>
          </div>
          <div>
            <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-black">Paper size</p>
            <div className="grid grid-cols-2 gap-2">
              {SIZES[prefs.type].map((s) => (
                <button key={s.key} type="button" onClick={() => setPrefs({ ...prefs, size: s.key })} className={`${choice(prefs.size === s.key)} h-9 text-[12px]`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-4 border-t border-black/10 bg-[#FAFAFA] px-5 py-3">
          <button onClick={onCancel} className="text-[11px] font-extrabold uppercase tracking-wide text-slate-600 hover:text-black cursor-pointer">
            Cancel
          </button>
          <button
            onClick={() => {
              savePrefs(prefs);
              onPrint(prefs);
            }}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#C1272D] px-5 text-[12px] font-extrabold uppercase tracking-wide text-white shadow-[0_8px_20px_-10px_rgba(193,39,45,.9)] hover:bg-[#9B1C21] cursor-pointer"
          >
            <Printer className="h-4 w-4" /> Print Now
          </button>
        </div>
      </div>
    </div>
  );
}
