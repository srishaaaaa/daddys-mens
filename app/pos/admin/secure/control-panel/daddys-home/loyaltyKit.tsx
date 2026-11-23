"use client";

import { useState } from "react";
import { Download, X } from "lucide-react";

/* Small building blocks shared by the Loyalty screens. Cream cards, red accents — the app's theme. */

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(" ");
export const labelCls = "mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-600";
export const field =
  "h-11 w-full rounded-xl bg-[#F6F3E9] px-4 text-[14px] font-medium text-slate-900 outline-none ring-[#C1272D]/15 transition placeholder:text-slate-400 focus:bg-white focus:ring-4";
export const card = "rounded-2xl border border-black/10 bg-white shadow-sm";
export const fmtDate = (t: number) => new Date(t).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
export const fmtDateTime = (t: number) =>
  new Date(t).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
export const rupee = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export type Period = "all" | "today" | "week" | "month" | "year" | "custom";
export type Range = { from: number; to: number } | null;

export function rangeOf(period: Period, from: string, to: string, now = new Date()): Range {
  if (period === "all") return null;
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === "today") return { from: start.getTime(), to: start.getTime() + 86_400_000 - 1 };
  if (period === "week") {
    const dow = start.getDay();
    start.setDate(start.getDate() + (dow === 0 ? -6 : 1 - dow));
    return { from: start.getTime(), to: Date.now() + 1 };
  }
  if (period === "month") return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to: Date.now() + 1 };
  if (period === "year") return { from: new Date(now.getFullYear(), 0, 1).getTime(), to: Date.now() + 1 };
  const f = from ? new Date(`${from}T00:00:00`).getTime() : 0;
  const t = to ? new Date(`${to}T23:59:59.999`).getTime() : Date.now() + 1;
  return { from: f, to: t };
}
export const within = (t: number, r: Range) => !r || (t >= r.from && t <= r.to);

export function downloadCsv(name: string, rows: (string | number)[][]) {
  const csv = rows.map((r) => r.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function Btn({
  children, onClick, kind = "light", disabled, className, type = "button", title,
}: {
  children: React.ReactNode; onClick?: () => void; kind?: "light" | "red" | "dark" | "danger" | "green";
  disabled?: boolean; className?: string; type?: "button" | "submit"; title?: string;
}) {
  const k = {
    light: "border border-black/10 bg-white text-slate-800 hover:bg-slate-50",
    red: "bg-[#C1272D] text-white hover:bg-[#9B1C21] shadow-sm",
    dark: "bg-slate-900 text-white hover:bg-slate-700",
    danger: "bg-[#C1272D] text-white hover:bg-[#9B1C21] shadow-sm",
    green: "bg-[#22c55e] text-white hover:bg-[#16a34a]",
  }[kind];
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled}
      className={cx("inline-flex h-10 items-center justify-center gap-2 rounded-xl px-4 text-[12.5px] font-bold transition disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed", k, className)}>
      {children}
    </button>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: React.ReactNode; hint?: string; tone?: "green" | "amber" | "red" }) {
  const t = tone === "green" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : tone === "red" ? "text-[#C1272D]" : "text-black";
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-600">{label}</div>
      <div className={cx("mt-3 text-[26px] font-black leading-none", t)}>{value}</div>
      {hint && <div className="mt-2 text-[11.5px] text-slate-500">{hint}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: { v: T; t: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="mb-5 flex flex-wrap gap-x-6 gap-y-1 border-b border-black/10">
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className={cx("-mb-px border-b-2 px-0.5 pb-3 pt-1 text-[12.5px] font-extrabold uppercase tracking-wide cursor-pointer transition",
            value === o.v ? "border-[#C1272D] text-[#C1272D]" : "border-transparent text-slate-600 hover:text-black")}>
          {o.t}
        </button>
      ))}
    </div>
  );
}

export function Pills<T extends string>({ label, value, options, onChange }: { label?: string; value: T; options: { v: T; t: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-full border border-black/10 bg-white p-1">
      {label && <span className="px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</span>}
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)}
          className={cx("rounded-full px-3.5 py-1.5 text-[11.5px] font-extrabold uppercase tracking-wide cursor-pointer transition",
            value === o.v ? "bg-[#C1272D] text-white" : "text-slate-700 hover:bg-[#FBEFEF]")}>
          {o.t}
        </button>
      ))}
    </div>
  );
}

export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={cx("relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer", on ? "bg-[#22a55a]" : "bg-stone-300")}>
      <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

export function Modal({ title, onClose, children, footer, wide }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode; footer?: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={cx("flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-black/10 bg-[#FDFCF7] shadow-[0_20px_60px_rgba(0,0,0,0.3)]", wide ? "max-w-3xl" : "max-w-md")}>
        <div className="flex items-center justify-between border-b border-black/10 px-5 py-4">
          <h3 className="text-base font-black text-black">{title}</h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 hover:bg-black/5 cursor-pointer" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-black/10 bg-[#F6F3E9] px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="h-11 min-w-0 flex-1 rounded-xl bg-[#F6F3E9] px-4 text-[13px] font-medium outline-none focus:bg-white focus:ring-4 ring-[#C1272D]/15" />
  );
}

export function ExcelBtn({ onClick, disabled, children = "Excel" }: { onClick: () => void; disabled?: boolean; children?: React.ReactNode }) {
  return (
    <Btn onClick={onClick} disabled={disabled}>
      <Download className="h-4 w-4" /> {children}
    </Btn>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="text-sm font-bold text-slate-800">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">{children}</p>}
    </div>
  );
}

export function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    setBusy(true);
    try {
      return await fn();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Something went wrong.");
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}
