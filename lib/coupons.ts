import "server-only";
import { supabaseAdmin as sb } from "@/lib/supabase";

import { couponStatus, type Coupon, type CouponInput } from "@/lib/couponTypes";
export type { Coupon, CouponInput, CouponStatus } from "@/lib/couponTypes";

/** A date column as yyyy-mm-dd, whether the driver hands back a string or a Date. */
const dayOnly = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
};

const map = (r: any): Coupon => ({
  id: r.id,
  code: r.code,
  percent: Number(r.percent),
  minOrder: Number(r.min_order ?? 0),
  expiresAt: dayOnly(r.expires_at),
  limit: r.usage_limit === null || r.usage_limit === undefined ? null : Number(r.usage_limit),
  used: Number(r.used ?? 0),
  active: r.active ?? true,
  restricted: r.restricted ?? false,
  audience: (["all", "regular", "loyalty"].includes(r.audience) ? r.audience : "all") as Coupon["audience"],
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
    audience: (["all", "regular", "loyalty"].includes(input.audience) ? input.audience : "all"),
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
  if (c.audience !== "all") {
    const p = tenDigits(phone);
    const { data: m } = p.length === 10 ? await sb.from("loyalty_customers").select("id").eq("phone", p).eq("status", "active").maybeSingle() : { data: null };
    if (c.audience === "loyalty" && !m) return { ok: false, reason: `${c.code} is only for loyalty members.` };
    if (c.audience === "regular" && m) return { ok: false, reason: `${c.code} is only for customers who are not loyalty members.` };
  }
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

export type CouponRecipient = { phone: string; name: string; member: boolean };

/** Who a coupon can be sent to in one go: loyalty members, customers from past bills who are not members, or both. */
export async function listCouponRecipients(scope: "members" | "nonMembers" | "everyone"): Promise<CouponRecipient[]> {
  const out = new Map<string, CouponRecipient>();
  const { data: mem } = await sb.from("loyalty_customers").select("phone, name, status").eq("status", "active");
  const memberPhones = new Set<string>();
  for (const m of (mem ?? []) as any[]) {
    memberPhones.add(m.phone);
    if (scope !== "nonMembers") out.set(m.phone, { phone: m.phone, name: m.name ?? "", member: true });
  }
  if (scope !== "members") {
    const { data: ord } = await sb.from("orders").select("customer_phone, customer_name, created_at").order("created_at", { ascending: false }).limit(5000);
    for (const o of (ord ?? []) as any[]) {
      const p = tenDigits(String(o.customer_phone ?? "").split("_")[0]);
      if (p.length !== 10 || memberPhones.has(p) || out.has(p)) continue;
      out.set(p, { phone: p, name: o.customer_name && o.customer_name !== "Guest" ? o.customer_name : "", member: false });
    }
  }
  return [...out.values()];
}
