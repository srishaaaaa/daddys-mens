"use client";

import { useState } from "react";
import { BadgeCheck, UserPlus } from "lucide-react";
import { fmtYmd, memberDiscount, stateOf, todayIST, type Member, type Plan } from "@/lib/membershipTypes";
import { RegisterModal } from "./MembershipPanel";

/* Shown in Billing under the customer's details once a 10-digit number is typed:
   - a member: their plan, and a one-click member discount (never added on top of a coupon or manual discount,
     because it uses the same discount slot);
   - not a member: a prompt to add them to the membership;
   - expired or switched off: a note, and no member discount. */
export default function MembershipBillingBox({
  phone, name, members, plans, applied, onApply, onRemove, onRegistered,
}: {
  phone: string;
  name: string;
  members: Member[];
  plans: Plan[];
  /** the member discount is currently on this bill */
  applied: boolean;
  onApply: (m: Member, pct: number, birthday: boolean) => void;
  onRemove: () => void;
  onRegistered: (m: Member, revenueDelta: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  if (phone.length !== 10) return null;

  const m = members.find((x) => x.phone === phone);
  const today = todayIST();

  if (!m) {
    return (
      <>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-black/20 bg-[#FAF7F2] px-4 py-3">
          <div className="min-w-0">
            <p className="text-[12px] font-extrabold uppercase tracking-wider text-slate-700">Not a member yet</p>
            <p className="text-[12px] text-slate-500">Add this customer to the membership to give them member discounts.</p>
          </div>
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-[#C1272D] px-4 text-[11px] font-extrabold uppercase tracking-wider text-white hover:bg-[#9B1C21]"
          >
            <UserPlus className="h-4 w-4" /> Add to membership
          </button>
        </div>
        {adding && (
          <RegisterModal
            rows={members}
            plans={plans.filter((p) => p.active)}
            defaults={{ phone, name: name.trim() }}
            onClose={() => setAdding(false)}
            onDone={(r) => {
              setAdding(false);
              onRegistered(r.member, r.revenueDelta);
            }}
          />
        )}
      </>
    );
  }

  const st = stateOf(m, today);
  if (st !== "active") {
    return (
      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
        <p className="text-[12px] font-extrabold uppercase tracking-wider text-amber-900">
          Member {m.memberNo} · {st === "expired" ? `expired on ${fmtYmd(m.expiresAt)}` : "membership is inactive"}
        </p>
        <p className="text-[12px] text-amber-800">No member discount on this bill. {st === "expired" ? "Renew it in Membership to give the discount again." : "Activate it in Membership to give the discount again."}</p>
      </div>
    );
  }

  const disc = memberDiscount(m, today);
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
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
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-600 px-3 py-1 text-[11px] font-black uppercase tracking-wider text-white">{disc.pct}% member discount applied</span>
            <button type="button" onClick={onRemove} className="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-emerald-900 underline">Remove</button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => onApply(m, disc.pct, disc.birthday)}
            className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-emerald-700 px-4 text-[11px] font-extrabold uppercase tracking-wider text-white hover:bg-emerald-800"
          >
            Apply {disc.pct}% member discount
          </button>
        )
      ) : (
        <span className="text-[12px] font-semibold text-emerald-800">This plan has no discount.</span>
      )}
    </div>
  );
}
