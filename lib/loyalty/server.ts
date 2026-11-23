import "server-only";
import { randomBytes } from "crypto";
import { supabaseAdmin as sb } from "@/lib/supabase";
import { DEFAULT_CONFIG, sanitizeConfig, type LoyaltyConfig, type MessageKey } from "./config";
import { earnFor, pointsValue, segmentOf, statsFrom } from "./engine";
import { fillMessage } from "./messages";
import { offerLive } from "./gifts";
import { getShopSettings } from "@/lib/shopSettings";
import type {
  Audit, GiftOffer, LedgerEntry, LoyaltyCustomer, LoyaltyLookup, LoyaltyMessage, LoyaltyState,
  PurchaseStats, Reward, Segment, Voucher, VoucherSource,
} from "./types";


const num = (v: unknown) => Number(v ?? 0);
const ms = (v: unknown) => (v ? new Date(String(v)).getTime() : 0);
const last10 = (v: string) => String(v ?? "").replace(/\D/g, "").slice(-10);
/** Orders keep the phone as "<10 digits>_<method>". */
const phoneOfOrder = (cp: string) => last10(String(cp ?? "").split("_")[0]);
const uid = () => randomBytes(8).toString("hex");
const codeGen = () => "DH" + randomBytes(4).toString("hex").slice(0, 5).toUpperCase();

/* ---------------------------------------------------------------- settings */
export async function getConfig(): Promise<LoyaltyConfig> {
  const { data } = await sb.from("loyalty_settings").select("config").eq("id", "default").maybeSingle();
  return sanitizeConfig(data?.config ?? DEFAULT_CONFIG);
}

async function audit(a: { actor: string; action: string; customerId?: string | null; reason?: string; before?: unknown; after?: unknown }) {
  const { error } = await sb.from("loyalty_audit").insert({
    actor: a.actor, action: a.action, customer_id: a.customerId ?? null, reason: a.reason ?? "",
    before: a.before ?? null, after: a.after ?? null,
  });
  if (error) console.error("audit failed:", error.message);
}

export async function saveConfig(raw: unknown, reason: string, actor: string): Promise<LoyaltyConfig> {
  const before = await getConfig();
  const next = sanitizeConfig(raw);
  const { error } = await sb.from("loyalty_settings").upsert({ id: "default", config: next, updated_at: new Date().toISOString() });
  if (error) throw error;
  await audit({ actor, action: "settings", reason, before, after: next });
  return next;
}

/* ---------------------------------------------------------------- mappers */
const mapCustomer = (r: any): LoyaltyCustomer => ({
  id: r.id, code: r.code, phone: r.phone, name: r.name ?? "", email: r.email ?? "",
  birthday: r.birthday ?? "", anniversary: r.anniversary ?? "", status: r.status, consent: !!r.consent,
  whatsapp: r.whatsapp ?? "", referralCode: "", referredBy: null, walletToken: "", tier: "member", tierSince: 0,
  available: num(r.available), lifetime: num(r.lifetime), redeemed: num(r.redeemed), expired: num(r.expired), debt: 0, stamps: 0,
  note: r.note ?? "", createdAt: ms(r.created_at), updatedAt: ms(r.updated_at),
});

const mapLedger = (r: any): LedgerEntry => ({
  id: String(r.id), customerId: r.customer_id, type: r.type, points: num(r.points),
  balanceBefore: num(r.balance_before), balanceAfter: num(r.balance_after), billId: r.order_id ?? null, invoiceNo: r.order_id ?? null,
  ref: "", key: null, description: r.description ?? "", expiresAt: null, actor: r.actor ?? "", reversalOf: null, createdAt: ms(r.created_at),
});

const mapMessage = (r: any): LoyaltyMessage => ({
  id: r.id, customerId: r.customer_id, type: r.type, phone: r.phone, text: r.text, status: r.status, error: r.error ?? "",
  billId: r.order_id ?? null, createdAt: ms(r.created_at), openedAt: r.opened_at ? ms(r.opened_at) : null, opens: num(r.opens),
});

const docOf = <T extends { id: string }>(r: any): T => ({ ...(r.data as T), id: r.id });

/* ---------------------------------------------------------------- messages */
async function prepareMessage(cfg: LoyaltyConfig, type: MessageKey, c: LoyaltyCustomer, vars: Record<string, string | number | null | undefined>, orderId?: string | null) {
  if (!cfg.enabled || !cfg.messages.enabled || !cfg.messages.events[type] || !c.consent) return;
  const shopName = (await getShopSettings()).shopName;
  const text = fillMessage(cfg.messages.templates[type], {
    name: c.name || "there", shop: shopName, date: new Date().toLocaleDateString("en-IN"),
    balance: c.available, bill: orderId ?? "", wallet: "", ...vars,
  });
  const { error } = await sb.from("loyalty_messages").insert({
    customer_id: c.id, type, phone: last10(c.whatsapp || c.phone), text, order_id: orderId ?? null,
  });
  if (error) console.error("message failed:", error.message);
}

/* ---------------------------------------------------------------- state for the admin page */
export type LoyaltyData = LoyaltyState & {
  stats: Record<string, PurchaseStats>;
  segments: Record<string, Segment | null>;
  purchases: Record<string, { id: string; total: number; createdAt: number }[]>;
  products: { id: string; name: string; category: string }[];
  categories: string[];
  shopName: string;
};

async function allOrders() {
  const { data } = await sb.from("orders").select("id, customer_phone, grand_total, created_at, status").order("created_at", { ascending: false }).limit(20000);
  return (data ?? []).map((o: any) => ({ id: o.id as string, phone: phoneOfOrder(o.customer_phone), total: num(o.grand_total), createdAt: ms(o.created_at), status: (o.status === "COMPLETED" ? "completed" : "pending") as string }));
}

export async function loadState(): Promise<LoyaltyData> {
  const [config, cust, rew, off, vou, msg, led, aud, prod, orders] = await Promise.all([
    getConfig(),
    sb.from("loyalty_customers").select("*").order("created_at", { ascending: false }),
    sb.from("loyalty_rewards").select("*").order("created_at", { ascending: true }),
    sb.from("loyalty_offers").select("*").order("created_at", { ascending: true }),
    sb.from("loyalty_vouchers").select("*").order("created_at", { ascending: false }).limit(5000),
    sb.from("loyalty_messages").select("*").order("created_at", { ascending: false }).limit(300),
    sb.from("loyalty_ledger").select("customer_id, type, points, created_at").order("created_at", { ascending: false }).limit(20000),
    sb.from("loyalty_audit").select("*").order("created_at", { ascending: false }).limit(100),
    sb.from("products").select("id, name, category").order("name"),
    allOrders(),
  ]);
  for (const r of [cust, rew, off, vou, msg, led, aud, prod]) if (r.error) throw r.error;

  const customers = (cust.data ?? []).map(mapCustomer);
  const rewards = (rew.data ?? []).map((r: any) => docOf<Reward>(r));
  const offers = (off.data ?? []).map((r: any) => docOf<GiftOffer>(r));
  const vouchers = (vou.data ?? []).map((r: any) => ({ ...(r.data as Voucher), id: r.id, customerId: r.customer_id, status: r.status }) as Voucher);

  // purchases, stats and segments per member (from the bills with their mobile)
  const byPhone = new Map<string, typeof orders>();
  for (const o of orders) if (o.phone) (byPhone.get(o.phone) ?? byPhone.set(o.phone, []).get(o.phone)!).push(o);
  const stats: LoyaltyData["stats"] = {};
  const segments: LoyaltyData["segments"] = {};
  const purchases: LoyaltyData["purchases"] = {};
  const spend: LoyaltyState["spend"] = {};
  const now = Date.now();
  for (const c of customers) {
    const list = byPhone.get(c.phone) ?? [];
    stats[c.id] = statsFrom(list, config.crm.frequentDays, now);
    segments[c.id] = segmentOf(stats[c.id], config, c.tier, now);
    purchases[c.id] = list.filter((o) => o.status === "completed").map((o) => ({ id: o.id, total: o.total, createdAt: o.createdAt }));
    spend[c.id] = stats[c.id].spent;
  }

  const ledger = led.data ?? [];
  let earned = 0;
  let redeemed = 0;
  const monthMap = new Map<string, { earned: number; redeemed: number }>();
  for (const l of ledger as any[]) {
    const p = num(l.points);
    const m = new Date(l.created_at).toISOString().slice(0, 7);
    const row = monthMap.get(m) ?? { earned: 0, redeemed: 0 };
    if (l.type === "purchase" || l.type === "bonus" || (l.type === "adjustment" && p > 0)) { earned += p; row.earned += p; }
    if (l.type === "redemption" || l.type === "reward" || (l.type === "adjustment" && p < 0)) { redeemed += -p; row.redeemed += -p; }
    monthMap.set(m, row);
  }
  const months = [...monthMap.entries()].sort().slice(-6).map(([month, v]) => ({ month, ...v }));
  const giftsGiven = vouchers.filter((v) => v.status === "used").reduce((a, v) => a + (v.giftQty || 1), 0);

  const cats = new Set<string>();
  for (const p of prod.data ?? []) if ((p as any).category) cats.add((p as any).category);

  return {
    config, customers, rewards, offers, vouchers,
    audit: (aud.data ?? []).map((a: any): Audit => ({ id: String(a.id), actor: a.actor, action: a.action, customerId: a.customer_id, ref: "", before: a.before, after: a.after, reason: a.reason, createdAt: ms(a.created_at) })),
    messages: (msg.data ?? []).map(mapMessage),
    spend, rewardSpend: {},
    totals: { earned, redeemed, outstanding: customers.reduce((a, c) => a + c.available, 0), giftsGiven },
    mismatched: [], months, expiring: {},
    stats, segments, purchases,
    products: (prod.data ?? []).map((p: any) => ({ id: p.id, name: p.name, category: p.category ?? "General" })),
    categories: [...cats].sort(),
    shopName: (await getShopSettings()).shopName,
  };
}

export async function listLedger(from?: number, to?: number, customerId?: string, size = 5000): Promise<LedgerEntry[]> {
  let q = sb.from("loyalty_ledger").select("*").order("created_at", { ascending: false }).limit(size);
  if (from) q = q.gte("created_at", new Date(from).toISOString());
  if (to) q = q.lte("created_at", new Date(to).toISOString());
  if (customerId) q = q.eq("customer_id", customerId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(mapLedger);
}

/* ---------------------------------------------------------------- customers */
export type CustomerInput = { phone: string; name?: string; email?: string; birthday?: string; anniversary?: string; consent?: boolean; whatsapp?: string; note?: string };

export async function registerCustomer(input: CustomerInput, actor: string): Promise<LoyaltyCustomer> {
  const phone = last10(input.phone);
  if (!/^[6-9]\d{9}$/.test(phone)) throw new Error("Enter a valid 10-digit mobile number.");
  const cfg = await getConfig();
  const { data: ex } = await sb.from("loyalty_customers").select("id").eq("phone", phone).maybeSingle();
  if (ex) throw new Error("That mobile number is already a loyalty customer.");
  const { data, error } = await sb.from("loyalty_customers").insert({
    code: codeGen(), phone, name: (input.name ?? "").trim().slice(0, 60), email: (input.email ?? "").trim().slice(0, 80),
    birthday: input.birthday ?? "", anniversary: input.anniversary ?? "", consent: input.consent ?? cfg.display.defaultConsent,
    whatsapp: last10(input.whatsapp ?? ""), note: (input.note ?? "").slice(0, 300),
  }).select("*").single();
  if (error) throw error;
  const c = mapCustomer(data);
  await audit({ actor, action: "register", customerId: c.id, after: c });
  await prepareMessage(cfg, "enrol", c, {});
  return c;
}

export async function updateCustomer(id: string, p: Partial<CustomerInput>, actor: string): Promise<LoyaltyCustomer> {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (p.name !== undefined) patch.name = p.name.trim().slice(0, 60);
  if (p.email !== undefined) patch.email = p.email.trim().slice(0, 80);
  if (p.birthday !== undefined) patch.birthday = p.birthday;
  if (p.anniversary !== undefined) patch.anniversary = p.anniversary;
  if (p.consent !== undefined) patch.consent = p.consent;
  if (p.whatsapp !== undefined) patch.whatsapp = last10(p.whatsapp);
  if (p.note !== undefined) patch.note = p.note.slice(0, 300);
  if (p.phone !== undefined) {
    const ph = last10(p.phone);
    if (!/^[6-9]\d{9}$/.test(ph)) throw new Error("Enter a valid 10-digit mobile number.");
    patch.phone = ph;
  }
  const { data, error } = await sb.from("loyalty_customers").update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(error.code === "23505" ? "That mobile number belongs to another customer." : error.message);
  await audit({ actor, action: "update", customerId: id, after: patch });
  return mapCustomer(data);
}

export async function setCustomerStatus(id: string, status: "active" | "inactive", actor: string) {
  const { error } = await sb.from("loyalty_customers").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
  await audit({ actor, action: status === "active" ? "reactivate" : "deactivate", customerId: id });
}

export async function deleteCustomer(id: string, actor: string) {
  const { error } = await sb.from("loyalty_customers").delete().eq("id", id);
  if (error) throw error;
  await audit({ actor, action: "delete", customerId: id });
}

export async function adjustPoints(id: string, points: number, reason: string, actor: string): Promise<number> {
  const p = Math.round(points);
  if (!p) throw new Error("Enter the number of points to add or remove.");
  if (!reason.trim()) throw new Error("Give a reason — it is kept in the history.");
  const { data, error } = await sb.rpc("loyalty_apply", { p_customer: id, p_type: "adjustment", p_points: p, p_order: null, p_desc: reason.trim(), p_actor: actor });
  if (error) throw new Error(error.message);
  const cfg = await getConfig();
  const { data: row } = await sb.from("loyalty_customers").select("*").eq("id", id).single();
  if (row) {
    const c = mapCustomer(row);
    await prepareMessage(cfg, "adjust", c, { points: (p > 0 ? "+" : "") + p, reason: reason.trim() });
    await refreshUnlocks(c, cfg);
  }
  return Number(data);
}

/* ---------------------------------------------------------------- rewards, offers */
export async function saveReward(r: Partial<Reward> & { name: string }): Promise<Reward> {
  const doc = {
    name: r.name.trim().slice(0, 80), description: r.description ?? "", imageUrl: "", category: "", kind: "free_item", value: 0,
    productId: r.productId ?? null, pointsCost: Math.max(0, Math.round(r.pointsCost ?? 0)), trigger: r.trigger ?? "points",
    milestoneAmount: Math.max(0, r.milestoneAmount ?? 0), giftQty: Math.max(1, Math.round(r.giftQty ?? 1)), tiers: [],
    startsOn: null, endsOn: null, active: r.active ?? true, maxRedemptions: null, perCustomerLimit: null, terms: "",
    redeemed: r.redeemed ?? 0, createdAt: r.createdAt ?? Date.now(), updatedAt: Date.now(),
  };
  if (!doc.name) throw new Error("Give the gift a name.");
  if (!doc.productId) throw new Error("Pick the menu item that is given free.");
  if (doc.trigger === "points" && doc.pointsCost < 1) throw new Error("Points needed must be at least 1.");
  if (doc.trigger === "milestone" && doc.milestoneAmount < 1) throw new Error("Spending amount must be at least ₹1.");
  const row: Record<string, unknown> = r.id ? { id: r.id, data: doc } : { data: doc };
  const { data, error } = await sb.from("loyalty_rewards").upsert(row).select("*").single();
  if (error) throw error;
  return docOf<Reward>(data);
}
export async function deleteReward(id: string) {
  const { error } = await sb.from("loyalty_rewards").delete().eq("id", id);
  if (error) throw error;
}

export async function saveOffer(o: Partial<GiftOffer> & { name: string }): Promise<GiftOffer> {
  const doc = {
    name: o.name.trim().slice(0, 80), type: o.type === "buy" ? "buy" : "spend", minBill: Math.max(0, o.minBill ?? 0),
    productId: o.productId ?? null, buyQty: Math.max(1, Math.round(o.buyQty ?? 1)), giftProductId: o.giftProductId ?? "",
    giftQty: Math.max(1, Math.round(o.giftQty ?? 1)), repeatable: o.repeatable ?? true, audience: o.audience === "members" ? "members" : "all",
    maxTotal: o.maxTotal ?? null, startsOn: o.startsOn ?? null, endsOn: o.endsOn ?? null, active: o.active ?? true,
    given: o.given ?? 0, createdAt: o.createdAt ?? Date.now(), updatedAt: Date.now(),
  };
  if (!doc.name) throw new Error("Give the offer a name.");
  if (!doc.giftProductId) throw new Error("Pick the menu item that is given free.");
  if (doc.type === "spend" && doc.minBill < 1) throw new Error("Set the bill amount that earns the gift.");
  if (doc.type === "buy" && !doc.productId) throw new Error("Pick the item the customer has to buy.");
  const row: Record<string, unknown> = o.id ? { id: o.id, data: doc } : { data: doc };
  const { data, error } = await sb.from("loyalty_offers").upsert(row).select("*").single();
  if (error) throw error;
  return docOf<GiftOffer>(data);
}
export async function deleteOffer(id: string) {
  const { error } = await sb.from("loyalty_offers").delete().eq("id", id);
  if (error) throw error;
}

/* ---------------------------------------------------------------- vouchers (rewards earned) */
async function newVoucher(c: LoyaltyCustomer, r: Reward, source: VoucherSource, cfg: LoyaltyConfig, key: string) {
  const now = Date.now();
  const days = cfg.gifts.validityDays;
  const doc = {
    ref: "V" + randomBytes(3).toString("hex").toUpperCase(), rewardId: r.id, name: r.name, kind: "free_item", value: 0,
    productId: r.productId, source, pointsCost: source === "points" ? r.pointsCost : 0, giftQty: r.giftQty, billId: null, invoiceNo: null,
    key, issuedAt: now, usedAt: null, expiresAt: source === "milestone" && days > 0 ? now + days * 86_400_000 : null, note: "",
  };
  const { error } = await sb.from("loyalty_vouchers").insert({ customer_id: c.id, reward_id: r.id, status: "issued", data: doc });
  if (error) { console.error("voucher failed:", error.message); return false; }
  return true;
}

/** Unlock gifts the customer has now earned: enough points, or a new spending milestone. Safe to call any time. */
export async function refreshUnlocks(c: LoyaltyCustomer, cfg: LoyaltyConfig) {
  if (!cfg.enabled || c.status !== "active") return;
  const [{ data: rew }, { data: vou }] = await Promise.all([
    sb.from("loyalty_rewards").select("*"),
    sb.from("loyalty_vouchers").select("id, reward_id, status, data").eq("customer_id", c.id),
  ]);
  const rewards = (rew ?? []).map((r: any) => docOf<Reward>(r)).filter((r) => r.active);
  const own = vou ?? [];
  let spent: number | null = null;
  for (const r of rewards) {
    if (r.trigger === "points" && cfg.gifts.points) {
      const open = own.some((v: any) => v.reward_id === r.id && v.status === "issued");
      if (!open && r.pointsCost > 0 && c.available >= r.pointsCost) {
        if (await newVoucher(c, r, "points", cfg, `pts:${r.id}:${Date.now()}`)) await prepareMessage(cfg, "unlock", c, { reward: r.name });
      }
    }
    if (r.trigger === "milestone" && cfg.gifts.milestone && r.milestoneAmount > 0) {
      if (spent === null) {
        const orders = (await allOrders()).filter((o) => o.phone === c.phone && o.status === "completed");
        spent = orders.reduce((a, o) => a + o.total, 0);
        (c as any)._orders = orders;
      }
      const orders: { total: number; createdAt: number }[] = (c as any)._orders ?? [];
      const counted = cfg.gifts.countOldBills ? orders : orders.filter((o) => o.createdAt >= r.createdAt);
      const total = counted.reduce((a, o) => a + o.total, 0);
      const reached = Math.floor(total / r.milestoneAmount + 1e-9);
      const have = own.filter((v: any) => v.reward_id === r.id && (v.data?.source === "milestone")).length;
      for (let k = have; k < reached; k++) {
        if (await newVoucher(c, r, "milestone", cfg, `ms:${r.id}:${k + 1}`)) await prepareMessage(cfg, "milestone", c, { reward: r.name, amount: `₹${r.milestoneAmount * (k + 1)}` });
      }
    }
  }
}

export async function cancelVoucher(id: string, actor: string) {
  const { error } = await sb.from("loyalty_vouchers").update({ status: "cancelled" }).eq("id", id).eq("status", "issued");
  if (error) throw error;
  await audit({ actor, action: "voucher.cancel", reason: id });
}

/* ---------------------------------------------------------------- messages */
export async function openMessage(id: string) {
  const { data } = await sb.from("loyalty_messages").select("opens").eq("id", id).maybeSingle();
  const { error } = await sb.from("loyalty_messages").update({ status: "opened", opened_at: new Date().toISOString(), opens: num(data?.opens) + 1 }).eq("id", id);
  if (error) throw error;
}
export async function retryMessage(id: string) {
  const { error } = await sb.from("loyalty_messages").update({ status: "pending", error: "" }).eq("id", id);
  if (error) throw error;
}

/* ---------------------------------------------------------------- billing */
export async function lookupMember(phoneRaw: string): Promise<LoyaltyLookup & { products: { id: string; name: string; category: string }[] }> {
  const config = await getConfig();
  const phone = last10(phoneRaw);
  const { data: prod } = await sb.from("products").select("id, name, category");
  const products = (prod ?? []).map((p: any) => ({ id: p.id, name: p.name, category: p.category ?? "General" }));
  const empty = { enabled: config.enabled, config, customer: null, knownName: "", vouchers: [], rewards: [], offers: [], spendRewards: [], firstPurchase: false, products };
  if (!config.enabled || phone.length !== 10) return empty;
  const { data } = await sb.from("loyalty_customers").select("*").eq("phone", phone).maybeSingle();
  if (!data) return empty;
  const customer = mapCustomer(data);
  const [{ data: vou }, { data: rew }, { data: off }] = await Promise.all([
    sb.from("loyalty_vouchers").select("*").eq("customer_id", customer.id).eq("status", "issued"),
    sb.from("loyalty_rewards").select("*"),
    sb.from("loyalty_offers").select("*"),
  ]);
  const now = Date.now();
  const vouchers = (vou ?? []).map((r: any) => ({ ...(r.data as Voucher), id: r.id, customerId: r.customer_id, status: r.status }) as Voucher).filter((v) => !v.expiresAt || v.expiresAt >= now);
  const rewards = (rew ?? []).map((r: any) => docOf<Reward>(r));
  const offers = (off ?? []).map((r: any) => docOf<GiftOffer>(r)).filter((o) => o.active && config.gifts.offers);
  return { ...empty, customer: customer.status === "active" ? customer : null, vouchers, rewards: [], offers, spendRewards: rewards.filter((r) => r.active && r.trigger === "milestone").map((r) => ({ id: r.id, name: r.name, giftQty: r.giftQty, productId: r.productId, amount: r.milestoneAmount, progress: 0 })) };
}

export type SettleInput = {
  orderId: string;
  phone: string;
  /** points the cashier applied as a discount */
  pointsUsed: number;
  /** vouchers handed over as free ₹0 lines on this bill */
  voucherIds: string[];
};

/** After a bill is saved: take the points used, give the points earned, mark gifts claimed, prepare messages. The server recomputes everything. */
export async function settleOrder(s: SettleInput, actor: string): Promise<{ earned: number; used: number; balance: number } | null> {
  const cfg = await getConfig();
  if (!cfg.enabled) return null;
  const phone = last10(s.phone);
  const { data: row } = await sb.from("loyalty_customers").select("*").eq("phone", phone).maybeSingle();
  if (!row || row.status !== "active") return null;
  let c = mapCustomer(row);
  const prev = c.available;

  const { data: ord } = await sb.from("orders").select("id, subtotal, discount_amount, order_items(snapshot_name, snapshot_price, quantity)").eq("id", s.orderId).maybeSingle();
  if (!ord) return null;
  const { data: prod } = await sb.from("products").select("id, name, category");
  const byName = new Map((prod ?? []).map((p: any) => [String(p.name).toLowerCase(), p]));
  const items = ((ord as any).order_items ?? [])
    .filter((i: any) => !/^GST \(/.test(i.snapshot_name))
    .map((i: any) => {
      const p: any = byName.get(String(i.snapshot_name).toLowerCase());
      return { productId: p?.id ?? null, name: i.snapshot_name, price: num(i.snapshot_price), qty: num(i.quantity), free: num(i.snapshot_price) === 0 };
    });
  const catOf = (id: string | null) => (prod ?? []).find((p: any) => p.id === id)?.category ?? "";
  const subtotal = num((ord as any).subtotal);
  const discount = num((ord as any).discount_amount);

  // points used (the discount already sits in the bill; here we just take the points)
  let used = 0;
  if (s.pointsUsed > 0) {
    const pts = Math.min(Math.floor(s.pointsUsed), c.available);
    if (pts > 0) {
      const { error } = await sb.rpc("loyalty_apply", { p_customer: c.id, p_type: "redemption", p_points: -pts, p_order: s.orderId, p_desc: `Used on bill ${s.orderId}`, p_actor: actor });
      if (error) console.error("redeem failed:", error.message); else used = pts;
    }
  }

  // free gifts handed over
  for (const vid of s.voucherIds ?? []) {
    const { data: v } = await sb.from("loyalty_vouchers").select("*").eq("id", vid).eq("customer_id", c.id).eq("status", "issued").maybeSingle();
    if (!v) continue;
    const d = v.data as Voucher;
    if (d.pointsCost > 0) {
      const { error } = await sb.rpc("loyalty_apply", { p_customer: c.id, p_type: "reward", p_points: -d.pointsCost, p_order: s.orderId, p_desc: `Free gift: ${d.name}`, p_actor: actor });
      if (error) { console.error("gift points failed:", error.message); continue; }
    }
    await sb.from("loyalty_vouchers").update({ status: "used", data: { ...d, billId: s.orderId, invoiceNo: s.orderId, usedAt: Date.now() } }).eq("id", vid);
    c = { ...c };
    await prepareMessage(cfg, "claimed", c, { reward: d.name, quantity: d.giftQty }, s.orderId);
  }

  // points earned: on what was actually paid for eligible items, after every discount
  const e = earnFor({ cfg, items, catOf, subtotal, discount: discount, tier: c.tier, firstPurchase: false, campaigns: [] });
  let earned = 0;
  if (e.total > 0) {
    const { error } = await sb.rpc("loyalty_apply", { p_customer: c.id, p_type: "purchase", p_points: e.total, p_order: s.orderId, p_desc: e.parts[0]?.label ?? "Purchase", p_actor: actor });
    if (error) console.error("earn failed:", error.message); else earned = e.total;
  }

  const { data: fresh } = await sb.from("loyalty_customers").select("*").eq("id", c.id).single();
  const after = mapCustomer(fresh);
  await sb.from("orders").update({
    loyalty_customer_id: c.id, loyalty_prev: prev, loyalty_earned: earned, loyalty_used: used, loyalty_balance: after.available,
    loyalty_discount: used > 0 ? pointsValue(used, cfg) : 0,
  }).eq("id", s.orderId);
  if (earned > 0) await prepareMessage(cfg, "earned", after, { points: earned }, s.orderId);
  if (used > 0) await prepareMessage(cfg, "redeemed", after, { points: used, discount: pointsValue(used, cfg) }, s.orderId);
  await refreshUnlocks(after, cfg);
  return { earned, used, balance: after.available };
}

/** Loyalty summary for a bill (printed on the invoice). */
export async function orderLoyalty(orderId: string) {
  const { data } = await sb.from("orders").select("loyalty_customer_id, loyalty_prev, loyalty_earned, loyalty_used, loyalty_balance").eq("id", orderId).maybeSingle();
  if (!data || !data.loyalty_customer_id) return null;
  return { prev: num(data.loyalty_prev), earned: num(data.loyalty_earned), used: num(data.loyalty_used), balance: num(data.loyalty_balance) };
}

/* ---------------------------------------------------------------- phone suggestions (billing) */
export type CustomerSuggestion = { phone: string; name: string; source: "loyalty" | "bill"; points: number | null };

/** Numbers that start with (or contain) what was typed, from loyalty members and earlier bills. */
export async function suggestCustomers(q: string): Promise<CustomerSuggestion[]> {
  const digits = String(q ?? "").replace(/\D/g, "").slice(0, 10);
  if (digits.length < 2) return [];
  const [{ data: mem }, { data: ord }] = await Promise.all([
    sb.from("loyalty_customers").select("phone, name, available, status").like("phone", `%${digits}%`).limit(10),
    sb.from("orders").select("customer_phone, customer_name, created_at").like("customer_phone", `%${digits}%`).order("created_at", { ascending: false }).limit(60),
  ]);
  const out = new Map<string, CustomerSuggestion>();
  for (const m of (mem ?? []) as any[]) {
    if (m.status !== "active") continue;
    out.set(m.phone, { phone: m.phone, name: m.name ?? "", source: "loyalty", points: num(m.available) });
  }
  for (const o of (ord ?? []) as any[]) {
    const p = phoneOfOrder(o.customer_phone);
    if (p.length !== 10 || !p.includes(digits)) continue;
    const ex = out.get(p);
    if (ex) { if (!ex.name && o.customer_name && o.customer_name !== "Guest") ex.name = o.customer_name; continue; }
    out.set(p, { phone: p, name: o.customer_name && o.customer_name !== "Guest" ? o.customer_name : "", source: "bill", points: null });
  }
  return [...out.values()]
    .sort((a, b) => Number(b.phone.startsWith(digits)) - Number(a.phone.startsWith(digits)) || a.phone.localeCompare(b.phone))
    .slice(0, 8);
}


/* ---------------------------------------------------------------- bill offers (for any customer) */
/** The shop's live offers on the bill. Billing works out which of them a bill qualifies for. */
export async function listLiveOffers(): Promise<GiftOffer[]> {
  const cfg = await getConfig();
  if (!cfg.enabled || !cfg.gifts.offers) return [];
  const { data } = await sb.from("loyalty_offers").select("*");
  return (data ?? []).map((r: any) => docOf<GiftOffer>(r)).filter((o) => offerLive(o));
}

/** Counts gifts handed over through offers, so offers with a total limit run out. */
export async function recordOffersGiven(given: { offerId: string; qty: number }[]) {
  for (const g of given) {
    const { data } = await sb.from("loyalty_offers").select("data").eq("id", g.offerId).maybeSingle();
    if (!data) continue;
    const doc = data.data as GiftOffer;
    await sb.from("loyalty_offers").update({ data: { ...doc, given: (doc.given ?? 0) + Math.max(0, Math.round(g.qty)) } }).eq("id", g.offerId);
  }
}
