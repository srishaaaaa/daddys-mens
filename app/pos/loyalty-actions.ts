"use server";

import { requireAdmin, requireStaff } from "@/lib/auth";
import * as L from "@/lib/loyalty/server";
import type { CustomerInput, SettleInput } from "@/lib/loyalty/server";
import type { GiftOffer, Reward } from "@/lib/loyalty/types";

const actorOf = (role: string) => role;

export async function loyaltyStateAction() {
  await requireAdmin();
  return L.loadState();
}
export async function loyaltyLedgerAction(from?: number, to?: number) {
  await requireAdmin();
  return L.listLedger(from, to);
}
export async function loyaltyConfigAction(raw: unknown, reason: string) {
  const role = await requireAdmin();
  return L.saveConfig(raw, reason, actorOf(role));
}
export async function loyaltyRegisterAction(input: CustomerInput) {
  const role = await requireStaff();
  return L.registerCustomer(input, actorOf(role));
}
export async function loyaltyUpdateAction(id: string, patch: Partial<CustomerInput>) {
  const role = await requireStaff();
  return L.updateCustomer(id, patch, actorOf(role));
}
export async function loyaltyStatusAction(id: string, status: "active" | "inactive") {
  const role = await requireAdmin();
  return L.setCustomerStatus(id, status, actorOf(role));
}
export async function loyaltyDeleteAction(id: string) {
  const role = await requireAdmin();
  return L.deleteCustomer(id, actorOf(role));
}
export async function loyaltyAdjustAction(id: string, points: number, reason: string) {
  const role = await requireAdmin();
  return L.adjustPoints(id, points, reason, actorOf(role));
}
export async function loyaltyRewardSaveAction(r: Partial<Reward> & { name: string }) {
  await requireAdmin();
  return L.saveReward(r);
}
export async function loyaltyRewardDeleteAction(id: string) {
  await requireAdmin();
  return L.deleteReward(id);
}
export async function loyaltyOfferSaveAction(o: Partial<GiftOffer> & { name: string }) {
  await requireAdmin();
  return L.saveOffer(o);
}
export async function loyaltyOfferDeleteAction(id: string) {
  await requireAdmin();
  return L.deleteOffer(id);
}
export async function loyaltyVoucherCancelAction(id: string) {
  const role = await requireAdmin();
  return L.cancelVoucher(id, actorOf(role));
}
export async function loyaltyMsgOpenAction(id: string) {
  await requireStaff();
  return L.openMessage(id);
}
export async function loyaltyMsgRetryAction(id: string) {
  await requireAdmin();
  return L.retryMessage(id);
}

/* ---------- billing (staff) ---------- */
export async function loyaltyLookupAction(phone: string) {
  await requireStaff();
  return L.lookupMember(phone);
}
export async function loyaltySettleAction(input: SettleInput) {
  const role = await requireStaff();
  return L.settleOrder(input, actorOf(role));
}
export async function suggestCustomersAction(q: string) {
  await requireStaff();
  return L.suggestCustomers(q);
}
