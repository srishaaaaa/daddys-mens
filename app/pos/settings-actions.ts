"use server";

import { requireAdmin, requireStaff } from "@/lib/auth";
import { passcodeMatches, setPasscode, type PasscodeRole } from "@/lib/passcodes";
import { run } from "@/lib/actionResult";
import { getShopProfile, getShopSettings, saveShopSettings, type ShopSettings } from "@/lib/shopSettings";

export async function getShopSettingsAction() {
  await requireAdmin();
  return getShopSettings();
}
/** Shop name, phone, address and website address — what customers see on bills, coupons and messages. */
export async function getShopProfileAction() {
  await requireStaff();
  return getShopProfile();
}
export async function saveShopSettingsAction(s: Partial<ShopSettings>) {
  await requireAdmin();
  return run(() => saveShopSettings(s));
}

/** Change the admin or staff passcode. The current admin passcode must be entered again to confirm. */
export async function changePasscodeAction(
  role: PasscodeRole,
  currentAdminPasscode: string,
  next: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  if (!(await passcodeMatches("admin", currentAdminPasscode))) return { ok: false, error: "The current admin passcode isn't right." };
  try {
    await setPasscode(role === "admin" ? "admin" : "staff", next);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not change the passcode." };
  }
}
