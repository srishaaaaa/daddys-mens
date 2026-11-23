"use client";

import { useMemo } from "react";
import { IdCard } from "lucide-react";
import { customerStats, prospects, stateOf, todayIST, type Overview } from "@/lib/membershipTypes";
import type { BillRow } from "./MembershipPanel";

/* Membership analytics for the Analytics page. Everything is worked out from the bills and memberships already
   stored: nothing is kept twice, so it updates as soon as a bill is completed or a membership changes. */

export type SalesBill = { phone: string; total: number; discount: number; memberNo: string | null; loyaltyDiscount: number };

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
const pct = (n: number) => `${(Math.round(n * 10) / 10).toLocaleString("en-IN")}%`;

const Card = ({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: "green" | "amber" | "red" }) => (
  <div className="min-w-0 rounded-2xl border border-black/10 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
    <span className="text-[11px] font-extrabold uppercase tracking-wide text-black">{label}</span>
    <div className={`mt-4 mb-1.5 truncate text-[26px] font-black leading-none tracking-tight ${tone === "green" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : tone === "red" ? "text-[#C1272D]" : "text-black"}`}>{value}</div>
    {sub && <div className="truncate text-[10.5px] font-semibold text-black/70">{sub}</div>}
  </div>
);

export default function MembershipAnalytics({ data, allBills, salesBills }: { data: Overview; allBills: BillRow[]; salesBills: SalesBill[] }) {
  const today = todayIST();
  const month = today.slice(0, 7);
  const { members, plans, events, revenue, settings } = data;

  const m = useMemo(() => {
    let active = 0, expired = 0, inactive = 0;
    for (const x of members) {
      const s = stateOf(x, today);
      if (s === "active") active++;
      else if (s === "expired") expired++;
      else inactive++;
    }
    const inMonth = (iso: string) => iso.slice(0, 7) === month;
    const newThisMonth = events.filter((e) => e.kind === "join" && inMonth(e.at)).length;
    const renewals = events.filter((e) => e.kind === "renewal");
    const upgrades = events.filter((e) => e.kind === "upgrade");

    // plan breakdown (members by plan)
    const byPlan = new Map<string, number>();
    for (const x of members) byPlan.set(x.planName || "No plan", (byPlan.get(x.planName || "No plan") ?? 0) + 1);
    const breakdown = [...byPlan.entries()].sort((a, b) => b[1] - a[1]);

    // sales: members versus everyone else
    const phones = new Set(members.map((x) => x.phone));
    const memberSales = salesBills.filter((b) => phones.has(b.phone));
    const otherSales = salesBills.filter((b) => !phones.has(b.phone));
    const sum = (a: SalesBill[]) => a.reduce((t, b) => t + b.total, 0);
    const discountBills = salesBills.filter((b) => b.memberNo);
    const discountTotal = discountBills.reduce((t, b) => t + Math.max(0, b.discount - b.loyaltyDiscount), 0);

    // eligibility + conversion
    const stats = customerStats(allBills, settings.basis);
    const pros = prospects({ plans, members, stats });
    const eligible = pros.filter((p) => p.status === "eligible");
    const viaBilling = members.filter((x) => x.source !== "manual").length;
    const conversion = viaBilling + eligible.length > 0 ? (viaBilling / (viaBilling + eligible.length)) * 100 : 0;

    return {
      active, expired, inactive, newThisMonth, renewals: renewals.length, upgrades: upgrades.length,
      renewalsMonth: renewals.filter((e) => inMonth(e.at)).length, upgradesMonth: upgrades.filter((e) => inMonth(e.at)).length,
      breakdown, memberSales: sum(memberSales), memberAvg: memberSales.length ? sum(memberSales) / memberSales.length : 0,
      otherAvg: otherSales.length ? sum(otherSales) / otherSales.length : 0, memberBillCount: memberSales.length, otherBillCount: otherSales.length,
      discountBills: discountBills.length, discountTotal, pros, eligible: eligible.length, viaBilling, conversion,
    };
  }, [members, plans, events, allBills, salesBills, settings.basis, today, month]);

  const total = members.length;
  const lift = m.otherAvg > 0 && m.memberAvg > 0 ? ((m.memberAvg - m.otherAvg) / m.otherAvg) * 100 : null;

  return (
    <section className="mb-8">
      <h3 className="mb-3 mt-2 flex items-center gap-2 text-[15px] font-black text-black"><IdCard className="h-4 w-4 text-[#C1272D]" /> Membership</h3>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Registered members" value={total.toLocaleString("en-IN")} sub="all time" />
        <Card label="Active members" value={m.active.toLocaleString("en-IN")} tone="green" sub="valid today" />
        <Card label="Expired members" value={m.expired.toLocaleString("en-IN")} tone="amber" sub="due for renewal" />
        <Card label="Inactive members" value={m.inactive.toLocaleString("en-IN")} sub="switched off" />
        <Card label="New memberships" value={m.newThisMonth.toLocaleString("en-IN")} sub="this month" />
        <Card label="Renewals" value={m.renewals.toLocaleString("en-IN")} sub={`${m.renewalsMonth} this month`} />
        <Card label="Upgrades" value={m.upgrades.toLocaleString("en-IN")} sub={`${m.upgradesMonth} this month`} />
        <Card label="Membership revenue" value={inr(revenue)} tone="red" sub="paid fees, all time" />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm lg:col-span-1">
          <p className="mb-3 text-[11px] font-extrabold uppercase tracking-wide text-black">Members by plan</p>
          {m.breakdown.length === 0 ? (
            <p className="text-[12px] text-slate-500">No members yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {m.breakdown.map(([name, n]) => (
                <li key={name}>
                  <div className="flex justify-between text-[12px] font-semibold text-black"><span>{name}</span><span>{n} · {pct((n / total) * 100)}</span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#F6F3E9]"><div className="h-full rounded-full bg-[#C1272D]" style={{ width: `${(n / total) * 100}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid grid-cols-2 gap-4 lg:col-span-2">
          <Card label="Member discounts given" value={inr(m.discountTotal)} tone="green" sub={`${m.discountBills} bill${m.discountBills === 1 ? "" : "s"} · this period`} />
          <Card label="Sales from members" value={inr(m.memberSales)} sub={`${m.memberBillCount} bill${m.memberBillCount === 1 ? "" : "s"} · this period`} />
          <Card label="Avg bill · members" value={inr(m.memberAvg)} tone="green" sub={lift === null ? "this period" : `${lift >= 0 ? "+" : ""}${pct(lift)} vs non-members`} />
          <Card label="Avg bill · non-members" value={inr(m.otherAvg)} sub={`${m.otherBillCount} bill${m.otherBillCount === 1 ? "" : "s"} · this period`} />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Eligible customers" value={m.eligible.toLocaleString("en-IN")} tone="green" sub="not enrolled yet" />
        <Card label="Enrolled through billing" value={m.viaBilling.toLocaleString("en-IN")} sub="single bill or total purchases" />
        <Card label="Upgraded" value={m.upgrades.toLocaleString("en-IN")} sub="moved to a better plan" />
        <Card label="Conversion" value={pct(m.conversion)} tone="red" sub="eligible customers who enrolled" />
      </div>

      <div className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
        <p className="mb-3 text-[11px] font-extrabold uppercase tracking-wide text-black">Customers near or at a membership threshold</p>
        {m.pros.length === 0 ? (
          <p className="text-[12px] text-slate-500">No customers are close to a plan threshold right now. Plans that qualify by purchases (single bill or total) are set under Membership → Plans.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {m.pros.slice(0, 10).map((p) => (
              <li key={p.phone} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[12.5px]">
                <span className="font-bold text-black">{p.name || "Customer"} <span className="font-mono text-[11px] font-medium text-slate-500">{p.phone}</span></span>
                <span className={p.status === "eligible" ? "font-bold text-emerald-700" : "text-slate-600"}>
                  {p.status === "eligible" ? `Eligible for ${p.plan.name}` : `${inr(p.remaining)} away from ${p.plan.name}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
