"use server";

import { requireAdmin, requireStaff } from "@/lib/auth";
import { run } from "@/lib/actionResult";
import * as m from "@/lib/membership";
import type { PaymentStatus } from "@/lib/membershipTypes";

/* Staff can register, renew and switch members on or off. Only the admin manages the plans. */
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
