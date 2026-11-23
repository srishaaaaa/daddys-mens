"use server";

import { requireAdmin, requireStaff } from "@/lib/auth";
import { getShopSettings, saveShopSettings, type ShopSettings } from "@/lib/shopSettings";

export async function getShopSettingsAction() {
  await requireAdmin();
  return getShopSettings();
}
/** Staff need the website address to build coupon links; nothing else. */
export async function getPublicUrlAction() {
  await requireStaff();
  return (await getShopSettings()).publicUrl;
}
export async function saveShopSettingsAction(s: Partial<ShopSettings>) {
  await requireAdmin();
  return saveShopSettings(s);
}
