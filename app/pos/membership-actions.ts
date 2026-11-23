"use server";

import { requireAdmin, requireStaff } from "@/lib/auth";
import { run } from "@/lib/actionResult";
import * as m from "@/lib/membership";
import type { MemberSettings, PaymentStatus, Source } from "@/lib/membershipTypes";

/* Staff can register, renew, upgrade and switch members on or off, and send the WhatsApp messages.
   Only the admin manages the plans, the settings and promotions. */
export async function membershipOverviewAction() {
  await requireStaff();
  return m.overview();
}
export async function registerMemberAction(i: m.RegisterInput) {
  await requireStaff();
  return run(() => m.registerMember(i));
}
export async function renewMemberAction(id: string, planId: string, payment: PaymentStatus) {
  await requireStaff();
  return run(() => m.renewMember(id, planId, payment));
}
export async function upgradeMemberAction(id: string, planId: string, payment: PaymentStatus, source: Source = "manual") {
  await requireStaff();
  return run(() => m.upgradeMember(id, planId, payment, source));
}
export async function enrollFromBillingAction(i: m.BillingEnroll) {
  await requireStaff();
  return run(() => m.enrollFromBilling(i));
}
export async function setMemberStatusAction(id: string, active: boolean) {
  await requireStaff();
  return run(() => m.setMemberStatus(id, active));
}
export async function markMemberPaidAction(id: string) {
  await requireStaff();
  return run(() => m.markPaid(id));
}
export async function savePlanAction(i: m.PlanInput) {
  await requireAdmin();
  return run(() => m.savePlan(i));
}
export async function saveMembershipSettingsAction(s: MemberSettings) {
  await requireAdmin();
  return run(() => m.saveSettings(s));
}
export async function markMessageAction(id: string, status: "sent" | "failed" | "pending") {
  await requireStaff();
  return run(() => m.markMessage(id, status));
}
export async function eligibilityMessageAction(phone: string, name: string, planId: string) {
  await requireStaff();
  return run(() => m.eligibilityMessage(phone, name, planId));
}
export async function queueOfferAction(planId: string, text: string) {
  await requireAdmin();
  return run(() => m.queueOffer(planId, text));
}
export async function attachMemberToOrderAction(orderId: string, memberNo: string) {
  await requireStaff();
  return m.attachToOrder(orderId, memberNo);
}
