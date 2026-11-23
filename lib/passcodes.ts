import "server-only";
import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { supabaseAdmin as sb } from "@/lib/supabase";

export type PasscodeRole = "admin" | "staff";

const norm = (v: string) => String(v ?? "").replace(/\s/g, "");
const envFor = (role: PasscodeRole) => (role === "admin" ? process.env.ADMIN_PASSCODE : process.env.STAFF_PASSCODE) ?? "";
const col = (role: PasscodeRole) => (role === "admin" ? "admin_pass_hash" : "staff_pass_hash");

function hash(pass: string): string {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("hex")}$${scryptSync(pass, salt, 32).toString("hex")}`;
}
function check(pass: string, stored: string): boolean {
  const [tag, saltHex, hashHex] = stored.split("$");
  if (tag !== "scrypt" || !saltHex || !hashHex) return false;
  const want = Buffer.from(hashHex, "hex");
  const got = scryptSync(pass, Buffer.from(saltHex, "hex"), want.length);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** The hash saved from the Settings screen, if any. If the column isn't there yet (migration 0009), it counts as none. */
async function storedHash(role: PasscodeRole): Promise<string | null> {
  const { data, error } = await sb.from("shop_settings").select(col(role)).eq("id", "default").maybeSingle();
  if (error || !data) return null;
  return ((data as unknown as Record<string, string | null>)[col(role)] ?? null) || null;
}

/** Does this passcode belong to the role? A passcode set in Settings wins; otherwise the .env one is used. */
export async function passcodeMatches(role: PasscodeRole, entered: string): Promise<boolean> {
  const e = norm(entered);
  if (!e) return false;
  const stored = await storedHash(role);
  if (stored) return check(e, stored);
  const env = norm(envFor(role));
  return !!env && e === env;
}

/** Changes a role's passcode. Throws a readable message when it isn't allowed. */
export async function setPasscode(role: PasscodeRole, next: string): Promise<void> {
  const n = norm(next);
  if (n.length < 4) throw new Error("The new passcode must be at least 4 characters (no spaces).");
  if (n.length > 40) throw new Error("The new passcode is too long (40 characters at most).");
  const other: PasscodeRole = role === "admin" ? "staff" : "admin";
  if (await passcodeMatches(other, n)) throw new Error(`That passcode is already used by ${other}. Choose a different one so the two can't be mixed up.`);
  const { error } = await sb.from("shop_settings").upsert({ id: "default", [col(role)]: hash(n), updated_at: new Date().toISOString() });
  if (error) {
    throw new Error(/admin_pass_hash|staff_pass_hash|shop_settings/.test(error.message) ? "Run migration 0009 (supabase/all_migrations.sql) in Supabase first." : error.message);
  }
}
