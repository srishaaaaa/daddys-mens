"use server";

import { requireAdmin } from "@/lib/auth";
import * as inv from "@/lib/inventory";
import type { InventoryInput, StockAdjustType } from "@/lib/inventory";

export async function listInventoryAction() {
  await requireAdmin();
  return inv.listInventory();
}
export async function createInventoryItemAction(input: InventoryInput) {
  await requireAdmin();
  return inv.createInventoryItem(input);
}
export async function updateInventoryItemAction(id: string, input: InventoryInput) {
  await requireAdmin();
  return inv.updateInventoryItem(id, input);
}
export async function deleteInventoryItemAction(id: string) {
  await requireAdmin();
  return inv.deleteInventoryItem(id);
}
export async function adjustProductStockAction(
  id: string,
  data: { type: StockAdjustType; newStock: number; lowStockAlert?: number | null; note?: string | null },
) {
  await requireAdmin();
  return inv.adjustProductStock(id, data);
}
export async function listCategoriesAction() {
  await requireAdmin();
  return inv.listCategories();
}
export async function addCategoryAction(name: string) {
  await requireAdmin();
  return inv.addCategory(name);
}
export async function renameCategoryAction(oldName: string, newName: string) {
  await requireAdmin();
  return inv.renameCategory(oldName, newName);
}
export async function deleteCategoryAction(name: string) {
  await requireAdmin();
  return inv.deleteCategory(name);
}
export async function listStockMovementsAction() {
  await requireAdmin();
  return inv.listStockMovements();
}
