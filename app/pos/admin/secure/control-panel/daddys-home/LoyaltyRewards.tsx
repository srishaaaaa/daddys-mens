"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import type { LoyaltyData } from "@/lib/loyalty/server";
import type { GiftOffer, Reward } from "@/lib/loyalty/types";
import {
  loyaltyOfferDeleteAction, loyaltyOfferSaveAction, loyaltyRewardDeleteAction, loyaltyRewardSaveAction,
} from "@/app/pos/loyalty-actions";
import { Btn, ExcelBtn, Modal, Switch, card, cx, downloadCsv, field, labelCls, rupee, useBusy } from "./loyaltyKit";

type Prod = LoyaltyData["products"][number];

function ProductSelect({ value, onChange, products }: { value: string; onChange: (v: string) => void; products: Prod[] }) {
  return (
    <select className={field} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Pick a menu item…</option>
      {products.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.category}</option>)}
    </select>
  );
}

export default function LoyaltyRewards({ d, reload }: { d: LoyaltyData; reload: () => Promise<void> }) {
  const [reward, setReward] = useState<(Partial<Reward> & { trigger: "points" | "milestone" }) | null>(null);
  const [offer, setOffer] = useState<Partial<GiftOffer> | null>(null);
  const pname = (id: string | null) => d.products.find((p) => p.id === id)?.name ?? "(item removed)";
  const pointsGifts = d.rewards.filter((r) => r.trigger === "points");
  const spendGifts = d.rewards.filter((r) => r.trigger === "milestone");

  const toggleReward = async (r: Reward) => { await loyaltyRewardSaveAction({ ...r, active: !r.active }); await reload(); };
  const delReward = async (r: Reward) => { if (window.confirm(`Delete "${r.name}"? Gifts already unlocked stay on record.`)) { await loyaltyRewardDeleteAction(r.id); await reload(); } };
  const toggleOffer = async (o: GiftOffer) => { await loyaltyOfferSaveAction({ ...o, active: !o.active }); await reload(); };
  const delOffer = async (o: GiftOffer) => { if (window.confirm(`Delete the offer "${o.name}"?`)) { await loyaltyOfferDeleteAction(o.id); await reload(); } };

  const excel = () =>
    downloadCsv("free-gifts", [
      ["Kind", "Name", "Item", "Rule", "Qty", "Active"],
      ...pointsGifts.map((r) => ["Points gift", r.name, pname(r.productId), `${r.pointsCost} points`, r.giftQty, r.active ? "Yes" : "No"]),
      ...spendGifts.map((r) => ["Spending reward", r.name, pname(r.productId), `Every ₹${r.milestoneAmount}`, r.giftQty, r.active ? "Yes" : "No"]),
      ...d.offers.map((o) => ["Bill offer", o.name, pname(o.giftProductId), o.type === "spend" ? `Spend ₹${o.minBill}` : `Buy ${o.buyQty} ${pname(o.productId)}`, o.giftQty, o.active ? "Yes" : "No"]),
    ]);

  const Section = ({ n, title, blurb, add, addLabel, empty, children }: { n: number; title: string; blurb: string; add: () => void; addLabel: string; empty: string; children: React.ReactNode }) => (
    <section className={cx(card, "p-5")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[15px] font-bold">{n} · {title}</h3>
        <Btn kind="red" className="h-9" onClick={add}><Plus className="h-4 w-4" /> {addLabel}</Btn>
      </div>
      <p className="mt-2 text-[12.5px] text-slate-500">{blurb}</p>
      <div className="mt-4">{children ?? <p className="py-6 text-center text-[13px] text-slate-500">{empty}</p>}</div>
    </section>
  );

  const Row = ({ title, sub, active, onToggle, onEdit, onDelete }: { title: string; sub: string; active: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void }) => (
    <li className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 bg-[#FDFCF7] px-4 py-3">
      <div className="min-w-0"><p className="text-sm font-bold">{title}</p><p className="text-xs text-slate-500">{sub}</p></div>
      <div className="flex items-center gap-2">
        <Switch on={active} onChange={onToggle} label="Active" />
        <button onClick={onEdit} aria-label="Edit" className="grid h-8 w-8 place-items-center rounded-lg border border-black/10 text-slate-600 hover:bg-slate-50 cursor-pointer"><Pencil className="h-4 w-4" /></button>
        <button onClick={onDelete} aria-label="Delete" className="grid h-8 w-8 place-items-center rounded-lg border border-black/10 text-slate-400 hover:bg-red-50 hover:text-red-600 cursor-pointer"><Trash2 className="h-4 w-4" /></button>
      </div>
    </li>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><ExcelBtn onClick={excel} /></div>
      <p className="rounded-xl bg-[#F6F3E9] px-4 py-3 text-[13px] text-slate-700">
        A free gift is always an item from your menu. When it is given, it shows on the bill as a <b>FREE GIFT ₹0</b> line and comes off the normal stock — and shows in the Stock movement log.
      </p>

      <Section n={1} title="Gifts customers unlock with points" addLabel="Add gift" add={() => setReward({ trigger: "points", giftQty: 1, pointsCost: 100, active: true })}
        blurb="For example: 100 points = a free item. It unlocks by itself when the customer has enough points, and the points are used only when the gift is handed over on a paid bill."
        empty="No points-based gifts yet.">
        {pointsGifts.length ? <ul className="space-y-2">{pointsGifts.map((r) => <Row key={r.id} title={r.name} sub={`${r.pointsCost} points = ${r.giftQty} × ${pname(r.productId)}`} active={r.active} onToggle={() => toggleReward(r)} onEdit={() => setReward(r)} onDelete={() => delReward(r)} />)}</ul> : undefined}
      </Section>

      <Section n={2} title="Gifts for total spending" addLabel="Add reward" add={() => setReward({ trigger: "milestone", giftQty: 1, milestoneAmount: 1000, active: true })}
        blurb="For example: spend ₹1,000 in total = a free item. Spending is counted from paid bills only (after discounts, never free gifts), starting from the day you create the reward. It unlocks again each time they pass another multiple."
        empty="No spending rewards yet.">
        {spendGifts.length ? <ul className="space-y-2">{spendGifts.map((r) => <Row key={r.id} title={r.name} sub={`Every ${rupee(r.milestoneAmount)} spent = ${r.giftQty} × ${pname(r.productId)}`} active={r.active} onToggle={() => toggleReward(r)} onEdit={() => setReward(r)} onDelete={() => delReward(r)} />)}</ul> : undefined}
      </Section>

      <Section n={3} title="Offers on the bill (for everyone)" addLabel="Add offer" add={() => setOffer({ type: "spend", minBill: 500, buyQty: 1, giftQty: 1, repeatable: true, audience: "all", active: true })}
        blurb="For example: spend ₹500 get a free item, or buy 2 get 1 free. These work for any customer — they don't need to be in the loyalty programme. Billing shows the gift when the bill qualifies and staff add it with one tap."
        empty="No bill offers yet.">
        {d.offers.length ? <ul className="space-y-2">{d.offers.map((o) => <Row key={o.id} title={o.name} sub={`${o.type === "spend" ? `Spend ${rupee(o.minBill)}` : `Buy ${o.buyQty} × ${pname(o.productId)}`} → ${o.giftQty} × ${pname(o.giftProductId)}${o.audience === "members" ? " · members only" : ""}`} active={o.active} onToggle={() => toggleOffer(o)} onEdit={() => setOffer(o)} onDelete={() => delOffer(o)} />)}</ul> : undefined}
      </Section>

      {reward && <RewardForm r={reward} products={d.products} onClose={() => setReward(null)} onSaved={async () => { setReward(null); await reload(); }} />}
      {offer && <OfferForm o={offer} products={d.products} onClose={() => setOffer(null)} onSaved={async () => { setOffer(null); await reload(); }} />}
    </div>
  );
}

function RewardForm({ r, products, onClose, onSaved }: { r: Partial<Reward> & { trigger: "points" | "milestone" }; products: Prod[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({ name: r.name ?? "", productId: r.productId ?? "", pointsCost: String(r.pointsCost ?? 100), milestoneAmount: String(r.milestoneAmount ?? 1000), giftQty: String(r.giftQty ?? 1), active: r.active ?? true });
  const { busy, run } = useBusy();
  const isPts = r.trigger === "points";
  const save = async () => {
    const ok = await run(async () => {
      await loyaltyRewardSaveAction({ ...r, name: f.name, productId: f.productId || null, pointsCost: Number(f.pointsCost) || 0, milestoneAmount: Number(f.milestoneAmount) || 0, giftQty: Number(f.giftQty) || 1, active: f.active, trigger: r.trigger });
      return true;
    });
    if (ok) await onSaved();
  };
  return (
    <Modal title={`${r.id ? "Edit" : "Add"} ${isPts ? "gift" : "spending reward"}`} onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="red" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</Btn></>}>
      <div className="space-y-4">
        <label className="block"><span className={labelCls}>Name *</span><input className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder={isPts ? "e.g. Free handkerchief" : "e.g. ₹1,000 spending gift"} /></label>
        <label className="block"><span className={labelCls}>Free menu item *</span><ProductSelect value={f.productId} onChange={(v) => setF({ ...f, productId: v })} products={products} /></label>
        <div className="grid grid-cols-2 gap-3">
          {isPts ? (
            <label className="block"><span className={labelCls}>Points needed *</span><input className={field} type="number" min={1} value={f.pointsCost} onChange={(e) => setF({ ...f, pointsCost: e.target.value })} /></label>
          ) : (
            <label className="block"><span className={labelCls}>Total spending (₹) *</span><input className={field} type="number" min={1} value={f.milestoneAmount} onChange={(e) => setF({ ...f, milestoneAmount: e.target.value })} /></label>
          )}
          <label className="block"><span className={labelCls}>Quantity given</span><input className={field} type="number" min={1} value={f.giftQty} onChange={(e) => setF({ ...f, giftQty: e.target.value })} /></label>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-[#F6F3E9] px-4 py-3"><span className="text-[13px] font-bold">Active</span><Switch on={f.active} onChange={(v) => setF({ ...f, active: v })} /></div>
      </div>
    </Modal>
  );
}

function OfferForm({ o, products, onClose, onSaved }: { o: Partial<GiftOffer>; products: Prod[]; onClose: () => void; onSaved: () => Promise<void> }) {
  const [f, setF] = useState({ name: o.name ?? "", type: o.type ?? "spend", minBill: String(o.minBill ?? 500), productId: o.productId ?? "", buyQty: String(o.buyQty ?? 1), giftProductId: o.giftProductId ?? "", giftQty: String(o.giftQty ?? 1), repeatable: o.repeatable ?? true, audience: o.audience ?? "all", active: o.active ?? true });
  const { busy, run } = useBusy();
  const save = async () => {
    const ok = await run(async () => {
      await loyaltyOfferSaveAction({ ...o, name: f.name, type: f.type as "spend" | "buy", minBill: Number(f.minBill) || 0, productId: f.productId || null, buyQty: Number(f.buyQty) || 1, giftProductId: f.giftProductId, giftQty: Number(f.giftQty) || 1, repeatable: f.repeatable, audience: f.audience as "all" | "members", active: f.active });
      return true;
    });
    if (ok) await onSaved();
  };
  return (
    <Modal title={`${o.id ? "Edit" : "Add"} offer`} onClose={onClose} footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="red" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</Btn></>}>
      <div className="space-y-4">
        <label className="block"><span className={labelCls}>Name *</span><input className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Spend ₹500 get a free item" /></label>
        <div className="grid grid-cols-2 gap-2">
          {([{ v: "spend", t: "Spend an amount" }, { v: "buy", t: "Buy an item" }] as const).map((x) => (
            <button key={x.v} type="button" onClick={() => setF({ ...f, type: x.v })} className={cx("rounded-xl border px-3 py-2.5 text-[13px] font-bold cursor-pointer", f.type === x.v ? "border-[#C1272D] bg-[#FBEFEF]" : "border-black/10 bg-white")}>{x.t}</button>
          ))}
        </div>
        {f.type === "spend" ? (
          <label className="block"><span className={labelCls}>Bill amount (₹) *</span><input className={field} type="number" min={1} value={f.minBill} onChange={(e) => setF({ ...f, minBill: e.target.value })} /></label>
        ) : (
          <div className="grid grid-cols-[1fr_96px] gap-3">
            <label className="block"><span className={labelCls}>Item to buy *</span><ProductSelect value={f.productId} onChange={(v) => setF({ ...f, productId: v })} products={products} /></label>
            <label className="block"><span className={labelCls}>Qty</span><input className={field} type="number" min={1} value={f.buyQty} onChange={(e) => setF({ ...f, buyQty: e.target.value })} /></label>
          </div>
        )}
        <div className="grid grid-cols-[1fr_96px] gap-3">
          <label className="block"><span className={labelCls}>Free item *</span><ProductSelect value={f.giftProductId} onChange={(v) => setF({ ...f, giftProductId: v })} products={products} /></label>
          <label className="block"><span className={labelCls}>Qty</span><input className={field} type="number" min={1} value={f.giftQty} onChange={(e) => setF({ ...f, giftQty: e.target.value })} /></label>
        </div>
        <div className="flex items-center justify-between rounded-xl bg-[#F6F3E9] px-4 py-3"><span className="text-[13px] font-bold">Repeats on bigger bills</span><Switch on={f.repeatable} onChange={(v) => setF({ ...f, repeatable: v })} /></div>
        <div className="flex items-center justify-between rounded-xl bg-[#F6F3E9] px-4 py-3"><span className="text-[13px] font-bold">Loyalty members only</span><Switch on={f.audience === "members"} onChange={(v) => setF({ ...f, audience: v ? "members" : "all" })} /></div>
        <div className="flex items-center justify-between rounded-xl bg-[#F6F3E9] px-4 py-3"><span className="text-[13px] font-bold">Active</span><Switch on={f.active} onChange={(v) => setF({ ...f, active: v })} /></div>
      </div>
    </Modal>
  );
}
