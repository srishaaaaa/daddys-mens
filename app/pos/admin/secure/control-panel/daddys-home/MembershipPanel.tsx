"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IdCard, MessageCircle, Pencil, Plus, Printer, RefreshCw, Settings2, SlidersHorizontal, TrendingUp } from "lucide-react";
import {
  addMonths, billValue, customerStats, daysBetween, fmtYmd, monthsLabel, prospects, rank, stateOf, todayIST,
  type Bill, type Eligibility, type Member, type MemberEvent, type MemberMessage, type MemberSettings, type MemberState, type Overview, type PaymentStatus, type Plan, type Source,
} from "@/lib/membershipTypes";
import { KIND_LABEL, waLink } from "@/lib/membershipMessages";
import {
  markMemberPaidAction, markMessageAction, membershipOverviewAction, queueOfferAction, registerMemberAction, renewMemberAction, savePlanAction,
  saveMembershipSettingsAction, setMemberStatusAction, upgradeMemberAction, eligibilityMessageAction,
} from "@/app/pos/membership-actions";
import { suggestCustomersAction } from "@/app/pos/loyalty-actions";
import { unwrap } from "@/lib/actionResult";
import { Btn, Empty, Modal, SearchInput, Stat, card, cx, field, labelCls, rupee } from "./loyaltyKit";

/* Membership: plans (with eligibility rules, fee, validity, discount and offers), members, renewals and upgrades,
   customers who qualify, WhatsApp messages, and the printable card. The member discount is applied in Billing.
   Separate from Loyalty. */

const STATE_STYLE: Record<MemberState, string> = {
  active: "border-emerald-200 bg-emerald-50 text-emerald-700",
  expired: "border-amber-200 bg-amber-50 text-amber-800",
  inactive: "border-black/10 bg-slate-100 text-slate-500",
};
export const StatePill = ({ s }: { s: MemberState }) => (
  <span className={cx("inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider", STATE_STYLE[s])}>{s}</span>
);
const PendingPill = () => <span className="inline-block rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-amber-800">Fee pending</span>;

export type Result = { member: Member; revenueDelta: number; event?: MemberEvent; message?: MemberMessage | null };
export type BillRow = Bill & { name: string };

/** Adds or replaces a member in the screen's data (plus the revenue, fee history and any new WhatsApp message). */
export function applyResult(d: Overview, r: Result): Overview {
  const has = d.members.some((m) => m.id === r.member.id);
  return {
    ...d,
    members: has ? d.members.map((m) => (m.id === r.member.id ? r.member : m)) : [r.member, ...d.members],
    revenue: d.revenue + r.revenueDelta,
    events: r.event ? [r.event, ...d.events] : d.events,
    messages: r.message ? [r.message, ...d.messages.filter((x) => x.id !== r.message!.id)] : d.messages,
  };
}

const SOURCE_LABEL: Record<Source, string> = { manual: "Manual", single_bill: "Single bill", cumulative: "Total purchases" };

/* ------------------------------------------------------------------ the digital card (screen + print) */
function MemberCard({ m, shop }: { m: Member; shop: string }) {
  const st = stateOf(m);
  return (
    <div className={cx("overflow-hidden rounded-2xl bg-gradient-to-br from-[#C1272D] to-[#7C1519] p-5 text-white shadow-lg", st !== "active" && "opacity-75 grayscale-[30%]")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#F3D8A0]">{shop}</p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.3em] text-white/70">Membership card</p>
        </div>
        <span className={cx("rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider", st === "active" ? "bg-emerald-400/90 text-emerald-950" : "bg-white/25 text-white")}>{st}</span>
      </div>
      <p className="mt-6 font-mono text-[24px] font-black tracking-[0.12em]">{m.memberNo}</p>
      <p className="mt-3 text-[18px] font-extrabold leading-tight">{m.name}</p>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 text-[12px] text-white/85">
        <span className="font-bold text-[#F3D8A0]">{m.planName || "Member"}</span>
        <span>{m.expiresAt ? `Valid until ${fmtYmd(m.expiresAt)}` : "No expiry"}</span>
      </div>
    </div>
  );
}

/** Opens a small window with just the card and starts the print dialog. */
function printCard(m: Member, shop: string) {
  const w = window.open("", "_blank", "width=520,height=420");
  if (!w) {
    alert("Allow pop-ups to print the card.");
    return;
  }
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Membership card ${esc(m.memberNo)}</title><style>
    @page { size: 90mm 56mm; margin: 0 }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact }
    body { margin: 0; font-family: Arial, Helvetica, sans-serif }
    .c { width: 90mm; height: 56mm; padding: 5mm 6mm; color: #fff; background: linear-gradient(135deg,#C1272D,#7C1519); display: flex; flex-direction: column; justify-content: space-between }
    .s { font-size: 9px; font-weight: 800; letter-spacing: .22em; text-transform: uppercase; color: #F3D8A0 }
    .k { font-size: 7px; letter-spacing: .3em; text-transform: uppercase; opacity: .75; margin-top: 2px }
    .id { font: 800 19px "Courier New", monospace; letter-spacing: .12em }
    .n { font-size: 14px; font-weight: 800; margin-top: 3px }
    .f { display: flex; justify-content: space-between; font-size: 9px; opacity: .9 }
    .p { color: #F3D8A0; font-weight: 700 }
  </style></head><body><div class="c"><div><div class="s">${esc(shop)}</div><div class="k">Membership card</div></div>
  <div><div class="id">${esc(m.memberNo)}</div><div class="n">${esc(m.name)}</div></div>
  <div class="f"><span class="p">${esc(m.planName || "Member")}</span><span>${m.expiresAt ? "Valid until " + esc(fmtYmd(m.expiresAt)) : "No expiry"}</span></div></div>
  <script>window.onload=function(){setTimeout(function(){window.print()},200)}</script></body></html>`);
  w.document.close();
}

/* ------------------------------------------------------------------ the panel */
export default function MembershipPanel({
  shop, admin, data, setData, bills, categories, productNames,
}: { shop: string; admin: boolean; data: Overview; setData: React.Dispatch<React.SetStateAction<Overview>>; bills: BillRow[]; categories: string[]; productNames: string[] }) {
  const [loaded, setLoaded] = useState(data.members.length > 0 || data.plans.length > 0);
  const [q, setQ] = useState("");
  const [registering, setRegistering] = useState<null | { phone?: string; name?: string; planId?: string; source?: Source }>(null);
  const [renewing, setRenewing] = useState<Member | null>(null);
  const [upgrading, setUpgrading] = useState<Member | null>(null);
  const [plansOpen, setPlansOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [showSent, setShowSent] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    membershipOverviewAction()
      .then((o) => {
        if (!live) return;
        setData(o);
        setLoaded(true);
      })
      .catch(() => live && (setError("Could not load memberships."), setLoaded(true)));
    return () => {
      live = false;
    };
  }, [setData]);

  const today = todayIST();
  const { members, plans, revenue, settings, events, messages } = data;
  const stats = useMemo(() => customerStats(bills, settings.basis), [bills, settings.basis]);
  const pros = useMemo(() => prospects({ plans, members, stats }), [plans, members, stats]);
  const eligibleNow = pros.filter((p) => p.status === "eligible");

  const counts = useMemo(() => {
    let active = 0;
    for (const m of members) if (stateOf(m, today) === "active") active++;
    return { active };
  }, [members, today]);

  const expiring = useMemo(
    () =>
      members
        .filter((m) => stateOf(m, today) === "active" && m.expiresAt && daysBetween(today, m.expiresAt) <= 14)
        .sort((a, b) => (a.expiresAt as string).localeCompare(b.expiresAt as string)),
    [members, today],
  );

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return members;
    const d = t.replace(/\D/g, "");
    return members.filter((m) => m.name.toLowerCase().includes(t) || m.memberNo.toLowerCase().includes(t) || (d.length >= 2 && m.phone.includes(d)));
  }, [members, q]);

  const open = members.find((m) => m.id === openId) ?? null;
  const take = (r: Result) => setData((d) => applyResult(d, r));
  const activePlans = plans.filter((p) => p.active);
  const waiting = messages.filter((m) => m.status !== "sent");

  const toggle = async (m: Member) => {
    try {
      take(await unwrap(setMemberStatusAction(m.id, m.off)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not change the membership.");
    }
  };
  const markPaid = async (m: Member) => {
    try {
      take(await unwrap(markMemberPaidAction(m.id)));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not update the payment.");
    }
  };

  /** Opens the WhatsApp chat with the message, then records it as sent (or failed if the browser blocked it). */
  const send = async (m: MemberMessage) => {
    const w = window.open(waLink(m.phone, m.text), "_blank", "noopener,noreferrer");
    try {
      const upd = await unwrap(markMessageAction(m.id, w ? "sent" : "failed"));
      setData((d) => ({ ...d, messages: d.messages.map((x) => (x.id === upd.id ? upd : x)) }));
    } catch {
      /* the chat is open anyway; the status can be fixed on the next refresh */
    }
  };

  const eligibilityWa = async (p: { phone: string; name: string; plan: Plan }) => {
    try {
      const msg = await unwrap(eligibilityMessageAction(p.phone, p.name, p.plan.id));
      if (!msg) return alert("Eligibility messages are switched off in the membership settings.");
      setData((d) => ({ ...d, messages: [msg, ...d.messages] }));
      await send(msg);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not prepare the message.");
    }
  };

  const purchases = (phone: string) => bills.filter((b) => b.phone === phone && b.completed).sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="mx-auto w-full max-w-[1400px] flex-1 pb-8 pr-2 animate-in fade-in duration-300">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[28px] font-black tracking-tight text-black">Membership</h2>
          <p className="mt-1 text-xs font-semibold text-black/60">Plans, members, renewals and upgrades. The member discount is applied in Billing.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {admin && (
            <>
              <Btn onClick={() => setSettingsOpen(true)} className="h-11"><SlidersHorizontal className="h-4 w-4" /> Settings</Btn>
              <Btn onClick={() => setPlansOpen(true)} className="h-11"><Settings2 className="h-4 w-4" /> Plans</Btn>
            </>
          )}
          <Btn kind="red" onClick={() => setRegistering({})} className="h-11 px-5"><Plus className="h-4 w-4" /> Register member</Btn>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Total members" value={members.length.toLocaleString("en-IN")} hint="registered so far" />
        <Stat label="Active members" value={counts.active.toLocaleString("en-IN")} tone="green" hint="valid today" />
        <Stat label="Expiring soon" value={expiring.length.toLocaleString("en-IN")} tone="amber" hint="within 14 days" />
        <Stat label="Eligible customers" value={eligibleNow.length.toLocaleString("en-IN")} tone="green" hint="not enrolled yet" />
        <Stat label="Membership revenue" value={rupee(revenue)} tone="red" hint="fees collected" />
      </div>

      {expiring.length > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-amber-900">Expiring in the next 14 days</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {expiring.map((m) => {
              const d = daysBetween(today, m.expiresAt as string);
              return (
                <li key={m.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-1.5 text-[12px] shadow-sm">
                  <button className="cursor-pointer text-left" onClick={() => setOpenId(m.id)}>
                    <b className="text-black">{m.name}</b> <span className="font-mono text-slate-500">{m.memberNo}</span> · {d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`}
                  </button>
                  <Btn onClick={() => setRenewing(m)} className="h-7 px-2.5 text-[11px]">Renew</Btn>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {pros.length > 0 && (
        <div className={cx(card, "mb-4 overflow-hidden")}>
          <div className="flex items-center gap-2 border-b border-black/10 bg-[#F6F3E9] px-5 py-3">
            <TrendingUp className="h-4 w-4 text-[#C1272D]" />
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-700">Customers who qualify or are close to qualifying</p>
          </div>
          <ul className="divide-y divide-black/5">
            {pros.slice(0, 8).map((p) => {
              const member = members.find((m) => m.phone === p.phone);
              return (
                <li key={p.phone} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold text-black">{p.name || "Customer"} <span className="font-mono text-[12px] font-medium text-slate-500">{p.phone}</span></p>
                    <p className="text-[12px] text-slate-600">
                      {p.status === "eligible"
                        ? `${member ? "Qualifies to upgrade to" : "Qualifies for"} ${p.plan.name} (${p.via === "single_bill" ? "one big bill" : `${rupee(p.total)} in purchases`})`
                        : `${rupee(p.remaining)} away from ${p.plan.name} · ${rupee(p.total)} so far`}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {p.status === "eligible" && (
                      <>
                        <Btn onClick={() => eligibilityWa(p)} className="h-8 px-3 text-[11px]"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</Btn>
                        {member ? (
                          <Btn kind="red" onClick={() => setUpgrading(member)} className="h-8 px-3 text-[11px]">Upgrade</Btn>
                        ) : (
                          <Btn kind="red" onClick={() => setRegistering({ phone: p.phone, name: p.name, planId: p.plan.id, source: p.via })} className="h-8 px-3 text-[11px]">Enroll</Btn>
                        )}
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {(waiting.length > 0 || admin) && (
        <div className={cx(card, "mb-4 overflow-hidden")}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-black/10 bg-[#F6F3E9] px-5 py-3">
            <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-700"><MessageCircle className="h-4 w-4 text-emerald-600" /> WhatsApp messages{waiting.length ? ` · ${waiting.length} waiting` : ""}</p>
            <div className="flex gap-2">
              <Btn onClick={() => setShowSent((v) => !v)} className="h-8 px-3 text-[11px]">{showSent ? "Hide sent" : "Show sent"}</Btn>
              {admin && <Btn onClick={() => setOfferOpen(true)} className="h-8 px-3 text-[11px]"><Plus className="h-3.5 w-3.5" /> New offer</Btn>}
            </div>
          </div>
          {(showSent ? messages : waiting).length === 0 ? (
            <p className="px-5 py-4 text-[12.5px] text-slate-500">Nothing waiting. Membership messages (welcome, renewal, upgrade, expiry reminders and offers) appear here, ready to send with one tap.</p>
          ) : (
            <ul className="max-h-72 divide-y divide-black/5 overflow-y-auto">
              {(showSent ? messages : waiting).slice(0, 60).map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-bold text-black">
                      {m.name || "Customer"} <span className="font-mono text-[11px] font-medium text-slate-500">{m.phone}</span>
                      <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-600">{KIND_LABEL[m.kind]}</span>
                      {m.status === "failed" && <span className="ml-1 rounded bg-red-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-red-700">Failed</span>}
                      {m.status === "sent" && <span className="ml-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-700">Sent</span>}
                    </p>
                    <p className="truncate text-[11.5px] text-slate-500">{m.text.replace(/\n+/g, " ")}</p>
                  </div>
                  <Btn kind={m.status === "sent" ? "light" : "green"} onClick={() => send(m)} className="h-8 shrink-0 px-3 text-[11px]">{m.status === "failed" ? "Retry" : m.status === "sent" ? "Send again" : "Send"}</Btn>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mb-4 flex">
        <SearchInput value={q} onChange={setQ} placeholder="Search by name, phone number or Membership ID" />
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{error}</div>}

      <div className={cx(card, "overflow-hidden")}>
        {shown.length === 0 ? (
          loaded ? (
            members.length === 0 ? <Empty title="No members yet">Press “Register member” to add the first one.</Empty> : <Empty title="No member matches your search" />
          ) : (
            <div className="min-h-[160px]" />
          )
        ) : (
          <>
            <div className="hidden grid-cols-[1.4fr_1fr_0.9fr_1.1fr_0.9fr_0.9fr_0.9fr_0.8fr] gap-3 border-b border-black/10 bg-[#F6F3E9] px-5 py-3 text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-slate-600 lg:grid">
              <span>Customer</span><span>Phone</span><span>Member ID</span><span>Plan</span><span>Joined</span><span>Expires</span><span>Purchases</span><span>Status</span>
            </div>
            <ul className="divide-y divide-black/5">
              {shown.map((m) => {
                const st = stateOf(m, today);
                const total = stats.get(m.phone)?.total ?? 0;
                return (
                  <li key={m.id}>
                    <div className="grid cursor-pointer grid-cols-2 items-center gap-x-3 gap-y-1 px-5 py-3.5 hover:bg-[#FAF7F2] lg:grid-cols-[1.4fr_1fr_0.9fr_1.1fr_0.9fr_0.9fr_0.9fr_0.8fr]" onClick={() => setOpenId(m.id)}>
                      <span className="text-[14px] font-bold text-black">{m.name}</span>
                      <span className="justify-self-end lg:order-last lg:justify-self-start"><StatePill s={st} /></span>
                      <span className="font-mono text-[12px] text-slate-500 lg:text-[13px] lg:text-slate-700">{m.phone}</span>
                      <span className="justify-self-end font-mono text-[13px] font-bold text-[#C1272D] lg:justify-self-start">{m.memberNo}</span>
                      <span className="text-[12.5px] font-semibold text-slate-700">{m.planName || "—"}{m.paymentStatus === "pending" && <span className="ml-2 align-middle"><PendingPill /></span>}</span>
                      <span className="hidden text-[13px] text-slate-600 lg:inline">{fmtYmd(m.joinedAt.slice(0, 10))}</span>
                      <span className={cx("justify-self-end text-[12.5px] lg:justify-self-start lg:text-[13px]", st === "expired" ? "font-bold text-amber-700" : "text-slate-600")}>{m.expiresAt ? `Until ${fmtYmd(m.expiresAt)}` : "No expiry"}</span>
                      <span className="hidden text-[13px] font-semibold text-slate-700 lg:inline">{rupee(total)}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {registering && (
        <RegisterModal
          rows={members}
          plans={activePlans}
          defaults={registering}
          onClose={() => setRegistering(null)}
          onDone={(r) => {
            take(r);
            setRegistering(null);
            setOpenId(r.member.id);
          }}
        />
      )}

      {plansOpen && <PlansModal plans={plans} categories={categories} productNames={productNames} onClose={() => setPlansOpen(false)} onChange={(p) => setData((d) => ({ ...d, plans: d.plans.some((x) => x.id === p.id) ? d.plans.map((x) => (x.id === p.id ? p : x)) : [...d.plans, p] }))} />}
      {settingsOpen && <SettingsModal settings={settings} onClose={() => setSettingsOpen(false)} onSaved={(s) => setData((d) => ({ ...d, settings: s }))} />}
      {offerOpen && <OfferModal plans={activePlans} onClose={() => setOfferOpen(false)} onQueued={async () => { const o = await membershipOverviewAction(); setData(o); }} />}

      {open && (
        <Modal
          title={<span className="flex items-center gap-2"><IdCard className="h-5 w-5 text-[#C1272D]" /> Membership</span>}
          onClose={() => setOpenId(null)}
          footer={
            <>
              <Btn onClick={() => toggle(open)}>{open.off ? "Activate" : "Deactivate"}</Btn>
              <Btn onClick={() => printCard(open, shop)}><Printer className="h-4 w-4" /> Print card</Btn>
              <Btn onClick={() => setUpgrading(open)}><TrendingUp className="h-4 w-4" /> Upgrade</Btn>
              <Btn kind="red" onClick={() => setRenewing(open)}><RefreshCw className="h-4 w-4" /> Renew</Btn>
            </>
          }
        >
          <MemberCard m={open} shop={shop} />
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
            <Info k="Phone" v={`+91 ${open.phone}`} />
            <Info k="Plan" v={open.planName || "—"} />
            <Info k="Joined" v={fmtYmd(open.joinedAt.slice(0, 10))} />
            <Info k="Valid until" v={open.expiresAt ? fmtYmd(open.expiresAt) : "No expiry"} />
            <Info k="Member discount" v={open.discountPct ? `${open.discountPct}%${open.offerPct ? ` + ${open.offerPct}% offer` : ""}${open.birthdayPct ? ` · ${open.birthdayPct}% on birthday` : ""}${open.minBill ? ` · bills of ${rupee(open.minBill)}+` : ""}${open.onlyCategories.length + open.onlyProducts.length ? ` · only ${[...open.onlyCategories, ...open.onlyProducts].join(", ")}` : ""}` : "None"} />
            <Info k="Status" v={<StatePill s={stateOf(open, today)} />} />
            <Info k="Joined through" v={SOURCE_LABEL[open.source]} />
            <Info k="Total purchases" v={rupee(stats.get(open.phone)?.total ?? 0)} />
            {open.birthday && <Info k="Birthday" v={new Date(open.birthday + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", month: "long", timeZone: "UTC" })} />}
            <Info
              k="Membership fee"
              v={
                open.paymentStatus === "pending" ? (
                  <span className="flex flex-wrap items-center gap-2"><PendingPill /><Btn onClick={() => markPaid(open)} className="h-7 px-2.5 text-[11px]">Mark as paid</Btn></span>
                ) : (
                  <span className="font-bold text-emerald-700">Paid</span>
                )
              }
            />
          </dl>
          {plans.find((p) => p.id === open.planId)?.description && <p className="mt-4 rounded-xl bg-[#F6F3E9] px-4 py-3 text-[12.5px] text-slate-700">{plans.find((p) => p.id === open.planId)?.description}</p>}

          <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Membership history</p>
          <ul className="mt-1 divide-y divide-black/5 text-[12.5px]">
            {events.filter((e) => e.memberId === open.id).map((e) => (
              <li key={e.id} className="flex justify-between gap-3 py-1.5">
                <span className="text-slate-700">{e.kind === "join" ? "Joined" : e.kind === "renewal" ? "Renewed" : `Upgraded from ${e.fromPlan || "—"} to`} · {e.planName}</span>
                <span className="shrink-0 text-slate-500">{fmtYmd(e.at.slice(0, 10))} · {e.amount ? `${rupee(e.amount)}${e.status === "pending" ? " (pending)" : ""}` : "Free"}</span>
              </li>
            ))}
            {events.every((e) => e.memberId !== open.id) && <li className="py-1.5 text-slate-500">No history yet.</li>}
          </ul>

          <p className="mt-5 text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">Purchase history</p>
          <ul className="mt-1 divide-y divide-black/5 text-[12.5px]">
            {purchases(open.phone).slice(0, 8).map((b) => (
              <li key={b.id} className="flex justify-between gap-3 py-1.5">
                <span className="font-mono text-slate-700">{b.id}</span>
                <span className="shrink-0 text-slate-500">{fmtYmd(b.date.slice(0, 10))} · <b className="text-black">{rupee(b.total)}</b>{b.discount > 0 ? ` (−${rupee(b.discount)})` : ""}</span>
              </li>
            ))}
            {purchases(open.phone).length === 0 && <li className="py-1.5 text-slate-500">No bills for this number yet.</li>}
          </ul>
        </Modal>
      )}

      {upgrading && (
        <UpgradeModal
          m={upgrading}
          plans={activePlans}
          onClose={() => setUpgrading(null)}
          onDone={(r) => {
            take(r);
            setUpgrading(null);
            setOpenId(r.member.id);
          }}
        />
      )}

      {renewing && (
        <RenewModal
          m={renewing}
          plans={activePlans}
          onClose={() => setRenewing(null)}
          onDone={(r) => {
            take(r);
            setRenewing(null);
            setOpenId(r.member.id);
          }}
        />
      )}
    </div>
  );
}

const Info = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div>
    <dt className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-500">{k}</dt>
    <dd className="mt-0.5 font-semibold text-black">{v}</dd>
  </div>
);

const planLine = (p: Plan) => `${p.name} · ${p.fee ? rupee(p.fee) : "Free"} · ${monthsLabel(p.months)} · ${p.discountPct}% off`;

/* ------------------------------------------------------------------ register (also used from Billing) */
export function RegisterModal({
  rows, plans, onClose, onDone, defaults,
}: {
  rows: Member[]; plans: Plan[]; onClose: () => void; onDone: (r: Result) => void; defaults?: { phone?: string; name?: string; planId?: string; source?: Source };
}) {
  const [phone, setPhone] = useState(defaults?.phone ?? "");
  const [name, setName] = useState(defaults?.name ?? "");
  const [planId, setPlanId] = useState(plans.some((p) => p.id === defaults?.planId) ? (defaults?.planId as string) : plans[0]?.id ?? "");
  const [payment, setPayment] = useState<PaymentStatus>("paid");
  const [birthday, setBirthday] = useState("");
  const [sugg, setSugg] = useState<{ phone: string; name: string }[]>([]);
  const [showSugg, setShowSugg] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const typed = useRef(false);
  const memberOf = (p: string) => rows.find((m) => m.phone === p);

  useEffect(() => {
    if (!typed.current || phone.length < 2 || phone.length >= 10) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSugg([]);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      suggestCustomersAction(phone).then((r) => live && setSugg(r)).catch(() => live && setSugg([]));
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [phone]);

  const plan = plans.find((p) => p.id === planId);
  const existing = phone.length === 10 ? memberOf(phone) : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      onDone(await unwrap(registerMemberAction({ name, phone, planId, payment, birthday: birthday || null, source: defaults?.source ?? "manual" })));
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Could not register the member.");
      setBusy(false);
    }
  };

  return (
    <Modal title="Register member" onClose={onClose}>
      {plans.length === 0 ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-900">There is no active membership plan yet. The admin can add one under Membership → Plans.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="relative">
            <label className={labelCls}>Mobile number</label>
            <input
              autoFocus={!defaults?.phone}
              className={field}
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              placeholder="10-digit mobile number"
              value={phone}
              onFocus={() => setShowSugg(true)}
              onBlur={() => setTimeout(() => setShowSugg(false), 150)}
              onChange={(e) => {
                typed.current = true;
                setShowSugg(true);
                setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
              }}
            />
            {showSugg && sugg.length > 0 && (
              <ul className="absolute left-0 right-0 z-10 mt-1 max-h-56 overflow-y-auto rounded-xl border border-black/10 bg-white shadow-lg">
                {sugg.map((s) => {
                  const m = memberOf(s.phone);
                  return (
                    <li key={s.phone}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          typed.current = false;
                          setPhone(s.phone);
                          if (s.name) setName(s.name);
                          setSugg([]);
                          setShowSugg(false);
                        }}
                        className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[#FAF7F2]"
                      >
                        <span className="min-w-0">
                          <span className="block text-sm font-bold tracking-wide text-black">{s.phone}</span>
                          <span className="block truncate text-[11px] font-semibold text-black/60">{s.name || "No name saved"}</span>
                        </span>
                        <span className={cx("shrink-0 rounded border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider", m ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-black/10 bg-black/5 text-black/50")}>
                          {m ? "Already a member" : "Customer"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div>
            <label className={labelCls}>Customer name</label>
            <input className={field} maxLength={60} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Membership plan</label>
            <select className={field} value={planId} onChange={(e) => setPlanId(e.target.value)}>
              {plans.map((p) => <option key={p.id} value={p.id}>{planLine(p)}</option>)}
            </select>
            {plan?.description && <p className="mt-1.5 text-[12px] text-slate-500">{plan.description}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Fee</label>
              <select className={field} value={payment} onChange={(e) => setPayment(e.target.value as PaymentStatus)}>
                <option value="paid">Paid{plan?.fee ? ` · ${rupee(plan.fee)}` : ""}</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Birthday (optional)</label>
              <input className={field} type="date" value={birthday} max={todayIST()} onChange={(e) => setBirthday(e.target.value)} />
            </div>
          </div>
          {plan && (
            <p className="rounded-xl bg-[#F6F3E9] px-4 py-3 text-[12.5px] text-slate-700">
              Joins today · valid until <b>{fmtYmd(addMonths(todayIST(), plan.months))}</b> · <b>{plan.discountPct}%</b> member discount. A Membership ID is created automatically.
            </p>
          )}
          {existing && <p className="rounded-xl bg-amber-50 px-4 py-3 text-[12.5px] font-semibold text-amber-900">This number is already a member: {existing.memberNo} · {existing.name}.</p>}
          {err && <p className="rounded-xl bg-red-50 px-4 py-3 text-[12.5px] font-bold text-red-700">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn type="submit" kind="red" disabled={busy || !name.trim() || phone.length !== 10 || !planId || !!existing}>{busy ? "Registering…" : "Register"}</Btn>
          </div>
        </form>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ renew / upgrade */
function RenewModal({ m, plans, onClose, onDone }: { m: Member; plans: Plan[]; onClose: () => void; onDone: (r: Result) => void }) {
  const [planId, setPlanId] = useState(plans.some((p) => p.id === m.planId) ? (m.planId as string) : plans[0]?.id ?? "");
  const [payment, setPayment] = useState<PaymentStatus>("paid");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const plan = plans.find((p) => p.id === planId);
  const today = todayIST();
  const base = m.expiresAt && m.expiresAt > today ? m.expiresAt : today;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      onDone(await unwrap(renewMemberAction(m.id, planId, payment)));
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Could not renew.");
      setBusy(false);
    }
  };

  return (
    <Modal title={`Renew · ${m.name}`} onClose={onClose}>
      {plans.length === 0 ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-900">There is no active plan to renew with. The admin can add one under Plans.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-[12.5px] text-slate-600">{m.memberNo} · {m.planName || "No plan"} · {m.expiresAt ? (m.expiresAt < today ? `expired ${fmtYmd(m.expiresAt)}` : `valid until ${fmtYmd(m.expiresAt)}`) : "no expiry"}</p>
          <div>
            <label className={labelCls}>Plan</label>
            <select className={field} value={planId} onChange={(e) => setPlanId(e.target.value)}>
              {plans.map((p) => <option key={p.id} value={p.id}>{planLine(p)}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Fee</label>
            <select className={field} value={payment} onChange={(e) => setPayment(e.target.value as PaymentStatus)}>
              <option value="paid">Paid{plan?.fee ? ` · ${rupee(plan.fee)}` : ""}</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          {plan && <p className="rounded-xl bg-[#F6F3E9] px-4 py-3 text-[12.5px] text-slate-700">New expiry: <b>{fmtYmd(addMonths(base, plan.months))}</b>{base !== today ? " (added to the current expiry)" : ""}</p>}
          {err && <p className="rounded-xl bg-red-50 px-4 py-3 text-[12.5px] font-bold text-red-700">{err}</p>}
          <div className="flex justify-end gap-2">
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn type="submit" kind="red" disabled={busy || !planId}>{busy ? "Renewing…" : "Renew"}</Btn>
          </div>
        </form>
      )}
    </Modal>
  );
}

function UpgradeModal({ m, plans, onClose, onDone }: { m: Member; plans: Plan[]; onClose: () => void; onDone: (r: Result) => void }) {
  const cur = plans.find((p) => p.id === m.planId);
  const options = plans.filter((p) => p.id !== m.planId).sort((a, b) => rank(b) - rank(a));
  const better = options.filter((p) => !cur || rank(p) > rank(cur));
  const [planId, setPlanId] = useState((better[0] ?? options[0])?.id ?? "");
  const [payment, setPayment] = useState<PaymentStatus>("paid");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const plan = plans.find((p) => p.id === planId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      onDone(await unwrap(upgradeMemberAction(m.id, planId, payment)));
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Could not upgrade.");
      setBusy(false);
    }
  };

  return (
    <Modal title={`Upgrade · ${m.name}`} onClose={onClose}>
      {options.length === 0 ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-[13px] font-semibold text-amber-900">There is no other active plan to upgrade to.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-[12.5px] text-slate-600">{m.memberNo} · now on <b>{m.planName || "no plan"}</b></p>
          <div>
            <label className={labelCls}>New plan</label>
            <select className={field} value={planId} onChange={(e) => setPlanId(e.target.value)}>
              {options.map((p) => <option key={p.id} value={p.id}>{planLine(p)}{cur && rank(p) > rank(cur) ? " ↑" : ""}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Fee</label>
            <select className={field} value={payment} onChange={(e) => setPayment(e.target.value as PaymentStatus)}>
              <option value="paid">Paid{plan?.fee ? ` · ${rupee(plan.fee)}` : ""}</option>
              <option value="pending">Pending</option>
            </select>
          </div>
          {plan && <p className="rounded-xl bg-[#F6F3E9] px-4 py-3 text-[12.5px] text-slate-700">The new plan starts today and is valid until <b>{fmtYmd(addMonths(todayIST(), plan.months))}</b>, with <b>{plan.discountPct}%</b> member discount.</p>}
          {err && <p className="rounded-xl bg-red-50 px-4 py-3 text-[12.5px] font-bold text-red-700">{err}</p>}
          <div className="flex justify-end gap-2">
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn type="submit" kind="red" disabled={busy || !planId}>{busy ? "Upgrading…" : "Upgrade"}</Btn>
          </div>
        </form>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ plans (admin) */
type PlanForm = {
  id?: string; name: string; fee: string; validity: string; custom: string; discountPct: string; birthdayPct: string; description: string; active: boolean;
  eligibility: Eligibility; threshold: string; minBill: string; offerText: string; offerValidUntil: string;
  offerPct: string; onlyCategories: string[]; onlyProducts: string[];
};
const NEW_PLAN: PlanForm = { name: "", fee: "0", validity: "12", custom: "", discountPct: "10", birthdayPct: "0", description: "", active: true, eligibility: "manual", threshold: "", minBill: "0", offerText: "", offerValidUntil: "", offerPct: "0", onlyCategories: [], onlyProducts: [] };
const VALIDITY = [["3", "3 months"], ["6", "6 months"], ["12", "1 year"], ["custom", "Custom…"]] as const;
const ELIG_LABEL: Record<Eligibility, string> = { manual: "Manual — staff enrol the customer", single_bill: "Single bill — one bill reaches the amount", cumulative: "Total purchases — all bills add up to the amount" };

const toForm = (p: Plan): PlanForm => ({
  id: p.id, name: p.name, fee: String(p.fee), validity: ["3", "6", "12"].includes(String(p.months)) ? String(p.months) : "custom",
  custom: ["3", "6", "12"].includes(String(p.months)) ? "" : String(p.months), discountPct: String(p.discountPct), birthdayPct: String(p.birthdayPct), description: p.description, active: p.active,
  eligibility: p.eligibility, threshold: p.threshold ? String(p.threshold) : "", minBill: String(p.minBill), offerText: p.offerText, offerValidUntil: p.offerValidUntil ?? "",
  offerPct: String(p.offerPct), onlyCategories: p.onlyCategories, onlyProducts: p.onlyProducts,
});

function PlansModal({ plans, categories, productNames, onClose, onChange }: { plans: Plan[]; categories: string[]; productNames: string[]; onClose: () => void; onChange: (p: Plan) => void }) {
  const [f, setF] = useState<PlanForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async (form: PlanForm) => {
    setBusy(true);
    setErr(null);
    try {
      const months = form.validity === "custom" ? Number(form.custom) : Number(form.validity);
      onChange(await unwrap(savePlanAction({
        id: form.id, name: form.name, fee: Number(form.fee), months, discountPct: Number(form.discountPct), birthdayPct: Number(form.birthdayPct || 0), description: form.description, active: form.active,
        eligibility: form.eligibility, threshold: Number(form.threshold || 0), minBill: Number(form.minBill || 0), offerText: form.offerText, offerValidUntil: form.offerValidUntil || null,
        offerPct: Number(form.offerPct || 0), onlyCategories: form.onlyCategories, onlyProducts: form.onlyProducts,
      })));
      setF(null);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Could not save the plan.");
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (p: Plan) => {
    try {
      onChange(await unwrap(savePlanAction({ ...p, active: !p.active })));
    } catch (x) {
      alert(x instanceof Error ? x.message : "Could not change the plan.");
    }
  };

  return (
    <Modal wide title="Membership plans" onClose={onClose}>
      {f ? (
        <form onSubmit={(e) => { e.preventDefault(); void save(f); }} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={labelCls}>Plan name</label>
              <input className={field} maxLength={40} placeholder="e.g. Gold" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>How a customer qualifies</label>
              <select className={field} value={f.eligibility} onChange={(e) => setF({ ...f, eligibility: e.target.value as Eligibility })}>
                {(Object.keys(ELIG_LABEL) as Eligibility[]).map((k) => <option key={k} value={k}>{ELIG_LABEL[k]}</option>)}
              </select>
            </div>
            {f.eligibility !== "manual" && (
              <div className="sm:col-span-2">
                <label className={labelCls}>{f.eligibility === "single_bill" ? "Minimum single bill (₹)" : "Total purchases required (₹)"}</label>
                <input className={field} type="number" min={0} step="0.01" placeholder={f.eligibility === "single_bill" ? "e.g. 2000" : "e.g. 5000"} value={f.threshold} onChange={(e) => setF({ ...f, threshold: e.target.value })} />
                <p className="mt-1 text-[11.5px] text-slate-500">Counted the way set in Membership → Settings (after discounts, or before). Billing offers this plan automatically when a customer reaches it.</p>
              </div>
            )}
            <div>
              <label className={labelCls}>Membership fee (₹, 0 = free)</label>
              <input className={field} type="number" min={0} step="0.01" value={f.fee} onChange={(e) => setF({ ...f, fee: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Validity</label>
              <div className="flex gap-2">
                <select className={field} value={f.validity} onChange={(e) => setF({ ...f, validity: e.target.value })}>
                  {VALIDITY.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
                {f.validity === "custom" && <input className={cx(field, "max-w-[110px]")} type="number" min={1} max={120} placeholder="Months" value={f.custom} onChange={(e) => setF({ ...f, custom: e.target.value })} />}
              </div>
            </div>
            <div>
              <label className={labelCls}>Member discount (%)</label>
              <input className={field} type="number" min={0} max={100} step="0.01" value={f.discountPct} onChange={(e) => setF({ ...f, discountPct: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Birthday discount (%, optional)</label>
              <input className={field} type="number" min={0} max={100} step="0.01" value={f.birthdayPct} onChange={(e) => setF({ ...f, birthdayPct: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Discount applies on bills of at least (₹)</label>
              <input className={field} type="number" min={0} step="0.01" value={f.minBill} onChange={(e) => setF({ ...f, minBill: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Extra offer valid until (optional)</label>
              <input className={field} type="date" value={f.offerValidUntil} onChange={(e) => setF({ ...f, offerValidUntil: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Extra offer discount (%, optional)</label>
              <input className={field} type="number" min={0} max={100} step="0.01" value={f.offerPct} onChange={(e) => setF({ ...f, offerPct: e.target.value })} />
              <p className="mt-1 text-[11.5px] text-slate-500">Added to the member discount while the offer is valid, and shown as its own line on the bill.</p>
            </div>
            <div className="sm:col-span-2 space-y-3 rounded-xl bg-[#F6F3E9] p-4">
              <p className="text-[11.5px] font-bold text-slate-700">Discount applies to (leave both empty = every item)</p>
              <ChipPicker label="Only these categories" options={categories} value={f.onlyCategories} onChange={(v) => setF({ ...f, onlyCategories: v })} />
              <ChipPicker label="Only these products" options={productNames} value={f.onlyProducts} onChange={(v) => setF({ ...f, onlyProducts: v })} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Extra offer / benefit (optional)</label>
              <input className={field} maxLength={120} placeholder="e.g. Free alteration, early access to sales" value={f.offerText} onChange={(e) => setF({ ...f, offerText: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Benefits (short description)</label>
              <input className={field} maxLength={200} placeholder="e.g. Better discounts and early access to special offers" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-slate-800">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="h-4 w-4 accent-[#C1272D]" /> Active (can be chosen for new members)
          </label>
          <p className="text-[12px] text-slate-500">The birthday discount replaces the member discount on the member's birthday when it is higher. Discounts are never added together, and never added on top of a coupon, manual or loyalty discount.</p>
          {err && <p className="rounded-xl bg-red-50 px-4 py-3 text-[12.5px] font-bold text-red-700">{err}</p>}
          <div className="flex justify-end gap-2">
            <Btn onClick={() => { setF(null); setErr(null); }}>Back</Btn>
            <Btn type="submit" kind="red" disabled={busy}>{busy ? "Saving…" : "Save plan"}</Btn>
          </div>
        </form>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-2">
            {plans.map((p) => (
              <li key={p.id} className={cx("flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 bg-white px-4 py-3", !p.active && "opacity-60")}>
                <div className="min-w-0">
                  <p className="text-[14px] font-extrabold text-black">{p.name} {!p.active && <span className="ml-1 text-[10px] font-bold uppercase text-slate-500">(inactive)</span>}</p>
                  <p className="text-[12px] text-slate-600">
                    {p.fee ? rupee(p.fee) : "Free"} · {monthsLabel(p.months)} · {p.discountPct}% off{p.birthdayPct ? ` · ${p.birthdayPct}% on birthday` : ""}
                    {p.offerPct ? ` + ${p.offerPct}% offer` : ""}{p.eligibility === "single_bill" ? ` · one bill of ${rupee(p.threshold)}+` : p.eligibility === "cumulative" ? ` · ${rupee(p.threshold)} total purchases` : " · manual enrolment"}{p.onlyCategories.length + p.onlyProducts.length ? ` · only ${[...p.onlyCategories, ...p.onlyProducts].join(", ")}` : ""}
                  </p>
                  {(p.offerText || p.description) && <p className="mt-0.5 text-[12px] text-slate-500">{p.offerText || p.description}</p>}
                </div>
                <div className="flex gap-2">
                  <Btn onClick={() => setF(toForm(p))} className="h-8 px-3 text-[11px]"><Pencil className="h-3.5 w-3.5" /> Edit</Btn>
                  <Btn onClick={() => toggle(p)} className="h-8 px-3 text-[11px]">{p.active ? "Deactivate" : "Activate"}</Btn>
                </div>
              </li>
            ))}
            {plans.length === 0 && <Empty title="No plans yet">Add the first plan below.</Empty>}
          </ul>
          <Btn kind="red" onClick={() => setF(NEW_PLAN)}><Plus className="h-4 w-4" /> Add plan</Btn>
        </div>
      )}
    </Modal>
  );
}

/** A list of chosen items shown as chips, with a dropdown to add more. */
function ChipPicker({ label, options, value, onChange }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void }) {
  const left = options.filter((o) => !value.some((v) => v.toLowerCase() === o.toLowerCase()));
  return (
    <div>
      <p className="mb-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-600">{label}</p>
      {value.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {value.map((v) => (
            <button key={v} type="button" onClick={() => onChange(value.filter((x) => x !== v))} title="Remove" className="cursor-pointer rounded-full border border-[#C1272D]/30 bg-[#FBEFEF] px-2.5 py-1 text-[11.5px] font-bold text-[#C1272D]">{v} ✕</button>
          ))}
        </div>
      )}
      <select className={field} value="" onChange={(e) => e.target.value && onChange([...value, e.target.value])}>
        <option value="">{left.length ? "Add…" : value.length ? "Nothing more to add" : "None available"}</option>
        {left.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

/* ------------------------------------------------------------------ settings (admin) */
function SettingsModal({ settings, onClose, onSaved }: { settings: MemberSettings; onClose: () => void; onSaved: (s: MemberSettings) => void }) {
  const [s, setS] = useState<MemberSettings>(settings);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toggles: [keyof MemberSettings, string][] = [
    ["msgActivation", "Membership activation message"], ["msgUpgrade", "Upgrade message"], ["msgRenewal", "Renewal message"],
    ["msgExpiry", "Expiry reminders"], ["msgEligibility", "Eligibility messages"], ["msgOffers", "Promotional offers"],
  ];
  const DAYS = [14, 7, 3, 1, 0];
  const save = async () => {
    setBusy(true);
    setErr(null);
    try {
      onSaved(await unwrap(saveMembershipSettingsAction(s)));
      onClose();
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Could not save.");
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Membership settings"
      onClose={onClose}
      footer={<><Btn onClick={onClose}>Cancel</Btn><Btn kind="red" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Btn></>}
    >
      <div className="space-y-5">
        <div>
          <label className={labelCls}>Purchases count toward membership as</label>
          <select className={field} value={s.basis} onChange={(e) => setS({ ...s, basis: e.target.value as MemberSettings["basis"] })}>
            <option value="net">Net amount (bill subtotal after discounts)</option>
            <option value="subtotal">Bill subtotal (before discounts)</option>
          </select>
          <p className="mt-1 text-[11.5px] text-slate-500">Used everywhere: billing offers, the member list, analytics. The membership fee, delivery and GST are never counted. Only completed bills count.</p>
        </div>
        <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-black/10 bg-white px-4 py-3 text-[13px] font-semibold text-slate-800">
          <span>Count the bill being made toward total-purchases eligibility<span className="mt-0.5 block text-[11.5px] font-normal text-slate-500">On: a customer is offered a plan on the bill that takes them over the amount. Off: only bills already completed count.</span></span>
          <input type="checkbox" className="mt-1 h-4 w-4 accent-[#C1272D]" checked={s.countCurrentBill} onChange={(e) => setS({ ...s, countCurrentBill: e.target.checked })} />
        </label>
        <div>
          <p className={labelCls}>WhatsApp messages</p>
          <div className="space-y-2">
            {toggles.map(([k, label]) => (
              <label key={k} className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-black/10 bg-white px-4 py-2.5 text-[13px] font-semibold text-slate-800">
                {label}
                <input type="checkbox" className="h-4 w-4 accent-[#C1272D]" checked={!!s[k]} onChange={(e) => setS({ ...s, [k]: e.target.checked })} />
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[11.5px] text-slate-500">Messages are prepared automatically when the event happens and wait in the WhatsApp list for one tap to send. Switched-off kinds are not prepared.</p>
        </div>
        <div>
          <p className={labelCls}>Remind before expiry</p>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d) => {
              const on = s.reminderDays.includes(d);
              return (
                <button key={d} type="button" onClick={() => setS({ ...s, reminderDays: on ? s.reminderDays.filter((x) => x !== d) : [...s.reminderDays, d].sort((a, b) => b - a) })}
                  className={cx("cursor-pointer rounded-full border px-3.5 py-1.5 text-[12px] font-bold", on ? "border-[#C1272D] bg-[#FBEFEF] text-[#C1272D]" : "border-black/10 bg-white text-slate-600")}>
                  {d === 0 ? "On the day" : `${d} day${d === 1 ? "" : "s"} before`}
                </button>
              );
            })}
          </div>
        </div>
        {err && <p className="rounded-xl bg-red-50 px-4 py-3 text-[12.5px] font-bold text-red-700">{err}</p>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ promotions (admin) */
function OfferModal({ plans, onClose, onQueued }: { plans: Plan[]; onClose: () => void; onQueued: () => void | Promise<void> }) {
  const [target, setTarget] = useState("all");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await unwrap(queueOfferAction(target, text));
      setDone(r.queued);
      await onQueued();
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Could not prepare the messages.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title="New member offer"
      onClose={onClose}
      footer={done === null ? <><Btn onClick={onClose}>Cancel</Btn><Btn kind="red" onClick={go} disabled={busy || !text.trim()}>{busy ? "Preparing…" : "Prepare messages"}</Btn></> : <Btn kind="dark" onClick={onClose}>Done</Btn>}
    >
      {done !== null ? (
        <p className="rounded-xl bg-emerald-50 px-4 py-3 text-[13px] font-semibold text-emerald-900">{done === 0 ? "No active members matched, so nothing was prepared." : `${done} message${done === 1 ? "" : "s"} prepared. Send them one by one from the WhatsApp list.`}</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className={labelCls}>Send to</label>
            <select className={field} value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="all">All active members</option>
              {plans.map((p) => <option key={p.id} value={p.id}>{p.name} members</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Message</label>
            <textarea className={cx(field, "h-32 resize-none py-3")} maxLength={900} placeholder={"Hi {name}! As a {plan} member, enjoy 20% off on all festival wear this week at {shop}. Valid till Sunday."} value={text} onChange={(e) => setText(e.target.value)} />
            <p className="mt-1 text-[11.5px] text-slate-500">{"{name}"}, {"{plan}"} and {"{shop}"} are filled in for each member. Put the offer's validity in the message.</p>
          </div>
          {err && <p className="rounded-xl bg-red-50 px-4 py-3 text-[12.5px] font-bold text-red-700">{err}</p>}
        </div>
      )}
    </Modal>
  );
}

export { billValue };
