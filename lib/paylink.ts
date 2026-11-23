import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

/* The link staff send a customer on WhatsApp to pay a bill by UPI: /pay/<token>. The token carries the amount
   and who it is for, signed with a server secret, so the amount can't be changed by editing the link, and it
   stops working after a while. Nothing is stored — the page rebuilds everything from the token. */

export type PayLink = { a: number; n: string; exp: number };

export const PAY_LINK_HOURS = 6;

const secret = () => process.env.PAY_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const sign = (body: string) => createHmac("sha256", secret()).update(`pay.${body}`).digest("base64url");

export function signPayLink(amount: number, name: string, now = Date.now()): string {
  if (!secret()) throw new Error("Payment links need PAY_LINK_SECRET (or the Supabase key) set in .env.");
  const p: PayLink = {
    a: Math.round(amount * 100) / 100,
    n: name.trim().slice(0, 40),
    exp: now + PAY_LINK_HOURS * 3_600_000,
  };
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** The link's contents if it is genuine and still fresh, otherwise not ok (`expired` tells the two apart). */
export function readPayLink(
  token: string,
  now = Date.now(),
): { ok: true; link: PayLink } | { ok: false; expired: boolean } {
  const [body, sig] = String(token).split(".");
  if (!body || !sig || !secret()) return { ok: false, expired: false };
  const want = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return { ok: false, expired: false };
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PayLink;
    if (!(typeof p.a === "number" && p.a > 0 && p.a <= 10_000_000 && typeof p.exp === "number")) {
      return { ok: false, expired: false };
    }
    if (p.exp < now) return { ok: false, expired: true };
    return { ok: true, link: { a: p.a, n: typeof p.n === "string" ? p.n : "", exp: p.exp } };
  } catch {
    return { ok: false, expired: false };
  }
}
