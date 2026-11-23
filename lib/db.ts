import "server-only";
import { supabaseAdmin as sb } from "@/lib/supabase";

// ── Types ─────────────────────────────────────────────────────────
export type StoredProduct = {
  id: string;
  name: string;
  description: string;
  default_price: number;
};

export type StoredOrderItem = {
  snapshot_name: string;
  snapshot_desc: string;
  snapshot_price: number;
  quantity: number;
};

export type StoredOrder = {
  id: string;
  customer_name: string;
  customer_phone: string;
  source: "ONLINE" | "OFFLINE";
  status: "COMPLETED" | "PENDING";
  subtotal: number;
  discount_type: "PERCENT" | "FIXED";
  discount_value: number;
  discount_amount: number;
  delivery_fee: number;
  grand_total: number;
  cash_received: number;
  created_at: string;
  /** How a UPI payment reached the shop (counter_qr, whatsapp_link, ...). Needs migration 0004. */
  upi_channel?: string | null;
  order_items: StoredOrderItem[];
};

const num = (v: unknown) => Number(v ?? 0); // defensive: coerce numeric/int8 to JS number

// ── Products ──────────────────────────────────────────────────────
export async function getProducts(): Promise<StoredProduct[]> {
  const { data, error } = await sb
    .from("products")
    .select("id, name, description, default_price")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("Error fetching products from DB:", error);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    default_price: num(r.default_price),
  }));
}

export async function addProduct(input: Omit<StoredProduct, "id">): Promise<StoredProduct> {
  const { data, error } = await sb
    .from("products")
    .insert({
      name: input.name,
      description: input.description,
      default_price: input.default_price,
    })
    .select("id, name, description, default_price")
    .single();
  if (error) throw error;
  return {
    id: data.id,
    name: data.name,
    description: data.description,
    default_price: num(data.default_price),
  };
}

export async function updateProduct(
  id: string,
  input: Omit<StoredProduct, "id">,
): Promise<StoredProduct | null> {
  const { data, error } = await sb
    .from("products")
    .update({
      name: input.name,
      description: input.description,
      default_price: input.default_price,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("id, name, description, default_price")
    .maybeSingle();
  if (error) throw error;
  return data
    ? {
        id: data.id,
        name: data.name,
        description: data.description,
        default_price: num(data.default_price),
      }
    : null;
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await sb.from("products").delete().eq("id", id);
  if (error) throw error;
}

// ── Orders ────────────────────────────────────────────────────────
const ORDER_SELECT = `
  id, customer_name, customer_phone, source, status, subtotal,
  discount_type, discount_value, discount_amount, delivery_fee,
  grand_total, cash_received, created_at,
  order_items ( snapshot_name, snapshot_desc, snapshot_price, quantity, position )`;

const mapOrder = (o: any): StoredOrder => ({
  id: o.id,
  customer_name: o.customer_name || "Guest",
  customer_phone: o.customer_phone || "",
  source: o.source,
  status: o.status,
  subtotal: num(o.subtotal),
  discount_type: o.discount_type,
  discount_value: num(o.discount_value),
  discount_amount: num(o.discount_amount),
  delivery_fee: num(o.delivery_fee),
  grand_total: num(o.grand_total),
  cash_received: num(o.cash_received),
  created_at: new Date(o.created_at).toISOString(),
  order_items: [...(o.order_items ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((i: any) => ({
      snapshot_name: i.snapshot_name,
      snapshot_desc: i.snapshot_desc || "",
      snapshot_price: num(i.snapshot_price),
      quantity: Number(i.quantity),
    })),
});

export async function getOrders(): Promise<StoredOrder[]> {
  const { data, error } = await sb
    .from("orders")
    .select(ORDER_SELECT)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Error fetching orders from DB:", error);
    return [];
  }
  return (data ?? []).map(mapOrder);
}

export async function getOrder(id: string): Promise<StoredOrder | null> {
  const { data, error } = await sb
    .from("orders")
    .select(ORDER_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error(`Error fetching order ${id} from DB:`, error);
    return null;
  }
  if (!data) return null;
  const order = mapOrder(data);
  // Read separately so the invoice still works before migration 0004 is applied.
  const { data: ch } = await sb.from("orders").select("upi_channel").eq("id", id).maybeSingle();
  order.upi_channel = (ch as { upi_channel?: string | null } | null)?.upi_channel ?? null;
  return order;
}

export async function orderExists(id: string): Promise<boolean> {
  const { data, error } = await sb
    .from("orders")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (error) return false;
  return Boolean(data);
}

export async function saveOrder(order: StoredOrder): Promise<void> {
  // Atomic via the SQL RPC function (order + items in one transaction).
  const isNew = !(await orderExists(order.id));
  const { error } = await sb.rpc("create_order", { payload: order });
  if (error) throw error;
  if (order.upi_channel) {
    const { error: chErr } = await sb.from("orders").update({ upi_channel: order.upi_channel }).eq("id", order.id);
    if (chErr) console.error("Could not save the UPI channel (is migration 0004 applied?):", chErr.message);
  }
  // Deduct stock only the first time a bill is saved (saves are upserts).
  if (isNew) {
    const { error: stockErr } = await sb.rpc("record_sale_stock", {
      p_order_id: order.id,
      p_items: order.order_items,
    });
    if (stockErr) console.error("Stock deduction failed (is migration 0002 applied?):", stockErr.message);
  }
}

export async function deleteOrder(id: string): Promise<void> {
  // order_items is ON DELETE CASCADE, so this clears the invoice everywhere.
  const { error } = await sb.from("orders").delete().eq("id", id);
  if (error) throw error;
}
