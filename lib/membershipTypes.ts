/* Membership types, date helpers and the eligibility rules, shared by the server and the screens
   (no server-only code in here, so billing, the panel and analytics all use exactly the same maths). */

export type Eligibility = "manual" | "single_bill" | "cumulative";
export type Source = "manual" | "single_bill" | "cumulative";
export type EligibilityBasis = "net" | "subtotal";

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
  /** how a customer qualifies: only by staff enrolling them, by one big bill, or by total purchases */
  eligibility: Eligibility;
  threshold: number;
  /** the member discount applies only on bills of at least this amount (0 = any bill) */
  minBill: number;
  /** an extra benefit shown on the bill, e.g. "Free alteration" */
  offerText: string;
  /** the extra offer stops showing after this date (yyyy-mm-dd; empty = no end) */
  offerValidUntil: string | null;
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
  minBill: number;
  offerText: string;
  offerValidUntil: string | null;
  joinedAt: string; // ISO
  /** yyyy-mm-dd; null = never expires (memberships from before plans existed) */
  expiresAt: string | null;
  paymentStatus: PaymentStatus;
  /** optional yyyy-mm-dd (only the day and month are used) */
  birthday: string | null;
  /** switched off by staff */
  off: boolean;
  /** how they joined */
  source: Source;
};

export type MemberState = "active" | "expired" | "inactive";

export type MemberSettings = {
  basis: EligibilityBasis;
  msgActivation: boolean;
  msgUpgrade: boolean;
  msgRenewal: boolean;
  msgExpiry: boolean;
  msgEligibility: boolean;
  msgOffers: boolean;
  /** days before expiry to remind (0 = on the day) */
  reminderDays: number[];
};
export const DEFAULT_SETTINGS: MemberSettings = {
  basis: "net", msgActivation: true, msgUpgrade: true, msgRenewal: true, msgExpiry: true, msgEligibility: true, msgOffers: true, reminderDays: [7, 3, 0],
};

export type MemberEvent = {
  id: string;
  memberId: string;
  kind: "join" | "renewal" | "upgrade";
  planName: string;
  fromPlan: string;
  amount: number;
  status: PaymentStatus;
  source: Source;
  at: string; // ISO
};

export type MessageKind = "activation" | "upgrade" | "renewal" | "expiry" | "eligibility" | "offer";
export type MemberMessage = {
  id: string;
  memberId: string | null;
  phone: string;
  name: string;
  kind: MessageKind;
  text: string;
  status: "pending" | "sent" | "failed";
  createdAt: string;
  sentAt: string | null;
};

export type Overview = { plans: Plan[]; members: Member[]; revenue: number; settings: MemberSettings; events: MemberEvent[]; messages: MemberMessage[] };
export const EMPTY_OVERVIEW: Overview = { plans: [], members: [], revenue: 0, settings: DEFAULT_SETTINGS, events: [], messages: [] };

/* ---------------------------------------------------------------- dates */

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

export const monthsLabel = (n: number) => (n % 12 === 0 ? `${n / 12} year${n / 12 === 1 ? "" : "s"}` : `${n} month${n === 1 ? "" : "s"}`);

export const fmtYmd = (ymd: string | null) => {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
};

/* ---------------------------------------------------------------- discounts on a bill */

/** What a member's discount would be on a bill of `subtotal`, today. None when expired / switched off / the bill
    is smaller than the plan's minimum. On their birthday the higher birthday discount is used instead (never added). */
export function memberDiscount(m: Member, subtotal: number, today = todayIST()): { pct: number; birthday: boolean } | null {
  if (stateOf(m, today) !== "active") return null;
  if (m.minBill > 0 && subtotal < m.minBill) return null;
  const isBirthday = !!m.birthday && m.birthday.slice(5) === today.slice(5);
  if (isBirthday && m.birthdayPct > m.discountPct) return { pct: m.birthdayPct, birthday: true };
  return m.discountPct > 0 ? { pct: m.discountPct, birthday: false } : null;
}

/** The plan's extra offer text, while it is still valid. */
export const liveOffer = (m: Pick<Member, "offerText" | "offerValidUntil">, today = todayIST()) =>
  m.offerText && (!m.offerValidUntil || m.offerValidUntil >= today) ? m.offerText : "";

/* ---------------------------------------------------------------- purchases (one definition used everywhere) */

export type Bill = { id: string; phone: string; subtotal: number; discount: number; completed: boolean; date: string; total: number };

/** The amount of a bill that counts toward membership: after discounts ("net") or before ("subtotal").
    The membership fee, delivery and GST are never part of it. */
export const billValue = (b: Pick<Bill, "subtotal" | "discount">, basis: EligibilityBasis) =>
  basis === "subtotal" ? b.subtotal : Math.max(0, b.subtotal - b.discount);

export type CustomerStats = { phone: string; name: string; total: number; maxBill: number; bills: number; last: string };

/** Totals per customer from completed bills only, each bill counted once. */
export function customerStats(bills: (Bill & { name: string })[], basis: EligibilityBasis): Map<string, CustomerStats> {
  const seen = new Set<string>();
  const out = new Map<string, CustomerStats>();
  for (const b of bills) {
    if (!b.completed || b.phone.length !== 10 || seen.has(b.id)) continue;
    seen.add(b.id);
    const v = billValue(b, basis);
    const c = out.get(b.phone) ?? { phone: b.phone, name: "", total: 0, maxBill: 0, bills: 0, last: "" };
    c.total += v;
    c.maxBill = Math.max(c.maxBill, v);
    c.bills += 1;
    if (b.name && b.name !== "Guest" && (!c.name || b.date > c.last)) c.name = b.name;
    if (b.date > c.last) c.last = b.date;
    out.set(b.phone, c);
  }
  return out;
}

/* ---------------------------------------------------------------- eligibility */

/** Plans ranked by how good they are: bigger discount first, then bigger fee, then bigger threshold. */
export const rank = (p: Pick<Plan, "discountPct" | "fee" | "threshold">) => p.discountPct * 1e9 + p.fee * 1e3 + p.threshold * 1e-3;

export type Offer = { plan: Plan; via: "single_bill" | "cumulative"; cumulative: number; kind: "activate" | "upgrade" | "renew" };

/** The best plan this customer qualifies for on this bill, and what to do about it:
    activate (not a member), upgrade (active member, better plan) or renew (expired / switched off). */
export function eligibleOffer(args: {
  plans: Plan[]; member: Member | undefined; pastTotal: number; billAmount: number; today?: string;
}): Offer | null {
  const { plans, member, pastTotal, billAmount } = args;
  const today = args.today ?? todayIST();
  let best: Offer | null = null;
  for (const p of plans) {
    if (!p.active || p.eligibility === "manual" || p.threshold <= 0) continue;
    const cumulative = pastTotal + billAmount;
    const via = p.eligibility === "single_bill" ? (billAmount >= p.threshold ? "single_bill" : null) : cumulative >= p.threshold ? "cumulative" : null;
    if (!via) continue;
    if (!best || rank(p) > rank(best.plan)) best = { plan: p, via, cumulative, kind: "activate" };
  }
  if (!best) return null;
  if (!member) return best;
  const st = stateOf(member, today);
  if (st !== "active") return { ...best, kind: "renew" };
  const cur = { discountPct: member.discountPct, fee: plans.find((p) => p.id === member.planId)?.fee ?? 0, threshold: plans.find((p) => p.id === member.planId)?.threshold ?? 0 };
  return rank(best.plan) > rank(cur) ? { ...best, kind: "upgrade" } : null;
}

export type Prospect = {
  phone: string; name: string; total: number; plan: Plan;
  status: "eligible" | "approaching";
  /** how much more they need to spend (0 when eligible) */
  remaining: number;
  via: "single_bill" | "cumulative";
  /** their current plan, if they are a member and would be upgrading */
  current: string;
};

/** Customers who qualify for a plan they don't have yet, and customers close to a total-purchases threshold.
    "Close" = within 20% of the threshold (and at most ₹2,000 away). */
export function prospects(args: { plans: Plan[]; members: Member[]; stats: Map<string, CustomerStats>; today?: string }): Prospect[] {
  const today = args.today ?? todayIST();
  const byPhone = new Map(args.members.map((m) => [m.phone, m]));
  const out: Prospect[] = [];
  for (const c of args.stats.values()) {
    const member = byPhone.get(c.phone);
    const memberOk = member && stateOf(member, today) === "active";
    const have = member ? rank({ discountPct: member.discountPct, fee: args.plans.find((p) => p.id === member.planId)?.fee ?? 0, threshold: args.plans.find((p) => p.id === member.planId)?.threshold ?? 0 }) : -1;
    let eligible: Prospect | null = null;
    let near: Prospect | null = null;
    for (const p of args.plans) {
      if (!p.active || p.eligibility === "manual" || p.threshold <= 0) continue;
      if (memberOk && rank(p) <= have) continue;
      const via = p.eligibility === "single_bill" ? "single_bill" : "cumulative";
      const reached = p.eligibility === "single_bill" ? c.maxBill >= p.threshold : c.total >= p.threshold;
      const base = { phone: c.phone, name: c.name || member?.name || "", total: c.total, plan: p, via, current: memberOk ? member!.planName : "" } as const;
      if (reached) {
        if (!eligible || rank(p) > rank(eligible.plan)) eligible = { ...base, status: "eligible", remaining: 0 };
      } else if (p.eligibility === "cumulative") {
        const remaining = p.threshold - c.total;
        if (remaining <= Math.min(2000, p.threshold * 0.2) && (!near || remaining < near.remaining)) near = { ...base, status: "approaching", remaining };
      }
    }
    if (eligible) out.push(eligible);
    else if (near) out.push(near);
  }
  return out.sort((a, b) => (a.status === b.status ? a.remaining - b.remaining : a.status === "eligible" ? -1 : 1));
}
