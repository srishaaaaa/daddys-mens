"use client";

import { useMemo, useState } from "react";
import { Trash2, Plus } from "lucide-react";
import type { LoyaltyData } from "@/lib/loyalty/server";
import { MESSAGE_FIELDS, MESSAGE_META, crmWarnings, rangeWarnings, rangesValid, sanitizeConfig, type LoyaltyConfig, type MessageKey } from "@/lib/loyalty/config";
import { redeemRange } from "@/lib/loyalty/engine";
import { loyaltyConfigAction } from "@/app/pos/loyalty-actions";
import { Btn, ExcelBtn, Switch, card, cx, downloadCsv, fmtDateTime, useBusy } from "./loyaltyKit";
import { unwrap } from "@/lib/actionResult";

// These report problems as results; unwrap turns them back into errors that carry the real message.
const saveConfig = (...a: Parameters<typeof loyaltyConfigAction>) => unwrap(loyaltyConfigAction(...a));


const numIn = "h-10 w-28 rounded-lg border border-black/15 bg-white px-3 text-right text-sm font-bold outline-none focus:border-[#C1272D]";
const Card = ({ title, sub, right, children }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode }) => (
  <section className={cx(card, "p-5 sm:p-6")}>
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-[15px] font-bold">{title}</h3>{right}</div>
    {sub && <p className="mt-1 text-[12.5px] text-slate-500">{sub}</p>}
    <div className="mt-4 space-y-4">{children}</div>
  </section>
);
const Cap = ({ children }: { children: React.ReactNode }) => <div className="text-[10.5px] font-black uppercase tracking-[0.14em] text-slate-600">{children}</div>;
const Check = ({ on, onChange, children }: { on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) => (
  <label className="flex cursor-pointer items-start gap-3 text-[13px] text-slate-700"><input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#C1272D]" /><span>{children}</span></label>
);

export default function LoyaltySettings({ d, reload }: { d: LoyaltyData; reload: () => Promise<void> }) {
  const [c, setC] = useState<LoyaltyConfig>(() => structuredClone(d.config));
  const [reason, setReason] = useState("");
  const [bill, setBill] = useState(500);
  const [rbill, setRbill] = useState(300);
  const { busy, run } = useBusy();
  const dirty = useMemo(() => JSON.stringify(sanitizeConfig(c)) !== JSON.stringify(d.config), [c, d.config]);
  const set = (fn: (x: LoyaltyConfig) => void) => setC((p) => { const n = structuredClone(p); fn(n); return n; });
  const n = (v: string) => (v === "" ? 0 : Number(v));

  const save = async () => {
    const ok = await run(async () => { await saveConfig(c, reason); return true; });
    if (ok) { setReason(""); await reload(); }
  };

  const raw = (bill / 100) * c.earn.per100;
  const tryPts = Math.max(0, c.earn.rounding === "ceil" ? Math.ceil(raw - 1e-9) : Math.floor(raw + 1e-9));
  const range = redeemRange(rbill, c.redeem.ranges);
  const rw = rangeWarnings(c.redeem.ranges, c.redeem.pointValue);
  const cw = crmWarnings(c.crm);
  const toggle = (arr: string[], v: string) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const itemsWithOwn = 0;

  const Exclusion = ({ ids, cats, onIds, onCats, title, blurb }: { ids: string[]; cats: string[]; onIds: (v: string[]) => void; onCats: (v: string[]) => void; title: string; blurb: string }) => (
    <div className="rounded-2xl border border-black/10 p-4">
      <p className="text-[13px] font-bold">{title}</p><p className="text-[12px] text-slate-500">{blurb}</p>
      <div className="mt-3"><Cap>By category</Cap>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {d.categories.map((cat) => (
            <button key={cat} type="button" onClick={() => onCats(toggle(cats, cat))} className={cx("rounded-full border px-3.5 py-1.5 text-[12px] font-semibold cursor-pointer", cats.includes(cat) ? "border-[#C1272D] bg-[#FBEFEF] text-[#C1272D]" : "border-black/15 bg-white text-slate-700")}>{cat}</button>
          ))}
          <span className="text-[11px] text-slate-400">{cats.length ? `${cats.length} categor${cats.length === 1 ? "y" : "ies"} excluded` : "No category is excluded"}</span>
        </div>
      </div>
      <div className="mt-3"><Cap>Single items</Cap>
        <select className="mt-2 h-10 w-full max-w-xs rounded-lg border border-black/15 bg-white px-3 text-sm cursor-pointer" value="" onChange={(e) => e.target.value && onIds(toggle(ids, e.target.value))}>
          <option value="">Add an item…</option>
          {d.products.filter((p) => !ids.includes(p.id)).map((p) => <option key={p.id} value={p.id}>{p.category} · {p.name}</option>)}
        </select>
        <div className="mt-2 flex flex-wrap gap-2">{ids.map((id) => <button key={id} onClick={() => onIds(ids.filter((x) => x !== id))} className="rounded-full border border-[#C1272D] bg-[#FBEFEF] px-3 py-1 text-[12px] text-[#C1272D] cursor-pointer">{d.products.find((p) => p.id === id)?.name ?? id} ✕</button>)}</div>
        {!ids.length && <p className="mt-1 text-[11px] text-slate-400">No single item is excluded</p>}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* sticky save bar */}
      <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-2xl border border-black/10 bg-[#FDFCF7]/95 px-4 py-3 shadow-sm backdrop-blur">
        <Switch on={c.enabled} onChange={(v) => set((x) => { x.enabled = v; })} label="Loyalty programme" />
        <span className="min-w-0 flex-1 text-[13px] font-bold">{c.enabled ? "Loyalty programme is ON" : "Loyalty programme is OFF — no points, no loyalty gifts, no bill offers, no messages"}</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for the change (audit log)" className="h-10 w-64 rounded-xl border border-black/10 bg-white px-3 text-[13px] outline-none" />
        <ExcelBtn onClick={() => downloadCsv("loyalty-settings-log", [["When", "Who", "Action", "Reason"], ...d.audit.filter((a) => a.action === "settings").map((a) => [fmtDateTime(a.createdAt), a.actor, a.action, a.reason])])} />
        <Btn disabled={!dirty || busy} onClick={() => setC(structuredClone(d.config))}>Discard</Btn>
        <Btn kind="red" disabled={!dirty || busy || !rangesValid(c.redeem.ranges)} onClick={save}>{busy ? "Saving…" : "Save settings"}</Btn>
      </div>

      <Card title="1 · Earning points" sub="Every time a customer pays a bill, they collect points. Decide how many here.">
        <div className="flex flex-wrap items-center gap-2 text-[14px]">A customer earns <input className={numIn} type="number" min={0} value={c.earn.per100} onChange={(e) => set((x) => { x.earn.per100 = n(e.target.value); })} /> points for every ₹100 they spend.</div>
        <p className="text-[12px] text-slate-500">“Spend” means the bill amount after discounts — GST and extra charges are not counted. Free gifts, and the part paid with points, never earn points.</p>
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900"><b>Items with their own points.</b> {itemsWithOwn} of your {d.products.length} items have one. Every other item follows the rule above. The points of all items on a bill are added together.</p>
        <div className="flex flex-wrap items-center gap-2 text-[14px]">Bills smaller than ₹ <input className={numIn} type="number" min={0} value={c.earn.minBill} onChange={(e) => set((x) => { x.earn.minBill = n(e.target.value); })} /> earn no points. <span className="text-[12px] text-slate-400">(0 means every bill earns)</span></div>
        <div className="flex flex-wrap items-center gap-2 text-[14px]">If the points come to a part (like 12.5), they are
          <select className="h-10 rounded-lg border border-black/15 bg-white px-3 text-sm font-semibold cursor-pointer" value={c.earn.rounding} onChange={(e) => set((x) => { x.earn.rounding = e.target.value as "floor" | "ceil"; })}><option value="floor">rounded down — 12.5 becomes 12</option><option value="ceil">rounded up — 12.5 becomes 13</option></select></div>
        <Exclusion title="Items that earn no points" blurb="Leave empty if everything earns points. Pick a whole category, or single items." ids={c.earn.excludedProductIds} cats={c.earn.excludedCategories} onIds={(v) => set((x) => { x.earn.excludedProductIds = v; })} onCats={(v) => set((x) => { x.earn.excludedCategories = v; })} />
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px]"><Cap>Try it — how many points does a bill earn?</Cap>
          <div className="mt-2">A bill of ₹ <input className={numIn} type="number" min={0} value={bill} onChange={(e) => setBill(n(e.target.value))} /> earns <b className="text-emerald-700">{tryPts} points</b>, worth ₹{Math.round(tryPts * c.redeem.pointValue * 100) / 100} when the customer uses them.</div></div>
      </Card>

      <Card title="2 · Using points (redeeming)" sub="Customers can pay part of a bill with the points they have collected. Decide what a point is worth and how many they may use."
        right={<label className="flex items-center gap-2 text-[13px] font-bold"><Switch on={c.redeem.enabled} onChange={(v) => set((x) => { x.redeem.enabled = v; })} /> Customers can use points</label>}>
        <div className="flex flex-wrap items-center gap-2 text-[14px]">Each point is worth ₹ <input className={numIn} type="number" min={0.01} step="0.01" value={c.redeem.pointValue} onChange={(e) => set((x) => { x.redeem.pointValue = n(e.target.value); })} /> <span className="text-[12px] text-slate-400">— so 100 points = ₹{Math.round(100 * c.redeem.pointValue * 100) / 100}</span></div>
        <div className="rounded-2xl border border-black/10 p-4">
          <p className="text-[13px] font-bold">How many points can be used on a bill?</p>
          <p className="text-[12px] text-slate-500">It depends on how big the bill is. Each row says: <i>for a bill from ₹A up to ₹B, the customer must use at least X points and at most Y points.</i> A bill that falls in no row can&apos;t use points.</p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-black/10">
            <table className="w-full min-w-[640px] text-left"><thead className="bg-[#F6F3E9]"><tr>{["Bill is from (₹)", "…up to (₹)", "Must use at least (points)", "Can use at most (points)", ""].map((h) => <th key={h} className="p-2.5 text-[10px] font-black uppercase tracking-wider text-slate-600">{h}</th>)}</tr></thead>
              <tbody>{c.redeem.ranges.map((r, i) => (
                <tr key={i} className="border-t border-black/5">
                  <td className="p-2"><input className={cx(numIn, "w-full")} type="number" value={r.from} onChange={(e) => set((x) => { x.redeem.ranges[i].from = n(e.target.value); })} /></td>
                  <td className="p-2"><input className={cx(numIn, "w-full")} type="number" placeholder="and above" value={r.to ?? ""} onChange={(e) => set((x) => { x.redeem.ranges[i].to = e.target.value === "" ? null : n(e.target.value); })} /></td>
                  <td className="p-2"><input className={cx(numIn, "w-full")} type="number" value={r.min} onChange={(e) => set((x) => { x.redeem.ranges[i].min = n(e.target.value); })} /></td>
                  <td className="p-2"><input className={cx(numIn, "w-full")} type="number" value={r.max} onChange={(e) => set((x) => { x.redeem.ranges[i].max = n(e.target.value); })} /></td>
                  <td className="p-2 text-right"><button aria-label="Remove range" onClick={() => set((x) => { x.redeem.ranges.splice(i, 1); })} className="grid h-9 w-9 place-items-center rounded-lg border border-black/10 text-slate-500 hover:bg-red-50 hover:text-red-600 cursor-pointer"><Trash2 className="h-4 w-4" /></button></td>
                </tr>))}</tbody></table>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn onClick={() => set((x) => { const last = x.redeem.ranges[x.redeem.ranges.length - 1]; x.redeem.ranges.push({ from: last ? (last.to ?? last.from) + 1 : 100, to: null, min: 20, max: 40 }); })}><Plus className="h-4 w-4" /> Add range</Btn>
            <Btn onClick={() => set((x) => { x.redeem.ranges = structuredClone(sanitizeConfig({}).redeem.ranges); })}>Use the suggested ranges</Btn>
          </div>
          {rw.length > 0 && <ul className="mt-3 space-y-1 rounded-xl bg-amber-50 px-4 py-3 text-[12px] text-amber-900">{rw.map((w) => <li key={w}>⚠ {w}</li>)}</ul>}
          <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px]"><Cap>Try it — what can a customer use on a bill?</Cap>
            <div className="mt-2">A bill of ₹ <input className={numIn} type="number" min={0} value={rbill} onChange={(e) => setRbill(n(e.target.value))} /> {range ? <>— the customer must use at least <b>{range.min}</b> and at most <b>{range.max}</b> points, which takes <b className="text-emerald-700">₹{Math.round(range.min * c.redeem.pointValue * 100) / 100} to ₹{Math.round(range.max * c.redeem.pointValue * 100) / 100}</b> off (and only if they own that many points).</> : <>— no range covers this bill, so points can&apos;t be used.</>}</div></div>
        </div>
        <div className="rounded-2xl border border-black/10 p-4"><p className="text-[13px] font-bold">Can points be used on a bill that also has…</p><p className="text-[12px] text-slate-500">Switch off to stop customers combining points with another saving. If a bill has it, the points are not applied and Billing tells the cashier why.</p>
          <div className="mt-3 max-w-xl space-y-2">{([["withCoupon", "a coupon discount"], ["withManual", "a manual discount typed at billing"], ["withReward", "a free-gift reward being claimed"]] as const).map(([k, t]) => (
            <div key={k} className="flex items-center justify-between rounded-lg bg-[#F6F3E9] px-3 py-2 text-[13px]"><span>{t}</span><span className="flex items-center gap-3"><b className={c.redeem[k] ? "text-emerald-700" : "text-slate-500"}>{c.redeem[k] ? "Points allowed" : "Points blocked"}</b><Switch on={c.redeem[k]} onChange={(v) => set((x) => { x.redeem[k] = v; })} /></span></div>))}</div></div>
        <Exclusion title="Things points can't be used to pay for" blurb="Leave empty if points can pay for anything." ids={c.redeem.excludedProductIds} cats={c.redeem.excludedCategories} onIds={(v) => set((x) => { x.redeem.excludedProductIds = v; })} onCats={(v) => set((x) => { x.redeem.excludedCategories = v; })} />
      </Card>

      <Card title="Free gifts" sub="Create the gifts themselves in Free Gifts & Rewards. Here you can switch each kind on or off.">
        <div className="flex flex-wrap items-center gap-6 text-[13px] font-semibold">
          {([["points", "Gifts customers unlock with points"], ["milestone", "Gifts for total spending"], ["offers", "Offers on the bill"]] as const).map(([k, t]) => <label key={k} className="flex items-center gap-2"><Switch on={c.gifts[k]} onChange={(v) => set((x) => { x.gifts[k] = v; })} /> {t}</label>)}
        </div>
        <div className="space-y-3 border-t border-black/10 pt-4">
          <Check on={c.gifts.countOldBills} onChange={(v) => set((x) => { x.gifts.countOldBills = v; })}><b>Spending rewards count every bill ever paid</b>, not only bills from the day the reward was created. Careful: turning this on can unlock gifts for customers right away.</Check>
          <Check on={c.gifts.restockOnVoid} onChange={(v) => set((x) => { x.gifts.restockOnVoid = v; })}><b>Put free gifts back in stock when a bill is voided or deleted.</b> Off = the gift was already handed over, so only the paid items go back.</Check>
          <div><Cap>An unlocked spending reward stays valid for (days)</Cap><input className={cx(numIn, "mt-2 text-center")} type="number" min={0} value={c.gifts.validityDays} onChange={(e) => set((x) => { x.gifts.validityDays = n(e.target.value); })} /><p className="mt-1 text-[11px] text-slate-400">0 = it never expires</p></div>
        </div>
      </Card>

      <Card title="Points expiry" sub="Leave at 0 if points should never run out. Otherwise points expire this many days after they were earned — the oldest are used first.">
        <div><Cap>Points expire after (days)</Cap><input className={cx(numIn, "mt-2 text-center")} type="number" min={0} value={c.expiry.days} onChange={(e) => set((x) => { x.expiry.days = n(e.target.value); })} /><p className="mt-1 text-[11px] text-slate-400">0 = never. Applies to points earned from now on.</p></div>
      </Card>

      <Card title="Customer groups (CRM)" sub="Every loyalty customer is put in a group from their paid bills — shown in the Customer CRM tab. These numbers decide where the lines fall.">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {([["newDays", "“New” for the first (days)"], ["regularVisits", "“Regular” from (visits)"], ["frequentVisits", "“Frequent” from (visits)"], ["frequentDays", "…counted over the last (days)"], ["highValue", "“High value” from spending (₹)"], ["vipSpend", "“VIP” from spending (₹)"], ["atRiskDays", "“At risk” after (days away)"], ["inactiveDays", "“Inactive” after (days away)"], ["lostDays", "“Lost” after (days away)"]] as const).map(([k, t]) => (
            <label key={k} className="block"><Cap>{t}</Cap><input className={cx(numIn, "mt-2 w-full text-center")} type="number" min={0} value={c.crm[k]} onChange={(e) => set((x) => { x.crm[k] = n(e.target.value); })} /></label>))}
        </div>
        {cw.length > 0 && <ul className="space-y-1 rounded-xl bg-amber-50 px-4 py-3 text-[12px] text-amber-900">{cw.map((w) => <li key={w}>⚠ {w} Saving puts them in order.</li>)}</ul>}
      </Card>

      <Card title="Billing & receipts">
        <Check on={c.display.receiptSummary} onChange={(v) => set((x) => { x.display.receiptSummary = v; })}><b>Print the loyalty summary</b> (previous balance, earned, redeemed, remaining) on receipts and the invoice page for loyalty customers. Bills without a loyalty customer never show it.</Check>
        <Check on={c.display.defaultConsent} onChange={(v) => set((x) => { x.display.defaultConsent = v; })}><b>Start with “agrees to WhatsApp messages” ticked</b> when adding a customer. Only tick this if you always ask the customer first.</Check>
        <Check on={c.display.autoTidy} onChange={(v) => set((x) => { x.display.autoTidy = v; })}><b>Tidy up automatically</b> — when this page opens, remove the loyalty records of bills that were deleted.</Check>
      </Card>

      <Card title="WhatsApp messages" right={<label className="flex items-center gap-2 text-[13px] font-bold"><Switch on={c.messages.enabled} onChange={(v) => set((x) => { x.messages.enabled = v; })} /> {c.messages.enabled ? "On" : "Off"}</label>}
        sub="Messages are prepared after each event and kept in the customer's history — only for customers who agreed to WhatsApp messages. A browser can't send WhatsApp by itself, so staff tap Send on WhatsApp to open the chat with the message ready. WhatsApp doesn't report delivery, so they are shown as “Opened in WhatsApp”, never “Sent”. Billing is never held up by a message.">
        {MESSAGE_META.map((m) => (
          <div key={m.key} className="rounded-2xl border border-black/10 p-4">
            <div className="flex items-center justify-between"><div><p className="text-[14px] font-bold">{m.label}</p><p className="text-[12px] text-slate-500">{m.when}</p></div>
              <label className="flex items-center gap-2 text-[13px] font-bold"><Switch on={c.messages.events[m.key as MessageKey]} onChange={(v) => set((x) => { x.messages.events[m.key as MessageKey] = v; })} /> {c.messages.events[m.key as MessageKey] ? "On" : "Off"}</label></div>
            <textarea rows={2} value={c.messages.templates[m.key as MessageKey]} onChange={(e) => set((x) => { x.messages.templates[m.key as MessageKey] = e.target.value; })} className="mt-3 w-full rounded-xl border border-black/10 bg-[#FDFCF7] px-4 py-3 text-[13px] outline-none focus:border-[#C1272D]" />
          </div>))}
        <p className="text-[12px] text-slate-500">Words that are filled in for each customer: {MESSAGE_FIELDS.map((f) => `{${f}}`).join(" ")}</p>
      </Card>
    </div>
  );
}
