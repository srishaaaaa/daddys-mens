"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Banknote, Check, Coins, List, Loader2, Pencil, PiggyBank, Plus, Receipt, Search, SlidersHorizontal, Tag, Trash2, Wallet,
} from "lucide-react";
import type { Expense, ExpenseCategory } from "@/lib/expenses";
import {
  createExpenseAction, createExpenseCategoryAction, deleteExpenseAction, deleteExpenseCategoryAction,
  listExpenseCategoriesAction, listExpensesAction, setExpenseCategoryActiveAction, updateExpenseAction,
} from "@/app/pos/expense-actions";

const EXPENSE_PAYMENT_MODES = ["CASH", "UPI", "CARD", "BANK", "OTHER"] as const;

type PeriodKey = "all" | "today" | "week" | "month" | "year" | "custom";
const todayLocal = () => new Date().toLocaleDateString("en-CA");

// Shared date-window test for the period filter (dates are plain yyyy-mm-dd days).
const isDateInPeriod = (dateStr: string, period: PeriodKey, startStr: string, endStr: string): boolean => {
  const now = new Date();
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return false;
  if (period === "all") return true;
  if (period === "today") return d.toDateString() === now.toDateString();
  if (period === "week") {
    const start = new Date(now);
    const dow = start.getDay();
    start.setDate(start.getDate() + (dow === 0 ? -6 : 1 - dow)); // Monday start
    start.setHours(0, 0, 0, 0);
    return d >= start;
  }
  if (period === "month") return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  if (period === "year") return d.getFullYear() === now.getFullYear();
  const t = d.getTime();
  const s = startStr ? new Date(`${startStr}T00:00:00`) : null;
  const e = endStr ? new Date(`${endStr}T23:59:59.999`) : null;
  return (!s || t >= s.getTime()) && (!e || t <= e.getTime());
};

const inr = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ExpensesPanel() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<ExpenseCategory[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [expTitle, setExpTitle] = useState("");
  // "" = the first active category (derived below as expCategoryValue).
  const [expCategory, setExpCategory] = useState("");
  const [showExpenseCatManager, setShowExpenseCatManager] = useState(false);
  const [newExpenseCatName, setNewExpenseCatName] = useState("");
  const [expenseCatError, setExpenseCatError] = useState<string | null>(null);
  const [isSavingExpenseCat, setIsSavingExpenseCat] = useState(false);
  const activeExpenseCategories = expenseCategories.filter((c) => c.is_active).map((c) => c.name);
  const expCategoryValue = expCategory || activeExpenseCategories[0] || "General";
  const [expAmount, setExpAmount] = useState<number | "">("");
  const [expPaymentMode, setExpPaymentMode] = useState("CASH");
  const [expNotes, setExpNotes] = useState("");
  const [expDate, setExpDate] = useState(todayLocal());
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [expensePeriod, setExpensePeriod] = useState<PeriodKey>("month");
  const [expenseStartDate, setExpenseStartDate] = useState(todayLocal());
  const [expenseEndDate, setExpenseEndDate] = useState(todayLocal());
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState("ALL");
  const [expenseSearch, setExpenseSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const [e, c] = await Promise.all([listExpensesAction(), listExpenseCategoriesAction()]);
      setExpenses(e);
      setExpenseCategories(c);
      setLoadError(null);
    } catch (err) {
      console.error("Failed to load expenses:", err);
      setLoadError("Could not load expenses. Has migration 0006_expenses.sql been run in Supabase?");
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const cancelEditExpense = () => {
    setEditingExpenseId(null);
    setExpTitle("");
    setExpAmount("");
    setExpNotes("");
    setExpCategory("");
    setExpPaymentMode("CASH");
    setExpDate(todayLocal());
  };

  const handleAddExpense = async () => {
    const amountNum = typeof expAmount === "number" ? expAmount : parseFloat(String(expAmount));
    if (!expTitle.trim()) {
      alert("Please enter what the expense was for.");
      return;
    }
    if (!amountNum || amountNum <= 0) {
      alert("Please enter a valid amount greater than 0.");
      return;
    }
    const payload = {
      title: expTitle.trim(),
      category: expCategoryValue.trim() || "General",
      amount: amountNum,
      payment_mode: expPaymentMode,
      notes: expNotes.trim() || null,
      expense_date: expDate,
    };
    setIsSavingExpense(true);
    try {
      if (editingExpenseId) {
        const updated = await updateExpenseAction(editingExpenseId, payload);
        if (!updated) {
          alert("This expense no longer exists - it may have been deleted.");
          setExpenses((prev) => prev.filter((e) => e.id !== editingExpenseId));
        } else {
          setExpenses((prev) => prev.map((e) => (e.id === editingExpenseId ? updated : e)));
        }
        cancelEditExpense();
        return;
      }
      const created = await createExpenseAction(payload);
      setExpenses((prev) => [created, ...prev]);
      // Keep category / payment mode / date for fast repeat entry
      setExpTitle("");
      setExpAmount("");
      setExpNotes("");
    } catch (err) {
      console.error("Error adding expense:", err);
      alert("Could not save the expense. Please try again.");
    } finally {
      setIsSavingExpense(false);
    }
  };

  const startEditExpense = (e: Expense) => {
    setEditingExpenseId(e.id);
    setExpTitle(e.title);
    setExpAmount(Number(e.amount) || "");
    setExpDate(e.expense_date);
    setExpCategory(e.category); // kept even if that category was since switched off or deleted
    setExpPaymentMode(e.payment_mode);
    setExpNotes(e.notes || "");
    document.getElementById("expense-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleAddExpenseCategory = async () => {
    if (isSavingExpenseCat) return;
    setIsSavingExpenseCat(true);
    setExpenseCatError(null);
    try {
      const result = await createExpenseCategoryAction(newExpenseCatName);
      if (!result.ok) {
        setExpenseCatError(result.error);
        return;
      }
      setExpenseCategories((prev) => [...prev, result.category].sort((a, b) => a.name.localeCompare(b.name)));
      setNewExpenseCatName("");
    } catch (err) {
      console.error("Failed to add expense category:", err);
      setExpenseCatError("Could not add the category. Please try again.");
    } finally {
      setIsSavingExpenseCat(false);
    }
  };

  const toggleExpenseCategory = async (cat: ExpenseCategory) => {
    // Optimistic: flip now, put it back if the save fails.
    const flip = (active: boolean) =>
      setExpenseCategories((prev) => prev.map((c) => (c.id === cat.id ? { ...c, is_active: active } : c)));
    flip(!cat.is_active);
    try {
      if (!(await setExpenseCategoryActiveAction(cat.id, !cat.is_active))) flip(cat.is_active);
    } catch (err) {
      console.error("Failed to update expense category:", err);
      flip(cat.is_active);
      alert("Could not update the category. Please try again.");
    }
  };

  const deleteExpenseCategory = async (cat: ExpenseCategory) => {
    if (!window.confirm(`Delete the category "${cat.name}"? Expenses already filed under it keep the name.`)) return;
    try {
      await deleteExpenseCategoryAction(cat.id);
      setExpenseCategories((prev) => prev.filter((c) => c.id !== cat.id));
    } catch (err) {
      console.error("Failed to delete expense category:", err);
      alert("Could not delete the category. Please try again.");
    }
  };

  const handleDeleteExpense = async (id: string) => {
    if (!window.confirm("Delete this expense? This cannot be undone.")) return;
    try {
      await deleteExpenseAction(id);
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      if (editingExpenseId === id) cancelEditExpense();
    } catch (err) {
      console.error("Error deleting expense:", err);
      alert("Could not delete the expense.");
    }
  };

  const expenseStats = useMemo(() => {
    const filtered = expenses.filter((e) => {
      if (!isDateInPeriod(e.expense_date, expensePeriod, expenseStartDate, expenseEndDate)) return false;
      if (expenseCategoryFilter !== "ALL" && e.category !== expenseCategoryFilter) return false;
      if (expenseSearch) {
        const q = expenseSearch.toLowerCase();
        if (!e.title.toLowerCase().includes(q) && !e.category.toLowerCase().includes(q) && !(e.notes || "").toLowerCase().includes(q)) return false;
      }
      return true;
    });
    const sortedFiltered = [...filtered].sort((a, b) => new Date(b.expense_date).getTime() - new Date(a.expense_date).getTime());
    const total = filtered.reduce((acc, e) => acc + e.amount, 0);
    const byCategory: Record<string, number> = {};
    filtered.forEach((e) => {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
    });
    const categoryBreakdown = Object.entries(byCategory).map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount);
    return {
      filtered: sortedFiltered,
      total,
      categoryBreakdown,
      topCategory: categoryBreakdown[0]?.category || "None",
      count: filtered.length,
      allCategories: Array.from(new Set(expenses.map((e) => e.category))).sort(),
    };
  }, [expenses, expensePeriod, expenseStartDate, expenseEndDate, expenseCategoryFilter, expenseSearch]);

  const inp = "w-full bg-[#FAFAFA] border border-black/10 rounded-lg px-3 py-2 text-sm text-[#000000] focus:outline-none focus:border-[#C1272D] placeholder:text-black/30";
  const lab = "block text-[10px] font-bold uppercase tracking-wider text-[#000000] mb-1";

  return (
    <div className="flex-1 flex flex-col max-w-[1400px] mx-auto w-full pb-8 pr-2 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
        <div>
          <h2 className="text-[28px] font-black text-[#000000] tracking-tight flex items-center gap-3">
            <Wallet className="w-7 h-7 text-[#C1272D]" />
            Expense Tracker
          </h2>
          <p className="text-xs text-[#000000] font-semibold mt-1">
            Record what the shop spends. Expenses are offset against sales to show your real Net Profit on the dashboard.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 bg-[#FAFAFA] border border-black/10 rounded-xl p-1">
          {(
            [["today", "Today"], ["week", "Week"], ["month", "Month"], ["year", "Year"], ["all", "All"], ["custom", "Custom"]] as [PeriodKey, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setExpensePeriod(key)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                expensePeriod === key ? "bg-[#C1272D] text-white shadow-sm" : "text-[#000000] hover:bg-black/5"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loadError && <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">{loadError}</div>}

      {expensePeriod === "custom" && (
        <div className="flex flex-wrap items-end gap-3 mb-6 bg-white border border-black/10 rounded-xl p-4">
          <div>
            <label className={lab}>From</label>
            <input type="date" value={expenseStartDate} onChange={(e) => setExpenseStartDate(e.target.value)} className="bg-[#FAFAFA] border border-black/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C1272D]" />
          </div>
          <div>
            <label className={lab}>To</label>
            <input type="date" value={expenseEndDate} onChange={(e) => setExpenseEndDate(e.target.value)} className="bg-[#FAFAFA] border border-black/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#C1272D]" />
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="rounded-2xl p-5 shadow-sm text-white bg-gradient-to-br from-[#C1272D] to-[#6E1216]">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-white/90">Total Expenses</span>
            <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
              <Coins className="w-4 h-4 text-white" />
            </div>
          </div>
          <div className="text-2xl font-black">₹{inr(expenseStats.total)}</div>
          <div className="text-[9px] text-white/80 font-semibold mt-1 uppercase tracking-wider">{expensePeriod} period</div>
        </div>
        <div className="bg-white border border-black/10 rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">Entries</span>
            <div className="w-8 h-8 rounded-full bg-[#6B5F52]/10 flex items-center justify-center">
              <Receipt className="w-4 h-4 text-[#6B5F52]" />
            </div>
          </div>
          <div className="text-2xl font-black text-[#000000]">{expenseStats.count}</div>
          <div className="text-[9px] text-[#000000] font-semibold mt-1">Expenses recorded</div>
        </div>
        <div className="bg-white border border-black/10 rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">Top Category</span>
            <div className="w-8 h-8 rounded-full bg-[#6B5F52]/10 flex items-center justify-center">
              <Tag className="w-4 h-4 text-[#6B5F52]" />
            </div>
          </div>
          <div className="text-lg font-black text-[#000000] truncate">{expenseStats.topCategory}</div>
          <div className="text-[9px] text-[#000000] font-semibold mt-1">Highest spend</div>
        </div>
      </div>

      {/* Two-column: add form + category breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mb-6">
        <div
          id="expense-form"
          className={`lg:col-span-2 bg-white border rounded-2xl p-5 shadow-sm h-fit scroll-mt-4 ${editingExpenseId ? "border-[#C1272D] ring-2 ring-[#C1272D]/15" : "border-black/10"}`}
        >
          <h3 className="text-sm font-black text-[#000000] uppercase tracking-wider flex items-center gap-2 mb-4">
            <span className="w-1.5 h-6 bg-[#C1272D] rounded-full" />
            {editingExpenseId ? "Edit Expense" : "Add Expense"}
          </h3>
          <div className="space-y-3">
            <div>
              <label className={lab}>What for?</label>
              <input type="text" value={expTitle} onChange={(e) => setExpTitle(e.target.value)} placeholder="e.g. October shop rent" className={inp} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={lab}>Amount (₹)</label>
                <input type="number" min="0" step="0.01" value={expAmount} onWheel={(e) => e.currentTarget.blur()} onChange={(e) => setExpAmount(e.target.value === "" ? "" : parseFloat(e.target.value))} placeholder="0.00" className={inp} />
              </div>
              <div>
                <label className={lab}>Date</label>
                <input type="date" value={expDate} onChange={(e) => setExpDate(e.target.value)} className={inp} />
              </div>
            </div>
            <div>
              <label className={lab}>Category</label>
              <select value={expCategoryValue} onChange={(e) => setExpCategory(e.target.value)} className={`${inp} cursor-pointer`}>
                {/* An expense being edited may use a category that is now off or deleted. */}
                {!activeExpenseCategories.includes(expCategoryValue) && <option value={expCategoryValue}>{expCategoryValue}</option>}
                {activeExpenseCategories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button type="button" onClick={() => setShowExpenseCatManager(true)} className="text-[10px] font-bold text-[#C1272D] hover:underline mt-1 cursor-pointer">
                Add or manage categories
              </button>
            </div>
            <div>
              <label className={lab}>Paid via</label>
              <select value={expPaymentMode} onChange={(e) => setExpPaymentMode(e.target.value)} className={`${inp} cursor-pointer`}>
                {EXPENSE_PAYMENT_MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lab}>Notes (optional)</label>
              <input type="text" value={expNotes} onChange={(e) => setExpNotes(e.target.value)} placeholder="Reference / supplier / bill no." className={inp} />
            </div>
            <button
              onClick={handleAddExpense}
              disabled={isSavingExpense}
              className="w-full mt-1 bg-[#C1272D] hover:bg-[#9B1C21] disabled:opacity-60 text-white py-3 rounded-lg font-black text-[11px] uppercase tracking-[0.1em] flex items-center justify-center gap-2 transition-transform active:scale-[0.98] shadow-sm cursor-pointer"
            >
              {editingExpenseId ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {isSavingExpense ? "Saving…" : editingExpenseId ? "Update Expense" : "Add Expense"}
            </button>
            {editingExpenseId && (
              <button type="button" onClick={cancelEditExpense} disabled={isSavingExpense} className="w-full bg-black/5 hover:bg-black/10 text-[#000000] py-2.5 rounded-lg font-black text-[11px] uppercase tracking-[0.1em] cursor-pointer transition-colors">
                Cancel Edit
              </button>
            )}
          </div>
        </div>

        {/* Category breakdown / manager */}
        <div className="lg:col-span-3 bg-white border border-black/10 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="text-sm font-black text-[#000000] uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-6 bg-[#C1272D] rounded-full" />
              Spend by Category
            </h3>
            <button
              type="button"
              onClick={() => {
                setShowExpenseCatManager((v) => !v);
                setExpenseCatError(null);
              }}
              className="text-[10px] font-bold text-[#000000] bg-white border border-black/10 hover:border-[#C1272D] px-3 py-2 rounded-lg uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {showExpenseCatManager ? "Close" : "Manage"}
            </button>
          </div>
          {showExpenseCatManager ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <div className="border border-black/10 rounded-2xl p-4">
                <p className="text-xs font-black text-[#000000] flex items-center gap-2 pb-3 mb-3 border-b border-black/5">
                  <Tag className="w-4 h-4" /> Add Category
                </p>
                <label htmlFor="new-expense-category" className="block text-[11px] font-bold text-[#000000]/70 mb-1.5">
                  Category Name <span className="text-[#C1272D]">*</span>
                </label>
                <input
                  id="new-expense-category"
                  type="text"
                  value={newExpenseCatName}
                  onChange={(e) => {
                    setNewExpenseCatName(e.target.value);
                    setExpenseCatError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddExpenseCategory();
                  }}
                  placeholder="e.g. Utility Bills, Packaging"
                  className="w-full bg-[#FAFAFA] border border-black/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#C1272D] placeholder:text-black/30"
                />
                {expenseCatError && <p role="alert" className="text-[11px] font-bold text-[#B91C1C] mt-1.5">{expenseCatError}</p>}
                <button
                  type="button"
                  onClick={handleAddExpenseCategory}
                  disabled={isSavingExpenseCat || !newExpenseCatName.trim()}
                  className="w-full mt-3 bg-[#C1272D] hover:bg-[#9B1C21] disabled:opacity-45 disabled:cursor-not-allowed text-white py-2.5 rounded-lg font-black text-[11px] uppercase tracking-[0.1em] flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {isSavingExpenseCat ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Add Category
                </button>
              </div>

              <div className="border border-black/10 rounded-2xl overflow-hidden">
                <p className="text-xs font-black text-[#000000] px-4 py-3 bg-[#FAFAFA] border-b border-black/10">
                  Expense Categories ({expenseCategories.length})
                </p>
                {expenseCategories.length === 0 ? (
                  <p className="px-4 py-6 text-xs font-semibold text-[#000000]/50 text-center">No categories yet. Add one on the left.</p>
                ) : (
                  <div className="max-h-80 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="text-[10px] font-black uppercase tracking-wider text-[#000000]/55 border-b border-black/10">
                        <tr>
                          <th className="px-4 py-2">Category Name</th>
                          <th className="px-2 py-2">Status</th>
                          <th className="px-2 py-2 w-8"><span className="sr-only">Delete</span></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-black/5">
                        {expenseCategories.map((cat) => (
                          <tr key={cat.id}>
                            <td className="px-4 py-2.5 font-bold text-[#000000]">{cat.name}</td>
                            <td className="px-2 py-2.5">
                              <button
                                type="button"
                                onClick={() => toggleExpenseCategory(cat)}
                                title={cat.is_active ? "Click to hide from the expense form" : "Click to show in the expense form"}
                                className={`text-[10px] font-black px-2.5 py-1 rounded-full border cursor-pointer transition-colors ${
                                  cat.is_active ? "text-[#15803D] bg-[#15803D]/10 border-[#15803D]/25 hover:bg-[#15803D]/20" : "text-[#000000]/50 bg-black/5 border-black/10 hover:bg-black/10"
                                }`}
                              >
                                {cat.is_active ? "Active" : "Inactive"}
                              </button>
                            </td>
                            <td className="px-2 py-2.5">
                              <button type="button" onClick={() => deleteExpenseCategory(cat)} aria-label={`Delete ${cat.name}`} title="Delete category" className="w-7 h-7 flex items-center justify-center rounded-md text-[#000000]/35 hover:text-[#DC2626] hover:bg-[#DC2626]/10 transition-colors cursor-pointer">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : expenseStats.categoryBreakdown.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-14 h-14 rounded-full bg-[#6B5F52]/10 flex items-center justify-center mx-auto mb-4">
                <PiggyBank className="w-7 h-7 text-[#6B5F52]" />
              </div>
              <p className="text-sm font-bold text-[#000000]">No expenses in this period yet.</p>
              <p className="text-xs font-semibold text-[#000000]/60 mt-1">Add your first expense to see the breakdown.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {expenseStats.categoryBreakdown.map((row) => {
                const max = expenseStats.categoryBreakdown[0].amount || 1;
                const pct = expenseStats.total ? (row.amount / expenseStats.total) * 100 : 0;
                return (
                  <div key={row.category}>
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-xs font-bold text-[#000000] flex items-center gap-1.5">
                        <Tag className="w-3 h-3 text-[#6B5F52]" />
                        {row.category}
                      </span>
                      <span className="text-xs font-black text-[#000000]">
                        ₹{inr(row.amount)}
                        <span className="text-[10px] font-bold text-[#000000]/50 ml-1.5">{pct.toFixed(0)}%</span>
                      </span>
                    </div>
                    <div className="h-2.5 bg-black/5 rounded-full overflow-hidden">
                      <div className="h-full bg-[#9B1C21] rounded-full transition-all duration-700" style={{ width: `${(row.amount / max) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Expense log */}
      <div className="bg-white border border-black/10 rounded-2xl shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 p-4 border-b border-black/10">
          <h3 className="text-sm font-black text-[#000000] uppercase tracking-wider flex items-center gap-2">
            <List className="w-4 h-4 text-[#C1272D]" />
            Expense Log
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <select value={expenseCategoryFilter} onChange={(e) => setExpenseCategoryFilter(e.target.value)} className="bg-[#FAFAFA] border border-black/10 rounded-lg px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#C1272D] cursor-pointer">
              <option value="ALL">All categories</option>
              {expenseStats.allCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-black/30 absolute left-3 top-1/2 -translate-y-1/2" />
              <input type="text" value={expenseSearch} onChange={(e) => setExpenseSearch(e.target.value)} placeholder="Search expenses…" className="bg-[#FAFAFA] border border-black/10 rounded-lg pl-8 pr-3 py-2 text-xs focus:outline-none focus:border-[#C1272D] placeholder:text-black/30 w-44" />
            </div>
          </div>
        </div>

        {expenseStats.filtered.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-14 h-14 rounded-full bg-[#6B5F52]/10 flex items-center justify-center mx-auto mb-4">
              <Wallet className="w-7 h-7 text-[#6B5F52]" />
            </div>
            <p className="text-sm font-bold text-[#000000]">No expenses found.</p>
            <p className="text-xs font-semibold text-[#000000]/60 mt-1">Try a different period or add a new expense.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[720px]">
              <thead className="bg-[#FAFAFA] border-b border-black/10 select-none">
                <tr>
                  {["Date", "Expense", "Category", "Paid via"].map((h) => (
                    <th key={h} className="p-3 text-[10px] font-black text-[#000000] uppercase tracking-wider">{h}</th>
                  ))}
                  <th className="p-3 text-[10px] font-black text-[#000000] uppercase tracking-wider text-right">Amount</th>
                  <th className="p-3 text-[10px] font-black text-[#000000] uppercase tracking-wider text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {expenseStats.filtered.map((e) => (
                  <tr key={e.id} className="border-b border-black/5 hover:bg-[#FAFAFA] transition-colors">
                    <td className="p-3 text-xs font-semibold text-[#000000] whitespace-nowrap">
                      {new Date(`${e.expense_date}T00:00:00`).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </td>
                    <td className="p-3">
                      <p className="text-sm font-bold text-[#000000]">{e.title}</p>
                      {e.notes && <p className="text-[10px] text-[#000000]/50 font-semibold mt-0.5">{e.notes}</p>}
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#000000] bg-black/5 border border-black/10 px-2 py-1 rounded-full uppercase tracking-wider">
                        <Tag className="w-2.5 h-2.5" />
                        {e.category}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#000000]/70">
                        <Banknote className="w-3 h-3" />
                        {e.payment_mode}
                      </span>
                    </td>
                    <td className="p-3 text-right text-sm font-black text-[#B91C1C] whitespace-nowrap">− ₹{inr(e.amount)}</td>
                    <td className="p-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => startEditExpense(e)} title="Edit expense" className={`inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors cursor-pointer ${editingExpenseId === e.id ? "bg-[#C1272D] text-white" : "bg-black/5 hover:bg-black/10 text-[#000000]"}`}>
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteExpense(e.id)} title="Delete expense" className="inline-flex items-center justify-center w-8 h-8 bg-[#B91C1C]/10 hover:bg-[#B91C1C]/20 text-[#B91C1C] rounded-md transition-colors cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#FAFAFA] border-t border-black/10">
                  <td colSpan={4} className="p-3 text-[10px] font-black text-[#000000] uppercase tracking-wider text-right">Total</td>
                  <td className="p-3 text-right text-sm font-black text-[#B91C1C] whitespace-nowrap">− ₹{inr(expenseStats.total)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
