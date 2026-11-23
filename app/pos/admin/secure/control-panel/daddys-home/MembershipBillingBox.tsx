"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, MessageCircle, UserPlus } from "lucide-react";
import {
  customerStats, eligibleOffer, fmtYmd, liveOffer, memberDiscount, stateOf, todayIST,
  type EligibilityBasis, type Member, type Offer, type Plan, type Source,
} from "@/lib/membershipTypes";

/** The discount the cashier is applying: the plan's percentage, the extra offer percentage, and the total. */
export type AppliedDiscount = { pct: number; offerPct: number; total: number; birthday: boolean };
import { waLink } from "@/lib/membershipMessages";
import { eligibilityMessageAction, markMessageAction } from "@/app/pos/membership-actions";
import { unwrap } from "@/lib/actionResult";
import { RegisterModal, type BillRow, type Result } from "./MembershipPanel";

/** What the cashier chose on this bill; it is carried out when the bill is completed. */
export type PendingEnroll = { kind: "activate" | "upgrade" | "renew"; planId: string; planName: string; fee: number; source: Source; phone: string; name: string };

const rupee = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

/* Shown in Billing under the customer's details once a 10-digit number is typed. Quiet inline notices, no popups:
   - a member: their plan, the discount that is applied automatically (original amount, discount, payable) and any offer;
   - a customer who qualifies for a plan on this bill (one big bill, or total purchases): the matching plan, with a
     button to activate / upgrade / renew it on this bill (the fee, if any, is added to the bill);
   - not a member and not eligible: a button to enrol them by hand;
   - expired or switched off: a note, and no member discount. */
export default function MembershipBillingBox({
  phone, name, members, plans, basis, countCurrent, bills, billSubtotal, billDiscount, eligibleAmount, restricted, applied, pending, onPending, onApply, onRemove, onRegistered,
}: {
  phone: string;
  name: string;
  members: Member[];
  plans: Plan[];
  basis: EligibilityBasis;
  /** the bill being made counts toward total-purchases eligibility */
  countCurrent: boolean;
  bills: BillRow[];
  /** the current bill, before and after its discounts */
  billSubtotal: number;
  billDiscount: number;
  /** the part of the bill the member discount applies to (all of it unless the plan is restricted to some items) */
  eligibleAmount: number;
  restricted: boolean;
  /** the member discount is currently on this bill */
  applied: boolean;
  pending: PendingEnroll | null;
  onPending: (p: PendingEnroll | null) => void;
  onApply: (m: Member, disc: AppliedDiscount) => void;
  onRemove: () => void;
  onRegistered: (r: Result) => void;
}) {
  const [adding, setAdding] = useState(false);
  const m = phone.length === 10 ? members.find((x) => x.phone === phone) : undefined;
  const today = todayIST();

  const stats = useMemo(() => customerStats(bills, basis), [bills, basis]);
  const pastTotal = stats.get(phone)?.total ?? 0;
  // What this bill counts for: the subtotal, or the subtotal after discounts.
  const billAmount = basis === "subtotal" ? billSubtotal : Math.max(0, billSubtotal - billDiscount);
  const offer: Offer | null = useMemo(
    () => (phone.length === 10 && billSubtotal > 0 ? eligibleOffer({ plans, member: m, pastTotal, billAmount, today, countCurrentBill: countCurrent }) : null),
    [plans, m, pastTotal, billAmount, today, phone, billSubtotal, countCurrent],
  );

  if (phone.length !== 10) return null;

  const pick = (o: Offer) => onPending({ kind: o.kind, planId: o.plan.id, planName: o.plan.name, fee: o.plan.fee, source: o.via, phone, name: (m?.name || name).trim() || "Customer" });

  const whatsapp = async (o: Offer) => {
    try {
      const msg = await unwrap(eligibilityMessageAction(phone, (m?.name || name).trim(), o.plan.id));
      if (!msg) return alert("Eligibility messages are switched off in the membership settings.");
      const w = window.open(waLink(msg.phone, msg.text), "_blank", "noopener,noreferrer");
      await unwrap(markMessageAction(msg.id, w ? "sent" : "failed")).catch(() => {});
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not prepare the message.");
    }
  };

  /* ------------------------------------------------ the eligibility banner */
  const banner = (o: Offer) => {
    const word = o.kind === "activate" ? "Membership" : o.kind === "upgrade" ? "Membership" : "Membership";
    const text =
      o.kind === "upgrade"
        ? `Customer qualifies for ${o.plan.name} ${word}!`
        : o.kind === "renew"
          ? `Customer qualifies for ${o.plan.name} ${word} — renew it on this bill.`
          : o.via === "single_bill"
            ? `This bill qualifies for ${o.plan.name} ${word}!`
            : `Congratulations! This customer has reached ${rupee(o.cumulative)} in purchases and qualifies for ${o.plan.name} ${word}.`;
    if (pending && pending.planId === o.plan.id && pending.phone === phone) {
      return (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3">
          <p className="text-[12.5px] font-bold text-emerald-900">
            ✓ {o.plan.name} {pending.kind === "activate" ? "will be activated" : pending.kind === "upgrade" ? "upgrade will be applied" : "will be renewed"} when this bill is completed
            {pending.fee > 0 ? ` · fee ${rupee(pending.fee)} added to the bill` : " · free"}.
          </p>
          <button type="button" onClick={() => onPending(null)} className="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-emerald-900 underline">Undo</button>
        </div>
      );
    }
    const label = (o.kind === "activate" ? "Activate" : o.kind === "upgrade" ? "Upgrade" : "Renew") + (o.plan.fee > 0 ? ` · add ${rupee(o.plan.fee)} fee to bill` : " (free)");
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#C1272D]/30 bg-[#FBEFEF] px-4 py-3">
        <p className="min-w-0 text-[12.5px] font-bold text-[#7C1519]">🎉 {text}</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => whatsapp(o)} title="Send them a WhatsApp message about it" className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg border border-black/10 bg-white px-3 text-[11px] font-extrabold uppercase tracking-wider text-slate-700 hover:bg-slate-50">
            <MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp
          </button>
          <button type="button" onClick={() => pick(o)} className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-[#C1272D] px-4 text-[11px] font-extrabold uppercase tracking-wider text-white hover:bg-[#9B1C21]">{label}</button>
        </div>
      </div>
    );
  };

  /* ------------------------------------------------ not a member */
  if (!m) {
    return (
      <>
        {offer ? (
          banner(offer)
        ) : (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-black/20 bg-[#FAF7F2] px-4 py-3">
            <div className="min-w-0">
              <p className="text-[12px] font-extrabold uppercase tracking-wider text-slate-700">Not a member yet</p>
              <p className="text-[12px] text-slate-500">Add this customer to the membership to give them member discounts.</p>
            </div>
            <button type="button" onClick={() => setAdding(true)} className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-[#C1272D] px-4 text-[11px] font-extrabold uppercase tracking-wider text-white hover:bg-[#9B1C21]">
              <UserPlus className="h-4 w-4" /> Add to membership
            </button>
          </div>
        )}
        {offer && (
          <div className="mt-2">
            <button type="button" onClick={() => setAdding(true)} className="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-slate-500 underline">Enrol by hand instead</button>
          </div>
        )}
        {adding && (
          <RegisterModal
            rows={members}
            plans={plans.filter((p) => p.active)}
            defaults={{ phone, name: name.trim() }}
            onClose={() => setAdding(false)}
            onDone={(r) => {
              setAdding(false);
              onRegistered(r);
            }}
          />
        )}
      </>
    );
  }

  /* ------------------------------------------------ expired / switched off */
  const st = stateOf(m, today);
  if (st !== "active") {
    return (
      <>
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[12px] font-extrabold uppercase tracking-wider text-amber-900">
            Member {m.memberNo} · {st === "expired" ? `expired on ${fmtYmd(m.expiresAt)}` : "membership is inactive"}
          </p>
          <p className="text-[12px] text-amber-800">No member discount on this bill. {st === "expired" ? "Renew it in Membership to give the discount again." : "Activate it in Membership to give the discount again."}</p>
        </div>
        {offer && banner(offer)}
      </>
    );
  }

  /* ------------------------------------------------ active member */
  const found = memberDiscount(m, billSubtotal, today);
  const nothingEligible = restricted && eligibleAmount <= 0;
  const disc = found && !nothingEligible ? found : null;
  const base = memberDiscount(m, Number.MAX_SAFE_INTEGER, today); // the discount if the bill were big enough
  const extra = liveOffer(m, today);
  const only = [...m.onlyCategories, ...m.onlyProducts];
  const amt = (pct: number) => (eligibleAmount * pct) / 100;
  return (
    <>
      <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
            <div className="min-w-0">
              <p className="text-[12px] font-extrabold uppercase tracking-wider text-emerald-900">
                Member · {m.planName || "Member"} <span className="font-mono normal-case tracking-normal text-emerald-800">{m.memberNo}</span>
              </p>
              <p className="text-[12px] text-emerald-800">
                {m.expiresAt ? `Valid until ${fmtYmd(m.expiresAt)}` : "No expiry"}
                {m.paymentStatus === "pending" ? " · fee pending" : ""}
                {disc?.birthday ? " · happy birthday! 🎂" : ""}
              </p>
            </div>
          </div>
          {disc ? (
            applied ? (
              <button type="button" onClick={onRemove} className="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-emerald-900 underline">Remove discount</button>
            ) : (
              <button type="button" onClick={() => onApply(m, disc)} className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-emerald-700 px-4 text-[11px] font-extrabold uppercase tracking-wider text-white hover:bg-emerald-800">
                Apply {disc.total}% member discount
              </button>
            )
          ) : nothingEligible ? (
            <span className="text-[12px] font-semibold text-emerald-800">No item on this bill qualifies{only.length ? ` (only ${only.join(", ")})` : ""}</span>
          ) : base && m.minBill > billSubtotal ? (
            <span className="text-[12px] font-semibold text-emerald-800">Add {rupee(m.minBill - billSubtotal)} more to get {base.total}% off</span>
          ) : (
            <span className="text-[12px] font-semibold text-emerald-800">This plan has no discount.</span>
          )}
        </div>
        {disc && applied && (
          <dl className={`mt-3 grid gap-2 rounded-lg bg-white/70 px-3 py-2 text-[12px] ${disc.offerPct > 0 ? "grid-cols-4" : "grid-cols-3"}`}>
            <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{restricted ? "Eligible items" : "Original"}</dt><dd className="font-bold text-black">{rupee(restricted ? eligibleAmount : billSubtotal)}</dd></div>
            <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{m.planName || "Member"} {disc.pct}%</dt><dd className="font-bold text-[#C1272D]">−{rupee(amt(disc.pct))}</dd></div>
            {disc.offerPct > 0 && <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Offer {disc.offerPct}%</dt><dd className="font-bold text-[#C1272D]">−{rupee(amt(disc.offerPct))}</dd></div>}
            <div><dt className="text-[10px] font-bold uppercase tracking-wider text-slate-500">After discount</dt><dd className="font-bold text-emerald-800">{rupee(billSubtotal - amt(disc.total))}</dd></div>
          </dl>
        )}
        {only.length > 0 && <p className="mt-2 text-[11.5px] text-emerald-800">Member discount applies only to: {only.join(", ")}.</p>}
        {extra && <p className="mt-2 text-[12px] font-semibold text-emerald-900">Member offer: {extra}</p>}
      </div>
      {offer && banner(offer)}
    </>
  );
}
