"use client";

import { mmss, spacedPhone, useUpiQr } from "./upiQr";
import { Qr } from "./Qr";

const rupee = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(n) ? 0 : 2, maximumFractionDigits: 2 })}`;

/* Counter screen: a QR the customer scans with any UPI app to pay `amount`. It renews every few minutes.
   The shop's UPI account can't tell the app a payment arrived, so staff look in their UPI app before
   completing the bill. */
export function UpiQrCard({
  upi,
  amount,
  shop,
  label,
}: {
  upi: { id: string; name: string; minutes: number; phone?: string };
  amount: number;
  shop: string;
  label: string;
}) {
  const { link, ref, left, ready } = useUpiQr(upi, amount, shop, "POS");
  return (
    <div className="mt-3 flex flex-col items-center gap-4 rounded-2xl bg-[#F5EFE6] border border-[#E0D5C3] p-4">
      <div className="w-full max-w-[210px] shrink-0 rounded-xl border border-black/10 bg-white p-2 shadow-sm">
        {ready ? <Qr text={link} className="block h-auto w-full" /> : <div className="aspect-square w-full" aria-hidden="true" />}
      </div>
      <div className="w-full min-w-0 space-y-1.5 text-center text-[12px] text-[#4A4038]">
        <p className="text-[15px] font-extrabold text-black">
          {label} {rupee(amount)}
        </p>
        <p>Ask the customer to scan this with any UPI app.</p>
        <p>
          New QR in <b className="text-black">{ready ? mmss(left) : "…"}</b> · note <span className="font-mono">{ref || "…"}</span>
        </p>
        <p className="break-all">
          Pays to <b className="text-black">{upi.id}</b>
        </p>
        {upi.phone && (
          <p>
            Or the customer can pay to the GPay number <b className="text-black">{spacedPhone(upi.phone)}</b>
          </p>
        )}
        <p className="text-[11px] text-[#6B5F52]">Check your UPI app for the payment, then complete the bill.</p>
      </div>
    </div>
  );
}
