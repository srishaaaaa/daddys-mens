"use server";

import { requireAdmin } from "@/lib/auth";
import * as ex from "@/lib/expenses";
import type { ExpenseInput } from "@/lib/expenses";

export async function listExpensesAction() { await requireAdmin(); return ex.listExpenses(); }
export async function createExpenseAction(i: ExpenseInput) { await requireAdmin(); return ex.createExpense(i); }
export async function updateExpenseAction(id: string, i: ExpenseInput) { await requireAdmin(); return ex.updateExpense(id, i); }
export async function deleteExpenseAction(id: string) { await requireAdmin(); return ex.deleteExpense(id); }
export async function listExpenseCategoriesAction() { await requireAdmin(); return ex.listExpenseCategories(); }
export async function createExpenseCategoryAction(name: string) { await requireAdmin(); return ex.createExpenseCategory(name); }
export async function setExpenseCategoryActiveAction(id: string, active: boolean) { await requireAdmin(); return ex.setExpenseCategoryActive(id, active); }
export async function deleteExpenseCategoryAction(id: string) { await requireAdmin(); return ex.deleteExpenseCategory(id); }
