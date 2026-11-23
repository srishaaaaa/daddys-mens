"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Loader2, QrCode, Save, Store } from "lucide-react";
import { UpiQrCard } from "@/app/_components/UpiQrCard";
import { changePasscodeAction, getShopSettingsAction, saveShopSettingsAction } from "@/app/pos/settings-actions";

type Form = {
  shopName: string; tagline: string; phone: string; email: string; address: string;
  upiId: string; upiName: string; upiPhone: string; upiQrMinutes: string; publicUrl: string;
};
const EMPTY: Form = { shopName: "", tagline: "", phone: "", email: "", address: "", upiId: "", upiName: "", upiPhone: "", upiQrMinutes: "5", publicUrl: "" };

const field =
  "h-12 w-full rounded-xl bg-[#F6F3E9] px-4 text-[14px] font-medium text-slate-900 outline-none ring-[#C1272D]/15 transition placeholder:text-slate-400 focus:bg-white focus:ring-4";
const labelCls = "mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-600";
const cardCls = "rounded-3xl border border-black/10 bg-white p-5 shadow-sm sm:p-8";

/* Shop settings: shop details shown to customers, the UPI details for the counter QR and WhatsApp payment
   link, the website address that links point at, and the admin / staff passcodes. */
export default function SettingsPanel() {
  const [f, setF] = useState<Form>(EMPTY);
  const [saved, setSaved] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const toForm = (s: { shopName: string; tagline: string; phone: string; email: string; address: string; upiId: string; upiName: string; upiPhone: string; upiQrMinutes: number; publicUrl: string }): Form => ({
    shopName: s.shopName, tagline: s.tagline, phone: s.phone, email: s.email, address: s.address,
    upiId: s.upiId, upiName: s.upiName, upiPhone: s.upiPhone, upiQrMinutes: String(s.upiQrMinutes), publicUrl: s.publicUrl,
  });

  useEffect(() => {
    let live = true;
    getShopSettingsAction()
      .then((s) => {
        if (!live) return;
        setF(toForm(s));
        setSaved(toForm(s));
      })
      .catch(() => live && setError("Could not load settings. Has the SQL in supabase/all_migrations.sql been run in Supabase?"))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const dirty = JSON.stringify(f) !== JSON.stringify(saved);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const s = await saveShopSettingsAction({ ...f, upiQrMinutes: Number(f.upiQrMinutes) });
      setF(toForm(s));
      setSaved(toForm(s));
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the settings.");
    } finally {
      setSaving(false);
    }
  };

  const upiReady = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9.-]{1,30}$/.test(f.upiId.trim());
  const shop = f.shopName.trim() || "Daddy's Home";

  return (
    <div className="mx-auto w-full max-w-[1100px] flex-1 pb-8 animate-in fade-in duration-300">
      <div className="rounded-3xl border border-black/5 bg-[#FDFCF7] p-5 shadow-sm sm:p-8">
        <h2 className="text-[28px] font-black tracking-tight text-black">Settings</h2>
        <p className="mt-1 mb-6 text-xs font-semibold text-black/60">
          Shop details, UPI payments, your website address and the admin / staff passcodes.
        </p>

        {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{error}</div>}

        {loading ? (
          <p className="py-16 text-center text-[13px] text-slate-400">Loading settings…</p>
        ) : (
          <div className="space-y-6">
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
              <form onSubmit={save} className={`${cardCls} space-y-5`}>
                <h3 className="flex items-center gap-2 text-[18px] font-bold text-slate-900">
                  <Store className="h-5 w-5 text-[#C1272D]" /> Shop details
                </h3>
                <p className="-mt-3 text-[12px] text-slate-500">Shown on invoices, coupons, payment links and WhatsApp messages.</p>
                <label className="block">
                  <span className={labelCls}>Shop name *</span>
                  <input className={field} value={f.shopName} maxLength={40} onChange={(e) => setF({ ...f, shopName: e.target.value })} />
                </label>
                <label className="block">
                  <span className={labelCls}>Tagline</span>
                  <input className={field} value={f.tagline} maxLength={60} placeholder="e.g. Premium Menswear & Accessories" onChange={(e) => setF({ ...f, tagline: e.target.value })} />
                </label>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block">
                    <span className={labelCls}>Shop phone</span>
                    <input className={field} inputMode="numeric" value={f.phone} maxLength={10} placeholder="10-digit mobile" onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} />
                  </label>
                  <label className="block">
                    <span className={labelCls}>Email</span>
                    <input className={field} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
                  </label>
                </div>
                <label className="block">
                  <span className={labelCls}>Address</span>
                  <input className={field} value={f.address} maxLength={200} onChange={(e) => setF({ ...f, address: e.target.value })} />
                </label>

                <h3 className="flex items-center gap-2 border-t border-black/10 pt-5 text-[18px] font-bold text-slate-900">
                  <QrCode className="h-5 w-5 text-[#C1272D]" /> UPI payments
                </h3>
                <label className="block">
                  <span className={labelCls}>UPI ID</span>
                  <input className={field} value={f.upiId} placeholder="e.g. 9876543210@okaxis" autoComplete="off" onChange={(e) => setF({ ...f, upiId: e.target.value })} />
                  <span className="mt-1 block text-[11.5px] text-slate-500">Where customers&apos; payments arrive. Leave empty to switch UPI QR and payment links off.</span>
                </label>
                <label className="block">
                  <span className={labelCls}>Payee name</span>
                  <input className={field} value={f.upiName} placeholder={`Shown to the customer, e.g. ${shop}`} maxLength={40} onChange={(e) => setF({ ...f, upiName: e.target.value })} />
                </label>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block">
                    <span className={labelCls}>GPay number (optional)</span>
                    <input className={field} inputMode="numeric" value={f.upiPhone} maxLength={10} placeholder="10-digit mobile" onChange={(e) => setF({ ...f, upiPhone: e.target.value.replace(/\D/g, "").slice(0, 10) })} />
                  </label>
                  <label className="block">
                    <span className={labelCls}>QR renews every (minutes)</span>
                    <input className={field} type="number" min={1} max={60} value={f.upiQrMinutes} onChange={(e) => setF({ ...f, upiQrMinutes: e.target.value })} />
                  </label>
                </div>

                <h3 className="border-t border-black/10 pt-5 text-[18px] font-bold text-slate-900">Website address</h3>
                <label className="block">
                  <span className={labelCls}>Public website address</span>
                  <input className={field} value={f.publicUrl} placeholder="https://yourshop.vercel.app" onChange={(e) => setF({ ...f, publicUrl: e.target.value })} />
                  <span className="mt-1 block text-[11.5px] text-slate-500">
                    Payment links and coupon links sent on WhatsApp open this address. It must be the public (https) address, not localhost.
                  </span>
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={saving || !dirty}
                    className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#C1272D] px-6 text-[13px] font-extrabold uppercase tracking-wide text-white shadow-[0_8px_20px_-10px_rgba(193,39,45,.9)] transition hover:bg-[#9B1C21] disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? "Saving…" : "Save settings"}
                  </button>
                  {justSaved && (
                    <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-emerald-700">
                      <CheckCircle2 className="h-4 w-4" /> Saved
                    </span>
                  )}
                </div>
              </form>

              <aside className={cardCls}>
                <h3 className="text-[18px] font-bold text-slate-900">Preview</h3>
                <p className="mt-1 text-[12.5px] text-slate-500">How the counter QR will look at billing (a test amount of ₹100).</p>
                {upiReady ? (
                  <UpiQrCard
                    upi={{ id: f.upiId.trim(), name: f.upiName.trim() || shop, minutes: Number(f.upiQrMinutes) || 5, phone: f.upiPhone }}
                    amount={100}
                    shop={shop}
                    label="Scan to pay"
                  />
                ) : (
                  <p className="mt-4 rounded-xl bg-[#F6F3E9] px-4 py-6 text-center text-[13px] text-slate-500">Enter a valid UPI ID to see the QR.</p>
                )}
              </aside>
            </div>

            <PasscodeCard />
          </div>
        )}
      </div>
    </div>
  );
}

/* Admin and staff passcodes. Changing either needs the current admin passcode again. */
function PasscodeCard() {
  const [role, setRole] = useState<"admin" | "staff">("staff");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const mismatch = again !== "" && next !== again;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (next !== again) {
      setMsg({ ok: false, text: "The two new passcodes don't match." });
      return;
    }
    setBusy(true);
    try {
      const r = await changePasscodeAction(role, current, next);
      if (r.ok) {
        setMsg({ ok: true, text: `The ${role} passcode was changed. Use it the next time ${role === "admin" ? "you sign in" : "staff sign in"}.` });
        setCurrent("");
        setNext("");
        setAgain("");
      } else {
        setMsg({ ok: false, text: r.error });
      }
    } catch {
      setMsg({ ok: false, text: "Could not change the passcode. Please try again." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className={`${cardCls} max-w-[640px] space-y-5`} autoComplete="off">
      <h3 className="flex items-center gap-2 text-[18px] font-bold text-slate-900">
        <KeyRound className="h-5 w-5 text-[#C1272D]" /> Passcodes
      </h3>
      <p className="-mt-3 text-[12px] text-slate-500">
        Change the passcode that admin or staff use to sign in. You confirm with the current admin passcode. People already signed in stay signed in.
      </p>
      <div>
        <span className={labelCls}>Change the passcode for</span>
        <div className="grid grid-cols-2 gap-2">
          {(["staff", "admin"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className={`h-11 rounded-xl border text-[13px] font-bold uppercase tracking-wide cursor-pointer transition ${role === r ? "border-[#C1272D] bg-[#FBEFEF] text-[#C1272D] ring-2 ring-[#C1272D]/15" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`}
            >
              {r === "staff" ? "Staff (billing only)" : "Admin (full access)"}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className={labelCls}>Current admin passcode *</span>
        <input className={field} type="password" value={current} autoComplete="current-password" onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className={labelCls}>New {role} passcode *</span>
          <input className={field} type="password" value={next} minLength={4} maxLength={40} autoComplete="new-password" onChange={(e) => setNext(e.target.value.replace(/\s/g, ""))} />
          <span className="mt-1 block text-[11.5px] text-slate-500">At least 4 characters, no spaces.</span>
        </label>
        <label className="block">
          <span className={labelCls}>Type it again *</span>
          <input className={`${field} ${mismatch ? "ring-4 ring-red-200" : ""}`} type="password" value={again} autoComplete="new-password" onChange={(e) => setAgain(e.target.value.replace(/\s/g, ""))} />
          {mismatch && <span className="mt-1 block text-[11.5px] font-semibold text-red-600">Doesn&apos;t match yet.</span>}
        </label>
      </div>
      {msg && (
        <p className={`rounded-xl px-4 py-3 text-[13px] font-semibold ${msg.ok ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : "border border-red-200 bg-red-50 text-red-700"}`}>{msg.text}</p>
      )}
      <button
        type="submit"
        disabled={busy || !current || next.length < 4 || next !== again}
        className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 text-[13px] font-extrabold uppercase tracking-wide text-white transition hover:bg-slate-700 disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        {busy ? "Changing…" : `Change ${role} passcode`}
      </button>
    </form>
  );
}
