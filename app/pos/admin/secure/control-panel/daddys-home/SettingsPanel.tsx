"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, KeyRound, Receipt, Loader2, QrCode, Save, Store } from "lucide-react";
import { UpiQrCard } from "@/app/_components/UpiQrCard";
import { changePasscodeAction, getShopSettingsAction, saveShopSettingsAction } from "@/app/pos/settings-actions";
import { unwrap } from "@/lib/actionResult";

// These report problems as results; unwrap turns them back into errors that carry the real message.
const saveShopSettings = (...a: Parameters<typeof saveShopSettingsAction>) => unwrap(saveShopSettingsAction(...a));


type Form = {
  shopName: string; tagline: string; phone: string; email: string; address: string;
  upiId: string; upiName: string; upiPhone: string; upiQrMinutes: string; publicUrl: string;
  defaultGst: boolean; gstRate: string; gstInclusive: boolean;
};
const EMPTY: Form = { shopName: "", tagline: "", phone: "", email: "", address: "", upiId: "", upiName: "", upiPhone: "", upiQrMinutes: "5", publicUrl: "", defaultGst: false, gstRate: "5", gstInclusive: false };

const field =
  "h-12 w-full rounded-xl bg-[#F6F3E9] px-4 text-[14px] font-medium text-slate-900 outline-none ring-[#C1272D]/15 transition placeholder:text-slate-400 focus:bg-white focus:ring-4";
const labelCls = "mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-600";
const cardCls = "rounded-3xl border border-black/10 bg-white p-5 shadow-sm sm:p-8";

/* Shop settings: shop details shown to customers, the UPI details for the counter QR and WhatsApp payment
   link, the website address that links point at, and the admin / staff passcodes. */
type SettingsData = { shopName: string; tagline: string; phone: string; email: string; address: string; upiId: string; upiName: string; upiPhone: string; upiQrMinutes: number; publicUrl: string; defaultGst: boolean; gstRate: number; gstInclusive: boolean };
const toForm = (s: SettingsData): Form => ({
  shopName: s.shopName, tagline: s.tagline, phone: s.phone, email: s.email, address: s.address,
  upiId: s.upiId, upiName: s.upiName, upiPhone: s.upiPhone, upiQrMinutes: String(s.upiQrMinutes), publicUrl: s.publicUrl,
  defaultGst: s.defaultGst, gstRate: String(s.gstRate), gstInclusive: s.gstInclusive,
});

// Kept while the app is open, so the tab shows straight away and refreshes quietly.
let settingsCache: SettingsData | null = null;

/** Gives the tab settings that were already loaded, so it opens instantly. */
export function seedSettings(s: SettingsData) {
  settingsCache = s;
}

/** Loads the settings ahead of time (after sign-in) so the tab opens instantly. */
export async function prefetchSettings() {
  if (settingsCache) return;
  try {
    settingsCache = await getShopSettingsAction();
  } catch {
    /* the tab shows the error itself if it still fails when opened */
  }
}

export default function SettingsPanel() {
  const [f, setF] = useState<Form>(settingsCache ? toForm(settingsCache) : EMPTY);
  const [saved, setSaved] = useState<Form>(settingsCache ? toForm(settingsCache) : EMPTY);
  const [loading, setLoading] = useState(!settingsCache);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let live = true;
    getShopSettingsAction()
      .then((s) => {
        if (!live) return;
        settingsCache = s;
        // keep what the user is already typing if the form was shown from the saved copy
        setSaved(toForm(s));
        setF((cur) => (JSON.stringify(cur) === JSON.stringify(saved) || !settingsCache ? toForm(s) : cur));
      })
      .catch(() => live && setError("Could not load settings. Has the SQL in supabase/all_migrations.sql been run in Supabase?"))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  const dirty = JSON.stringify(f) !== JSON.stringify(saved);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const s = await saveShopSettings({ ...f, upiQrMinutes: Number(f.upiQrMinutes), gstRate: Number(f.gstRate) });
      settingsCache = { shopName: s.shopName, tagline: s.tagline, phone: s.phone, email: s.email, address: s.address, upiId: s.upiId, upiName: s.upiName, upiPhone: s.upiPhone, upiQrMinutes: s.upiQrMinutes, publicUrl: s.publicUrl, defaultGst: s.defaultGst, gstRate: s.gstRate, gstInclusive: s.gstInclusive };
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

  const input = (label: string, node: React.ReactNode, hint?: string) => (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {node}
      {hint && <span className="mt-1 block text-[11.5px] text-slate-500">{hint}</span>}
    </label>
  );

  return (
    <div className="mx-auto w-full max-w-[1400px] flex-1 pb-8 pr-2 animate-in fade-in duration-300">
      <div>
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[28px] font-black tracking-tight text-black">Settings</h2>
            <p className="mt-1 text-xs font-semibold text-black/60">
              Shop details, UPI payments, your website address and the admin / staff passcodes.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {justSaved && (
              <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Saved
              </span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#C1272D] px-6 text-[13px] font-extrabold uppercase tracking-wide text-white shadow-[0_8px_20px_-10px_rgba(193,39,45,.9)] transition hover:bg-[#9B1C21] disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        </div>

        {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{error}</div>}

        {loading ? (
          <div className="animate-pulse grid gap-6 lg:grid-cols-2" aria-label="Loading settings">
            <div className="h-[420px] rounded-3xl border border-black/10 bg-white" />
            <div className="h-[420px] rounded-3xl border border-black/10 bg-white" />
          </div>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-2">
            {/* Left column */}
            <div className="space-y-6">
              <section className={`${cardCls} space-y-5`}>
                <h3 className="flex items-center gap-2 text-[18px] font-bold text-slate-900">
                  <Store className="h-5 w-5 text-[#C1272D]" /> Shop details
                </h3>
                <p className="-mt-3 text-[12px] text-slate-500">Shown on invoices, coupons, payment links and WhatsApp messages.</p>
                {input("Shop name *", <input className={field} value={f.shopName} maxLength={40} onChange={(e) => setF({ ...f, shopName: e.target.value })} />)}
                {input("Tagline", <input className={field} value={f.tagline} maxLength={60} placeholder="e.g. Premium Menswear & Accessories" onChange={(e) => setF({ ...f, tagline: e.target.value })} />)}
                <div className="grid gap-5 sm:grid-cols-2">
                  {input("Shop phone", <input className={field} inputMode="numeric" value={f.phone} maxLength={10} placeholder="10-digit mobile" onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, "").slice(0, 10) })} />)}
                  {input("Email", <input className={field} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />)}
                </div>
                {input("Address", <input className={field} value={f.address} maxLength={200} onChange={(e) => setF({ ...f, address: e.target.value })} />)}
              </section>

              <section className={`${cardCls} space-y-5`}>
                <h3 className="flex items-center gap-2 text-[18px] font-bold text-slate-900">
                  <Receipt className="h-5 w-5 text-[#C1272D]" /> Billing defaults
                </h3>
                <p className="-mt-3 text-[12px] text-slate-500">Every new bill starts with these. Staff can still change them on a single bill.</p>
                <div>
                  <span className={labelCls}>Bill type</span>
                  <div className="flex rounded-full border border-black/10 bg-white p-1">
                    {([[false, "Non-GST Bill"], [true, "GST Invoice"]] as const).map(([v, label]) => (
                      <button key={label} type="button" onClick={() => setF({ ...f, defaultGst: v })}
                        className={`flex-1 cursor-pointer rounded-full py-2.5 text-[11px] font-extrabold uppercase tracking-wider transition ${f.defaultGst === v ? (v ? "bg-[#C1272D] text-white shadow-sm" : "bg-[#111] text-white shadow-sm") : "text-black hover:bg-black/5"}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {f.defaultGst && (
                  <div className="space-y-5">
                    <div>
                      <span className={labelCls}>GST is</span>
                      <div className="flex rounded-xl border border-black/10 bg-white p-1">
                        {([[false, "Exclusive (+GST)"], [true, "Inclusive (tax incl.)"]] as const).map(([v, label]) => (
                          <button key={label} type="button" onClick={() => setF({ ...f, gstInclusive: v })}
                            className={`flex-1 cursor-pointer rounded-lg py-2.5 text-[11px] font-extrabold uppercase tracking-wider transition ${f.gstInclusive === v ? "bg-[#111] text-white shadow-sm" : "text-black hover:bg-black/5"}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {input("GST rate (%)", <input className={`${field} max-w-[140px]`} type="number" min={0} max={100} step="0.01" value={f.gstRate} onChange={(e) => setF({ ...f, gstRate: e.target.value })} />,
                      "Split equally into CGST and SGST on the bill.")}
                  </div>
                )}
              </section>

              <PasscodeCard />
            </div>

            {/* Right column */}
            <div className="space-y-6">
              <section className={`${cardCls} space-y-5`}>
                <h3 className="flex items-center gap-2 text-[18px] font-bold text-slate-900">
                  <QrCode className="h-5 w-5 text-[#C1272D]" /> UPI payments
                </h3>
                {input("UPI ID", <input className={field} value={f.upiId} placeholder="e.g. 9876543210@okaxis" autoComplete="off" onChange={(e) => setF({ ...f, upiId: e.target.value })} />,
                  "Where customers' payments arrive. Leave empty to switch UPI QR and payment links off.")}
                {input("Payee name", <input className={field} value={f.upiName} placeholder={`Shown to the customer, e.g. ${shop}`} maxLength={40} onChange={(e) => setF({ ...f, upiName: e.target.value })} />)}
                <div className="grid gap-5 sm:grid-cols-2">
                  {input("GPay number (optional)", <input className={field} inputMode="numeric" value={f.upiPhone} maxLength={10} placeholder="10-digit mobile" onChange={(e) => setF({ ...f, upiPhone: e.target.value.replace(/\D/g, "").slice(0, 10) })} />)}
                  {input("QR renews every (minutes)", <input className={field} type="number" min={1} max={60} value={f.upiQrMinutes} onChange={(e) => setF({ ...f, upiQrMinutes: e.target.value })} />)}
                </div>
                <div className="border-t border-black/10 pt-5">
                  <p className="text-[12.5px] font-bold text-slate-800">Preview</p>
                  <p className="mt-0.5 text-[12px] text-slate-500">How the counter QR will look at billing (a test amount of ₹100).</p>
                  {upiReady ? (
                    <UpiQrCard
                      upi={{ id: f.upiId.trim(), name: f.upiName.trim() || shop, minutes: Number(f.upiQrMinutes) || 5, phone: f.upiPhone }}
                      amount={100}
                      shop={shop}
                      label="Scan to pay"
                    />
                  ) : (
                    <p className="mt-3 rounded-xl bg-[#F6F3E9] px-4 py-6 text-center text-[13px] text-slate-500">Enter a valid UPI ID to see the QR.</p>
                  )}
                </div>
              </section>

            </div>
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
    <form onSubmit={submit} className={`${cardCls} space-y-5`} autoComplete="off">
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
