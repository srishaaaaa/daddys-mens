"use client";

import { useState } from "react";
import { Qr } from "@/app/_components/Qr";
import { mmss, spacedPhone, useUpiQr } from "@/app/_components/upiQr";

const rupee = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

/* The page behind the WhatsApp payment link. The QR and the app buttons carry the amount and the shop's UPI
   ID; the QR is renewed every few minutes. Nothing here confirms a payment — the counter checks their UPI
   app — so it asks the customer to show the payment confirmation. */
export function PayClient({
  amount,
  name,
  shop,
  upi,
}: {
  amount: number;
  name: string;
  shop: string;
  upi: { id: string; name: string; minutes: number; phone: string };
}) {
  const { link, apps, ref, left, ready } = useUpiQr(upi, amount, shop, "W");
  const [copied, setCopied] = useState("");
  const copy = async (what: string, v: string) => {
    try {
      await navigator.clipboard.writeText(v);
      setCopied(what);
      setTimeout(() => setCopied(""), 2000);
    } catch {}
  };
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5EFE6] px-4 py-10 text-slate-900">
      <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-xl">
        <div className="bg-gradient-to-br from-[#C1272D] to-[#8E1B20] p-6 text-center text-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" style={{ height: 44, width: "auto", margin: "0 auto 10px", objectFit: "contain" }} />
          <p className="text-[12px] font-extrabold uppercase tracking-[0.2em] text-[#F3D8A0]">{shop}</p>
          <p className="mt-1 text-[14px] text-[#FBE9E9]">{name ? `Hi ${name.split(" ")[0]}, your bill` : "Your bill"}</p>
          <p className="mt-1 text-[44px] font-black leading-none">{rupee(amount)}</p>
        </div>
        <div className="space-y-4 p-6 text-center">
          <p className="text-[13px] font-bold text-slate-700">
            Google Pay, PhonePe and Paytm open with the payee, amount and note filled in.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <a href={ready ? apps.gpay : undefined} aria-disabled={!ready} className="inline-flex h-12 items-center justify-center rounded-xl bg-[#1a73e8] px-1 text-[14px] font-bold text-white aria-disabled:opacity-50">
              Google Pay
            </a>
            <a href={ready ? apps.phonepe : undefined} aria-disabled={!ready} className="inline-flex h-12 items-center justify-center rounded-xl bg-[#5f259f] px-1 text-[14px] font-bold text-white aria-disabled:opacity-50">
              PhonePe
            </a>
            <a href={ready ? apps.paytm : undefined} aria-disabled={!ready} className="inline-flex h-12 items-center justify-center rounded-xl bg-[#00b9f1] px-1 text-[14px] font-bold text-white aria-disabled:opacity-50">
              Paytm
            </a>
          </div>
          <div className="mx-auto w-52 rounded-2xl border border-slate-200 bg-white p-2">
            {ready ? <Qr text={link} className="block h-auto w-full" /> : <div className="aspect-square w-full" aria-hidden="true" />}
          </div>
          <p className="text-[12.5px] text-slate-500">
            Tap your app: it opens with the amount ready. If it can&apos;t, scan the QR or enter the UPI ID in the app. New QR in{" "}
            <b>{ready ? mmss(left) : "…"}</b>.
          </p>
          <dl className="space-y-2 rounded-2xl bg-[#FAF7F2] p-4 text-left text-[13px]">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Pay to</dt>
              <dd className="font-bold">{upi.name}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">UPI ID</dt>
              <dd className="flex items-center gap-2 font-bold">
                {upi.id}
                <button type="button" onClick={() => copy("id", upi.id)} className="rounded-full border border-slate-300 px-2.5 py-0.5 text-[11px] font-bold text-slate-700 cursor-pointer">
                  {copied === "id" ? "Copied ✓" : "Copy"}
                </button>
              </dd>
            </div>
            {upi.phone && (
              <div className="flex items-center justify-between gap-3">
                <dt className="text-slate-500">GPay number</dt>
                <dd className="flex items-center gap-2 font-bold">
                  {spacedPhone(upi.phone)}
                  <button type="button" onClick={() => copy("phone", upi.phone)} className="rounded-full border border-slate-300 px-2.5 py-0.5 text-[11px] font-bold text-slate-700 cursor-pointer">
                    {copied === "phone" ? "Copied ✓" : "Copy"}
                  </button>
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Amount</dt>
              <dd className="font-bold">{rupee(amount)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-slate-500">Note</dt>
              <dd className="font-mono text-[12px]">{ref || "…"}</dd>
            </div>
          </dl>
          <p className="text-[12px] text-slate-500">After paying, show the confirmation on your phone at the counter.</p>
        </div>
      </div>
    </div>
  );
}
