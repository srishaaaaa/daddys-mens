"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BadgePercent,
  Check,
  Download,
  Loader2,
  MessageCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Ticket,
  Trash2,
  X,
} from "lucide-react";
import { couponStatus, type Coupon, type CouponAudience } from "@/lib/couponTypes";
import { canvasToPdf, drawCouponCanvas, sharePdf } from "@/lib/couponImage";
import { getPublicUrlAction } from "@/app/pos/settings-actions";
import {
  couponRecipientsAction,
  deleteCouponAction,
  listCouponsAction,
  saveCouponAction,
  sendCouponAction,
} from "@/app/pos/coupon-actions";

type Form = {
  id?: string;
  code: string;
  percent: string;
  minOrder: string;
  expiresAt: string;
  limit: string;
  active: boolean;
  restricted: boolean;
  audience: CouponAudience;
};
const EMPTY: Form = { code: "", percent: "", minOrder: "", expiresAt: "", limit: "", active: true, restricted: false, audience: "all" };

const AUDIENCES: { key: CouponAudience; label: string; hint: string; tone: string }[] = [
  { key: "all", label: "Everyone", hint: "Any customer, member or not", tone: "bg-slate-100 text-slate-600 border-slate-200" },
  { key: "regular", label: "Non-loyalty", hint: "Customers who are not loyalty members", tone: "bg-amber-50 text-amber-700 border-amber-200" },
  { key: "loyalty", label: "Loyalty members", hint: "Active loyalty members only", tone: "bg-emerald-50 text-emerald-700 border-emerald-200" },
];

const STATUS = {
  active: ["Active", "bg-emerald-50 text-emerald-700 border-emerald-200"],
  expired: ["Expired", "bg-red-50 text-red-700 border-red-200"],
  exhausted: ["Used up", "bg-red-50 text-red-700 border-red-200"],
  paused: ["Paused", "bg-slate-100 text-slate-600 border-slate-200"],
} as const;

const field =
  "h-12 w-full rounded-xl bg-[#F6F3E9] px-4 text-[14px] font-medium text-slate-900 outline-none ring-[#C1272D]/15 transition placeholder:text-slate-400 focus:bg-white focus:ring-4";
const labelCls = "mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-600";

const rupee = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const ddmmyyyy = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return `${day}/${m}/${y}`;
};
const tenDigits = (v: string) => v.replace(/\D/g, "").slice(-10);

function gen() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const r = new Uint32Array(7);
  crypto.getRandomValues(r);
  return Array.from(r, (n) => A[n % A.length]).join("");
}

const WaIcon = ({ size = 15 }: { size?: number }) => <MessageCircle width={size} height={size} />;

/* The form sits on the left and is always open; the list sits on the right. Editing a
   coupon loads it into the same form. Each coupon can be sent to a customer on WhatsApp. */
export default function CouponsPanel() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState<Form>(EMPTY);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [sendId, setSendId] = useState<string | null>(null);
  const [blastId, setBlastId] = useState<string | null>(null);
  const [tab, setTab] = useState<CouponAudience | "every">("every");
  const formRef = useRef<HTMLFormElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setCoupons(await listCouponsAction());
      setError(null);
    } catch (err) {
      console.error("Failed to load coupons:", err);
      setError("Could not load coupons. Has migration 0003_coupons.sql been run in Supabase?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const saved = await saveCouponAction({
        id: f.id,
        code: f.code,
        percent: Number(f.percent),
        minOrder: Number(f.minOrder) || 0,
        expiresAt: f.expiresAt || null,
        limit: f.limit ? Number(f.limit) : null,
        active: f.active,
        restricted: f.restricted,
        audience: f.audience,
      });
      setF(EMPTY);
      await load();
      alert(f.id ? `${saved.code} updated.` : `${saved.code} created — it's ready in Billing.`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save the coupon.");
    } finally {
      setBusy(false);
    }
  };

  const edit = (c: Coupon) => {
    setF({
      id: c.id,
      code: c.code,
      percent: String(c.percent),
      minOrder: c.minOrder ? String(c.minOrder) : "",
      expiresAt: c.expiresAt ?? "",
      limit: c.limit === null ? "" : String(c.limit),
      active: c.active,
      restricted: c.restricted,
      audience: c.audience,
    });
    // on a phone the form is above the list, so bring it into view
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const remove = async (c: Coupon) => {
    if (!window.confirm(`Delete ${c.code}? Past bills keep the coupon code on record.`)) return;
    try {
      await deleteCouponAction(c.id);
      if (f.id === c.id) setF(EMPTY);
      await load();
    } catch {
      alert("Could not delete the coupon. Please try again.");
    }
  };

  const togglePause = async (c: Coupon) => {
    try {
      await saveCouponAction({
        id: c.id,
        code: c.code,
        percent: c.percent,
        minOrder: c.minOrder,
        expiresAt: c.expiresAt,
        limit: c.limit,
        active: !c.active,
        restricted: c.restricted,
        audience: c.audience,
      });
      await load();
    } catch {
      alert("Could not update the coupon. Please try again.");
    }
  };

  const downloadExcel = () => {
    const rows = [
      ["Code", "Discount %", "Min order", "Expires", "Usage limit", "Used", "Sent", "Only for customers sent to", "Status"],
      ...coupons.map((c) => [
        c.code, c.percent, c.minOrder, c.expiresAt ?? "", c.limit ?? "Unlimited", c.used, c.sent,
        c.restricted ? "Yes" : "No", couponStatus(c),
      ]),
    ];
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `coupons-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const list = coupons.filter((c) => (tab === "every" || c.audience === tab) && (!q || c.code.toLowerCase().includes(q.toLowerCase())));
  const blasting = blastId ? coupons.find((c) => c.id === blastId) ?? null : null;
  const activeCount = coupons.filter((c) => couponStatus(c) === "active").length;
  const redemptions = coupons.reduce((n, c) => n + c.used, 0);
  const sending = sendId ? coupons.find((c) => c.id === sendId) ?? null : null;

  const kpis = [
    { label: "Total coupons", value: coupons.length, hint: "Configured promotional codes", Icon: Ticket, tone: "bg-amber-100 text-amber-700" },
    { label: "Active coupons", value: activeCount, hint: "Live & ready at checkout", Icon: Check, tone: "bg-emerald-100 text-emerald-700" },
    { label: "Total redemptions", value: redemptions, hint: "Times customers used a coupon", Icon: BadgePercent, tone: "bg-stone-200 text-stone-700" },
  ];

  return (
    <div className="flex-1 w-full max-w-[1400px] mx-auto pb-8 animate-in fade-in duration-300">
      <div className="rounded-3xl bg-[#FDFCF7] p-5 sm:p-8 border border-black/5 shadow-sm">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[28px] font-black tracking-tight text-black">Coupon Management</h2>
            <p className="mt-1 text-xs font-semibold text-black/60">
              Create discount codes and send them to customers on WhatsApp. Applies to the product subtotal only.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={downloadExcel}
              disabled={!coupons.length}
              className="h-10 inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-4 text-xs font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-40 cursor-pointer"
            >
              <Download className="w-4 h-4" /> Download Excel
            </button>
            <button
              onClick={load}
              className="h-10 inline-flex items-center gap-2 rounded-xl border border-black/10 bg-white px-4 text-xs font-bold text-slate-800 hover:bg-slate-50 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Refresh
            </button>
          </div>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-3">
          {kpis.map(({ label, value, hint, Icon, tone }) => (
            <div key={label} className="rounded-2xl border border-black/10 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <span className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-600">{label}</span>
                <span className={`grid h-8 w-8 place-items-center rounded-full ${tone}`}>
                  <Icon className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-3 text-[28px] font-black leading-none text-black">{value}</div>
              <div className="mt-2 text-[11.5px] text-slate-500">{hint}</div>
            </div>
          ))}
        </div>

        <p className="mb-6 rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-[13px] font-semibold text-sky-700">
          Coupon discount applies to the product subtotal only — not extra charges or GST. Staff can apply a code in
          Billing.
        </p>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{error}</div>
        )}

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          {/* ---------- new / edit ---------- */}
          <section className="scroll-mt-4 rounded-3xl border border-black/10 bg-white p-5 shadow-sm sm:p-8">
            <div className="mb-6 flex items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-[18px] font-bold text-slate-900">
                {f.id ? (
                  <>
                    <Pencil className="w-4 h-4" /> Edit {f.code || "coupon"}
                  </>
                ) : (
                  <>
                    <Plus className="w-[18px] h-[18px]" /> New Coupon
                  </>
                )}
              </h3>
              {f.id && (
                <button type="button" onClick={() => setF(EMPTY)} className="text-[12.5px] font-bold text-slate-500 hover:text-slate-900 cursor-pointer">
                  Cancel edit
                </button>
              )}
            </div>

            <form ref={formRef} onSubmit={save} className="space-y-5">
              <label className="block">
                <span className={labelCls}>Coupon code *</span>
                <span className="relative block">
                  <input
                    className={`${field} pr-28 uppercase`}
                    placeholder="E.G. SUMMER20"
                    value={f.code}
                    maxLength={24}
                    onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setF({ ...f, code: gen() })}
                    className="absolute right-2 top-1/2 h-8 -translate-y-1/2 rounded-lg bg-[#C1272D] px-4 text-[12.5px] font-bold text-white hover:bg-[#9B1C21] cursor-pointer"
                  >
                    Generate
                  </button>
                </span>
              </label>
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block">
                  <span className={labelCls}>Discount % *</span>
                  <input className={field} type="number" min={1} max={100} step="0.5" placeholder="e.g. 15" value={f.percent} onChange={(e) => setF({ ...f, percent: e.target.value })} required />
                </label>
                <label className="block">
                  <span className={labelCls}>Min order (₹)</span>
                  <input className={field} type="number" min={0} placeholder="e.g. 1000" value={f.minOrder} onChange={(e) => setF({ ...f, minOrder: e.target.value })} />
                </label>
                <label className="block">
                  <span className={labelCls}>Expiry date</span>
                  <input className={field} type="date" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} />
                </label>
                <label className="block">
                  <span className={labelCls}>Usage limit</span>
                  <input className={field} type="number" min={1} placeholder="e.g. 50" value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value })} />
                </label>
              </div>
              <div>
                <span className={labelCls}>Who can use it *</span>
                <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Coupon audience">
                  {AUDIENCES.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      role="radio"
                      aria-checked={f.audience === a.key}
                      onClick={() => setF({ ...f, audience: a.key })}
                      className={`rounded-xl border px-3 py-2.5 text-left transition cursor-pointer ${f.audience === a.key ? "border-[#C1272D] bg-[#FBEFEF] ring-2 ring-[#C1272D]/15" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                    >
                      <span className="block text-[13px] font-bold text-slate-900">{a.label}</span>
                      <span className="block text-[11px] leading-snug text-slate-500">{a.hint}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl bg-[#F6F3E9] px-4 py-3">
                <span>
                  <span className="block text-[13px] font-bold text-slate-800">Only for customers it&apos;s sent to</span>
                  <span className="block text-[11.5px] text-slate-500">Works only for the mobile numbers you send it to from this page.</span>
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={f.restricted}
                  aria-label="Only for customers it's sent to"
                  onClick={() => setF({ ...f, restricted: !f.restricted })}
                  className={`relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer ${f.restricted ? "bg-[#C1272D]" : "bg-stone-300"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${f.restricted ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>
              <button
                type="submit"
                disabled={busy}
                className="h-12 w-full rounded-xl bg-[#C1272D] text-[14px] font-extrabold uppercase tracking-wide text-white shadow-[0_8px_20px_-10px_rgba(193,39,45,.9)] transition hover:bg-[#9B1C21] active:scale-[.99] disabled:opacity-50 cursor-pointer inline-flex items-center justify-center gap-2"
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />}
                {busy ? "Saving…" : f.id ? "Save changes" : "Create coupon"}
              </button>
            </form>
          </section>

          {/* ---------- list ---------- */}
          <section className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm sm:p-8">
            <h3 className="mb-4 flex items-center gap-2 text-[18px] font-bold text-slate-900">
              All Coupons{" "}
              <span className="grid h-6 min-w-6 place-items-center rounded-full bg-slate-900 px-1.5 text-[12px] text-white">{coupons.length}</span>
            </h3>
            <div className="mb-4 flex flex-wrap gap-2">
              {([{ key: "every", label: "All" }, ...AUDIENCES] as { key: CouponAudience | "every"; label: string }[]).map((x) => {
                const n = x.key === "every" ? coupons.length : coupons.filter((c) => c.audience === x.key).length;
                return (
                  <button key={x.key} type="button" onClick={() => setTab(x.key)} className={`h-8 rounded-full px-3.5 text-[12px] font-bold transition cursor-pointer ${tab === x.key ? "bg-slate-900 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>
                    {x.label} <span className="opacity-60">{n}</span>
                  </button>
                );
              })}
            </div>
            <div className="relative mb-5">
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search coupons by code…"
                className="h-11 w-full rounded-xl bg-[#F6F3E9] pl-10 pr-4 text-[13px] font-medium outline-none focus:bg-white focus:ring-4 ring-[#C1272D]/15"
              />
            </div>
            {!list.length ? (
              <div className="rounded-2xl border border-dashed border-black/15 px-6 py-10 text-center">
                <Ticket className="mx-auto mb-2 w-6 h-6 text-slate-400" />
                <p className="text-sm font-bold text-slate-800">{coupons.length ? "No coupons match" : loading ? "Loading…" : "No coupons yet"}</p>
                {!coupons.length && !loading && <p className="mt-1 text-xs text-slate-500">Create one — staff can use it straight away.</p>}
              </div>
            ) : (
              <ul className="-mr-2 max-h-[560px] space-y-4 overflow-y-auto pr-2">
                {list.map((c) => {
                  const st = couponStatus(c);
                  return (
                    <li key={c.id} className={`rounded-2xl border bg-white p-4 shadow-[0_1px_4px_rgba(15,23,42,.05)] transition ${f.id === c.id ? "border-slate-400" : st === "active" ? "border-emerald-100" : "border-slate-100"}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <b className="min-w-0 truncate font-mono text-[16px] tracking-wider text-slate-900">{c.code}</b>
                        <span className={`rounded-md border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${STATUS[st][1]}`}>{STATUS[st][0]}</span>
                        {c.audience !== "all" && (
                          <span className={`rounded-md border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${AUDIENCES.find((a) => a.key === c.audience)!.tone}`}>
                            {c.audience === "loyalty" ? "Loyalty members" : "Non-loyalty"}
                          </span>
                        )}
                        {c.restricted && (
                          <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-700">
                            {c.phones.length ? `Only ${c.phones.length} phone${c.phones.length === 1 ? "" : "s"}` : "Sent-to only"}
                          </span>
                        )}
                      </div>
                      <p className="mt-1.5 text-[15px] font-extrabold text-[#C1272D]">
                        {c.percent}% OFF
                        {c.minOrder ? <span className="text-[12.5px] font-semibold text-slate-500"> · min {rupee(c.minOrder)}</span> : null}
                      </p>
                      <p className="mt-1 text-[12px] text-slate-500">
                        Used {c.used} time{c.used === 1 ? "" : "s"}
                        {c.limit !== null && ` of ${c.limit}`} • {c.expiresAt ? `expires ${ddmmyyyy(c.expiresAt)}` : "no expiry"}
                        {c.sent > 0 && ` • sent ${c.sent}×`}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          title={c.audience === "loyalty" ? "Send to every loyalty member" : c.audience === "regular" ? "Send to every customer who isn't a loyalty member" : "Send to loyalty members and other customers"}
                          onClick={() => setBlastId(c.id)}
                          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#22c55e] bg-white px-3.5 text-[12px] font-extrabold uppercase tracking-wide text-[#16a34a] hover:bg-emerald-50 cursor-pointer"
                        >
                          <WaIcon /> {c.audience === "loyalty" ? "All members" : c.audience === "regular" ? "All customers" : "Everyone"}
                        </button>
                        <button type="button" onClick={() => setSendId(c.id)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#22c55e] px-3.5 text-[12px] font-extrabold uppercase tracking-wide text-white hover:bg-[#16a34a] cursor-pointer">
                          <WaIcon /> Send
                        </button>
                        <button
                          type="button"
                          onClick={() => togglePause(c)}
                          title={c.active ? "Tap to pause" : "Tap to resume"}
                          className={`h-9 rounded-lg px-3.5 text-[12px] font-extrabold uppercase tracking-wide cursor-pointer ${c.active ? "bg-slate-900 text-white hover:bg-slate-700" : "border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"}`}
                        >
                          {c.active ? "Active" : "Paused"}
                        </button>
                        <button type="button" onClick={() => edit(c)} aria-label={`Edit ${c.code}`} title="Edit" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
                          <Pencil className="w-[15px] h-[15px]" />
                        </button>
                        <button type="button" onClick={() => remove(c)} aria-label={`Delete ${c.code}`} title="Delete" className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 cursor-pointer">
                          <Trash2 className="w-[15px] h-[15px]" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      {blasting && <BlastCoupon key={blasting.id} coupon={blasting} onClose={() => setBlastId(null)} onSent={load} />}
      {sending && <SendCoupon key={sending.id} coupon={sending} onClose={() => setSendId(null)} onSent={load} />}
    </div>
  );
}

/* Sends one coupon to one customer as a WhatsApp message. The send is recorded once the
   chat has been opened, and that is when the phone joins the coupon's list — the list
   "only for this customer" checks against. */
function SendCoupon({ coupon: c, onClose, onSent }: { coupon: Coupon; onClose: () => void; onSent: () => void }) {
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [only, setOnly] = useState(c.restricted);
  const [siteUrl, setSiteUrl] = useState("");
  useEffect(() => {
    getPublicUrlAction().then(setSiteUrl).catch(() => {});
  }, []);
  const [busy, setBusy] = useState(false);
  const ok = /^[6-9]\d{9}$/.test(phone);
  const who = name.trim();
  const base = (siteUrl || process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  const link = `${base}/coupon/${c.code}${who ? `?n=${encodeURIComponent(who)}` : ""}`;
  const message = [
    `Dear ${who || "Customer"},`,
    "",
    "🎁 A special gift from *Daddy's Home* 🎁",
    "",
    `🎉 *${c.percent}% OFF*`,
    `🔑 Your code: *${c.code}*`,
    "",
    c.minOrder ? `• Valid on purchases of ${rupee(c.minOrder)} or more` : "• No minimum purchase",
    ...(c.expiresAt ? [`• Valid till ${ddmmyyyy(c.expiresAt)}`] : []),
    "• Show this code at billing. Discount applies to the item value only.",
    "",
    `🎟️ Open your coupon: ${link}`,
    "",
    "📞 80566 42706",
  ].join("\n");

  // PDF: the coupon as a one-page file, shared through the phone's share sheet (or downloaded on a computer).
  const viaPdf = async () => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      const cv = await drawCouponCanvas({ code: c.code, percent: c.percent, minOrder: c.minOrder, expiresAt: c.expiresAt, customerName: who || undefined });
      const file = new File([canvasToPdf(cv)], `coupon-${c.code}.pdf`, { type: "application/pdf" });
      const how = await sharePdf(file, message);
      if (how === "cancelled") return;
      // No share sheet (most computers): the PDF was downloaded, so open the chat to attach it.
      if (how === "downloaded") window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
      await sendCouponAction(c.id, phone, only);
      onSent();
      onClose();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Couldn't make the PDF.");
    } finally {
      setBusy(false);
    }
  };

  const viaWhatsApp = async () => {
    if (!ok || busy) return;
    window.open(`https://wa.me/91${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    setBusy(true);
    try {
      await sendCouponAction(c.id, phone, only);
      onSent();
      onClose();
    } catch {
      alert("The chat opened, but the send could not be recorded.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-between border-b border-black/10 p-5">
          <h3 className="text-base font-black text-black">
            Send coupon · <span className="font-mono tracking-wider">{c.code}</span>
          </h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-pointer" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-[12.5px] leading-relaxed text-slate-500">
            The coupon goes as a link in the customer's WhatsApp chat, or as a PDF with "Generate & share PDF". It is recorded once the chat or share sheet has been used.
          </p>
          <label className="block">
            <span className={labelCls}>
              Customer phone <span className="text-red-600">*</span>
            </span>
            <input className={field} value={phone} onChange={(e) => setPhone(tenDigits(e.target.value))} placeholder="Enter WhatsApp number" inputMode="numeric" autoComplete="tel-national" />
            {phone && !ok && <span className="mt-1 block text-[11.5px] font-semibold text-amber-600">Enter a 10-digit mobile number.</span>}
          </label>
          <label className="block">
            <span className={labelCls}>Customer name</span>
            <input className={field} value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="Optional" />
          </label>
          <div className="flex items-center justify-between gap-4">
            <span className={`${labelCls} mb-0`}>Only for this customer</span>
            <button
              type="button"
              role="switch"
              aria-checked={only}
              onClick={() => setOnly(!only)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors cursor-pointer ${only ? "bg-[#C1272D]" : "bg-stone-300"}`}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${only ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
          {only ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] font-semibold text-amber-800">
              This coupon will only work for the phones it was sent to{c.phones.length ? ` (${c.phones.length} so far)` : ""}. Use a dedicated coupon for this.
            </p>
          ) : (
            c.restricted && <p className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-[12.5px] font-semibold text-sky-700">Sending with this off opens {c.code} to every customer again.</p>
          )}
          <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-3">
            <button type="button" onClick={onClose} className="h-12 rounded-xl border border-slate-200 bg-white text-[14px] font-bold text-slate-800 hover:bg-slate-50 cursor-pointer">
              Cancel
            </button>
            <button type="button" disabled={!ok || busy} onClick={viaWhatsApp} className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-[#22c55e] px-2 text-[13px] font-bold leading-tight text-white hover:bg-[#16a34a] disabled:opacity-45 cursor-pointer">
              <WaIcon size={16} /> Send link on WhatsApp
            </button>
            <button type="button" disabled={!ok || busy} onClick={viaPdf} className="flex h-12 items-center justify-center gap-1.5 rounded-xl border border-[#22c55e] bg-white px-2 text-[13px] font-bold leading-tight text-[#16a34a] hover:bg-emerald-50 disabled:opacity-45 cursor-pointer">
              <Download className="w-4 h-4" /> {busy ? "Working…" : "Generate & share PDF"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


/* Sends one coupon to many customers: lists who it can go to and opens a WhatsApp chat per person.
   Each send is recorded as it happens, so a person is never sent the same coupon twice by mistake. */
function BlastCoupon({ coupon: c, onClose, onSent }: { coupon: Coupon; onClose: () => void; onSent: () => void }) {
  const scope = c.audience === "loyalty" ? "members" : c.audience === "regular" ? "nonMembers" : "everyone";
  const [people, setPeople] = useState<{ phone: string; name: string; member: boolean }[] | null>(null);
  const [siteUrl, setSiteUrl] = useState("");
  const [done, setDone] = useState<string[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    couponRecipientsAction(scope).then(setPeople).catch(() => setPeople([]));
    getPublicUrlAction().then(setSiteUrl).catch(() => {});
  }, [scope]);

  const base = (siteUrl || process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "");
  const messageFor = (name: string, phone: string) => {
    const link = `${base}/coupon/${c.code}${name ? `?n=${encodeURIComponent(name)}` : ""}`;
    return [
      `Dear ${name || "Customer"},`, "",
      c.audience === "loyalty" ? "🎁 An exclusive gift for our loyalty members at *Daddy's Home* 🎁" : "🎁 A special gift from *Daddy's Home* 🎁", "",
      `🎉 *${c.percent}% OFF*`, `🔑 Your code: *${c.code}*`, "",
      c.minOrder ? `• Valid on purchases of ${rupee(c.minOrder)} or more` : "• No minimum purchase",
      ...(c.expiresAt ? [`• Valid till ${ddmmyyyy(c.expiresAt)}`] : []),
      "• Show this code at billing. Discount applies to the item value only.", "",
      `🎟️ Open your coupon: ${link}`, "", "📞 80566 42706",
    ].join("\n") + (phone ? "" : "");
  };

  const send = async (p: { phone: string; name: string }) => {
    window.open(`https://wa.me/91${p.phone}?text=${encodeURIComponent(messageFor(p.name, p.phone))}`, "_blank", "noopener,noreferrer");
    setDone((d) => [...d, p.phone]);
    try {
      await sendCouponAction(c.id, p.phone, c.restricted);
      onSent();
    } catch {
      /* the chat is open; the record can be retried by sending again */
    }
  };

  const list = (people ?? []).filter((p) => !q || p.phone.includes(q.replace(/\D/g, "") || "\u0000") || p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_20px_60px_rgba(0,0,0,0.3)]">
        <div className="flex items-center justify-between border-b border-black/10 p-5">
          <h3 className="text-base font-black text-black">
            {c.audience === "loyalty" ? "Send to loyalty members" : c.audience === "regular" ? "Send to customers" : "Send to everyone"} · <span className="font-mono tracking-wider">{c.code}</span>
          </h3>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 cursor-pointer" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-3 p-5">
          <p className="text-[12.5px] text-slate-500">
            Each tap opens WhatsApp with the coupon message ready for that person. WhatsApp can&apos;t send in bulk from a browser, so you send them one by one.
          </p>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name or number…" className="h-10 w-full rounded-xl bg-[#F6F3E9] px-4 text-[13px] outline-none focus:bg-white focus:ring-4 ring-[#C1272D]/15" />
        </div>
        <div className="flex-1 overflow-y-auto border-t border-black/5 px-5 pb-5">
          {people === null ? (
            <p className="py-10 text-center text-[13px] text-slate-400">Loading…</p>
          ) : list.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-slate-500">{people.length ? "No one matches." : "No customers to send to yet."}</p>
          ) : (
            <ul className="divide-y divide-black/5">
              {list.map((p) => {
                const sent = done.includes(p.phone) || c.phones.includes(p.phone);
                return (
                  <li key={p.phone} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-bold text-black">{p.name || p.phone}{p.member && <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-emerald-700">Member</span>}</span>
                      {p.name && <span className="block text-xs text-slate-500">{p.phone}</span>}
                    </span>
                    <button onClick={() => send(p)} className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-extrabold uppercase tracking-wide cursor-pointer ${sent ? "border border-slate-200 bg-slate-50 text-slate-500" : "bg-[#22c55e] text-white hover:bg-[#16a34a]"}`}>
                      <WaIcon size={14} /> {sent ? "Sent · again" : "Send"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
