import "server-only";
import { supabaseAdmin as sb } from "@/lib/supabase";
import { getShopSettings } from "@/lib/shopSettings";
import {
  DEFAULT_SETTINGS, addMonths, daysBetween, stateOf, todayIST,
  type Eligibility, type Member, type MemberEvent, type MemberMessage, type MemberSettings, type MessageKind, type Overview, type PaymentStatus, type Plan, type Source,
} from "@/lib/membershipTypes";
import { fillOffer, msgActivation, msgEligibility, msgExpiry, msgRenewal, msgUpgrade } from "@/lib/membershipMessages";

const NEEDS_MIGRATION = "Membership isn't fully set up yet. Run migrations 0012, 0013 and 0014 (supabase/all_migrations.sql) in Supabase first.";
const missing = (m: string) => /membership|relation .* does not exist|column .* does not exist/i.test(m);
const num = (v: unknown) => Number(v ?? 0);
const last10 = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);

/* ---------------------------------------------------------------- row mapping */
const ELIG: Eligibility[] = ["manual", "single_bill", "cumulative"];
const planOf = (r: any): Plan => ({
  id: r.id,
  name: r.name,
  fee: num(r.fee),
  months: Number(r.validity_months) || 12,
  discountPct: num(r.discount_pct),
  birthdayPct: num(r.birthday_pct),
  description: r.description ?? "",
  active: !!r.is_active,
  eligibility: ELIG.includes(r.eligibility) ? r.eligibility : "manual",
  threshold: num(r.threshold),
  minBill: num(r.min_bill),
  offerText: r.offer_text ?? "",
  offerValidUntil: r.offer_valid_until ?? null,
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
    minBill: plan?.minBill ?? 0,
    offerText: plan?.offerText ?? "",
    offerValidUntil: plan?.offerValidUntil ?? null,
    joinedAt: new Date(r.joined_at).toISOString(),
    expiresAt: r.expires_at ?? null,
    paymentStatus: r.payment_status === "pending" ? "pending" : "paid",
    birthday: r.birthday ?? null,
    off: r.status === "inactive",
    source: (["manual", "single_bill", "cumulative"] as const).includes(r.source) ? r.source : "manual",
  };
}

const eventOf = (r: any): MemberEvent => ({
  id: r.id, memberId: r.member_id, kind: r.kind, planName: r.plan_name ?? "", fromPlan: r.from_plan ?? "", amount: num(r.amount),
  status: r.status === "pending" ? "pending" : "paid", source: (["manual", "single_bill", "cumulative"] as const).includes(r.source) ? r.source : "manual",
  at: new Date(r.created_at).toISOString(),
});

const messageOf = (r: any): MemberMessage => ({
  id: r.id, memberId: r.member_id ?? null, phone: r.phone, name: r.name ?? "", kind: r.kind, text: r.text, status: r.status,
  createdAt: new Date(r.created_at).toISOString(), sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
});

const settingsOf = (r: any): MemberSettings =>
  r
    ? {
        basis: r.eligibility_basis === "subtotal" ? "subtotal" : "net",
        msgActivation: r.msg_activation !== false, msgUpgrade: r.msg_upgrade !== false, msgRenewal: r.msg_renewal !== false,
        msgExpiry: r.msg_expiry !== false, msgEligibility: r.msg_eligibility !== false, msgOffers: r.msg_offers !== false,
        reminderDays: String(r.reminder_days ?? "7,3,0").split(",").map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n >= 0 && n <= 60),
      }
    : DEFAULT_SETTINGS;

/* ---------------------------------------------------------------- settings */
export async function getSettings(): Promise<MemberSettings> {
  const { data } = await sb.from("membership_settings").select("*").eq("id", "default").maybeSingle();
  return settingsOf(data);
}

export async function saveSettings(s: MemberSettings): Promise<MemberSettings> {
  const days = [...new Set((s.reminderDays ?? []).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 60))].sort((a, b) => b - a);
  const { data, error } = await sb
    .from("membership_settings")
    .upsert({
      id: "default", eligibility_basis: s.basis === "subtotal" ? "subtotal" : "net",
      msg_activation: !!s.msgActivation, msg_upgrade: !!s.msgUpgrade, msg_renewal: !!s.msgRenewal, msg_expiry: !!s.msgExpiry,
      msg_eligibility: !!s.msgEligibility, msg_offers: !!s.msgOffers, reminder_days: days.join(","), updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw new Error(missing(error.message) ? NEEDS_MIGRATION : error.message);
  return settingsOf(data);
}

/* ---------------------------------------------------------------- messages (the shop sends them with one tap) */
async function queue(settings: MemberSettings, m: { kind: MessageKind; memberId: string | null; phone: string; name: string; text: string; key?: string }): Promise<MemberMessage | null> {
  const on = { activation: settings.msgActivation, upgrade: settings.msgUpgrade, renewal: settings.msgRenewal, expiry: settings.msgExpiry, eligibility: settings.msgEligibility, offer: settings.msgOffers }[m.kind];
  if (!on) return null;
  const { data, error } = await sb
    .from("membership_messages")
    .insert({ kind: m.kind, member_id: m.memberId, phone: last10(m.phone), name: m.name, text: m.text, reminder_key: m.key ?? null })
    .select("*")
    .single();
  if (error) {
    if (error.code !== "23505") console.error("Could not queue the membership message:", error.message);
    return null;
  }
  return messageOf(data);
}

export async function markMessage(id: string, status: "sent" | "failed" | "pending"): Promise<MemberMessage> {
  const { data, error } = await sb.from("membership_messages").update({ status, sent_at: status === "sent" ? new Date().toISOString() : null }).eq("id", id).select("*").single();
  if (error) throw new Error(error.message);
  return messageOf(data);
}

/* ---------------------------------------------------------------- overview */
/** Plans, members, fee history, settings and waiting messages, in one go; also prepares any due expiry reminders. */
export async function overview(): Promise<Overview> {
  const [pl, mb, pay, st, ms] = await Promise.all([
    sb.from("membership_plans").select("*").order("sort_order", { ascending: true }).order("created_at", { ascending: true }),
    sb.from("memberships").select("*").order("created_at", { ascending: false }).limit(5000),
    sb.from("membership_payments").select("*").order("created_at", { ascending: false }).limit(5000),
    sb.from("membership_settings").select("*").eq("id", "default").maybeSingle(),
    sb.from("membership_messages").select("*").order("created_at", { ascending: false }).limit(300),
  ]);
  for (const r of [pl, mb]) if (r.error && !missing(r.error.message)) throw new Error(r.error.message);
  const plans = (pl.data ?? []).map(planOf);
  const byId = new Map(plans.map((p) => [p.id, p]));
  const members = (mb.data ?? []).map((r: any) => memberOf(r, byId));
  const events = ((pay.data ?? []) as any[]).map(eventOf);
  const settings = settingsOf(st.data);
  const messages = ((ms.data ?? []) as any[]).map(messageOf);

  // Expiry reminders that are due now (once per membership, expiry date and reminder day).
  if (settings.msgExpiry && settings.reminderDays.length && !ms.error) {
    const today = todayIST();
    const shop = (await getShopSettings()).shopName;
    const rows: any[] = [];
    for (const m of members) {
      if (!m.expiresAt || stateOf(m, today) !== "active") continue;
      const left = daysBetween(today, m.expiresAt);
      const due = settings.reminderDays.filter((d) => left <= d && left >= 0).sort((a, b) => a - b)[0]; // the closest one that has been reached
      if (due === undefined) continue;
      rows.push({ kind: "expiry", member_id: m.id, phone: m.phone, name: m.name, reminder_key: `${m.id}:${m.expiresAt}:${due}`, text: msgExpiry({ shop, name: m.name, plan: m.planName || "Membership", expiresAt: m.expiresAt, daysLeft: left }) });
    }
    if (rows.length) {
      const { data } = await sb.from("membership_messages").upsert(rows, { onConflict: "reminder_key", ignoreDuplicates: true }).select("*");
      for (const r of data ?? []) messages.unshift(messageOf(r));
    }
  }

  return { plans, members, revenue: events.filter((e) => e.status === "paid").reduce((a, e) => a + e.amount, 0), settings, events, messages };
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
  if (data.plan_id) {
    const p = await planById(data.plan_id).catch(() => null);
    if (p) plans.set(p.id, p);
  }
  return memberOf(data, plans);
}

const cleanPayment = (p: unknown): PaymentStatus => (p === "pending" ? "pending" : "paid");
const cleanSource = (s: unknown): Source => (s === "single_bill" || s === "cumulative" ? s : "manual");

async function logPayment(memberId: string, plan: Plan, status: PaymentStatus, kind: "join" | "renewal" | "upgrade", source: Source, fromPlan = ""): Promise<MemberEvent | undefined> {
  const { data, error } = await sb
    .from("membership_payments")
    .insert({ member_id: memberId, plan_name: plan.name, from_plan: fromPlan, amount: plan.fee, status, kind, source, paid_at: status === "paid" ? new Date().toISOString() : null })
    .select("*")
    .single();
  if (error) {
    console.error("Could not record the membership payment:", error.message);
    return undefined;
  }
  return eventOf(data);
}

export type RegisterInput = { name: string; phone: string; planId: string; payment: PaymentStatus; birthday?: string | null; source?: Source };
export type MemberResult = { member: Member; revenueDelta: number; event?: MemberEvent; message?: MemberMessage | null };

/** Registers a customer as a member: automatic Membership ID, joining date today, expiry from the plan. */
export async function registerMember(i: RegisterInput): Promise<MemberResult> {
  const name = String(i.name ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
  const phone = last10(i.phone);
  if (!name) throw new Error("Enter the customer's name.");
  if (!/^[6-9]\d{9}$/.test(phone)) throw new Error("Enter a valid 10-digit mobile number.");
  const plan = await planById(i.planId);
  if (!plan.active) throw new Error("That plan is switched off. Choose another plan.");
  const birthday = i.birthday && /^\d{4}-\d{2}-\d{2}$/.test(i.birthday) ? i.birthday : null;
  const payment = cleanPayment(i.payment);
  const source = cleanSource(i.source);

  const { data, error } = await sb
    .from("memberships")
    .insert({ name, phone, plan_id: plan.id, plan_name: plan.name, expires_at: addMonths(todayIST(), plan.months), payment_status: payment, birthday, source })
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
  const member = memberOf(data, new Map([[plan.id, plan]]));
  const event = await logPayment(data.id, plan, payment, "join", source);
  const shop = (await getShopSettings()).shopName;
  const message = await queue(await getSettings(), {
    kind: "activation", memberId: data.id, phone, name,
    text: msgActivation({ shop, name, plan: plan.name, memberNo: member.memberNo, discountPct: plan.discountPct, expiresAt: member.expiresAt, offer: plan.offerText }),
  });
  return { member, revenueDelta: payment === "paid" ? plan.fee : 0, event, message };
}

/** Renews a membership (same plan or another). If it has not expired yet, the new period starts at its expiry. */
export async function renewMember(id: string, planId: string, payment: PaymentStatus, source: Source = "manual"): Promise<MemberResult> {
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
  const member = memberOf(data, new Map([[plan.id, plan]]));
  const event = await logPayment(id, plan, pay, "renewal", cleanSource(source));
  const shop = (await getShopSettings()).shopName;
  const message = await queue(await getSettings(), {
    kind: "renewal", memberId: id, phone: member.phone, name: member.name,
    text: msgRenewal({ shop, name: member.name, plan: plan.name, memberNo: member.memberNo, discountPct: plan.discountPct, expiresAt: member.expiresAt }),
  });
  return { member, revenueDelta: pay === "paid" ? plan.fee : 0, event, message };
}

/** Moves an active member to a different (better) plan. The new plan starts today. */
export async function upgradeMember(id: string, planId: string, payment: PaymentStatus, source: Source = "manual"): Promise<MemberResult> {
  const plan = await planById(planId);
  if (!plan.active) throw new Error("That plan is switched off. Choose another plan.");
  const before = await oneMember(id);
  if (before.planId === plan.id) throw new Error("They are already on this plan. Use Renew to extend it.");
  const pay = cleanPayment(payment);
  const { data, error } = await sb
    .from("memberships")
    .update({ plan_id: plan.id, plan_name: plan.name, expires_at: addMonths(todayIST(), plan.months), payment_status: pay, status: "active" })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  const member = memberOf(data, new Map([[plan.id, plan]]));
  const event = await logPayment(id, plan, pay, "upgrade", cleanSource(source), before.planName);
  const shop = (await getShopSettings()).shopName;
  const message = await queue(await getSettings(), {
    kind: "upgrade", memberId: id, phone: member.phone, name: member.name,
    text: msgUpgrade({ shop, name: member.name, from: before.planName, plan: plan.name, memberNo: member.memberNo, discountPct: plan.discountPct, expiresAt: member.expiresAt, offer: plan.offerText }),
  });
  return { member, revenueDelta: pay === "paid" ? plan.fee : 0, event, message };
}

export type BillingEnroll = { kind: "activate" | "upgrade" | "renew"; planId: string; phone: string; name: string; source: Source };
/** Called when a bill is completed with a membership activation / upgrade / renewal on it. The fee was charged on that bill. */
export async function enrollFromBilling(i: BillingEnroll): Promise<MemberResult & { label: string }> {
  const phone = last10(i.phone);
  const plan = await planById(i.planId);
  const src = cleanSource(i.source);
  if (i.kind === "activate") {
    const r = await registerMember({ name: i.name || "Customer", phone, planId: plan.id, payment: "paid", source: src });
    return { ...r, label: `${plan.name} activated` };
  }
  const { data } = await sb.from("memberships").select("id").eq("phone", phone).maybeSingle();
  if (!data) throw new Error("That customer isn't a member yet.");
  if (i.kind === "upgrade") return { ...(await upgradeMember(data.id, plan.id, "paid", src)), label: `Upgraded to ${plan.name}` };
  return { ...(await renewMember(data.id, plan.id, "paid", src)), label: `${plan.name} renewed` };
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

/* ---------------------------------------------------------------- eligibility + offer messages */
/** "You qualify" message for a customer who isn't a member yet (or can upgrade). */
export async function eligibilityMessage(phone: string, name: string, planId: string): Promise<MemberMessage | null> {
  const plan = await planById(planId);
  const shop = (await getShopSettings()).shopName;
  return queue(await getSettings(), { kind: "eligibility", memberId: null, phone, name, text: msgEligibility({ shop, name, plan: plan.name, discountPct: plan.discountPct, offer: plan.offerText }) });
}

/** A promotion for the active members of one plan (or all plans). One message is prepared per member. */
export async function queueOffer(planId: string | "all", text: string): Promise<{ queued: number }> {
  const body = String(text ?? "").trim().slice(0, 900);
  if (!body) throw new Error("Write the offer message first.");
  const settings = await getSettings();
  if (!settings.msgOffers) throw new Error("Promotional offers are switched off in the membership settings.");
  const o = await overview();
  const shop = (await getShopSettings()).shopName;
  const today = todayIST();
  let queued = 0;
  for (const m of o.members) {
    if (stateOf(m, today) !== "active") continue;
    if (planId !== "all" && m.planId !== planId) continue;
    const r = await queue(settings, { kind: "offer", memberId: m.id, phone: m.phone, name: m.name, text: fillOffer(body, { name: m.name, plan: m.planName, shop }) });
    if (r) queued++;
  }
  return { queued };
}

/* ---------------------------------------------------------------- plans */
export type PlanInput = {
  id?: string; name: string; fee: number; months: number; discountPct: number; birthdayPct: number; description: string; active: boolean;
  eligibility: Eligibility; threshold: number; minBill: number; offerText: string; offerValidUntil: string | null;
};

export async function savePlan(i: PlanInput): Promise<Plan> {
  const name = String(i.name ?? "").trim().slice(0, 40);
  if (!name) throw new Error("Enter the plan name.");
  const fee = Number(i.fee);
  const months = Math.round(Number(i.months));
  const disc = Number(i.discountPct);
  const bday = Number(i.birthdayPct || 0);
  const threshold = Number(i.threshold || 0);
  const minBill = Number(i.minBill || 0);
  const eligibility: Eligibility = ELIG.includes(i.eligibility) ? i.eligibility : "manual";
  if (!Number.isFinite(fee) || fee < 0) throw new Error("The membership fee can't be negative.");
  if (!Number.isFinite(months) || months < 1 || months > 120) throw new Error("Validity must be between 1 and 120 months.");
  if (!Number.isFinite(disc) || disc < 0 || disc > 100) throw new Error("The discount must be between 0 and 100%.");
  if (!Number.isFinite(bday) || bday < 0 || bday > 100) throw new Error("The birthday discount must be between 0 and 100%.");
  if (!Number.isFinite(threshold) || threshold < 0) throw new Error("The purchase threshold can't be negative.");
  if (eligibility !== "manual" && threshold <= 0) throw new Error("Enter the purchase amount a customer needs to qualify, or choose manual enrolment.");
  if (!Number.isFinite(minBill) || minBill < 0) throw new Error("The minimum bill can't be negative.");
  const until = i.offerValidUntil && /^\d{4}-\d{2}-\d{2}$/.test(i.offerValidUntil) ? i.offerValidUntil : null;
  const round = (n: number) => Math.round(n * 100) / 100;
  const row = {
    name, fee: round(fee), validity_months: months, discount_pct: round(disc), birthday_pct: round(bday),
    description: String(i.description ?? "").trim().slice(0, 200), is_active: !!i.active,
    eligibility, threshold: eligibility === "manual" ? 0 : round(threshold), min_bill: round(minBill),
    offer_text: String(i.offerText ?? "").trim().slice(0, 120), offer_valid_until: until,
  };
  const q = i.id ? sb.from("membership_plans").update(row).eq("id", i.id) : sb.from("membership_plans").insert(row);
  const { data, error } = await q.select("*").single();
  if (error) throw new Error(missing(error.message) ? NEEDS_MIGRATION : error.message);
  return planOf(data);
}

/** Remembers which membership was activated / upgraded / renewed on a bill (the ID exists only after the bill is saved). */
export async function attachToOrder(orderId: string, memberNo: string): Promise<void> {
  const { error } = await sb.from("orders").update({ member_event_no: memberNo }).eq("id", orderId);
  if (error) console.error("Could not attach the membership to the bill:", error.message);
}
