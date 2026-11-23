"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, QrCode, Save } from "lucide-react";
import { UpiQrCard } from "@/app/_components/UpiQrCard";
import { getShopSettingsAction, saveShopSettingsAction } from "@/app/pos/settings-actions";

type Form = { upiId: string; upiName: string; upiPhone: string; upiQrMinutes: string; publicUrl: string };
const EMPTY: Form = { upiId: "", upiName: "", upiPhone: "", upiQrMinutes: "5", publicUrl: "" };

const field =
  "h-12 w-full rounded-xl bg-[#F6F3E9] px-4 text-[14px] font-medium text-slate-900 outline-none ring-[#C1272D]/15 transition placeholder:text-slate-400 focus:bg-white focus:ring-4";
const labelCls = "mb-1.5 block text-[10.5px] font-bold uppercase tracking-[0.12em] text-slate-600";

/* Shop settings: the UPI details used for the counter QR and the WhatsApp payment link,
   and the website address that links sent to customers point at. */
export default function SettingsPanel() {
  const [f, setF] = useState<Form>(EMPTY);
  const [saved, setSaved] = useState<Form>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    let live = true;
    getShopSettingsAction()
      .then((s) => {
        if (!live) return;
        const form = { upiId: s.upiId, upiName: s.upiName, upiPhone: s.upiPhone, upiQrMinutes: String(s.upiQrMinutes), publicUrl: s.publicUrl };
        setF(form);
        setSaved(form);
      })
      .catch(() => live && setError("Could not load settings. Has migration 0007_shop_settings.sql been run in Supabase?"))
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
      const s = await saveShopSettingsAction({
        upiId: f.upiId, upiName: f.upiName, upiPhone: f.upiPhone, upiQrMinutes: Number(f.upiQrMinutes), publicUrl: f.publicUrl,
      });
      const form = { upiId: s.upiId, upiName: s.upiName, upiPhone: s.upiPhone, upiQrMinutes: String(s.upiQrMinutes), publicUrl: s.publicUrl };
      setF(form);
      setSaved(form);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the settings.");
    } finally {
      setSaving(false);
    }
  };

  const upiReady = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9.-]{1,30}$/.test(f.upiId.trim());

  return (
    <div className="mx-auto w-full max-w-[1100px] flex-1 pb-8 animate-in fade-in duration-300">
      <div className="rounded-3xl border border-black/5 bg-[#FDFCF7] p-5 shadow-sm sm:p-8">
        <h2 className="text-[28px] font-black tracking-tight text-black">Settings</h2>
        <p className="mt-1 mb-6 text-xs font-semibold text-black/60">
          UPI details for the counter QR and the WhatsApp payment link, and your website address.
        </p>

        {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{error}</div>}

        {loading ? (
          <p className="py-16 text-center text-[13px] text-slate-400">Loading settings…</p>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <form onSubmit={save} className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm sm:p-8 space-y-5">
              <h3 className="flex items-center gap-2 text-[18px] font-bold text-slate-900">
                <QrCode className="h-5 w-5 text-[#C1272D]" /> UPI payments
              </h3>
              <label className="block">
                <span className={labelCls}>UPI ID *</span>
                <input className={field} value={f.upiId} placeholder="e.g. 9876543210@okaxis" autoComplete="off" onChange={(e) => setF({ ...f, upiId: e.target.value })} />
                <span className="mt-1 block text-[11.5px] text-slate-500">Where customers&apos; payments arrive. Leave empty to switch UPI QR and payment links off.</span>
              </label>
              <label className="block">
                <span className={labelCls}>Payee name</span>
                <input className={field} value={f.upiName} placeholder="Shown to the customer, e.g. Daddy's Home" maxLength={40} onChange={(e) => setF({ ...f, upiName: e.target.value })} />
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

            <aside className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm sm:p-8">
              <h3 className="text-[18px] font-bold text-slate-900">Preview</h3>
              <p className="mt-1 text-[12.5px] text-slate-500">How the counter QR will look at billing (a test amount of ₹100).</p>
              {upiReady ? (
                <UpiQrCard
                  upi={{ id: f.upiId.trim(), name: f.upiName.trim() || "Daddy's Home", minutes: Number(f.upiQrMinutes) || 5, phone: f.upiPhone }}
                  amount={100}
                  shop="Daddy's Home"
                  label="Scan to pay"
                />
              ) : (
                <p className="mt-4 rounded-xl bg-[#F6F3E9] px-4 py-6 text-center text-[13px] text-slate-500">Enter a valid UPI ID to see the QR.</p>
              )}
            </aside>
          </div>
        )}
      </div>
    </div>
  );
}
