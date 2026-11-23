"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { IdCard, Plus } from "lucide-react";
import type { Member } from "@/lib/membership";
import { listMembersAction, registerMemberAction, setMemberStatusAction } from "@/app/pos/membership-actions";
import { suggestCustomersAction } from "@/app/pos/loyalty-actions";
import { unwrap } from "@/lib/actionResult";
import { Btn, Empty, Modal, SearchInput, card, cx, field, labelCls } from "./loyaltyKit";

/* Membership: a simple, free membership list. Register a customer, they get a Membership ID, and staff can
   find, view and switch a membership on or off from this one screen. Separate from Loyalty. */

// Kept while the app is open, so the tab shows straight away and refreshes quietly.
let cache: Member[] | null = null;

/** Gives the tab members that were already loaded (with the first load), so it opens instantly. */
export function seedMemberships(rows: Member[]) {
  cache = rows;
}

const dateOf = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

const StatusPill = ({ s }: { s: Member["status"] }) => (
  <span className={cx("inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider", s === "active" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-black/10 bg-slate-100 text-slate-500")}>
    {s === "active" ? "Active" : "Inactive"}
  </span>
);

export default function MembershipPanel({ shop }: { shop: string }) {
  const [rows, setRows] = useState<Member[]>(cache ?? []);
  const [ready, setReady] = useState(!!cache);
  const [q, setQ] = useState("");
  const [registering, setRegistering] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const put = (next: Member[]) => {
    cache = next;
    setRows(next);
  };

  useEffect(() => {
    let live = true;
    listMembersAction()
      .then((r) => {
        if (!live) return;
        cache = r;
        setRows(r);
        setReady(true);
      })
      .catch(() => live && (setError("Could not load members."), setReady(true)));
    return () => {
      live = false;
    };
  }, []);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return rows;
    const d = t.replace(/\D/g, "");
    return rows.filter((m) => m.name.toLowerCase().includes(t) || m.memberNo.toLowerCase().includes(t) || (d.length >= 2 && m.phone.includes(d)));
  }, [rows, q]);

  const open = rows.find((m) => m.id === openId) ?? null;
  const activeCount = rows.filter((m) => m.status === "active").length;

  const toggle = async (m: Member) => {
    const want = m.status !== "active";
    put(rows.map((x) => (x.id === m.id ? { ...x, status: want ? "active" : "inactive" } : x))); // instant; undone if it fails
    try {
      await unwrap(setMemberStatusAction(m.id, want));
    } catch (e) {
      put(rows.map((x) => (x.id === m.id ? m : x)));
      alert(e instanceof Error ? e.message : "Could not change the membership.");
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] flex-1 pb-8 pr-2 animate-in fade-in duration-300">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[28px] font-black tracking-tight text-black">Membership</h2>
          <p className="mt-1 text-xs font-semibold text-black/60">
            Register customers as members and manage their membership.{ready && rows.length > 0 ? ` ${rows.length} member${rows.length === 1 ? "" : "s"} · ${activeCount} active.` : ""}
          </p>
        </div>
        <Btn kind="red" onClick={() => setRegistering(true)} className="h-11 px-5">
          <Plus className="h-4 w-4" /> Register member
        </Btn>
      </div>

      <div className="mb-4 flex">
        <SearchInput value={q} onChange={setQ} placeholder="Search by name, phone number or Membership ID" />
      </div>

      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{error}</div>}

      <div className={cx(card, "overflow-hidden")}>
        {shown.length === 0 ? (
          ready ? (
            rows.length === 0 ? (
              <Empty title="No members yet">Press “Register member” to add the first one.</Empty>
            ) : (
              <Empty title="No member matches your search" />
            )
          ) : (
            <div className="min-h-[160px]" />
          )
        ) : (
          <>
            <div className="hidden grid-cols-[1.1fr_1.6fr_1.2fr_1fr_0.9fr_auto] gap-3 border-b border-black/10 bg-[#F6F3E9] px-5 py-3 text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-slate-600 md:grid">
              <span>Membership ID</span><span>Name</span><span>Phone</span><span>Joined</span><span>Status</span><span className="w-[110px] text-right">Action</span>
            </div>
            <ul className="divide-y divide-black/5">
              {shown.map((m) => (
                <li key={m.id}>
                  <div className="grid cursor-pointer grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 px-5 py-3.5 hover:bg-[#FAF7F2] md:grid-cols-[1.1fr_1.6fr_1.2fr_1fr_0.9fr_auto]" onClick={() => setOpenId(m.id)}>
                    <span className="font-mono text-[13px] font-bold text-[#C1272D]">{m.memberNo}</span>
                    <span className="order-3 col-span-2 text-[14px] font-bold text-black md:order-none md:col-span-1">{m.name}<span className="ml-2 font-mono text-[12px] font-medium text-slate-500 md:hidden">{m.phone}</span></span>
                    <span className="hidden font-mono text-[13px] text-slate-700 md:inline">{m.phone}</span>
                    <span className="hidden text-[13px] text-slate-600 md:inline">{dateOf(m.joinedAt)}</span>
                    <span className="justify-self-end md:justify-self-start"><StatusPill s={m.status} /></span>
                    <span className="hidden w-[110px] justify-end md:flex" onClick={(e) => e.stopPropagation()}>
                      <Btn onClick={() => toggle(m)} className="h-8 px-3 text-[11px]">{m.status === "active" ? "Deactivate" : "Activate"}</Btn>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {registering && (
        <RegisterModal
          rows={rows}
          onClose={() => setRegistering(false)}
          onDone={(m) => {
            put([m, ...rows]);
            setRegistering(false);
            setOpenId(m.id);
          }}
        />
      )}

      {open && (
        <Modal
          title={<span className="flex items-center gap-2"><IdCard className="h-5 w-5 text-[#C1272D]" /> Membership card</span>}
          onClose={() => setOpenId(null)}
          footer={
            <>
              <Btn onClick={() => toggle(open)}>{open.status === "active" ? "Deactivate membership" : "Activate membership"}</Btn>
              <Btn kind="dark" onClick={() => setOpenId(null)}>Close</Btn>
            </>
          }
        >
          <div className={cx("overflow-hidden rounded-2xl bg-gradient-to-br from-[#C1272D] to-[#7C1519] p-5 text-white shadow-lg", open.status !== "active" && "opacity-70 grayscale-[35%]")}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-extrabold uppercase tracking-[0.22em] text-[#F3D8A0]">{shop}</p>
                <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.3em] text-white/70">Member</p>
              </div>
              <span className={cx("rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider", open.status === "active" ? "bg-emerald-400/90 text-emerald-950" : "bg-white/25 text-white")}>
                {open.status === "active" ? "Active" : "Inactive"}
              </span>
            </div>
            <p className="mt-7 font-mono text-[26px] font-black tracking-[0.12em]">{open.memberNo}</p>
            <p className="mt-4 text-[18px] font-extrabold leading-tight">{open.name}</p>
            <div className="mt-3 flex items-end justify-between gap-3 text-[12px] text-white/85">
              <span className="font-mono">+91 {open.phone}</span>
              <span>Member since {dateOf(open.joinedAt)}</span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* Register: type the number (existing customers are suggested and fill in the name), check the name, register. */
function RegisterModal({ rows, onClose, onDone }: { rows: Member[]; onClose: () => void; onDone: (m: Member) => void }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
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

  const existing = phone.length === 10 ? memberOf(phone) : undefined;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      onDone(await unwrap(registerMemberAction(name, phone)));
    } catch (x) {
      setErr(x instanceof Error ? x.message : "Could not register the member.");
      setBusy(false);
    }
  };

  return (
    <Modal title="Register member" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        <div className="relative">
          <label className={labelCls}>Mobile number</label>
          <input
            autoFocus
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
        {existing && (
          <p className="rounded-xl bg-amber-50 px-4 py-3 text-[12.5px] font-semibold text-amber-900">
            This number is already a member: {existing.memberNo} · {existing.name}.
          </p>
        )}
        {err && <p className="rounded-xl bg-red-50 px-4 py-3 text-[12.5px] font-bold text-red-700">{err}</p>}
        <p className="text-[12px] text-slate-500">Membership is free. A Membership ID is created automatically.</p>
        <div className="flex justify-end gap-2 pt-1">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn type="submit" kind="red" disabled={busy || !name.trim() || phone.length !== 10 || !!existing}>{busy ? "Registering…" : "Register"}</Btn>
        </div>
      </form>
    </Modal>
  );
}
