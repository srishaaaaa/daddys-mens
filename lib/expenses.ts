import "server-only";
import { supabaseAdmin as sb } from "@/lib/supabase";

export type Expense = {
  id: string;
  title: string;
  category: string;
  amount: number;
  payment_mode: string; // CASH | UPI | CARD | BANK | OTHER
  notes: string | null;
  expense_date: string; // yyyy-mm-dd
  created_at: string;
};
export type ExpenseCategory = { id: string; name: string; is_active: boolean };
export type ExpenseInput = {
  title: string;
  category: string;
  amount: number;
  payment_mode: string;
  notes: string | null;
  expense_date: string;
};

const MODES = ["CASH", "UPI", "CARD", "BANK", "OTHER"];
const map = (r: any): Expense => ({
  id: r.id, title: r.title, category: r.category, amount: Number(r.amount) || 0,
  payment_mode: r.payment_mode, notes: r.notes ?? null,
  expense_date: r.expense_date instanceof Date ? r.expense_date.toISOString().slice(0, 10) : String(r.expense_date).slice(0, 10),
  created_at: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at,
});

function clean(i: ExpenseInput) {
  const title = String(i.title ?? "").trim().slice(0, 120);
  const amount = Math.round(Number(i.amount) * 100) / 100;
  if (!title) throw new Error("Please enter what the expense was for.");
  if (!(amount > 0 && amount <= 100_000_000)) throw new Error("Please enter a valid amount greater than 0.");
  return {
    title, amount,
    category: String(i.category ?? "").trim().slice(0, 60) || "General",
    payment_mode: MODES.includes(i.payment_mode) ? i.payment_mode : "OTHER",
    notes: i.notes ? String(i.notes).trim().slice(0, 300) || null : null,
    expense_date: /^\d{4}-\d{2}-\d{2}$/.test(i.expense_date) ? i.expense_date : new Date().toISOString().slice(0, 10),
  };
}

export async function listExpenses(): Promise<Expense[]> {
  const { data, error } = await sb.from("expenses").select("*").order("expense_date", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(map);
}
export async function createExpense(i: ExpenseInput): Promise<Expense> {
  const { data, error } = await sb.from("expenses").insert(clean(i)).select("*").single();
  if (error) throw error;
  return map(data);
}
export async function updateExpense(id: string, i: ExpenseInput): Promise<Expense | null> {
  const { data, error } = await sb.from("expenses").update(clean(i)).eq("id", id).select("*").maybeSingle();
  if (error) throw error;
  return data ? map(data) : null;
}
export async function deleteExpense(id: string): Promise<void> {
  const { error } = await sb.from("expenses").delete().eq("id", id);
  if (error) throw error;
}

export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  const { data, error } = await sb.from("expense_categories").select("id, name, is_active");
  if (error) throw error;
  return ((data ?? []) as ExpenseCategory[]).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}
/** Returns an error message when a category with this name (any letter case) already exists. */
export async function createExpenseCategory(raw: string): Promise<{ ok: true; category: ExpenseCategory } | { ok: false; error: string }> {
  const name = String(raw ?? "").trim().slice(0, 60);
  if (!name) return { ok: false, error: "Enter a category name." };
  const { data, error } = await sb.from("expense_categories").insert({ name }).select("id, name, is_active").single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "That category already exists." };
    throw error;
  }
  return { ok: true, category: data as ExpenseCategory };
}
export async function setExpenseCategoryActive(id: string, active: boolean): Promise<boolean> {
  const { data, error } = await sb.from("expense_categories").update({ is_active: active }).eq("id", id).select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}
/** Expenses already filed under it keep the name. */
export async function deleteExpenseCategory(id: string): Promise<void> {
  const { error } = await sb.from("expense_categories").delete().eq("id", id);
  if (error) throw error;
}
