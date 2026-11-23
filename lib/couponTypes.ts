// Shared (client + server) coupon types and status logic.
/** Who may use it: everyone, only customers who are not loyalty members, or only loyalty members. */
export type CouponAudience = "all" | "regular" | "loyalty";

export type Coupon = {
  audience: CouponAudience;
  id: string;
  code: string;
  percent: number;
  minOrder: number;
  expiresAt: string | null; // yyyy-mm-dd
  limit: number | null;
  used: number;
  active: boolean;
  restricted: boolean;
  phones: string[];
  sent: number;
};

export type CouponInput = {
  id?: string;
  code: string;
  percent: number;
  minOrder: number;
  expiresAt: string | null;
  limit: number | null;
  active: boolean;
  restricted: boolean;
  audience: CouponAudience;
};

export type CouponStatus = "active" | "expired" | "exhausted" | "paused";

const todayISO = () => new Date().toISOString().slice(0, 10);

export function couponStatus(c: Coupon): CouponStatus {
  if (!c.active) return "paused";
  if (c.expiresAt && c.expiresAt < todayISO()) return "expired";
  if (c.limit !== null && c.used >= c.limit) return "exhausted";
  return "active";
}

