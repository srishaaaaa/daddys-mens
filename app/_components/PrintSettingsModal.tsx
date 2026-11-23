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
    `rounded-2xl border-2 px-4 text-center font-extrabold cursor-pointer transition ${active ? "border-[#C1272D] bg-[#FBEFEF] text-[#C1272D]" : "border-black/10 bg-white text-slate-700 hover:border-black/25"}`;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[580px] overflow-hidden rounded-3xl bg-white shadow-2xl animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between bg-[#111] px-7 py-5 text-white">
          <h3 className="flex items-center gap-3 text-[18px] font-black uppercase tracking-wide">
            <Printer className="h-5 w-5" /> Print Settings
          </h3>
          <button onClick={onCancel} aria-label="Close" className="grid h-9 w-9 place-items-center rounded-lg bg-white/10 hover:bg-white/20 cursor-pointer">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 px-7 py-6">
          <div>
            <p className="mb-3 text-[13px] font-black uppercase tracking-wide text-black">Printer type</p>
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setType("thermal")} className={`${choice(prefs.type === "thermal")} h-16 text-[16px]`}>
                Thermal Roll
              </button>
              <button type="button" onClick={() => setType("sheet")} className={`${choice(prefs.type === "sheet")} h-16 text-[16px]`}>
                Sheet (A4/A5)
              </button>
            </div>
          </div>
          <div>
            <p className="mb-3 text-[13px] font-black uppercase tracking-wide text-black">Paper size</p>
            <div className="grid grid-cols-2 gap-3">
              {SIZES[prefs.type].map((s) => (
                <button key={s.key} type="button" onClick={() => setPrefs({ ...prefs, size: s.key })} className={`${choice(prefs.size === s.key)} h-12 text-[14px]`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-5 border-t border-black/10 bg-[#FAFAFA] px-7 py-5">
          <button onClick={onCancel} className="text-[13px] font-extrabold uppercase tracking-wide text-slate-600 hover:text-black cursor-pointer">
            Cancel
          </button>
          <button
            onClick={() => {
              savePrefs(prefs);
              onPrint(prefs);
            }}
            className="inline-flex h-12 items-center gap-2 rounded-2xl bg-[#C1272D] px-7 text-[14px] font-extrabold uppercase tracking-wide text-white shadow-[0_8px_20px_-10px_rgba(193,39,45,.9)] hover:bg-[#9B1C21] cursor-pointer"
          >
            <Printer className="h-4 w-4" /> Print Now
          </button>
        </div>
      </div>
    </div>
  );
}
