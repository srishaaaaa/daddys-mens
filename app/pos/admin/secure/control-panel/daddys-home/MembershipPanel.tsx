"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IdCard, Pencil, Plus, Printer, RefreshCw, Settings2 } from "lucide-react";
import {
  addMonths, daysBetween, fmtYmd, memberDiscount, monthsLabel, stateOf, todayIST,
  type Member, type MemberState, type Overview, type PaymentStatus, type Plan,
} from "@/lib/membershipTypes";
import {
  markMemberPaidAction, membershipOverviewAction, registerMemberAction, renewMemberAction, savePlanAction, setMemberStatusAction,
} from "@/app/pos/membership-actions";
import { suggestCustomersAction } from "@/app/pos/loyalty-actions";
import { unwrap } from "@/lib/actionResult";
import { Btn, Empty, Modal, SearchInput, Stat, card, cx, field, labelCls, rupee } from "./loyaltyKit";

/* Membership: plans with a fee, validity and member discount. Register a customer, give them a Membership ID,
   see who is active or expired, renew, print the card. The member discount is applied in Billing.
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

type Result = { member: Member; revenueDelta: number };

/** Adds or replaces a member in the screen's data (and the revenue), after the server has saved it. */
export function applyResult(d: Overview, r: Result): Overview {
  const has = d.members.some((m) => m.id === r.member.id);
  return {
    ...d,
    members: has ? d.members.map((m) => (m.id === r.member.id ? r.member : m)) : [r.member, ...d.members],
    revenue: d.revenue + r.revenueDelta,
  };
}

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
export default function MembershipPanel({ shop, admin, data, setData }: { shop: string; admin: boolean; data: Overview; setData: React.Dispatch<React.SetStateAction<Overview>> }) {
  const [loaded, setLoaded] = useState(data.members.length > 0 || data.plans.length > 0);
  const [q, setQ] = useState("");
  const [registering, setRegistering] = useState(false);
  const [renewing, setRenewing] = useState<Member | null>(null);
  const [plansOpen, setPlansOpen] = useState(false);
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
  const { members, plans, revenue } = data;
  const counts = useMemo(() => {
    let active = 0, expired = 0;
    for (const m of members) {
      const s = stateOf(m, today);
      if (s === "active") active++;
      else if (s === "expired") expired++;
    }
    return { active, expired };
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

  const pending = members.filter((m) => m.paymentStatus === "pending").length;

  return (
    <div className="mx-auto w-full max-w-[1400px] flex-1 pb-8 pr-2 animate-in fade-in duration-300">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[28px] font-black tracking-tight text-black">Membership</h2>
          <p className="mt-1 text-xs font-semibold text-black/60">Plans, members and renewals. The member discount is applied in Billing.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {admin && (
            <Btn onClick={() => setPlansOpen(true)} className="h-11">
              <Settings2 className="h-4 w-4" /> Plans
            </Btn>
          )}
          <Btn kind="red" onClick={() => setRegistering(true)} className="h-11 px-5">
            <Plus className="h-4 w-4" /> Register member
          </Btn>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total members" value={members.length.toLocaleString("en-IN")} hint="registered so far" />
        <Stat label="Active members" value={counts.active.toLocaleString("en-IN")} tone="green" hint="valid today" />
        <Stat label="Expired members" value={counts.expired.toLocaleString("en-IN")} tone="amber" hint="due for renewal" />
        <Stat label="Membership revenue" value={rupee(revenue)} tone="red" hint={pending ? `fees collected · ${pending} pending` : "fees collected"} />
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
            <div className="hidden grid-cols-[1.5fr_1.1fr_1fr_1.2fr_0.9fr_0.9fr_0.9fr] gap-3 border-b border-black/10 bg-[#F6F3E9] px-5 py-3 text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-slate-600 lg:grid">
              <span>Customer</span><span>Phone</span><span>Member ID</span><span>Plan</span><span>Joined</span><span>Expires</span><span>Status</span>
            </div>
            <ul className="divide-y divide-black/5">
              {shown.map((m) => {
                const st = stateOf(m, today);
                return (
                  <li key={m.id}>
                    <div className="grid cursor-pointer grid-cols-2 items-center gap-x-3 gap-y-1 px-5 py-3.5 hover:bg-[#FAF7F2] lg:grid-cols-[1.5fr_1.1fr_1fr_1.2fr_0.9fr_0.9fr_0.9fr]" onClick={() => setOpenId(m.id)}>
                      <span className="text-[14px] font-bold text-black">{m.name}</span>
                      <span className="justify-self-end lg:order-last lg:justify-self-start"><StatePill s={st} /></span>
                      <span className="font-mono text-[12px] text-slate-500 lg:text-[13px] lg:text-slate-700">{m.phone}</span>
                      <span className="justify-self-end font-mono text-[13px] font-bold text-[#C1272D] lg:order-none lg:justify-self-start">{m.memberNo}</span>
                      <span className="text-[12.5px] font-semibold text-slate-700">{m.planName || "—"}{m.paymentStatus === "pending" && <span className="ml-2 align-middle"><PendingPill /></span>}</span>
                      <span className="hidden text-[13px] text-slate-600 lg:inline">{fmtYmd(m.joinedAt.slice(0, 10))}</span>
                      <span className={cx("justify-self-end text-[12.5px] lg:justify-self-start lg:text-[13px]", st === "expired" ? "font-bold text-amber-700" : "text-slate-600")}>{m.expiresAt ? `Until ${fmtYmd(m.expiresAt)}` : "No expiry"}</span>
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
          onClose={() => setRegistering(false)}
          onDone={(r) => {
            take(r);
            setRegistering(false);
            setOpenId(r.member.id);
          }}
        />
      )}


      {plansOpen && <PlansModal plans={plans} onClose={() => setPlansOpen(false)} onChange={(p) => setData((d) => ({ ...d, plans: d.plans.some((x) => x.id === p.id) ? d.plans.map((x) => (x.id === p.id ? p : x)) : [...d.plans, p] }))} />}

      {open && (
        <Modal
          title={<span className="flex items-center gap-2"><IdCard className="h-5 w-5 text-[#C1272D]" /> Membership</span>}
          onClose={() => setOpenId(null)}
          footer={
            <>
              <Btn onClick={() => toggle(open)}>{open.off ? "Activate" : "Deactivate"}</Btn>
              <Btn onClick={() => printCard(open, shop)}><Printer className="h-4 w-4" /> Print card</Btn>
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
            <Info k="Member discount" v={open.discountPct ? `${open.discountPct}%${open.birthdayPct ? ` · ${open.birthdayPct}% on birthday` : ""}` : "None"} />
            <Info k="Status" v={<StatePill s={stateOf(open, today)} />} />
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
        </Modal>
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
  rows: Member[]; plans: Plan[]; onClose: () => void; onDone: (r: Result) => void; defaults?: { phone?: string; name?: string };
}) {
  const [phone, setPhone] = useState(defaults?.phone ?? "");
  const [name, setName] = useState(defaults?.name ?? "");
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
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
      onDone(await unwrap(registerMemberAction({ name, phone, planId, payment, birthday: birthday || null })));
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

/* ------------------------------------------------------------------ renew */
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

/* ------------------------------------------------------------------ plans (admin) */
type PlanForm = { id?: string; name: string; fee: string; validity: string; custom: string; discountPct: string; birthdayPct: string; description: string; active: boolean };
const NEW_PLAN: PlanForm = { name: "", fee: "0", validity: "12", custom: "", discountPct: "10", birthdayPct: "0", description: "", active: true };
const VALIDITY = [["3", "3 months"], ["6", "6 months"], ["12", "1 year"], ["custom", "Custom…"]] as const;

const toForm = (p: Plan): PlanForm => ({
  id: p.id, name: p.name, fee: String(p.fee), validity: ["3", "6", "12"].includes(String(p.months)) ? String(p.months) : "custom",
  custom: ["3", "6", "12"].includes(String(p.months)) ? "" : String(p.months), discountPct: String(p.discountPct), birthdayPct: String(p.birthdayPct), description: p.description, active: p.active,
});

function PlansModal({ plans, onClose, onChange }: { plans: Plan[]; onClose: () => void; onChange: (p: Plan) => void }) {
  const [f, setF] = useState<PlanForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async (form: PlanForm) => {
    setBusy(true);
    setErr(null);
    try {
      const months = form.validity === "custom" ? Number(form.custom) : Number(form.validity);
      onChange(await unwrap(savePlanAction({ id: form.id, name: form.name, fee: Number(form.fee), months, discountPct: Number(form.discountPct), birthdayPct: Number(form.birthdayPct || 0), description: form.description, active: form.active })));
      setF(null);
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Could not save the plan.");
    } finally {
      setBusy(false);
    }
  };
  const toggle = async (p: Plan) => {
    try {
      onChange(await unwrap(savePlanAction({ id: p.id, name: p.name, fee: p.fee, months: p.months, discountPct: p.discountPct, birthdayPct: p.birthdayPct, description: p.description, active: !p.active })));
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
              <input className={field} maxLength={40} placeholder="e.g. Gold Membership" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus />
            </div>
            <div>
              <label className={labelCls}>Membership fee (₹)</label>
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
            <div className="sm:col-span-2">
              <label className={labelCls}>Benefits (short description)</label>
              <input className={field} maxLength={200} placeholder="e.g. Better discounts and early access to special offers" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] font-semibold text-slate-800">
            <input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} className="h-4 w-4 accent-[#C1272D]" /> Active (can be chosen for new members)
          </label>
          <p className="text-[12px] text-slate-500">The birthday discount replaces the member discount on the member's birthday when it is higher. Discounts are never added together.</p>
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
                  <p className="text-[12px] text-slate-600">{p.fee ? rupee(p.fee) : "Free"} · {monthsLabel(p.months)} · {p.discountPct}% off{p.birthdayPct ? ` · ${p.birthdayPct}% on birthday` : ""}</p>
                  {p.description && <p className="mt-0.5 text-[12px] text-slate-500">{p.description}</p>}
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

export { memberDiscount };
