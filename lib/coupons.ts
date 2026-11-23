import "server-only";
import { supabaseAdmin as sb } from "@/lib/supabase";

import { couponStatus, type Coupon, type CouponInput } from "@/lib/couponTypes";
export type { Coupon, CouponInput, CouponStatus } from "@/lib/couponTypes";

const map = (r: any): Coupon => ({
  id: r.id,
  code: r.code,
  percent: Number(r.percent),
  minOrder: Number(r.min_order ?? 0),
  expiresAt: r.expires_at ?? null,
  limit: r.usage_limit === null || r.usage_limit === undefined ? null : Number(r.usage_limit),
  used: Number(r.used ?? 0),
  active: r.active ?? true,
  restricted: r.restricted ?? false,
  phones: Array.isArray(r.phones) ? r.phones : [],
  sent: Number(r.sent ?? 0),
});

const cleanCode = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 24);
const tenDigits = (v: string) => v.replace(/\D/g, "").slice(-10);

export async function listCoupons(): Promise<Coupon[]> {
  const { data, error } = await sb.from("coupons").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(map);
}

export async function saveCoupon(input: CouponInput): Promise<Coupon> {
  const code = cleanCode(input.code);
  if (code.length < 3) throw new Error("Coupon code needs at least 3 letters or digits.");
  if (!(input.percent > 0 && input.percent <= 100)) throw new Error("Discount must be between 0 and 100%.");
  const row = {
    code,
    percent: input.percent,
    min_order: Math.max(0, input.minOrder || 0),
    expires_at: input.expiresAt || null,
    usage_limit: input.limit && input.limit > 0 ? Math.floor(input.limit) : null,
    active: input.active,
    restricted: input.restricted,
  };
  const q = input.id
    ? sb.from("coupons").update(row).eq("id", input.id)
    : sb.from("coupons").insert(row);
  const { data, error } = await q.select("*").single();
  if (error) {
    if (error.code === "23505") throw new Error(`Coupon ${code} already exists.`);
    throw error;
  }
  return map(data);
}

export async function deleteCoupon(id: string): Promise<void> {
  const { error } = await sb.from("coupons").delete().eq("id", id);
  if (error) throw error;
}

/** Records that a coupon went to a customer; their phone joins the coupon's list. */
export async function recordCouponSend(id: string, phone: string, restricted: boolean): Promise<Coupon> {
  const { data: cur, error: e1 } = await sb.from("coupons").select("*").eq("id", id).single();
  if (e1) throw e1;
  const c = map(cur);
  const p = tenDigits(phone);
  const phones = p && !c.phones.includes(p) ? [...c.phones, p] : c.phones;
  const { data, error } = await sb
    .from("coupons")
    .update({ phones, sent: c.sent + 1, restricted })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return map(data);
}

/** Billing check: is this code usable for this subtotal / customer phone? */
export async function validateCoupon(
  rawCode: string,
  subtotal: number,
  phone: string,
): Promise<{ ok: true; code: string; percent: number } | { ok: false; reason: string }> {
  const code = cleanCode(rawCode);
  if (!code) return { ok: false, reason: "Enter a coupon code." };
  const { data } = await sb.from("coupons").select("*").eq("code", code).maybeSingle();
  if (!data) return { ok: false, reason: `Coupon ${code} doesn't exist.` };
  const c = map(data);
  const st = couponStatus(c);
  if (st === "paused") return { ok: false, reason: `${c.code} is paused.` };
  if (st === "expired") return { ok: false, reason: `${c.code} has expired.` };
  if (st === "exhausted") return { ok: false, reason: `${c.code} has been fully used.` };
  if (c.minOrder > 0 && subtotal < c.minOrder) return { ok: false, reason: `${c.code} needs a minimum order of ₹${c.minOrder}.` };
  if (c.restricted && !c.phones.includes(tenDigits(phone))) return { ok: false, reason: `${c.code} only works for the customers it was sent to.` };
  return { ok: true, code: c.code, percent: c.percent };
}

export async function redeemCoupon(code: string): Promise<void> {
  const { error } = await sb.rpc("redeem_coupon", { p_code: code });
  if (error) console.error("Could not count coupon use:", error.message);
}

/** What the public coupon page shows. Paused / expired / used-up coupons still show, marked as such. */
export async function getPublicCoupon(rawCode: string) {
  let decoded = rawCode;
  try {
    decoded = decodeURIComponent(rawCode);
  } catch {}
  const code = cleanCode(decoded);
  if (!code) return null;
  const { data } = await sb.from("coupons").select("*").eq("code", code).maybeSingle();
  if (!data) return null;
  const c = map(data);
  return {
    code: c.code,
    percent: c.percent,
    minOrder: c.minOrder,
    expiresAt: c.expiresAt,
    status: couponStatus(c),
  };
}
