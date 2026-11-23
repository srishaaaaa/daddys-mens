import type { Metadata } from "next";
import { getUpiConfig } from "@/lib/upi";
import { readPayLink } from "@/lib/paylink";
import { PayClient } from "./PayClient";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const upi = await getUpiConfig();
  return { title: `Pay your bill — ${upi?.shopName ?? "Shop"}`, robots: { index: false, follow: false } };
}

/* Opened from the WhatsApp message staff send: the amount, the shop's UPI ID, and a QR to pay it. */
export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  let raw = token;
  try {
    raw = decodeURIComponent(token);
  } catch {}
  const r = readPayLink(raw);
  const upi = await getUpiConfig();

  const note = !r.ok
    ? r.expired
      ? "This payment link has expired. Please ask the counter for a new one."
      : "This payment link isn't valid. Please ask the counter for a new one."
    : !upi
      ? "Online payment isn't switched on for this shop right now. Please pay at the counter."
      : "";

  if (!r.ok || !upi) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5EFE6] p-6 text-center">
        <h1 className="mb-1 text-base font-bold text-[#C1272D]">{upi?.shopName ?? "Shop"}</h1>
        <p className="max-w-sm text-sm text-[#4A4038]">{note}</p>
      </div>
    );
  }
  return (
    <PayClient
      amount={r.link.a}
      name={r.link.n}
      shop={upi.shopName}
      upi={{ id: upi.id, name: upi.name, minutes: upi.minutes, phone: upi.phone }}
    />
  );
}
