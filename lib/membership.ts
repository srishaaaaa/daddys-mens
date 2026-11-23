import "server-only";
import { supabaseAdmin as sb } from "@/lib/supabase";
import { addMonths, todayIST, type Member, type Overview, type PaymentStatus, type Plan } from "@/lib/membershipTypes";

const NEEDS_MIGRATION = "Membership isn't fully set up yet. Run migrations 0012 and 0013 (supabase/all_migrations.sql) in Supabase first.";
const missing = (m: string) => /membership|relation .* does not exist|column .* does not exist/i.test(m);
const num = (v: unknown) => Number(v ?? 0);

const planOf = (r: any): Plan => ({
  id: r.id,
  name: r.name,
  fee: num(r.fee),
  months: Number(r.validity_months) || 12,
  discountPct: num(r.discount_pct),
  birthdayPct: num(r.birthday_pct),
  description: r.description ?? "",
  active: !!r.is_active,
});

function memberOf(r: any, plans: Map<string, Plan>): Member {
  const plan = r.plan_id ? plans.get(r.plan_id) : undefined;
  return {
    id: r.id,
    memberNo: r.member_no,
    name: r.name,
    phone: r.phone,
    planId: r.plan_id ?? null,
    planName: plan?.name ?? r.plan_name ?? "",
    discountPct: plan?.discountPct ?? 0,
    birthdayPct: plan?.birthdayPct ?? 0,
    joinedAt: new Date(r.joined_at).toISOString(),
    expiresAt: r.expires_at ?? null,
    paymentStatus: r.payment_status === "pending" ? "pending" : "paid",
    birthday: r.birthday ?? null,
    off: r.status === "inactive",
  };
}

/** Plans, members and total fees collected: everything the Membership screen and billing need, in one go. */
export async function overview(): Promise<Overview> {
  const [pl, mb, pay] = await Promise.all([
    sb.from("membership_plans").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    sb.from("memberships").select("*").order("created_at", { ascending: false }).limit(5000),
    sb.from("membership_payments").select("amount").eq("status", "paid").limit(20000),
  ]);
  for (const r of [pl, mb]) if (r.error && !missing(r.error.message)) throw new Error(r.error.message);
  const plans = (pl.data ?? []).map(planOf);
  const byId = new Map(plans.map((p) => [p.id, p]));
  return {
    plans,
    members: (mb.data ?? []).map((r: any) => memberOf(r, byId)),
    revenue: ((pay.data ?? []) as any[]).reduce((a, r) => a + num(r.amount), 0),
  };
}

async function planById(id: string): Promise<Plan> {
  const { data, error } = await sb.from("membership_plans").select("*").eq("id", id).maybeSingle();
  if (error && missing(error.message)) throw new Error(NEEDS_MIGRATION);
  if (!data) throw new Error("Choose a membership plan.");
  return planOf(data);
}

async function oneMember(id: string): Promise<Member> {
  const { data, error } = await sb.from("memberships").select("*").eq("id", id).single();
  if (error) throw new Error(error.message);
  const plans = new Map<string, Plan>();
  if (data.plan_id) plans.set(data.plan_id, await planById(data.plan_id).catch(() => undefined as unknown as Plan));
  if (data.plan_id && !plans.get(data.plan_id)) plans.delete(data.plan_id);
  return memberOf(data, plans);
}

const cleanPayment = (p: unknown): PaymentStatus => (p === "pending" ? "pending" : "paid");

async function logPayment(memberId: string, plan: Plan, status: PaymentStatus, kind: "join" | "renewal") {
  const { error } = await sb.from("membership_payments").insert({
    member_id: memberId, plan_name: plan.name, amount: plan.fee, status, kind, paid_at: status === "paid" ? new Date().toISOString() : null,
  });
  if (error) console.error("Could not record the membership payment:", error.message);
}

export type RegisterInput = { name: string; phone: string; planId: string; payment: PaymentStatus; birthday?: string | null };
export type MemberResult = { member: Member; revenueDelta: number };

/** Registers a customer as a member: automatic Membership ID, joining date today, expiry from the plan. */
export async function registerMember(i: RegisterInput): Promise<MemberResult> {
  const name = String(i.name ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  const phone = String(i.phone ?? "").replace(/\D/g, "").slice(-10);
  if (!name) throw new Error("Enter the customer's name.");
  if (!/^[6-9]\d{9}$/.test(phone)) throw new Error("Enter a valid 10-digit mobile number.");
  const plan = await planById(i.planId);
  if (!plan.active) throw new Error("That plan is switched off. Choose another plan.");
  const birthday = i.birthday && /^\d{4}-\d{2}-\d{2}$/.test(i.birthday) ? i.birthday : null;
  const payment = cleanPayment(i.payment);

  const { data, error } = await sb
    .from("memberships")
    .insert({ name, phone, plan_id: plan.id, plan_name: plan.name, expires_at: addMonths(todayIST(), plan.months), payment_status: payment, birthday })
    .select("*")
    .single();
  if (error) {
    if (missing(error.message) && !/duplicate/i.test(error.message)) throw new Error(NEEDS_MIGRATION);
    if (error.code === "23505") {
      const { data: ex } = await sb.from("memberships").select("member_no, name").eq("phone", phone).maybeSingle();
      throw new Error(ex ? `This number is already a member (${ex.member_no}, ${ex.name}).` : "This number is already a member.");
    }
    throw new Error(error.message);
  }
  await logPayment(data.id, plan, payment, "join");
  return { member: memberOf(data, new Map([[plan.id, plan]])), revenueDelta: payment === "paid" ? plan.fee : 0 };
}

/** Renews a membership (same plan or another). If it has not expired yet, the new period starts at its expiry. */
export async function renewMember(id: string, planId: string, payment: PaymentStatus): Promise<MemberResult> {
  const plan = await planById(planId);
  if (!plan.active) throw new Error("That plan is switched off. Choose another plan.");
  const { data: cur, error: e1 } = await sb.from("memberships").select("expires_at").eq("id", id).single();
  if (e1) throw new Error(e1.message);
  const today = todayIST();
  const base = cur.expires_at && cur.expires_at > today ? cur.expires_at : today;
  const pay = cleanPayment(payment);
  const { data, error } = await sb
    .from("memberships")
    .update({ plan_id: plan.id, plan_name: plan.name, expires_at: addMonths(base, plan.months), payment_status: pay, status: "active" })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await logPayment(id, plan, pay, "renewal");
  return { member: memberOf(data, new Map([[plan.id, plan]])), revenueDelta: pay === "paid" ? plan.fee : 0 };
}

export async function setMemberStatus(id: string, active: boolean): Promise<MemberResult> {
  const { error } = await sb.from("memberships").update({ status: active ? "active" : "inactive" }).eq("id", id);
  if (error) throw new Error(missing(error.message) ? NEEDS_MIGRATION : error.message);
  return { member: await oneMember(id), revenueDelta: 0 };
}

/** A pending membership fee has been received. */
export async function markPaid(id: string): Promise<MemberResult> {
  const { data: pend } = await sb.from("membership_payments").select("id, amount").eq("member_id", id).eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
  let delta = 0;
  if (pend) {
    await sb.from("membership_payments").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", pend.id);
    delta = num(pend.amount);
  }
  const { error } = await sb.from("memberships").update({ payment_status: "paid" }).eq("id", id);
  if (error) throw new Error(error.message);
  return { member: await oneMember(id), revenueDelta: delta };
}

/* ---------------------------------------------------------------- plans */
export type PlanInput = { id?: string; name: string; fee: number; months: number; discountPct: number; birthdayPct: number; description: string; active: boolean };

export async function savePlan(i: PlanInput): Promise<Plan> {
  const name = String(i.name ?? "").trim().slice(0, 40);
  if (!name) throw new Error("Enter the plan name.");
  const fee = Number(i.fee);
  const months = Math.round(Number(i.months));
  const disc = Number(i.discountPct);
  const bday = Number(i.birthdayPct || 0);
  if (!Number.isFinite(fee) || fee < 0) throw new Error("The membership fee can't be negative.");
  if (!Number.isFinite(months) || months < 1 || months > 120) throw new Error("Validity must be between 1 and 120 months.");
  if (!Number.isFinite(disc) || disc < 0 || disc > 100) throw new Error("The discount must be between 0 and 100%.");
  if (!Number.isFinite(bday) || bday < 0 || bday > 100) throw new Error("The birthday discount must be between 0 and 100%.");
  const row = {
    name, fee: Math.round(fee * 100) / 100, validity_months: months, discount_pct: Math.round(disc * 100) / 100,
    birthday_pct: Math.round(bday * 100) / 100, description: String(i.description ?? "").trim().slice(0, 200), is_active: !!i.active,
  };
  const q = i.id ? sb.from("membership_plans").update(row).eq("id", i.id) : sb.from("membership_plans").insert(row);
  const { data, error } = await q.select("*").single();
  if (error) throw new Error(missing(error.message) ? NEEDS_MIGRATION : error.message);
  return planOf(data);
}
