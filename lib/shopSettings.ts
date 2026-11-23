import "server-only";
import { supabaseAdmin as sb } from "@/lib/supabase";

export type ShopSettings = {
  upiId: string;
  upiName: string;
  upiPhone: string;
  upiQrMinutes: number;
  /** https://yourshop.vercel.app — used in the links sent on WhatsApp */
  publicUrl: string;
  /** Shop details shown on invoices, coupons, payment links and WhatsApp messages */
  shopName: string;
  tagline: string;
  phone: string;
  email: string;
  address: string;
};

/** What the app used before these were editable, so nothing changes until the owner edits them. */
export const DEFAULT_PROFILE = {
  shopName: "Daddy's Home",
  tagline: "Premium Menswear & Accessories",
  phone: "8056642706",
  email: "divyadarshan409@gmail.com",
  address: "East 2nd Street, Near Bombay Bhavan, 1st Floor, Pudukkottai - 622001.",
};

const EMPTY: ShopSettings = { upiId: "", upiName: "", upiPhone: "", upiQrMinutes: 5, publicUrl: "", ...DEFAULT_PROFILE };

/** Reads the saved settings; if the table or the newer columns aren't there yet, falls back so nothing else breaks. */
export async function getShopSettings(): Promise<ShopSettings> {
  const { data, error } = await sb.from("shop_settings").select("*").eq("id", "default").maybeSingle();
  if (error || !data) return { ...EMPTY };
  return {
    upiId: data.upi_id ?? "",
    upiName: data.upi_name ?? "",
    upiPhone: data.upi_phone ?? "",
    upiQrMinutes: Number(data.upi_qr_minutes) > 0 ? Number(data.upi_qr_minutes) : 5,
    publicUrl: data.public_url ?? "",
    shopName: (data.shop_name ?? "").trim() || DEFAULT_PROFILE.shopName,
    tagline: data.shop_tagline ?? DEFAULT_PROFILE.tagline,
    phone: (data.shop_phone ?? "").trim() || DEFAULT_PROFILE.phone,
    email: data.shop_email ?? DEFAULT_PROFILE.email,
    address: data.shop_address ?? DEFAULT_PROFILE.address,
  };
}

/** The shop's public details (name, phone, address…), for pages and messages. */
export async function getShopProfile() {
  const s = await getShopSettings();
  return { shopName: s.shopName, tagline: s.tagline, phone: s.phone, email: s.email, address: s.address, publicUrl: s.publicUrl };
}
export type ShopProfile = Awaited<ReturnType<typeof getShopProfile>>;

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
      publicUrl = new URL(publicUrl).origin;
    } catch {
      throw new Error("The website address isn't valid. Use something like https://yourshop.vercel.app");
    }
  }
  const minutes = Math.round(Number(raw.upiQrMinutes));

  const shopName = String(raw.shopName ?? "").trim().slice(0, 40);
  if (!shopName) throw new Error("Enter the shop name.");
  const shopPhone = String(raw.phone ?? "").replace(/\D/g, "").slice(-10);
  if (shopPhone && !/^[6-9]\d{9}$/.test(shopPhone)) throw new Error("The shop phone must be a 10-digit mobile number.");
  const email = String(raw.email ?? "").trim().slice(0, 80);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("That email address doesn't look right.");

  return {
    upiId,
    upiName: String(raw.upiName ?? "").trim().slice(0, 40),
    upiPhone: phone ? phone.slice(-10) : "",
    upiQrMinutes: Number.isFinite(minutes) && minutes >= 1 && minutes <= 60 ? minutes : 5,
    publicUrl,
    shopName,
    tagline: String(raw.tagline ?? "").trim().slice(0, 60),
    phone: shopPhone,
    email,
    address: String(raw.address ?? "").trim().slice(0, 200),
  };
}

export async function saveShopSettings(raw: Partial<ShopSettings>): Promise<ShopSettings> {
  const s = cleanSettings(raw);
  const { error } = await sb.from("shop_settings").upsert({
    id: "default", upi_id: s.upiId, upi_name: s.upiName, upi_phone: s.upiPhone,
    upi_qr_minutes: s.upiQrMinutes, public_url: s.publicUrl,
    shop_name: s.shopName, shop_tagline: s.tagline, shop_phone: s.phone, shop_email: s.email, shop_address: s.address,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    throw new Error(
      /shop_settings|shop_name|shop_tagline|shop_phone|shop_email|shop_address/.test(error.message)
        ? "Run migrations 0007 and 0009 (supabase/all_migrations.sql) in Supabase first."
        : error.message,
    );
  }
  return s;
}
