import "server-only";
import { supabaseAdmin as sb } from "@/lib/supabase";

export type ItemType = "PRODUCT" | "SERVICE";
export type StockMovementType =
  | "OPENING" | "RESTOCK" | "RETURN" | "SALE" | "LOSS" | "RECONCILE" | "EDIT";
export type StockAdjustType = "RESTOCK" | "RETURN" | "LOSS" | "RECONCILE";
const ADJUST_TYPES: StockMovementType[] = ["RESTOCK", "RETURN", "LOSS", "RECONCILE"];

export type InventoryItem = {
  id: string;
  name: string;
  description: string;
  category: string;
  item_type: ItemType;
  selling_price: number;
  cost_price: number;
  current_stock: number | null;
  low_stock_alert: number | null;
  offer_discount_pct: number;
  offer_price: number | null;
  is_active: boolean;
};

export type InventoryInput = Omit<InventoryItem, "id">;

export type StockMovement = {
  id: number;
  product_id: string | null;
  product_name: string;
  movement_type: StockMovementType;
  quantity: number;
  stock_before: number;
  stock_after: number;
  note: string;
  reference: string;
  created_at: string;
};

const num = (v: unknown) => Number(v ?? 0);
const numOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

const COLS =
  "id, name, description, category, item_type, default_price, cost_price, current_stock, low_stock_alert, offer_discount_pct, offer_price, is_active";

const mapItem = (r: any): InventoryItem => ({
  id: r.id,
  name: r.name,
  description: r.description ?? "",
  category: r.category ?? "General",
  item_type: r.item_type ?? "PRODUCT",
  selling_price: num(r.default_price),
  cost_price: num(r.cost_price),
  current_stock: numOrNull(r.current_stock),
  low_stock_alert: numOrNull(r.low_stock_alert),
  offer_discount_pct: num(r.offer_discount_pct),
  offer_price: numOrNull(r.offer_price),
  is_active: r.is_active ?? true,
});

const toRow = (i: InventoryInput) => {
  const tracked = i.item_type === "PRODUCT";
  return {
    name: i.name.trim(),
    description: i.description.trim(),
    category: i.category.trim() || "General",
    item_type: i.item_type,
    default_price: i.selling_price,
    cost_price: i.cost_price,
    current_stock: tracked ? (i.current_stock ?? 0) : null,
    low_stock_alert: tracked ? (i.low_stock_alert ?? 0) : null,
    offer_discount_pct: i.offer_discount_pct,
    offer_price: i.offer_price,
    is_active: i.is_active,
  };
};

/**
 * Append one row to the movement ledger. Logging must never block the stock
 * change itself, so failures are reported and swallowed. No-op when the count
 * did not actually change.
 */
async function recordMovement(input: {
  productId: string;
  productName: string;
  type: StockMovementType;
  before: number;
  after: number;
  reference?: string | null;
  note?: string | null;
}): Promise<void> {
  const before = Number(input.before) || 0;
  const after = Number(input.after) || 0;
  if (before === after) return;
  try {
    const { error } = await sb.from("stock_movements").insert({
      product_id: input.productId,
      product_name: input.productName,
      movement_type: input.type,
      quantity: after - before,
      stock_before: before,
      stock_after: after,
      reference: input.reference ?? "",
      note: input.note?.trim() || "",
    });
    if (error) throw error;
  } catch (err) {
    console.error(`Failed to record stock movement for ${input.productId}:`, err);
  }
}

async function ensureCategory(name: string) {
  const n = name.trim();
  if (!n) return;
  await sb.from("categories").upsert({ name: n }, { onConflict: "name", ignoreDuplicates: true });
}

// ── Items ─────────────────────────────────────────────────────────
export async function listInventory(): Promise<InventoryItem[]> {
  const { data, error } = await sb.from("products").select(COLS).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapItem);
}

export async function createInventoryItem(input: InventoryInput): Promise<InventoryItem> {
  const row = toRow(input);
  await ensureCategory(row.category);
  const { data, error } = await sb.from("products").insert(row).select(COLS).single();
  if (error) throw error;
  const item = mapItem(data);
  await recordMovement({
    productId: item.id,
    productName: item.name,
    type: "OPENING",
    before: 0,
    after: item.item_type === "PRODUCT" ? Number(item.current_stock) || 0 : 0,
    note: "Opening stock",
  });
  return item;
}

export async function updateInventoryItem(id: string, input: InventoryInput): Promise<InventoryItem | null> {
  const row = toRow(input);
  await ensureCategory(row.category);
  const { data: before } = await sb.from("products").select("current_stock").eq("id", id).maybeSingle();
  const { data, error } = await sb
    .from("products")
    .update({ ...row, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(COLS)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const item = mapItem(data);
  // Changing the stock count in the product form is logged as an EDIT.
  if (item.item_type === "PRODUCT" && item.current_stock !== null) {
    await recordMovement({
      productId: id,
      productName: item.name,
      type: "EDIT",
      before: Number(before?.current_stock) || 0,
      after: Number(item.current_stock) || 0,
    });
  }
  return item;
}

export async function deleteInventoryItem(id: string): Promise<void> {
  const { error } = await sb.from("products").delete().eq("id", id);
  if (error) throw error;
}

/** Stock-adjust dialog: set the new count and log why it changed. */
export async function adjustProductStock(
  id: string,
  data: { type: StockAdjustType; newStock: number; lowStockAlert?: number | null; note?: string | null },
): Promise<InventoryItem | null> {
  if (!ADJUST_TYPES.includes(data.type)) throw new Error(`Invalid adjustment type: ${data.type}`);
  const { data: prev, error: readErr } = await sb
    .from("products")
    .select("item_type, current_stock")
    .eq("id", id)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!prev || prev.item_type !== "PRODUCT") return null;
  const patch: Record<string, unknown> = {
    current_stock: Math.max(0, num(data.newStock)),
    updated_at: new Date().toISOString(),
  };
  if (data.lowStockAlert !== undefined) patch.low_stock_alert = data.lowStockAlert;
  const { data: row, error } = await sb.from("products").update(patch).eq("id", id).select(COLS).maybeSingle();
  if (error) throw error;
  if (!row) return null;
  await recordMovement({
    productId: id,
    productName: row.name,
    type: data.type,
    before: Number(prev.current_stock) || 0,
    after: Number(row.current_stock) || 0,
    note: data.note ?? null,
  });
  return mapItem(row);
}


// ── Categories ────────────────────────────────────────────────────
export async function listCategories(): Promise<string[]> {
  const [{ data: cats }, { data: prods }] = await Promise.all([
    sb.from("categories").select("name").order("name"),
    sb.from("products").select("category"),
  ]);
  const set = new Set<string>();
  (cats ?? []).forEach((c: any) => c.name && set.add(c.name));
  (prods ?? []).forEach((p: any) => p.category && set.add(p.category));
  return [...set].sort((a, b) => a.localeCompare(b));
}

export async function addCategory(name: string): Promise<void> {
  const { error } = await sb.from("categories").upsert({ name: name.trim() }, { onConflict: "name" });
  if (error) throw error;
}

export async function renameCategory(oldName: string, newName: string): Promise<void> {
  const n = newName.trim();
  await ensureCategory(n);
  const { error } = await sb.from("products").update({ category: n }).eq("category", oldName);
  if (error) throw error;
  await sb.from("categories").delete().eq("name", oldName);
}

export async function deleteCategory(name: string): Promise<void> {
  // Products already using the category keep its name.
  const { error } = await sb.from("categories").delete().eq("name", name);
  if (error) throw error;
}

// ── Movements ─────────────────────────────────────────────────────
export async function listStockMovements(): Promise<StockMovement[]> {
  const { data, error } = await sb
    .from("stock_movements")
    .select("id, product_id, product_name, movement_type, quantity, stock_before, stock_after, note, reference, created_at")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data ?? []).map((m: any) => ({
    id: m.id,
    product_id: m.product_id,
    product_name: m.product_name,
    movement_type: m.movement_type,
    quantity: num(m.quantity),
    stock_before: num(m.stock_before),
    stock_after: num(m.stock_after),
    note: m.note ?? "",
    reference: m.reference ?? "",
    created_at: new Date(m.created_at).toISOString(),
  }));
}
