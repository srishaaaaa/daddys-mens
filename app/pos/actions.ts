"use server";

import { requireStaff, requireAdmin, setSessionRoleCookie, clearSessionRoleCookie } from "@/lib/auth";
import * as db from "@/lib/db";
import type { StoredProduct, StoredOrder } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { passcodeMatches } from "@/lib/passcodes";
import { run } from "@/lib/actionResult";

export async function verifyPasscode(
  enteredPasscode: string,
): Promise<{ success: boolean; role?: "staff" | "admin" }> {
  // A passcode changed in Settings (stored hashed) wins; otherwise the one in .env. Never sent to the browser.
  const normalizedEntered = enteredPasscode.replace(/\s/g, "");

  if (!normalizedEntered) {
    return { success: false };
  }

  if (await passcodeMatches("admin", normalizedEntered)) {
    await setSessionRoleCookie("admin");
    return { success: true, role: "admin" };
  }
  if (await passcodeMatches("staff", normalizedEntered)) {
    await setSessionRoleCookie("staff");
    return { success: true, role: "staff" };
  }

  return { success: false };
}

export async function logoutAction() {
  await clearSessionRoleCookie();
}

export async function listProductsAction() {
  await requireStaff();
  return db.getProducts();
}

export async function listOrdersAction() {
  await requireStaff();
  return db.getOrders();
}

export async function orderExistsAction(id: string) {
  await requireStaff();
  return db.orderExists(id);
}

export async function createProductAction(input: Omit<StoredProduct, "id">) {
  await requireAdmin();
  return db.addProduct(input);
}

export async function updateProductAction(
  id: string,
  input: Omit<StoredProduct, "id">,
) {
  await requireAdmin();
  return db.updateProduct(id, input);
}

export async function deleteProductAction(id: string) {
  await requireAdmin();
  return db.deleteProduct(id);
}

export async function createOrderAction(order: StoredOrder) {
  await requireStaff();
  await db.saveOrder(order);
  revalidatePath(`/invoice/${order.id}`);
}

export async function deleteOrderAction(id: string) {
  await requireAdmin();
  await db.deleteOrder(id);
  revalidatePath(`/invoice/${id}`);
}

/** A return or refund on a bill (admin only). */
export async function refundOrderAction(id: string, amount: number, note: string) {
  await requireAdmin();
  return run(() => db.refundOrder(id, amount, note));
}
