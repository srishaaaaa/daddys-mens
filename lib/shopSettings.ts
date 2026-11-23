import "server-only";
import { supabaseAdmin as sb } from "@/lib/supabase";

export type ShopSettings = {
  upiId: string;
  upiName: string;
  upiPhone: string;
  upiQrMinutes: number;
  /** https://yourshop.vercel.app — used in the links sent on WhatsApp */
  publicUrl: string;
};

const EMPTY: ShopSettings = { upiId: "", upiName: "", upiPhone: "", upiQrMinutes: 5, publicUrl: "" };

/** Reads the saved settings; if the table isn't there yet, returns empty settings so nothing else breaks. */
export async function getShopSettings(): Promise<ShopSettings> {
  const { data, error } = await sb.from("shop_settings").select("*").eq("id", "default").maybeSingle();
  if (error || !data) return { ...EMPTY };
  return {
    upiId: data.upi_id ?? "",
    upiName: data.upi_name ?? "",
    upiPhone: data.upi_phone ?? "",
    upiQrMinutes: Number(data.upi_qr_minutes) > 0 ? Number(data.upi_qr_minutes) : 5,
    publicUrl: data.public_url ?? "",
  };
}

export function cleanSettings(raw: Partial<ShopSettings>): ShopSettings {
  const upiId = String(raw.upiId ?? "").trim().replace(/\s+/g, "");
  if (upiId && !/^[a-zA-Z0-9._-]{2,64}@[a-zA-Z][a-zA-Z0-9.-]{1,30}$/.test(upiId)) {
    throw new Error("That doesn't look like a UPI ID. It looks like name@bank, e.g. 9876543210@okaxis.");
  }
  const phone = String(raw.upiPhone ?? "").replace(/\D/g, "");
  if (phone && !/^[6-9]\d{9}$/.test(phone.slice(-10))) throw new Error("The GPay number must be a 10-digit mobile number.");
  let publicUrl = String(raw.publicUrl ?? "").trim().replace(/\/+$/, "");
  if (publicUrl) {
    if (!/^https?:\/\//i.test(publicUrl)) publicUrl = `https://${publicUrl}`;
    try {
      const u = new URL(publicUrl);
      publicUrl = u.origin;
    } catch {
      throw new Error("The website address isn't valid. Use something like https://yourshop.vercel.app");
    }
  }
  const minutes = Math.round(Number(raw.upiQrMinutes));
  return {
    upiId,
    upiName: String(raw.upiName ?? "").trim().slice(0, 40),
    upiPhone: phone ? phone.slice(-10) : "",
    upiQrMinutes: Number.isFinite(minutes) && minutes >= 1 && minutes <= 60 ? minutes : 5,
    publicUrl,
  };
}

export async function saveShopSettings(raw: Partial<ShopSettings>): Promise<ShopSettings> {
  const s = cleanSettings(raw);
  const { error } = await sb.from("shop_settings").upsert({
    id: "default", upi_id: s.upiId, upi_name: s.upiName, upi_phone: s.upiPhone,
    upi_qr_minutes: s.upiQrMinutes, public_url: s.publicUrl, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message.includes("shop_settings") ? "Run migration 0007_shop_settings.sql in Supabase first." : error.message);
  return s;
}
