"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Search, Star, Trash2, Users } from "lucide-react";
import type { LoyaltyData } from "@/lib/loyalty/server";
import type { LedgerEntry, LoyaltyCustomer, LoyaltyMessage, Segment, Voucher } from "@/lib/loyalty/types";
import { SEGMENTS } from "@/lib/loyalty/engine";
import { fillMessage } from "@/lib/loyalty/messages";
import {
  loyaltyAdjustAction, loyaltyDeleteAction, loyaltyLedgerAction, loyaltyMsgOpenAction, loyaltyMsgRetryAction,
  loyaltyRegisterAction, loyaltyStateAction, loyaltyStatusAction, loyaltyUpdateAction, loyaltyVoucherCancelAction,
} from "@/app/pos/loyalty-actions";
import {
  Btn, Empty, ExcelBtn, Modal, Pills, SearchInput, Stat, Switch, Tabs, card, cx, downloadCsv, field, fmtDate,
  fmtDateTime, labelCls, rangeOf, rupee, useBusy, within, type Period,
} from "./loyaltyKit";
import LoyaltyRewards from "./LoyaltyRewards";
import LoyaltySettings from "./LoyaltySettings";

type Tab = "dashboard" | "customers" | "rewards" | "records" | "crm" | "settings";
const EARN_TYPES = ["purchase", "bonus", "promo", "referral", "occasion", "refund_restore"];
const USE_TYPES = ["redemption", "reward"];

export type Shared = { d: LoyaltyData; reload: () => Promise<void>; range: ReturnType<typeof rangeOf>; label: string; ledger: LedgerEntry[] };

const waLink = (phone: string, text: string) => `https://api.whatsapp.com/send/?phone=91${phone.replace(/\D/g, "").slice(-10)}&text=${encodeURIComponent(text)}`;

/* The last result is kept while the app is open, so the tab shows straight away and refreshes quietly. */
let cache: { d: LoyaltyData; ledger: LedgerEntry[]; at: number } | null = null;

/** Loads the loyalty data ahead of time (called after sign-in) so the tab opens instantly. */
export async function prefetchLoyalty() {
  if (cache && Date.now() - cache.at < 30_000) return;
  try {
    const [d, ledger] = await Promise.all([loyaltyStateAction(), loyaltyLedgerAction()]);
    cache = { d, ledger, at: Date.now() };
  } catch {
    /* the tab shows the error itself if it still fails when opened */
  }
}

export default function LoyaltyPanel({ admin }: { admin: boolean }) {
  const [tab, setTab] = useState<Tab>(admin ? "dashboard" : "customers");
  const [d, setD] = useState<LoyaltyData | null>(cache?.d ?? null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [ledger, setLedger] = useState<LedgerEntry[]>(cache?.ledger ?? []);

  const range = useMemo(() => rangeOf(period, from, to), [period, from, to]);
  const label =
    period === "all" ? "All time" : period === "today" ? "Today" : period === "week" ? "This week" : period === "month" ? "This month" : period === "year" ? "This year" : "Custom range";

  const reload = useCallback(async () => {
    try {
      const [state, led] = await Promise.all([loyaltyStateAction(), loyaltyLedgerAction(range?.from, range?.to)]);
      setD(state);
      setLedger(led);
      setError(null);
      if (!range) cache = { d: state, ledger: led, at: Date.now() };
    } catch (e) {
      console.error(e);
      setError("Could not load loyalty data. Has migration 0005_loyalty.sql been run in Supabase?");
    }
  }, [range]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
  }, [reload]);

  const sum = (types: string[]) => ledger.filter((r) => types.includes(r.type)).reduce((a, r) => a + r.points, 0);
  const earned = sum(EARN_TYPES) + ledger.filter((r) => r.type === "adjustment" && r.points > 0).reduce((a, r) => a + r.points, 0);
  const redeemed = 0 - (sum(USE_TYPES) + ledger.filter((r) => r.type === "adjustment" && r.points < 0).reduce((a, r) => a + r.points, 0));

  const tabs: { v: Tab; t: string }[] = admin
    ? [
        { v: "dashboard", t: "Dashboard" }, { v: "customers", t: "Customers" }, { v: "rewards", t: "Free Gifts & Rewards" },
        { v: "records", t: "Rewards earned" }, { v: "crm", t: "Customer CRM" }, { v: "settings", t: "Settings" },
      ]
    : [{ v: "customers", t: "Customers" }];

  const shared: Shared | null = d ? { d, reload, range, label, ledger } : null;

  return (
    <div className="mx-auto w-full max-w-[1400px] flex-1 pb-8 pr-2 animate-in fade-in duration-300">
      <div>
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[28px] font-black tracking-tight text-black">Loyalty</h2>
            <p className="mt-1 text-xs font-semibold text-black/60">
              {d ? (d.config.enabled ? "Points, free gifts and rewards for your regular customers." : "The programme is switched off — turn it on in Settings.") : "Points, free gifts and rewards for your regular customers."}
            </p>
          </div>
          <Btn onClick={() => void reload()}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Btn>
        </div>

        {error && !d && <p className="rounded-xl bg-red-50 px-4 py-3 text-[13px] font-semibold text-red-700">{error}</p>}
        {!d && !error && (
          <div className="animate-pulse" aria-label="Loading loyalty data">
            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} className="h-[112px] rounded-2xl border border-black/10 bg-white" />
              ))}
            </div>
            <div className="mb-5 h-9 w-2/3 rounded-lg bg-black/5" />
            <div className="h-64 rounded-2xl border border-black/10 bg-white" />
          </div>
        )}

        {d && shared && (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
              <Stat label="Loyalty customers" value={d.customers.length.toLocaleString("en-IN")} hint={range ? `${d.customers.filter((c) => within(c.createdAt, range)).length} joined · ${label}` : undefined} />
              <Stat label="Points earned" value={earned.toLocaleString("en-IN")} tone="green" hint={label} />
              <Stat label="Points redeemed" value={redeemed.toLocaleString("en-IN")} tone="amber" hint={label} />
              <Stat label="Available points" value={d.totals.outstanding.toLocaleString("en-IN")} tone="amber" hint="held by customers now" />
              <Stat label="Free gifts given" value={d.totals.giftsGiven.toLocaleString("en-IN")} hint={`on paid bills · ${label}`} />
            </div>

            {tabs.length > 1 && <Tabs value={tab} options={tabs} onChange={setTab} />}

            {tab !== "rewards" && tab !== "settings" && (
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <Pills label="Period:" value={period} onChange={setPeriod}
                  options={[{ v: "all", t: "All time" }, { v: "today", t: "Today" }, { v: "week", t: "This week" }, { v: "month", t: "This month" }, { v: "year", t: "This year" }, { v: "custom", t: "Custom" }]} />
                {admin && tab === "dashboard" && (
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <ExcelBtn onClick={() => excelDashboard(shared, earned, redeemed)}>Excel · whole dashboard</ExcelBtn>
                    <ExcelBtn onClick={() => excelLedger(shared)}>Excel · all points transactions</ExcelBtn>
                  </div>
                )}
                {period === "custom" && (
                  <span className="flex items-center gap-2 rounded-xl border border-black/10 bg-white px-3 py-1.5 text-[11px] font-bold uppercase text-slate-600">
                    From <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="bg-transparent text-xs font-bold outline-none" />
                    To <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="bg-transparent text-xs font-bold outline-none" />
                  </span>
                )}
              </div>
            )}

            {admin && tab === "dashboard" && <Dashboard s={shared} onOpen={setTab} earned={earned} redeemed={redeemed} />}
            {tab === "customers" && <Customers s={shared} admin={admin} />}
            {admin && tab === "rewards" && <LoyaltyRewards d={d} reload={reload} />}
            {admin && tab === "records" && <RewardRecords s={shared} />}
            {admin && tab === "crm" && <Crm s={shared} />}
            {admin && tab === "settings" && <LoyaltySettings d={d} reload={reload} />}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Excel exports (Dashboard tab) */
function excelDashboard(s: Shared, earned: number, redeemed: number) {
  const { d, range } = s;
  const newCust = d.customers.filter((c) => within(c.createdAt, range)).length;
  const gifts = d.vouchers.filter((v) => v.status === "used" && within(v.usedAt ?? 0, range)).reduce((a, v) => a + v.giftQty, 0);
  downloadCsv("loyalty-dashboard", [
    ["Metric", "Value"], ["Loyalty customers", d.customers.length], ["New customers", newCust], ["Points earned", earned],
    ["Points redeemed", redeemed], ["Available points", d.totals.outstanding], ["Free gifts given", gifts],
  ]);
}
function excelLedger(s: Shared) {
  const { d, ledger } = s;
  const who = (id: string) => d.customers.find((c) => c.id === id);
  downloadCsv("loyalty-points-transactions", [
    ["Date", "Customer", "Type", "Points", "Balance after", "Bill", "Note"],
    ...ledger.map((l) => [fmtDateTime(l.createdAt), who(l.customerId)?.name || who(l.customerId)?.phone || "", l.type, l.points, l.balanceAfter, l.billId ?? "", l.description]),
  ]);
}

/* ------------------------------------------------------------------ Dashboard */
function Dashboard({ s, onOpen, earned, redeemed }: { s: Shared; onOpen: (t: Tab) => void; earned: number; redeemed: number }) {
  const { d, range, label, ledger } = s;
  const newCust = d.customers.filter((c) => within(c.createdAt, range)).length;
  const gifts = d.vouchers.filter((v) => v.status === "used" && within(v.usedAt ?? 0, range)).reduce((a, v) => a + v.giftQty, 0);
  const unlocked = d.vouchers.filter((v) => v.status === "issued").length;
  const pending = d.messages.filter((m) => m.status === "pending").length;
  const failed = d.messages.filter((m) => m.status === "failed").length;
  const opened = d.messages.filter((m) => m.status === "opened").length;
  const name = (id: string) => d.customers.find((c) => c.id === id);
  const byPoints = [...d.customers].sort((a, b) => b.available - a.available).filter((c) => c.available > 0).slice(0, 5);
  const bySpend = [...d.customers].sort((a, b) => (d.spend[b.id] ?? 0) - (d.spend[a.id] ?? 0)).filter((c) => (d.spend[c.id] ?? 0) > 0).slice(0, 5);
  const given = d.vouchers.filter((v) => v.status === "used").slice(0, 6);
  const max = Math.max(1, ...d.months.map((m) => Math.max(m.earned, m.redeemed)));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="New customers" value={newCust} hint={label} />
        <Stat label="Points earned" value={earned.toLocaleString("en-IN")} tone="green" hint={label} />
        <Stat label="Points redeemed" value={redeemed.toLocaleString("en-IN")} tone="amber" hint={label} />
        <Stat label="Free gifts given" value={gifts} hint={`${label} · ${unlocked} unlocked, waiting`} />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className={cx(card, "p-5")}>
          <h3 className="mb-4 text-[15px] font-bold">Points, last 6 months</h3>
          {d.months.length === 0 ? (
            <p className="py-16 text-center text-[13px] text-slate-500">Points will appear here after the first loyalty bill.</p>
          ) : (
            <div className="flex h-48 items-end gap-4">
              {d.months.map((m) => (
                <div key={m.month} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-40 w-full items-end justify-center gap-1">
                    <div title={`Earned ${m.earned}`} className="w-1/3 rounded-t bg-emerald-500" style={{ height: `${(m.earned / max) * 100}%` }} />
                    <div title={`Redeemed ${m.redeemed}`} className="w-1/3 rounded-t bg-amber-500" style={{ height: `${(m.redeemed / max) * 100}%` }} />
                  </div>
                  <span className="text-[10px] font-semibold text-slate-500">{m.month}</span>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className={cx(card, "p-5")}>
          <h3 className="mb-3 text-[15px] font-bold">What needs doing</h3>
          <ul className="space-y-2 text-[13px] text-slate-600">
            <li>{pending ? <button onClick={() => onOpen("customers")} className="font-semibold text-[#C1272D] underline cursor-pointer">{pending} WhatsApp message{pending === 1 ? "" : "s"} waiting</button> : "✓ No WhatsApp messages waiting"}</li>
            <li className={failed ? "font-semibold text-red-600" : ""}>{failed ? `${failed} failed message${failed === 1 ? "" : "s"}` : "✓ No failed messages"}</li>
            <li>{unlocked ? <button onClick={() => onOpen("records")} className="font-semibold text-[#C1272D] underline cursor-pointer">{unlocked} unlocked gift{unlocked === 1 ? "" : "s"} waiting</button> : "✓ No unlocked gifts waiting"}</li>
            <li>✓ No points about to expire</li>
          </ul>
          <p className="mt-4 rounded-xl bg-[#F6F3E9] px-3 py-3 text-[12.5px] text-slate-600">
            Customers hold <b>{d.totals.outstanding.toLocaleString("en-IN")}</b> points, worth <b>{rupee(d.totals.outstanding * d.config.redeem.pointValue)}</b> if all were used. WhatsApp messages: {opened} opened, {pending} waiting.
          </p>
        </section>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={cx(card, "p-5")}>
          <h3 className="mb-3 text-[15px] font-bold">Top customers by points</h3>
          {byPoints.length === 0 ? <p className="py-6 text-center text-[13px] text-slate-500">Nobody yet.</p> : (
            <ol className="space-y-2">{byPoints.map((c) => <li key={c.id} className="flex justify-between text-[13px]"><span className="font-semibold">{c.name || c.phone}</span><b>{c.available}</b></li>)}</ol>
          )}
        </section>
        <section className={cx(card, "p-5")}>
          <h3 className="mb-3 text-[15px] font-bold">Top customers by spending</h3>
          {bySpend.length === 0 ? <p className="py-6 text-center text-[13px] text-slate-500">Nobody yet.</p> : (
            <ol className="space-y-2">{bySpend.map((c) => <li key={c.id} className="flex justify-between text-[13px]"><span className="font-semibold">{c.name || c.phone}</span><b>{rupee(d.spend[c.id] ?? 0)}</b></li>)}</ol>
          )}
        </section>
        <section className={cx(card, "p-5")}>
          <div className="mb-3 flex items-center justify-between"><h3 className="text-[15px] font-bold">Free gifts given</h3><button onClick={() => onOpen("rewards")} className="text-xs font-extrabold text-[#C1272D] cursor-pointer">Manage gifts</button></div>
          {given.length === 0 ? <p className="py-6 text-center text-[13px] text-slate-500">No free gifts have been given yet.</p> : (
            <ul className="space-y-2">{given.map((v) => <li key={v.id} className="flex justify-between text-[13px]"><span>{v.name} × {v.giftQty}</span><span className="text-slate-500">{name(v.customerId)?.name || name(v.customerId)?.phone}</span></li>)}</ul>
          )}
        </section>
        <section className={cx(card, "p-5")}>
          <h3 className="mb-3 text-[15px] font-bold">Points about to expire</h3>
          <p className="py-6 text-center text-[13px] text-slate-500">{d.config.expiry.days > 0 ? "No points are about to expire." : "Points never expire (you can change this in Settings)."}</p>
        </section>
      </div>
      <section className={cx(card, "p-5")}>
        <h3 className="mb-3 text-[15px] font-bold">Latest WhatsApp messages</h3>
        {d.messages.length === 0 ? <p className="py-6 text-center text-[13px] text-slate-500">No messages yet.</p> : (
          <ul className="divide-y divide-black/5">{d.messages.slice(0, 6).map((m) => <MessageRow key={m.id} m={m} d={d} reload={s.reload} />)}</ul>
        )}
      </section>
    </div>
  );
}

function MessageRow({ m, d, reload }: { m: LoyaltyMessage; d: LoyaltyData; reload: () => Promise<void> }) {
  const c = d.customers.find((x) => x.id === m.customerId);
  const open = async () => {
    window.open(waLink(m.phone, m.text), "_blank", "noopener,noreferrer");
    await loyaltyMsgOpenAction(m.id);
    await reload();
  };
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-bold text-slate-800">{c?.name || m.phone} <span className="font-medium text-slate-400">· {m.type} · {fmtDateTime(m.createdAt)}</span></p>
        <p className="mt-0.5 line-clamp-2 text-[12.5px] text-slate-600">{m.text}</p>
      </div>
      <div className="flex items-center gap-2">
        <span className={cx("rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase", m.status === "opened" ? "bg-emerald-50 text-emerald-700" : m.status === "failed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700")}>
          {m.status === "opened" ? "Opened in WhatsApp" : m.status === "failed" ? "Failed" : "Ready to send"}
        </span>
        {m.status === "failed" ? (
          <Btn className="h-8 px-3" onClick={async () => { await loyaltyMsgRetryAction(m.id); await reload(); }}>Retry</Btn>
        ) : (
          <Btn kind="green" className="h-8 px-3" onClick={open}>{m.status === "opened" ? "Send again" : "Send on WhatsApp"}</Btn>
        )}
      </div>
    </li>
  );
}

/* ------------------------------------------------------------------ Customers */
function Customers({ s, admin }: { s: Shared; admin: boolean }) {
  const { d, range, reload } = s;
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [add, setAdd] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const list = d.customers.filter((c) => within(c.createdAt, range) && (status === "all" || c.status === status) &&
    (!q || c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q.replace(/\D/g, "") || "\u0000")));
  const open = openId ? d.customers.find((c) => c.id === openId) ?? null : null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl bg-[#F6F3E9] pl-4"><Search className="h-4 w-4 text-slate-400" /><SearchInput value={q} onChange={setQ} placeholder="Search by name or mobile number…" /></div>
        <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-[13px] font-semibold cursor-pointer">
          <option value="all">Active &amp; deactivated</option><option value="active">Active only</option><option value="inactive">Deactivated only</option>
        </select>
        <ExcelBtn disabled={!list.length} onClick={() => downloadCsv("loyalty-customers", [["Name", "Mobile", "Points", "Earned", "Redeemed", "Purchases", "Joined", "Status"], ...list.map((c) => [c.name, c.phone, c.available, c.lifetime, c.redeemed, d.spend[c.id] ?? 0, fmtDate(c.createdAt), c.status])])} />
        <Btn kind="red" onClick={() => setAdd(true)}><Plus className="h-4 w-4" /> Add customer</Btn>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
        <table className="w-full min-w-[760px] border-collapse text-left">
          <thead className="bg-[#F6F3E9]"><tr>{["Customer", "Mobile", "Points", "Earned", "Redeemed", "Purchases", "Joined"].map((h, i) => <th key={h} className={cx("p-3 text-[10.5px] font-black uppercase tracking-wider text-slate-600", i >= 2 && i <= 5 && "text-right")}>{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-black/5">
            {list.map((c) => (
              <tr key={c.id} onClick={() => setOpenId(c.id)} className="cursor-pointer hover:bg-[#FAF7F2]">
                <td className="p-3 text-sm font-bold">{c.name || "—"}{c.status === "inactive" && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-slate-500">Deactivated</span>}</td>
                <td className="p-3 text-sm">{c.phone}</td>
                <td className="p-3 text-right text-sm font-black">{c.available}</td>
                <td className="p-3 text-right text-sm">{c.lifetime}</td>
                <td className="p-3 text-right text-sm">{c.redeemed}</td>
                <td className="p-3 text-right text-sm">{rupee(d.spend[c.id] ?? 0)}</td>
                <td className="p-3 text-sm text-slate-600">{fmtDate(c.createdAt)}</td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={7}><Empty title={d.customers.length ? "No customers match" : "No loyalty customers yet"}>Add a customer, or enrol one while billing.</Empty></td></tr>}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11.5px] text-slate-500">{list.length} record{list.length === 1 ? "" : "s"}</p>
      {add && <CustomerForm d={d} onClose={() => setAdd(false)} onSaved={async () => { setAdd(false); await reload(); }} />}
      {open && <CustomerDetail c={open} s={s} admin={admin} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function CustomerForm({ d, c, onClose, onSaved }: { d: LoyaltyData; c?: LoyaltyCustomer; onClose: () => void; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({ name: c?.name ?? "", phone: c?.phone ?? "", email: c?.email ?? "", birthday: c?.birthday ?? "", whatsapp: c?.whatsapp ?? "", consent: c?.consent ?? d.config.display.defaultConsent });
  const { busy, run } = useBusy();
  const save = async () => {
    const ok = await run(async () => {
      if (c) await loyaltyUpdateAction(c.id, f);
      else await loyaltyRegisterAction(f);
      return true;
    });
    if (ok) await onSaved();
  };
  return (
    <Modal title={c ? "Edit customer" : "Add customer"} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="red" disabled={busy || !/^[6-9]\d{9}$/.test(f.phone)} onClick={save}>{busy ? "Saving…" : c ? "Save changes" : "Add customer"}</Btn></>}>
      <div className="space-y-4">
        <label className="block"><span className={labelCls}>Name</span><input className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
        <label className="block"><span className={labelCls}>Mobile *</span><input className={field} inputMode="numeric" value={f.phone} maxLength={10} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} /></label>
        <label className="block"><span className={labelCls}>Email</span><input className={field} value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        <label className="block"><span className={labelCls}>Birthday</span><input className={field} type="date" value={f.birthday} onChange={(e) => setF({ ...f, birthday: e.target.value })} /></label>
        <label className="block"><span className={labelCls}>WhatsApp number (if different)</span><input className={field} inputMode="numeric" value={f.whatsapp} maxLength={10} onChange={(e) => setF({ ...f, whatsapp: e.target.value.replace(/\D/g, "").slice(0, 10) })} /></label>
        <div className="flex items-center justify-between gap-4 rounded-xl bg-[#F6F3E9] px-4 py-3">
          <span className="text-[13px] font-bold text-slate-800">Customer agrees to WhatsApp messages</span>
          <Switch on={f.consent} onChange={(v) => setF({ ...f, consent: v })} label="WhatsApp consent" />
        </div>
      </div>
    </Modal>
  );
}

function CustomerDetail({ c, s, admin, onClose }: { c: LoyaltyCustomer; s: Shared; admin: boolean; onClose: () => void }) {
  const { d, reload } = s;
  const [edit, setEdit] = useState(false);
  const [adj, setAdj] = useState(false);
  const [pts, setPts] = useState("");
  const [reason, setReason] = useState("");
  const [hist, setHist] = useState<LedgerEntry[] | null>(null);
  const { busy, run } = useBusy();
  useEffect(() => {
    let live = true;
    loyaltyLedgerAction(undefined, undefined).then((r) => live && setHist(r.filter((x) => x.customerId === c.id))).catch(() => live && setHist([]));
    return () => { live = false; };
  }, [c.id, c.available]);
  const vouchers = d.vouchers.filter((v) => v.customerId === c.id);
  const msgs = d.messages.filter((m) => m.customerId === c.id);
  const purchases = d.purchases[c.id] ?? [];
  const doAdjust = async () => {
    const ok = await run(async () => { await loyaltyAdjustAction(c.id, Number(pts), reason); return true; });
    if (ok) { setAdj(false); setPts(""); setReason(""); await reload(); }
  };
  return (
    <Modal wide title={c.name || c.phone} onClose={onClose} footer={<><ExcelBtn onClick={() => downloadCsv(`loyalty-${c.phone}`, [["Date", "Type", "Points", "Balance", "Note"], ...(hist ?? []).map((l) => [fmtDateTime(l.createdAt), l.type, l.points, l.balanceAfter, l.description])])} /><Btn onClick={onClose}>Close</Btn></>}>
      <div className="space-y-5">
        <div className="space-y-1 text-[13px]">
          <p>Mobile <b>{c.phone}</b></p>
          <p>WhatsApp <b>{c.whatsapp || c.phone}</b> {!c.consent && <span className="ml-1 rounded bg-[#F6F3E9] px-2 py-0.5 text-[10px] font-extrabold uppercase text-slate-500">No WhatsApp consent</span>}</p>
          <p>Joined {fmtDate(c.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={() => setEdit(true)}>Edit</Btn>
          {admin && <Btn onClick={() => setAdj(true)}>Add / remove points</Btn>}
          {admin && <Btn onClick={async () => { await loyaltyStatusAction(c.id, c.status === "active" ? "inactive" : "active"); await reload(); }}>{c.status === "active" ? "Deactivate" : "Reactivate"}</Btn>}
          {admin && <Btn kind="danger" onClick={async () => { if (window.confirm(`Delete ${c.name || c.phone}? Their points history is deleted too.`)) { await loyaltyDeleteAction(c.id); onClose(); await reload(); } }}><Trash2 className="h-4 w-4" /> Delete customer</Btn>}
        </div>
        <div>
          <h4 className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-600">Points</h4>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Available" value={c.available} tone="green" hint={`worth ${rupee(c.available * d.config.redeem.pointValue)}`} />
            <Stat label="Total earned" value={c.lifetime} />
            <Stat label="Total redeemed" value={c.redeemed} />
            <Stat label="Total purchases" value={rupee(d.spend[c.id] ?? 0)} />
          </div>
          {!hist?.length ? <p className="mt-3 text-center text-[13px] text-slate-500">No points activity yet.</p> : (
            <ul className="mt-3 divide-y divide-black/5 rounded-xl border border-black/10 bg-white text-[13px]">
              {hist.slice(0, 15).map((l) => <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2"><span><b className="capitalize">{l.type.replace("_", " ")}</b> <span className="text-slate-500">· {l.description} · {fmtDateTime(l.createdAt)}</span></span><b className={l.points >= 0 ? "text-emerald-600" : "text-amber-600"}>{l.points > 0 ? "+" : ""}{l.points}</b></li>)}
            </ul>
          )}
        </div>
        <div>
          <h4 className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-600">Free gifts &amp; rewards</h4>
          {!vouchers.length ? <p className="text-center text-[13px] text-slate-500">{d.rewards.length ? "No gifts unlocked yet." : "No rewards are set up yet — add them in Free Gifts & Rewards."}</p> : (
            <ul className="space-y-1.5 text-[13px]">{vouchers.map((v) => <li key={v.id} className="flex justify-between rounded-lg bg-white px-3 py-2 border border-black/10"><span>{v.name} × {v.giftQty}</span><span className="font-bold capitalize">{v.status === "issued" ? "Unlocked" : v.status === "used" ? "Claimed" : v.status}</span></li>)}</ul>
          )}
        </div>
        <div>
          <h4 className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-600">Purchase history</h4>
          {!purchases.length ? <p className="text-center text-[13px] text-slate-500">No paid bills for this mobile number yet.</p> : (
            <ul className="divide-y divide-black/5 rounded-xl border border-black/10 bg-white text-[13px]">{purchases.slice(0, 20).map((p) => <li key={p.id} className="flex justify-between px-3 py-2"><span>{p.id} <span className="text-slate-500">· {fmtDateTime(p.createdAt)}</span></span><b>{rupee(p.total)}</b></li>)}</ul>
          )}
        </div>
        <div>
          <h4 className="mb-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-600">WhatsApp messages</h4>
          <p className="mb-2 text-[12px] text-slate-500">Messages are prepared automatically but WhatsApp can&apos;t confirm delivery, so they show as “Ready to send” until you open them, then “Opened in WhatsApp”.</p>
          {!c.consent ? <p className="text-center text-[13px] text-slate-500">This customer hasn&apos;t agreed to WhatsApp messages, so none are prepared.</p> : !msgs.length ? <p className="text-center text-[13px] text-slate-500">No messages yet.</p> : <ul className="divide-y divide-black/5">{msgs.map((m) => <MessageRow key={m.id} m={m} d={d} reload={reload} />)}</ul>}
        </div>
      </div>
      {edit && <CustomerForm d={d} c={c} onClose={() => setEdit(false)} onSaved={async () => { setEdit(false); await reload(); }} />}
      {adj && (
        <Modal title={`Add / remove points · ${c.name || c.phone}`} onClose={() => setAdj(false)} footer={<><Btn onClick={() => setAdj(false)}>Cancel</Btn><Btn kind="red" disabled={busy || !Number(pts) || !reason.trim()} onClick={doAdjust}>{busy ? "Saving…" : "Apply"}</Btn></>}>
          <div className="space-y-4">
            <label className="block"><span className={labelCls}>Points (use − to remove)</span><input className={field} type="number" value={pts} onChange={(e) => setPts(e.target.value)} placeholder="e.g. 50 or -20" /></label>
            <label className="block"><span className={labelCls}>Reason *</span><input className={field} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Kept in the history" /></label>
            <p className="text-[12px] text-slate-500">Current balance {c.available} → {Math.max(0, c.available + (Number(pts) || 0))}</p>
          </div>
        </Modal>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ Rewards earned */
function RewardRecords({ s }: { s: Shared }) {
  const { d, range, reload } = s;
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | Voucher["status"]>("all");
  const rows = d.vouchers.filter((v) => within(v.issuedAt, range) && (kind === "all" || v.status === kind) &&
    (!q || v.name.toLowerCase().includes(q.toLowerCase()) || (d.customers.find((c) => c.id === v.customerId)?.name ?? "").toLowerCase().includes(q.toLowerCase()) || (v.invoiceNo ?? "").toLowerCase().includes(q.toLowerCase())));
  const count = (st: Voucher["status"]) => d.vouchers.filter((v) => v.status === st && within(v.issuedAt, range)).length;
  const cust = (id: string) => d.customers.find((c) => c.id === id);
  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Unlocked" value={count("issued")} hint="waiting to be claimed" />
        <Stat label="Claimed" value={count("used")} hint="handed over on a bill" />
        <Stat label="Cancelled" value={count("cancelled")} hint="taken back" />
        <Stat label="Expired" value={count("expired")} hint="ran out of time" />
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl bg-[#F6F3E9] pl-4"><Search className="h-4 w-4 text-slate-400" /><SearchInput value={q} onChange={setQ} placeholder="Search customer, reward or bill…" /></div>
        <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className="h-11 rounded-xl border border-black/10 bg-white px-3 text-[13px] font-semibold cursor-pointer">
          <option value="all">Every kind</option><option value="issued">Unlocked</option><option value="used">Claimed</option><option value="cancelled">Cancelled</option><option value="expired">Expired</option>
        </select>
        <ExcelBtn disabled={!rows.length} onClick={() => downloadCsv("rewards-earned", [["Date", "Customer", "Reward", "Qty", "Status", "Bill"], ...rows.map((v) => [fmtDateTime(v.issuedAt), cust(v.customerId)?.name || cust(v.customerId)?.phone || "", v.name, v.giftQty, v.status, v.invoiceNo ?? ""])])} />
      </div>
      {!rows.length ? (
        <div className="rounded-2xl border border-black/10 bg-white py-14 text-center"><Star className="mx-auto mb-2 h-6 w-6 text-slate-300" /><p className="text-sm font-bold">No rewards here yet</p><p className="mx-auto mt-1 max-w-md text-xs text-slate-500">Gifts show up as soon as a customer unlocks one, or a bill offer gives one.</p></div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
          <table className="w-full min-w-[700px] border-collapse text-left">
            <thead className="bg-[#F6F3E9]"><tr>{["Date", "Customer", "Reward", "Status", "Bill", ""].map((h) => <th key={h} className="p-3 text-[10.5px] font-black uppercase tracking-wider text-slate-600">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-black/5">{rows.map((v) => (
              <tr key={v.id}>
                <td className="p-3 text-xs text-slate-600">{fmtDateTime(v.issuedAt)}</td>
                <td className="p-3 text-sm font-bold">{cust(v.customerId)?.name || cust(v.customerId)?.phone}</td>
                <td className="p-3 text-sm">{v.name} × {v.giftQty}</td>
                <td className="p-3 text-xs font-extrabold uppercase">{v.status === "issued" ? "Unlocked" : v.status === "used" ? "Claimed" : v.status}</td>
                <td className="p-3 text-xs">{v.invoiceNo ?? "—"}</td>
                <td className="p-3 text-right">{v.status === "issued" && <Btn className="h-8 px-3" onClick={async () => { if (window.confirm("Take this gift back?")) { await loyaltyVoucherCancelAction(v.id); await reload(); } }}>Cancel</Btn>}</td>
              </tr>))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ Customer CRM */
/* Each customer group gets its own starting message; edits are kept per group while the page is open. */
const CRM_MESSAGES: Record<Segment | "all", string> = {
  all: "Hi {name}! Thank you for being part of {shop}. See you again soon!",
  new: "Hi {name}! Welcome to {shop}. We're so glad you joined us — see you again soon!",
  regular: "Hi {name}! Thanks for being a regular at {shop}. Keep collecting points for free gifts!",
  frequent: "Hi {name}! You're one of our most frequent visitors at {shop}. Thank you — your next reward is closer than you think!",
  high_value: "Hi {name}! Thank you for being one of our most valued customers at {shop}. We have something special for you on your next visit.",
  vip: "Hi {name}! As a VIP of {shop}, you get our very best. Visit us soon for an exclusive treat!",
  at_risk: "Hi {name}! We miss you at {shop}. Come back soon — we'd love to see you again!",
  inactive: "Hi {name}! It's been a while since your last visit to {shop}. Drop by — we have something new for you!",
  lost: "Hi {name}! We'd love to welcome you back to {shop}. Visit us again and we'll make it worth your while.",
};

function Crm({ s }: { s: Shared }) {
  const { d, range } = s;
  const [q, setQ] = useState("");
  const [seg, setSeg] = useState<Segment | null>(null);
  const [texts, setTexts] = useState<Partial<Record<Segment | "all", string>>>({});
  const key: Segment | "all" = seg ?? "all";
  const text = texts[key] ?? CRM_MESSAGES[key];
  const setText = (v: string) => setTexts((t) => ({ ...t, [key]: v }));
  const all = d.customers.filter((c) => c.status === "active");
  const segOf = (id: string) => d.segments[id] ?? null;
  const rows = all.filter((c) => (!seg || segOf(c.id) === seg) && (!q || c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q.replace(/\D/g, "") || "\u0000")) && (range ? d.purchases[c.id]?.some((p) => within(p.createdAt, range)) || within(c.createdAt, range) : true));
  const fill = (c: LoyaltyCustomer) => fillMessage(text, { name: c.name || "there", shop: d.shopName, balance: c.available, points: c.available });
  return (
    <div>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {SEGMENTS.map((x) => (
          <button key={x.key} onClick={() => setSeg(seg === x.key ? null : x.key)} className={cx("rounded-xl border bg-white p-3 text-left cursor-pointer transition", seg === x.key ? "border-[#C1272D] bg-[#FBEFEF]" : "border-black/10 hover:bg-slate-50")}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{x.label}</div>
            <div className="mt-2 text-xl font-black">{all.filter((c) => segOf(c.id) === x.key).length}</div>
          </button>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl bg-[#F6F3E9] pl-4"><Search className="h-4 w-4 text-slate-400" /><SearchInput value={q} onChange={setQ} placeholder="Search by name or mobile number…" /></div>
        {seg && <Btn onClick={() => setSeg(null)}>Show everyone</Btn>}
        <ExcelBtn disabled={!rows.length} onClick={() => downloadCsv(`customer-crm${seg ? `-${seg}` : ""}`, [["Name", "Mobile", "Group", "Visits", "Spent", "Avg bill", "Last visit", "Points"], ...rows.map((c) => { const st = d.stats[c.id]; return [c.name, c.phone, SEGMENTS.find((x) => x.key === segOf(c.id))?.label ?? "No bills yet", st?.visits ?? 0, st?.spent ?? 0, st?.aov ?? 0, st?.last ? fmtDate(st.last) : "", c.available]; })])} />
      </div>
      <label className="mb-1 block text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-600">WhatsApp message{seg ? ` for “${SEGMENTS.find((x) => x.key === seg)?.label}”` : ""}</label>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-[13px] outline-none focus:border-[#C1272D]" />
      <p className="mb-3 mt-1 text-[11.5px] text-slate-500">{"{name}"} and {"{shop}"} are filled in for each customer. Only customers who agreed to WhatsApp messages get a Send button.</p>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-bold text-slate-800">
          Showing: <span className="text-[#C1272D]">{seg ? SEGMENTS.find((x) => x.key === seg)?.label : "Everyone"}</span>{" "}
          <span className="font-semibold text-slate-500">· {rows.length} customer{rows.length === 1 ? "" : "s"}</span>
        </p>
        <p className="text-[11.5px] text-slate-500">
          Send uses the message above{seg ? ` for “${SEGMENTS.find((x) => x.key === seg)?.label}”` : ""}.
        </p>
      </div>
      {!rows.length ? (
        <div className="rounded-2xl border border-black/10 bg-white py-12 text-center"><Users className="mx-auto mb-2 h-6 w-6 text-slate-300" /><p className="text-sm font-bold">No customers here</p><p className="text-xs text-slate-500">{seg ? `No customers are in “${SEGMENTS.find((x) => x.key === seg)?.label}” right now. Try another group or search.` : "Try another group or search."}</p></div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white">
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead className="bg-[#F6F3E9]"><tr>{["Customer", "Group", "Visits", "Spent", "Avg bill", "Last visit", "Points", "WhatsApp"].map((h, i) => <th key={h} className={cx("p-3 text-[10.5px] font-black uppercase tracking-wider text-slate-600", i >= 2 && i <= 6 && "text-right")}>{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-black/5">{rows.map((c) => { const st = d.stats[c.id]; const sg = SEGMENTS.find((x) => x.key === segOf(c.id)); return (
              <tr key={c.id}>
                <td className="p-3"><div className="text-sm font-bold">{c.name || "—"}</div><div className="text-xs text-slate-500">{c.phone}</div></td>
                <td className="p-3 text-xs">{sg ? <b>{sg.label}</b> : <span className="text-slate-400">No bills yet</span>}</td>
                <td className="p-3 text-right text-sm">{st?.visits ?? 0}</td>
                <td className="p-3 text-right text-sm">{rupee(st?.spent ?? 0)}</td>
                <td className="p-3 text-right text-sm">{rupee(st?.aov ?? 0)}</td>
                <td className="p-3 text-right text-sm">{st?.last ? fmtDate(st.last) : "—"}</td>
                <td className="p-3 text-right text-sm font-black">{c.available}</td>
                <td className="p-3 text-right">{c.consent ? <Btn kind="green" className="h-8 px-3" onClick={() => window.open(waLink(c.whatsapp || c.phone, fill(c)), "_blank", "noopener,noreferrer")}>Send</Btn> : <span className="text-xs text-slate-400">No consent</span>}</td>
              </tr>); })}</tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11.5px] text-slate-500">{rows.length} record{rows.length === 1 ? "" : "s"}</p>
    </div>
  );
}
