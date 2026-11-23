"use server";

import { headers } from "next/headers";
import { requireStaff } from "@/lib/auth";
import { getUpiConfig } from "@/lib/upi";
import { getShopSettings } from "@/lib/shopSettings";
import { signPayLink } from "@/lib/paylink";

/** The shop's UPI details for the counter QR (null when SHOP_UPI_ID isn't set). */
export async function getUpiConfigAction() {
  await requireStaff();
  return await getUpiConfig();
}

type PayLinkResult =
  | { ok: true; url: string; upiId: string; upiName: string; upiPhone: string; shopName: string }
  | { ok: false; error: string };

/** The signed payment link staff send a customer on WhatsApp. */
export async function createPayLinkAction(amount: number, name: string): Promise<PayLinkResult> {
  await requireStaff();
  const amt = Math.round(Number(amount) * 100) / 100;
  if (!(amt > 0 && amt <= 10_000_000)) return { ok: false, error: "Enter a bill amount first." };
  const upi = await getUpiConfig();
  if (!upi) return { ok: false, error: "Add your UPI ID in Settings first." };

  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host") || "";
  const proto = h.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const onThisComputer = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?)/.test(host);
  const configured = ((await getShopSettings()).publicUrl || process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");
  const base = configured || (onThisComputer ? "" : `${proto}://${host}`);
  if (!base) {
    return {
      ok: false,
      error:
        "The payment link would only open on this computer. Set your website address in Settings (like https://yourshop.vercel.app).",
    };
  }
  try {
    return {
      ok: true,
      url: `${base}/pay/${signPayLink(amt, name)}`,
      upiId: upi.id,
      upiName: upi.name,
      upiPhone: upi.phone,
      shopName: upi.shopName,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Couldn't make the payment link." };
  }
}
