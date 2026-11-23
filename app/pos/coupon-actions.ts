"use server";

import { requireAdmin, requireStaff } from "@/lib/auth";
import * as cp from "@/lib/coupons";
import type { CouponInput } from "@/lib/coupons";
import { run } from "@/lib/actionResult";

export async function listCouponsAction() {
  await requireAdmin();
  return cp.listCoupons();
}
export async function saveCouponAction(input: CouponInput) {
  await requireAdmin();
  return run(() => cp.saveCoupon(input));
}
export async function deleteCouponAction(id: string) {
  await requireAdmin();
  return cp.deleteCoupon(id);
}
export async function sendCouponAction(id: string, phone: string, restricted: boolean) {
  await requireAdmin();
  return cp.recordCouponSend(id, phone, restricted);
}
export async function couponRecipientsAction(scope: "members" | "nonMembers" | "everyone") {
  await requireAdmin();
  return cp.listCouponRecipients(scope);
}
/** Billing: staff can check a code against the current subtotal. */
export async function validateCouponAction(code: string, subtotal: number, phone: string) {
  await requireStaff();
  return cp.validateCoupon(code, subtotal, phone);
}
/** Billing: counts one use after the bill is saved. */
export async function redeemCouponAction(code: string) {
  await requireStaff();
  return cp.redeemCoupon(code);
}
