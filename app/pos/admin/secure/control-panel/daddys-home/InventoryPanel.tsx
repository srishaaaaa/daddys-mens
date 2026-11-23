"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Boxes,
  Check,
  CheckCircle2,
  ChevronDown,
  Download,
  History,
  Loader2,
  Minus,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Scissors,
  Search,
  SlidersHorizontal,
  Tag,
  Target,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import type { InventoryItem, ItemType, StockAdjustType } from "@/lib/inventory";
import {
  addCategoryAction,
  adjustProductStockAction,
  createInventoryItemAction,
  deleteCategoryAction,
  deleteInventoryItemAction,
  listCategoriesAction,
  listInventoryAction,
  renameCategoryAction,
  updateInventoryItemAction,
} from "@/app/pos/inventory-actions";
import StockMovementsPanel from "./StockMovementsPanel";
import { productImageToDataUrl } from "@/lib/imageUpload";

// Same shape the reference POS uses for a catalogue row.
type CatalogItem = {
  id: string;
  name: string;
  desc?: string;
  price?: number;
  category?: string;
  itemType: ItemType;
  costPrice?: number;
  stock?: number | null;
  lowStockAlert?: number | null;
  isActive?: boolean;
  imageUrl?: string | null;
};

const toCatalogItem = (p: InventoryItem): CatalogItem => ({
  id: p.id,
  name: p.name,
  desc: p.description,
  price: p.selling_price,
  category: p.category,
  itemType: p.item_type,
  costPrice: p.cost_price,
  stock: p.current_stock,
  lowStockAlert: p.low_stock_alert,
  isActive: p.is_active,
  imageUrl: p.image_url,
});

type NumField = number | "";

// Kept while the app is open, so the tab shows straight away and refreshes quietly.
let inventoryCache: { items: CatalogItem[]; cats: string[] } | null = null;

/** Loads the inventory ahead of time (after sign-in) so the tab opens instantly. */
export async function prefetchInventory() {
  if (inventoryCache) return;
  try {
    const [items, cats] = await Promise.all([listInventoryAction(), listCategoriesAction()]);
    inventoryCache = { items: items.map(toCatalogItem), cats };
  } catch {
    /* the tab shows the error itself if it still fails when opened */
  }
}

export default function InventoryPanel() {
  const [inventoryView, setInventoryView] = useState<"products" | "movements">("products");
  const [catalog, setCatalog] = useState<CatalogItem[]>(inventoryCache?.items ?? []);
  const [categories, setCategories] = useState<string[]>(inventoryCache?.cats ?? []);
  const [loading, setLoading] = useState(!inventoryCache);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inventorySearch, setInventorySearch] = useState("");
  const [expandedProductId, setExpandedProductId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [items, cats] = await Promise.all([listInventoryAction(), listCategoriesAction()]);
      const mapped = items.map(toCatalogItem);
      inventoryCache = { items: mapped, cats };
      setCatalog(mapped);
      setCategories(cats);
      setLoadError(null);
    } catch (err) {
      console.error("Failed to load inventory:", err);
      setLoadError("Could not load inventory. Has migration 0002_inventory.sql been run in Supabase?");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  const filteredInventory = useMemo(() => {
    const q = inventorySearch.trim().toLowerCase();
    return catalog.filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.desc ?? "").toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q),
    );
  }, [catalog, inventorySearch]);

  // ── Add / edit item modal ───────────────────────────────────────────────
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
  const [isSavingCatalog, setIsSavingCatalog] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const [newCatPrice, setNewCatPrice] = useState<NumField>("");
  const [newCatCost, setNewCatCost] = useState<NumField>("");
  const [newCatCategory, setNewCatCategory] = useState("");
  const [newCatType, setNewCatType] = useState<ItemType>("PRODUCT");
  const [newCatStock, setNewCatStock] = useState<NumField>(0);
  const [newCatLowStock, setNewCatLowStock] = useState<NumField>(0);
  const [newCatActive, setNewCatActive] = useState(true);
  const [newCatImage, setNewCatImage] = useState<string | null>(null);

  const resetCatalogForm = () => {
    setNewCatName("");
    setNewCatDesc("");
    setNewCatPrice("");
    setNewCatCost("");
    setNewCatCategory("");
    setNewCatType("PRODUCT");
    setNewCatStock(0);
    setNewCatLowStock(0);
    setNewCatActive(true);
    setNewCatImage(null);
  };

  const openEditCatalog = (catItem: CatalogItem) => {
    setEditingCatalogId(catItem.id);
    setNewCatName(catItem.name || "");
    setNewCatDesc(catItem.desc || "");
    setNewCatPrice(catItem.price ?? "");
    setNewCatCategory(catItem.category || "");
    setNewCatType(catItem.itemType || "PRODUCT");
    setNewCatCost(catItem.costPrice ?? "");
    setNewCatStock(catItem.stock ?? 0);
    setNewCatLowStock(catItem.lowStockAlert ?? 0);
    setNewCatActive(catItem.isActive === undefined ? true : catItem.isActive);
    setNewCatImage(catItem.imageUrl ?? null);
    setShowCatalogModal(true);
  };

  const openAddCatalog = (type: ItemType) => {
    resetCatalogForm();
    setNewCatType(type);
    setEditingCatalogId(null);
    setShowCatalogModal(true);
  };

  const closeCatalogModal = () => {
    resetCatalogForm();
    setEditingCatalogId(null);
    setShowCatalogModal(false);
  };


  const addToCatalog = async () => {
    if (!newCatName.trim()) {
      alert(newCatType === "SERVICE" ? "Service name is required." : "Product name is required.");
      return;
    }

    const priceNum = Number(newCatPrice);
    if (priceNum > 99999999.99) {
      alert("The price exceeds the maximum allowable system limit of ₹99,999,999.99.");
      return;
    }

    const isService = newCatType === "SERVICE";
    const payload = {
      name: newCatName.trim(),
      description: newCatDesc || "",
      category: newCatCategory.trim() || "General",
      item_type: newCatType,
      selling_price: newCatPrice === "" ? 0 : Number(newCatPrice),
      cost_price: newCatCost === "" ? 0 : Number(newCatCost),
      // Services never carry stock.
      current_stock: isService ? null : newCatStock === "" ? 0 : Number(newCatStock),
      low_stock_alert: isService ? null : newCatLowStock === "" ? 0 : Number(newCatLowStock),
      offer_discount_pct: 0,
      offer_price: null,
      is_active: newCatActive,
      image_url: newCatImage,
    };

    if (isSavingCatalog) return; // ignore double-clicks
    setIsSavingCatalog(true);
    try {
      if (editingCatalogId) {
        const data = await updateInventoryItemAction(editingCatalogId, payload);
        if (!data) {
          alert("Product not found — it may have been removed. Refresh and try again.");
          return;
        }
      } else {
        const product = await createInventoryItemAction(payload);
        if (!product?.id) throw new Error("Product was not saved");
      }
      closeCatalogModal();
    } catch (err) {
      console.error("Failed to save product:", err);
      alert(
        "Could not save this item to the database. Check your connection and try again — nothing was added.",
      );
      return;
    } finally {
      setIsSavingCatalog(false);
    }
    // Re-read so the list shows exactly what the database holds.
    fetchData();
  };

  const deleteFromCatalog = async (id: string) => {
    try {
      await deleteInventoryItemAction(id);
      setCatalog((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      console.error("Failed to delete product:", err);
      alert("Could not delete this item. Please try again.");
    }
  };

  // ── Category management (create / rename / delete) ──────────────────────
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [editingCategory, setEditingCategory] = useState<string | null>(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [isSavingCategory, setIsSavingCategory] = useState(false);

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) {
      alert("Please enter a category name.");
      return;
    }
    if (categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
      alert("That category already exists.");
      return;
    }
    setIsSavingCategory(true);
    try {
      await addCategoryAction(name);
      setNewCategoryName("");
      await fetchData();
    } catch (err) {
      console.error("Failed to add category:", err);
      alert("Could not add the category. Please try again.");
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleSaveEditCategory = async () => {
    if (!editingCategory) return;
    const name = editCategoryName.trim();
    if (!name) {
      alert("Category name cannot be empty.");
      return;
    }
    setIsSavingCategory(true);
    try {
      await renameCategoryAction(editingCategory, name);
      setEditingCategory(null);
      setEditCategoryName("");
      // Renaming also updates products, so refresh both lists.
      await fetchData();
    } catch (err) {
      console.error("Failed to rename category:", err);
      alert("Could not rename the category. Please try again.");
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (name: string) => {
    if (
      !window.confirm(
        `Delete category "${name}"? Products already using it keep their category name.`,
      )
    )
      return;
    try {
      await deleteCategoryAction(name);
      await fetchData();
    } catch (err) {
      console.error("Failed to delete category:", err);
      alert("Could not delete the category. Please try again.");
    }
  };

  // ── Stock adjustment (restock / return / loss / reconcile) ───────────────
  const [stockAdjustTarget, setStockAdjustTarget] = useState<CatalogItem | null>(null);
  const [stockAdjustType, setStockAdjustType] = useState<StockAdjustType>("RESTOCK");
  const [stockAdjustQty, setStockAdjustQty] = useState<number>(0);
  const [stockAdjustNote, setStockAdjustNote] = useState("");
  const [isSavingStock, setIsSavingStock] = useState(false);

  const openStockAdjust = (item: CatalogItem) => {
    setStockAdjustTarget(item);
    setStockAdjustType("RESTOCK");
    setStockAdjustQty(0);
    setStockAdjustNote("");
  };

  const closeStockAdjust = () => {
    if (isSavingStock) return;
    setStockAdjustTarget(null);
  };

  // Where the count lands after this adjustment.
  const stockAdjustPreview = (() => {
    if (!stockAdjustTarget) return 0;
    const current = stockAdjustTarget.stock ?? 0;
    const qty = Math.max(0, Number(stockAdjustQty) || 0);
    switch (stockAdjustType) {
      case "RESTOCK":
      case "RETURN":
        return current + qty;
      case "LOSS":
        return Math.max(0, current - qty);
      case "RECONCILE":
        return qty;
    }
  })();

  const stockAdjustDelta = stockAdjustPreview - (stockAdjustTarget?.stock ?? 0);

  const saveStockAdjustment = async () => {
    if (!stockAdjustTarget || isSavingStock) return;
    const target = stockAdjustTarget;
    const qty = Math.max(0, Number(stockAdjustQty) || 0);

    if (stockAdjustType !== "RECONCILE" && qty === 0) {
      alert("Enter a quantity greater than 0.");
      return;
    }
    if (stockAdjustType === "LOSS" && qty > (target.stock ?? 0)) {
      const proceed = window.confirm(
        `Only ${target.stock ?? 0} in stock. Deducting ${qty} will set stock to 0. Continue?`,
      );
      if (!proceed) return;
    }

    setIsSavingStock(true);
    try {
      await adjustProductStockAction(target.id, {
        type: stockAdjustType,
        newStock: stockAdjustPreview,
        // Reconcile is an exact count, so align the low-stock warning with it too.
        lowStockAlert:
          stockAdjustType === "RECONCILE"
            ? Math.min(target.lowStockAlert ?? 0, stockAdjustPreview)
            : undefined,
        note: stockAdjustNote,
      });
      await fetchData();
      setStockAdjustTarget(null);
    } catch (err) {
      console.error("Failed to adjust stock:", err);
      alert("Could not update stock. Please try again.");
    } finally {
      setIsSavingStock(false);
    }
  };

  // ── CSV export (also used as the "Stock Snapshot") ───────────────────────
  const exportInventoryCSV = () => {
    if (catalog.length === 0) {
      alert("No products in inventory to export.");
      return;
    }
    const headers = [
      "Product ID", "Name", "Type", "Description", "Category", "Price", "Cost Price",
      "Stock", "Low Stock Alert", "Active",
    ];
    const rows = catalog.map((p) => [
      p.id,
      p.name,
      p.itemType === "SERVICE" ? "SERVICE" : "PRODUCT",
      p.desc || "",
      p.category || "",
      p.price ?? "",
      p.costPrice ?? "",
      // Services have no stock by design.
      p.itemType === "SERVICE" ? "" : (p.stock ?? ""),
      p.itemType === "SERVICE" ? "" : (p.lowStockAlert ?? ""),
      p.isActive === false ? "No" : "Yes",
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Inventory_${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const rupees = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2 });

  return (
    <div className="flex-1 flex flex-col max-w-[1400px] mx-auto w-full pb-8 pr-2 animate-in fade-in duration-300">
      <div className="bg-white border border-black/10 rounded-2xl p-2 mb-6 flex flex-wrap items-center gap-1 w-full sm:w-fit">
        {(
          [
            { key: "products", label: "Products & Stock", Icon: Boxes },
            { key: "movements", label: "Stock Movements", Icon: History },
          ] as const
        ).map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setInventoryView(key)}
            className={`flex-1 sm:flex-none px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              inventoryView === key
                ? "bg-[#C1272D] text-white shadow-sm"
                : "text-[#000000]/70 hover:bg-[#FBEFEF] hover:text-[#000000]"
            }`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {inventoryView === "movements" ? (
        <StockMovementsPanel onExportSnapshot={exportInventoryCSV} />
      ) : (
        <>
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
            <div>
              <h2 className="text-[28px] font-black text-[#000000] tracking-tight flex items-center gap-3">
                <Boxes className="w-7 h-7 text-[#C1272D]" />
                Inventory
              </h2>
              <p className="text-xs text-[#000000] font-semibold mt-1">
                Manage products and categories — add, edit and delete.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
              <div className="relative flex-1 lg:flex-none">
                <Search className="w-3.5 h-3.5 text-[#000000]/40 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search products…"
                  className="pl-9 pr-3 py-2 bg-white border border-black/10 rounded-lg text-xs font-semibold focus:outline-none focus:border-[#C1272D] w-full lg:w-48"
                  value={inventorySearch}
                  onChange={(e) => setInventorySearch(e.target.value)}
                />
              </div>
              <button
                onClick={exportInventoryCSV}
                className="text-[10px] font-bold text-[#000000] bg-white border border-black/10 hover:bg-[#FAFAFA] px-3 py-2 rounded-lg uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#C1272D]" /> Inventory CSV
              </button>
              <button
                onClick={() => {
                  setNewCategoryName("");
                  setEditingCategory(null);
                  setEditCategoryName("");
                  setShowCategoryModal(true);
                }}
                className="text-[10px] font-bold text-[#C1272D] bg-white border border-[#C1272D]/40 hover:bg-[#C1272D]/10 px-3 py-2 rounded-lg uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Tag className="w-3.5 h-3.5" /> Manage Categories
              </button>
              <button
                onClick={() => openAddCatalog("SERVICE")}
                className="text-[10px] font-bold text-white bg-[#9B1C21] hover:bg-[#7F1D1D] px-3 py-2 rounded-lg uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Scissors className="w-3.5 h-3.5" /> Add Service
              </button>
              <button
                onClick={() => openAddCatalog("PRODUCT")}
                className="text-[10px] font-bold text-white bg-[#C1272D] hover:bg-[#9B1C21] px-3 py-2 rounded-lg uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add Product
              </button>
            </div>
          </div>

          {loadError ? (
            <div className="bg-white border border-[#B91C1C]/30 rounded-xl p-8 text-center text-xs font-bold text-[#B91C1C]">
              {loadError}
            </div>
          ) : loading ? (
            <div className="bg-white border border-black/10 rounded-xl overflow-hidden">
              <div className="animate-pulse space-y-3 p-6" aria-label="Loading">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded-xl bg-black/5" />
              ))}
            </div>
            </div>
          ) : catalog.length === 0 ? (
            <div className="bg-white border border-black/10 rounded-xl p-12 text-center">
              <div className="w-14 h-14 rounded-full bg-[#C1272D]/10 flex items-center justify-center mx-auto mb-4">
                <Boxes className="w-7 h-7 text-[#C1272D]" />
              </div>
              <p className="text-base font-bold text-[#000000]">No products yet.</p>
              <p className="text-xs font-semibold text-[#000000]/60 mt-1 mb-4">
                Add your first product or service to start managing your catalog.
              </p>
              <button
                onClick={() => openAddCatalog("PRODUCT")}
                className="text-[10px] font-bold text-white bg-[#C1272D] px-4 py-2 rounded-lg uppercase tracking-wider inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Add First Product
              </button>
            </div>
          ) : (
            <div className="bg-white border border-black/10 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead className="bg-[#FAFAFA] border-b border-black/10 select-none">
                    <tr>
                      <th className="p-3 text-[10px] font-black text-[#000000] uppercase tracking-wider">Product</th>
                      <th className="p-3 text-[10px] font-black text-[#000000] uppercase tracking-wider">Type</th>
                      <th className="p-3 text-[10px] font-black text-[#000000] uppercase tracking-wider text-right">Stock</th>
                      <th className="p-3 text-[10px] font-black text-[#000000] uppercase tracking-wider text-right">Price</th>
                      <th className="p-3 text-[10px] font-black text-[#000000] uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {filteredInventory.map((p) => {
                      const isExpanded = expandedProductId === p.id;
                      return (
                        <React.Fragment key={p.id}>
                          <tr
                            className="hover:bg-[#FAFAFA] cursor-pointer transition-colors"
                            onClick={() => setExpandedProductId(isExpanded ? null : p.id)}
                          >
                            <td className="p-3">
                              <div className="flex items-start gap-2.5">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExpandedProductId(isExpanded ? null : p.id);
                                  }}
                                  className={`mt-0.5 w-6 h-6 rounded-md flex items-center justify-center transition-all shrink-0 cursor-pointer ${
                                    isExpanded
                                      ? "bg-[#C1272D] text-white shadow-xs"
                                      : "bg-black/5 hover:bg-black/15 text-black/70 hover:text-black"
                                  }`}
                                  title={isExpanded ? "Click to collapse details" : "Click dropdown to open product details"}
                                  aria-label="Toggle details dropdown"
                                >
                                  <ChevronDown
                                    className={`w-3.5 h-3.5 transition-transform duration-200 ${
                                      isExpanded ? "rotate-180 text-white" : ""
                                    }`}
                                  />
                                </button>
                                {p.imageUrl && (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={p.imageUrl} alt="" className="w-10 h-10 rounded-md object-cover border border-black/10 shrink-0" />
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-bold text-[#000000] flex items-center gap-2 flex-wrap">
                                    <span>{p.name}</span>
                                    <span
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setExpandedProductId(isExpanded ? null : p.id);
                                      }}
                                      className="text-[9px] text-[#C1272D] hover:underline font-bold cursor-pointer inline-flex items-center gap-0.5"
                                    >
                                      {isExpanded ? "▲ Hide Details" : "▼ Open in detail"}
                                    </span>
                                  </div>
                                  {p.desc && (
                                    <div className="text-[10px] font-semibold text-[#000000]/60 mt-0.5">{p.desc}</div>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="p-3">
                              <span
                                className={`text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded border inline-block ${
                                  p.itemType === "SERVICE"
                                    ? "text-[#9B1C21] bg-[#9B1C21]/10 border-[#9B1C21]/25"
                                    : "text-[#C1272D] bg-[#C1272D]/10 border-[#C1272D]/25"
                                }`}
                              >
                                {p.itemType === "SERVICE" ? "Service" : "Product"}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              {p.itemType === "SERVICE" ? (
                                <span className="text-[10px] font-semibold text-[#000000]/35">—</span>
                              ) : (
                                (() => {
                                  const stock = Number(p.stock) || 0;
                                  const alertAt = p.lowStockAlert;
                                  const isLow =
                                    alertAt !== null && alertAt !== undefined && stock <= Number(alertAt);
                                  return (
                                    <span className={`text-sm font-black ${isLow ? "text-[#B91C1C]" : "text-[#000000]"}`}>
                                      {stock}
                                      {isLow && (
                                        <span className="text-[9px] font-bold uppercase tracking-wider ml-1">Low</span>
                                      )}
                                    </span>
                                  );
                                })()
                              )}
                            </td>
                            <td className="p-3 text-right text-sm font-black text-[#000000]">
                              ₹{rupees(p.price ?? 0)}
                              
                            </td>
                            <td className="p-3 text-right">
                              <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => setExpandedProductId(isExpanded ? null : p.id)}
                                  className={`text-[10px] font-bold px-2.5 py-1.5 rounded uppercase tracking-wider transition-all cursor-pointer inline-flex items-center gap-1 ${
                                    isExpanded
                                      ? "bg-[#C1272D] text-white shadow-xs"
                                      : "text-[#C1272D] hover:bg-[#C1272D]/10 border border-[#C1272D]/30"
                                  }`}
                                  title={isExpanded ? "Collapse product details" : "Open product details"}
                                >
                                  <ChevronDown
                                    className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}
                                  />
                                  {isExpanded ? "Close" : "Details"}
                                </button>
                                <button
                                  onClick={() => openEditCatalog(p)}
                                  className="text-[10px] font-bold text-[#C1272D] hover:text-white hover:bg-[#C1272D] border border-[#C1272D]/30 px-2.5 py-1.5 rounded uppercase tracking-wider transition-colors cursor-pointer inline-flex items-center gap-1"
                                >
                                  <Pencil className="w-3 h-3" /> Edit
                                </button>
                                {p.itemType !== "SERVICE" && (
                                  <button
                                    onClick={() => openStockAdjust(p)}
                                    className="text-[10px] font-bold text-black/70 hover:text-[#C1272D] hover:bg-[#C1272D]/10 border border-black/15 px-2.5 py-1.5 rounded uppercase tracking-wider transition-colors cursor-pointer inline-flex items-center gap-1"
                                    title="Adjust stock — restock, return, loss or reconcile"
                                  >
                                    <SlidersHorizontal className="w-3 h-3" /> Stock
                                  </button>
                                )}
                                <button
                                  onClick={() => {
                                    if (window.confirm(`Delete "${p.name}" from inventory? This cannot be undone.`)) {
                                      deleteFromCatalog(p.id);
                                    }
                                  }}
                                  className="text-[10px] font-bold text-[#DC2626] hover:text-white hover:bg-[#DC2626] border border-[#DC2626]/30 px-2.5 py-1.5 rounded uppercase tracking-wider transition-colors cursor-pointer inline-flex items-center gap-1"
                                >
                                  <Trash2 className="w-3 h-3" /> Delete
                                </button>
                              </div>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-[#FAFAFA] border-b border-black/5">
                              <td colSpan={3} className="p-4">
                                <div className="bg-white border border-black/10 rounded-xl p-4 shadow-sm">
                                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 mb-3 border-b border-black/5">
                                    <div className="flex items-center gap-2">
                                      <span className="w-2 h-2 rounded-full bg-[#C1272D]" />
                                      <h4 className="text-xs font-black text-black uppercase tracking-wider">
                                        Product Detail — {p.name}
                                      </h4>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={() => openEditCatalog(p)}
                                        className="text-[10px] font-bold text-white bg-[#C1272D] hover:bg-[#9B1C21] px-3 py-1.5 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1 shadow-xs"
                                      >
                                        <Pencil className="w-3 h-3" /> Edit
                                      </button>
                                      {p.itemType !== "SERVICE" && (
                                        <button
                                          onClick={() => openStockAdjust(p)}
                                          className="text-[10px] font-bold text-black bg-white hover:bg-[#C1272D] hover:text-white border border-black/15 px-3 py-1.5 rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1"
                                          title="Adjust stock — restock, return, loss or reconcile"
                                        >
                                          <SlidersHorizontal className="w-3 h-3" /> Adjust Stock
                                        </button>
                                      )}
                                      <button
                                        onClick={() => setExpandedProductId(null)}
                                        className="text-[10px] font-bold text-black/70 hover:text-black bg-black/5 hover:bg-black/10 px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer"
                                      >
                                        Close
                                      </button>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
                                    <div>
                                      <div className="text-[9px] font-bold text-black/40 uppercase tracking-wider mb-0.5">
                                        Selling Price
                                      </div>
                                      <div className="font-black text-black">₹{rupees(p.price ?? 0)}</div>
                                    </div>
                                    <div>
                                      <div className="text-[9px] font-bold text-black/40 uppercase tracking-wider mb-0.5">
                                        Category
                                      </div>
                                      <div className="font-bold text-black">{p.category || "General"}</div>
                                    </div>
                                    {p.desc && (
                                      <div className="col-span-2 sm:col-span-3">
                                        <div className="text-[9px] font-bold text-black/40 uppercase tracking-wider mb-0.5">
                                          Description
                                        </div>
                                        <div className="font-semibold text-black/70">{p.desc}</div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {filteredInventory.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-xs font-semibold text-[#000000]/60">
                          No products match &quot;{inventorySearch}&quot;.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Adjust Stock modal ─────────────────────────────────────────── */}
      {stockAdjustTarget && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4"
          onClick={closeStockAdjust}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.3)] border border-black/10 w-full max-w-md overflow-hidden transform animate-in zoom-in-95 duration-200"
          >
            <div className="flex items-start justify-between gap-3 p-5 bg-[#C1272D] text-white">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-base font-black tracking-tight truncate">Adjust Inventory Stock</h3>
                  <p className="text-[10px] font-semibold text-white/80">
                    Restock, return, deduct loss, or reconcile count
                  </p>
                </div>
              </div>
              <button
                onClick={closeStockAdjust}
                disabled={isSavingStock}
                className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center shrink-0 transition-colors cursor-pointer disabled:opacity-50"
                aria-label="Close stock adjustment"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
              <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-[#FBEFEF] border border-[#C1272D]/25">
                <div className="min-w-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-[#C1272D] mb-0.5 flex items-center gap-1.5">
                    <Package className="w-3 h-3" /> Target Item
                  </p>
                  <p className="text-sm font-bold text-black truncate">{stockAdjustTarget.name}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[9px] font-black uppercase tracking-widest text-black/45">Current Stock</p>
                  <p className="text-lg font-black text-black leading-tight">
                    {stockAdjustTarget.stock ?? 0}
                    <span className="text-[10px] font-bold text-black/45 ml-1">units</span>
                  </p>
                </div>
              </div>

              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-black/50 mb-2">
                  Select Adjustment Type <span className="text-red-500">*</span>
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    [
                      { key: "RESTOCK", label: "Restock", sub: "+ Add", Icon: Plus, tone: "text-emerald-600" },
                      { key: "RETURN", label: "Return", sub: "+ Add", Icon: Undo2, tone: "text-blue-600" },
                      { key: "LOSS", label: "Loss / Dmg", sub: "− Deduct", Icon: Minus, tone: "text-red-600" },
                      { key: "RECONCILE", label: "Reconcile", sub: "Exact Set", Icon: Target, tone: "text-amber-600" },
                    ] as const
                  ).map(({ key, label, sub, Icon, tone }) => {
                    const active = stockAdjustType === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setStockAdjustType(key);
                          setStockAdjustQty(key === "RECONCILE" ? stockAdjustTarget.stock ?? 0 : 0);
                        }}
                        className={`flex flex-col items-center justify-center gap-1 rounded-xl border px-2 py-3 transition-all cursor-pointer ${
                          active
                            ? "border-[#C1272D] bg-[#FBEFEF] shadow-xs"
                            : "border-black/10 bg-white hover:border-black/25"
                        }`}
                      >
                        <span
                          className={`w-7 h-7 rounded-full flex items-center justify-center border ${
                            active ? "border-[#C1272D]/40 bg-white" : "border-black/10 bg-black/[0.03]"
                          }`}
                        >
                          <Icon className={`w-3.5 h-3.5 ${active ? "text-[#C1272D]" : tone}`} />
                        </span>
                        <span className="text-[10px] font-black text-black leading-tight">{label}</span>
                        <span
                          className={`text-[9px] font-bold leading-tight ${
                            sub.startsWith("+")
                              ? "text-emerald-600"
                              : sub.startsWith("−")
                                ? "text-red-600"
                                : "text-amber-600"
                          }`}
                        >
                          {sub}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div
                className={`rounded-xl border p-3.5 transition-colors ${
                  stockAdjustType === "LOSS" ? "border-red-200 bg-red-50/40" : "border-[#C1272D]/30 bg-[#FBEFEF]"
                }`}
              >
                <p className="text-[9px] font-black uppercase tracking-widest text-black/50 mb-2.5">
                  {stockAdjustType === "RECONCILE"
                    ? "New Counted Quantity"
                    : stockAdjustType === "LOSS"
                      ? "Quantity to Deduct"
                      : "Quantity to Add"}{" "}
                  <span className="text-red-500">*</span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStockAdjustQty((q) => Math.max(0, q - 1))}
                    className="w-10 h-10 shrink-0 rounded-lg border border-black/15 bg-white hover:bg-black/5 flex items-center justify-center font-black text-lg cursor-pointer transition-colors"
                    aria-label="Decrease quantity"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    // Show 0 as an empty box so typed digits replace it instead
                    // of being appended after a leading zero.
                    value={stockAdjustQty || ""}
                    placeholder="0"
                    onFocus={(e) => e.currentTarget.select()}
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={(e) => setStockAdjustQty(Math.max(0, Number(e.target.value) || 0))}
                    className="flex-1 min-w-0 text-center text-lg font-black text-black bg-white border border-black/15 rounded-lg px-3 py-2 focus:outline-none focus:border-[#C1272D] focus:ring-2 focus:ring-[#C1272D]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setStockAdjustQty((q) => q + 1)}
                    className="w-10 h-10 shrink-0 rounded-lg border border-black/15 bg-white hover:bg-black/5 flex items-center justify-center font-black text-lg cursor-pointer transition-colors"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 mt-3">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-black/45 mr-0.5">Quick:</span>
                  {[1, 5, 10, 25, 50, 100].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setStockAdjustQty((q) => (stockAdjustType === "RECONCILE" ? n : q + n))}
                      className="px-2 py-1 rounded-md border border-black/10 bg-white hover:border-[#C1272D] hover:text-[#C1272D] text-[10px] font-bold cursor-pointer transition-colors"
                    >
                      {stockAdjustType === "RECONCILE" ? n : `+${n}`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-[#C1272D]/30 bg-[#FBEFEF] text-[11px] font-bold">
                <span className="text-black/55">
                  Current: <span className="text-black font-black">{stockAdjustTarget.stock ?? 0}</span>
                  <span className="mx-1.5">→</span>
                  New Stock: <span className="text-[#C1272D] font-black">{stockAdjustPreview}</span> units
                </span>
                <span
                  className={`font-black ${
                    stockAdjustDelta > 0 ? "text-emerald-600" : stockAdjustDelta < 0 ? "text-red-600" : "text-black/40"
                  }`}
                >
                  {stockAdjustDelta > 0 ? `+${stockAdjustDelta}` : stockAdjustDelta}
                </span>
              </div>

              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-black/50 mb-1.5">
                  Adjustment Note <span className="text-black/30 normal-case">(optional)</span>
                </p>
                <input
                  value={stockAdjustNote}
                  onChange={(e) => setStockAdjustNote(e.target.value)}
                  placeholder="e.g. Received new stock shipment"
                  className="w-full bg-white border border-black/15 rounded-lg px-3 py-2.5 text-sm font-semibold text-black placeholder:text-black/30 focus:outline-none focus:border-[#C1272D] focus:ring-2 focus:ring-[#C1272D]/20 transition-colors"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 p-5 border-t border-black/10 bg-[#FAFAFA]">
              <button
                type="button"
                onClick={closeStockAdjust}
                disabled={isSavingStock}
                className="px-4 py-2.5 rounded-lg border border-black/15 bg-white hover:bg-black/5 text-[11px] font-black uppercase tracking-wider text-black cursor-pointer transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveStockAdjustment}
                disabled={isSavingStock}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#C1272D] hover:bg-[#9B1C21] disabled:opacity-50 text-white text-[11px] font-black uppercase tracking-wider cursor-pointer transition-colors shadow-xs"
              >
                {isSavingStock ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                {isSavingStock ? "Updating..." : `Update (${stockAdjustDelta > 0 ? `+${stockAdjustDelta}` : stockAdjustDelta})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Category Management modal ─────────────────────────────────── */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.3)] border border-black/10 w-full max-w-md overflow-hidden transform animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between p-5 border-b border-black/10">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-[#C1272D]" />
                <div>
                  <h3 className="text-base font-black text-black tracking-tight">Manage Categories</h3>
                  <p className="text-[10px] font-semibold text-black/50">Create, rename or delete product categories</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowCategoryModal(false);
                  setEditingCategory(null);
                  setEditCategoryName("");
                  setNewCategoryName("");
                }}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">
                    New Category
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Sarees, Blouses, Fabrics"
                    className="w-full bg-white border border-gray-200 hover:border-gray-300 focus:border-[#C1272D] rounded-lg px-3.5 py-2.5 text-sm font-semibold text-black focus:outline-none transition-colors shadow-xs"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddCategory();
                    }}
                  />
                </div>
                <button
                  onClick={handleAddCategory}
                  disabled={isSavingCategory}
                  className="py-2.5 px-4 bg-[#C1272D] hover:bg-[#9B1C21] text-white rounded-lg font-bold text-xs uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSavingCategory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add
                </button>
              </div>

              <div className="border border-black/10 rounded-lg divide-y divide-black/5 max-h-[320px] overflow-y-auto">
                {categories.length === 0 ? (
                  <div className="p-6 text-center text-xs font-semibold text-black/50">
                    No categories yet. Add your first one above.
                  </div>
                ) : (
                  categories.map((cat) => (
                    <div key={cat} className="flex items-center justify-between gap-2 p-2.5">
                      {editingCategory === cat ? (
                        <>
                          <input
                            type="text"
                            className="flex-1 bg-white border border-black/15 focus:border-[#C1272D] rounded-lg px-3 py-1.5 text-sm font-semibold text-black focus:outline-none"
                            value={editCategoryName}
                            onChange={(e) => setEditCategoryName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSaveEditCategory();
                            }}
                            autoFocus
                          />
                          <button
                            onClick={handleSaveEditCategory}
                            disabled={isSavingCategory}
                            className="text-[10px] font-bold text-white bg-[#16A34A] hover:bg-[#15803D] px-2.5 py-1.5 rounded uppercase tracking-wider transition-colors cursor-pointer"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => {
                              setEditingCategory(null);
                              setEditCategoryName("");
                            }}
                            className="text-[10px] font-bold text-black/70 hover:text-black bg-black/5 hover:bg-black/10 px-2.5 py-1.5 rounded uppercase tracking-wider transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 text-sm font-bold text-black truncate">{cat}</span>
                          <button
                            onClick={() => {
                              setEditingCategory(cat);
                              setEditCategoryName(cat);
                            }}
                            className="text-[10px] font-bold text-[#C1272D] hover:text-white hover:bg-[#C1272D] border border-[#C1272D]/30 px-2.5 py-1.5 rounded uppercase tracking-wider transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" /> Edit
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(cat)}
                            className="text-[10px] font-bold text-[#DC2626] hover:text-white hover:bg-[#DC2626] border border-[#DC2626]/30 px-2.5 py-1.5 rounded uppercase tracking-wider transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" /> Delete
                          </button>
                        </>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / Edit catalog item modal ──────────────────────────────── */}
      {showCatalogModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.3)] border border-black/10 w-full max-w-md overflow-hidden transform animate-in zoom-in-95 duration-200">
            <div className="px-6 py-5 bg-white border-b border-black/10 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#C1272D]/10 rounded-xl flex items-center justify-center text-[#C1272D]">
                  <PackagePlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-black tracking-tight">
                    {editingCatalogId
                      ? "Edit Catalog Item"
                      : newCatType === "SERVICE"
                        ? "Add New Service"
                        : "Add New Product"}
                  </h3>
                  <p className="text-[11px] text-gray-500 font-medium">
                    {editingCatalogId
                      ? "Modify item parameters"
                      : newCatType === "SERVICE"
                        ? "Register a chargeable service"
                        : "Set pricing, stock and category for this item"}
                  </p>
                </div>
              </div>
              <button
                onClick={closeCatalogModal}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto bg-white">
              <div>
                <p className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">Item Type</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewCatType("PRODUCT")}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer border ${
                      newCatType === "PRODUCT"
                        ? "bg-[#C1272D] text-white border-[#C1272D] shadow-sm"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <Package className="w-4 h-4" />
                    Product
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewCatType("SERVICE")}
                    className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest transition-colors cursor-pointer border ${
                      newCatType === "SERVICE"
                        ? "bg-[#9B1C21] text-white border-[#9B1C21] shadow-sm"
                        : "bg-white text-gray-600 border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <Scissors className="w-4 h-4" />
                    Service
                  </button>
                </div>
                <p className="text-[9px] text-gray-400 font-semibold mt-1.5">
                  {newCatType === "SERVICE"
                    ? "Services = delivery, packing, add-ons and other chargeable work. No stock is tracked."
                    : "Products = physical items sold. Stock and low-stock alerts are tracked."}
                </p>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">
                  {newCatType === "SERVICE" ? "Service Name" : "Product Name"} <span className="text-[#C1272D]">*</span>
                </label>
                <input
                  type="text"
                  placeholder={
                    newCatType === "SERVICE"
                      ? "e.g., Alteration Charges / Delivery"
                      : "e.g., Designer Silk Saree / Bridal Blouse"
                  }
                  className="w-full bg-white border border-gray-200 hover:border-gray-300 focus:border-[#C1272D] rounded-lg px-3.5 py-2.5 text-sm font-bold text-black focus:outline-none transition-colors shadow-xs"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">
                  Photo (Optional)
                </label>
                <div className="flex items-center gap-3">
                  <div className="w-16 h-16 rounded-lg border border-gray-200 bg-gray-50 overflow-hidden flex items-center justify-center shrink-0">
                    {newCatImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={newCatImage} alt="Product" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[9px] font-bold text-gray-400 uppercase">No photo</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="inline-block text-[10px] font-bold uppercase tracking-widest px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-gray-300 cursor-pointer">
                      {newCatImage ? "Change photo" : "Upload photo"}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          try {
                            setNewCatImage(await productImageToDataUrl(file));
                          } catch (err) {
                            alert(err instanceof Error ? err.message : "Could not use that image.");
                          }
                        }}
                      />
                    </label>
                    {newCatImage && (
                      <button type="button" onClick={() => setNewCatImage(null)} className="text-[10px] font-bold uppercase tracking-widest text-gray-500 hover:text-red-600 text-left cursor-pointer">
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">
                  Description / Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder={
                    newCatType === "SERVICE"
                      ? "e.g., Includes stitching and finishing"
                      : "e.g., Pure Kanjeevaram Silk, Pink & Gold Zari, Size 38"
                  }
                  className="w-full bg-white border border-gray-200 hover:border-gray-300 focus:border-[#C1272D] rounded-lg px-3.5 py-2.5 text-sm font-semibold text-black focus:outline-none transition-colors shadow-xs"
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">
                    Category
                  </label>
                  <input
                    type="text"
                    list="catalog-category-list"
                    placeholder="e.g., Blouses, Sarees, Services"
                    className="w-full bg-white border border-gray-200 hover:border-gray-300 focus:border-[#C1272D] rounded-lg px-3.5 py-2.5 text-sm font-semibold text-black focus:outline-none transition-colors shadow-xs"
                    value={newCatCategory}
                    onChange={(e) => setNewCatCategory(e.target.value)}
                  />
                  <datalist id="catalog-category-list">
                    {categories.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  <p className="text-[9px] text-gray-400 font-semibold mt-1">
                    Pick an existing category or type a new one (it will be added automatically)
                  </p>
                </div>

                {newCatType === "PRODUCT" && (
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">
                      Low Stock Alert
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="5"
                      className="w-full bg-white border border-gray-200 hover:border-gray-300 focus:border-[#C1272D] rounded-lg px-3.5 py-2.5 text-sm font-bold text-black focus:outline-none transition-colors shadow-xs"
                      value={newCatLowStock}
                      onWheel={(e) => e.currentTarget.blur()}
                      onChange={(e) => setNewCatLowStock(e.target.value === "" ? "" : parseFloat(e.target.value))}
                    />
                    <p className="text-[9px] text-gray-400 font-semibold mt-1">
                      Warns you in Inventory when stock falls to this level.
                    </p>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">
                    {newCatType === "SERVICE" ? "Service Price (₹)" : "Original Price (₹)"}{" "}
                    <span className="text-[#C1272D]">*</span>
                  </label>
                  <input
                    type="number"
                    placeholder="0.00"
                    className="w-full bg-white border border-gray-200 hover:border-gray-300 focus:border-[#C1272D] rounded-lg px-3.5 py-2.5 text-sm font-bold text-black focus:outline-none transition-colors shadow-xs"
                    value={newCatPrice}
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={(e) => setNewCatPrice(e.target.value === "" ? "" : parseFloat(e.target.value))}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">
                    Cost Price (₹)
                  </label>
                  <input
                    type="number"
                    placeholder="0.00"
                    className="w-full bg-white border border-gray-200 hover:border-gray-300 focus:border-[#C1272D] rounded-lg px-3.5 py-2.5 text-sm font-bold text-black focus:outline-none transition-colors shadow-xs"
                    value={newCatCost}
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={(e) => setNewCatCost(e.target.value === "" ? "" : parseFloat(e.target.value))}
                  />
                </div>
                {newCatType === "PRODUCT" && (
                  <div>
                    <label className="block text-[10px] font-bold text-gray-600 uppercase tracking-widest mb-1.5">
                      Current Stock
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="0"
                      className="w-full bg-white border border-gray-200 hover:border-gray-300 focus:border-[#C1272D] rounded-lg px-3.5 py-2.5 text-sm font-bold text-black focus:outline-none transition-colors shadow-xs"
                      value={newCatStock}
                      onWheel={(e) => e.currentTarget.blur()}
                      onChange={(e) => setNewCatStock(e.target.value === "" ? "" : parseFloat(e.target.value))}
                    />
                  </div>
                )}
              </div>

              <p className="text-[9px] text-gray-400 font-semibold -mt-2">
                Cost price is for your records only — it is never used in billing.
              </p>

              <button
                type="button"
                onClick={() => setNewCatActive((prev) => !prev)}
                className="w-full flex items-center gap-3 border border-gray-200 hover:border-gray-300 rounded-xl px-3.5 py-3 cursor-pointer transition-colors text-left"
              >
                <span
                  className={`w-5 h-5 rounded flex items-center justify-center border transition-colors ${
                    newCatActive
                      ? "bg-[#C1272D] border-[#C1272D] text-white"
                      : "bg-white border-gray-300 text-transparent"
                  }`}
                >
                  <Check className="w-3.5 h-3.5" />
                </span>
                <span className="text-xs font-bold text-gray-700">Active (visible in Billing Panel)</span>
              </button>

              <button
                onClick={addToCatalog}
                disabled={isSavingCatalog}
                className="w-full py-3.5 mt-2 bg-[#C1272D] hover:bg-[#9B1C21] text-white rounded-xl font-bold text-xs uppercase tracking-widest transition-colors shadow-sm cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isSavingCatalog ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackagePlus className="w-4 h-4" />}
                {editingCatalogId ? "Save Changes" : newCatType === "SERVICE" ? "Save Service" : "Save Product to Catalog"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
