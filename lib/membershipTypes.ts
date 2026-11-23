/* Membership types and date helpers shared by the server and the screens (no server-only code in here). */

export type Plan = {
  id: string;
  name: string;
  fee: number;
  /** how long a membership lasts, in months */
  months: number;
  discountPct: number;
  /** optional: a bigger discount on the member's birthday (0 = none) */
  birthdayPct: number;
  /** short benefits, e.g. "Priority alterations, early access to sales" */
  description: string;
  active: boolean;
};

export type PaymentStatus = "paid" | "pending";

export type Member = {
  id: string;
  memberNo: string;
  name: string;
  phone: string;
  planId: string | null;
  planName: string;
  /** the plan's discounts, as they are now */
  discountPct: number;
  birthdayPct: number;
  joinedAt: string; // ISO
  /** yyyy-mm-dd; null = never expires (memberships from before plans existed) */
  expiresAt: string | null;
  paymentStatus: PaymentStatus;
  /** optional yyyy-mm-dd (only the day and month are used) */
  birthday: string | null;
  /** switched off by staff */
  off: boolean;
};

export type MemberState = "active" | "expired" | "inactive";

export type Overview = { plans: Plan[]; members: Member[]; revenue: number };
export const EMPTY_OVERVIEW: Overview = { plans: [], members: [], revenue: 0 };

/** Today's date in India, as yyyy-mm-dd. */
export const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });

/** Adds whole months to a yyyy-mm-dd date (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const total = m - 1 + months;
  const ny = y + Math.floor(total / 12);
  const nm = ((total % 12) + 12) % 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

const dayMs = (ymd: string) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
export const daysBetween = (fromYmd: string, toYmd: string) => Math.round((dayMs(toYmd) - dayMs(fromYmd)) / 86400000);

export function stateOf(m: Pick<Member, "off" | "expiresAt">, today = todayIST()): MemberState {
  if (m.off) return "inactive";
  if (m.expiresAt && m.expiresAt < today) return "expired";
  return "active";
}

/** The discount a member gets on a bill today (none when expired or switched off). On their birthday the
    birthday discount is used if it is higher; the two are never added together. */
export function memberDiscount(m: Member, today = todayIST()): { pct: number; birthday: boolean } | null {
  if (stateOf(m, today) !== "active") return null;
  const isBirthday = !!m.birthday && m.birthday.slice(5) === today.slice(5);
  if (isBirthday && m.birthdayPct > m.discountPct) return { pct: m.birthdayPct, birthday: true };
  return m.discountPct > 0 ? { pct: m.discountPct, birthday: false } : null;
}

export const monthsLabel = (n: number) => (n % 12 === 0 ? `${n / 12} year${n / 12 === 1 ? "" : "s"}` : `${n} month${n === 1 ? "" : "s"}`);

export const fmtYmd = (ymd: string | null) => {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
};
