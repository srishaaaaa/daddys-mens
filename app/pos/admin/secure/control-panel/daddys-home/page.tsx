"use client";

import { useState, useRef, useEffect } from "react";
import {
  User,
  Receipt,
  Search,
  ChevronDown,
  X,
  PackagePlus,
  ShoppingBag,
  Trash2,
  Plus,
  TrendingUp,
  Trophy,
  IndianRupee,
  BarChart2,
  Package,
  List,
  Globe,
  Zap,
  Menu,
  History,
  ChevronLeft,
  ChevronRight,
  Percent,
  Calendar,
  Download,
  LogOut,
  Eye,
  EyeOff,
  ShieldCheck,
  Shield,
  Lock,
  Printer,
  Save,
  AlertTriangle,
  Loader2,
  RefreshCw,
  MessageCircle,
  Star,
  Check,
  PiggyBank,
  TrendingDown,
  Settings as SettingsIcon,
} from "lucide-react";
import InstallAppButton from "@/app/install-app-button";
import InventoryPanel from "./InventoryPanel";
import CouponsPanel from "./CouponsPanel";
import LoyaltyPanel, { prefetchLoyalty } from "./LoyaltyPanel";
import { prefetchInventory } from "./InventoryPanel";
import { prefetchCoupons } from "./CouponsPanel";
import { prefetchExpenses } from "./ExpensesPanel";
import { prefetchSettings } from "./SettingsPanel";
import ExpensesPanel from "./ExpensesPanel";
import { listExpensesAction } from "@/app/pos/expense-actions";
import SettingsPanel from "./SettingsPanel";
import PrintSettingsModal from "@/app/_components/PrintSettingsModal";
import { listBillOffersAction, loyaltyLookupAction, loyaltyRegisterAction, loyaltySettleAction, recordOffersGivenAction } from "@/app/pos/loyalty-actions";
import { offerEntitlements } from "@/lib/loyalty/gifts";
import { pointsValue, redeemCap } from "@/lib/loyalty/engine";
import type { GiftOffer, LoyaltyLookup } from "@/lib/loyalty/types";
import { suggestCustomersAction } from "@/app/pos/loyalty-actions";
import { UpiQrCard } from "@/app/_components/UpiQrCard";
import { createPayLinkAction, getUpiConfigAction } from "@/app/pos/pay-actions";
import { getShopProfileAction } from "@/app/pos/settings-actions";
import { listCouponsAction, redeemCouponAction, validateCouponAction } from "@/app/pos/coupon-actions";
import type { Coupon as DbCoupon } from "@/lib/couponTypes";
import {
  createProductAction,
  deleteProductAction,
  deleteOrderAction,
  listOrdersAction,
  listProductsAction,
  orderExistsAction,
  createOrderAction,
  updateProductAction,
  verifyPasscode,
  logoutAction,
} from "@/app/pos/actions";

const UPI_CHANNELS = [
  { key: "counter_qr", label: "Counter QR" },
  { key: "whatsapp_link", label: "WhatsApp payment link" },
  { key: "guest_phone", label: "Guest's phone QR" },
  { key: "gpay_number", label: "GPay number" },
  { key: "other", label: "Other UPI" },
] as const;

type CatalogItem = {
  id: string;
  imageUrl?: string | null;
  name: string;
  desc?: string;
  price?: number;
};

// The catalog lives entirely in the `products` table — the built-in items were
// seeded there by migration 0002_seed_default_products.sql.

type OrderItem = {
  id: string;
  name: string;
  desc: string;
  price: number;
  qty: number;
};

type CompletedOrder = {
  id: string;
  customerName: string;
  customerPhone: string;
  source: "ONLINE" | "OFFLINE";
  items: OrderItem[];
  subtotal: number;
  discount: number;
  discountType?: "PERCENT" | "FIXED";
  discountValue?: number;
  deliveryFee: number;
  grandTotal: number;
  cashReceived: number;
  paymentMethod?: "CASH" | "CARD" | "GPAY" | "SPLIT";
  splitCash?: number;
  splitUpi?: number;
  splitCard?: number;
  /** saved GST flag; undefined on bills from before it existed */
  isGst?: boolean;
  date: string;
  status: "Completed" | "Pending";
};

/* A stat card for the analytics screens. */
const AnalyticsCard = ({
  label, value, sub, icon, tone = "slate", valueClass = "", subContent,
}: {
  label: string; value: React.ReactNode; sub?: string; icon: React.ReactNode;
  tone?: "slate" | "green" | "teal" | "pink" | "violet"; valueClass?: string; subContent?: React.ReactNode;
}) => {
  const chip = { slate: "bg-slate-100 text-slate-600", green: "bg-emerald-100 text-emerald-700", teal: "bg-cyan-100 text-cyan-700", pink: "bg-[#C1272D]/10 text-[#C1272D]", violet: "bg-violet-100 text-violet-700" }[tone];
  return (
    <div className="bg-white border border-black/10 rounded-2xl p-5 shadow-sm transition-shadow hover:shadow-md min-w-0">
      <div className="flex justify-between items-start gap-2">
        <span className="text-[11px] font-extrabold uppercase tracking-wide text-[#000000]">{label}</span>
        <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${chip}`}>{icon}</span>
      </div>
      <div className={`mt-5 mb-1.5 text-[26px] leading-none font-black tracking-tight text-[#000000] truncate ${valueClass}`}>{value}</div>
      {subContent ?? <div className="text-[10.5px] font-semibold text-[#000000]/70 truncate">{sub}</div>}
    </div>
  );
};

const SearchableItemInput = ({
  item,
  catalog,
  updateItem,
}: {
  item: OrderItem;
  catalog: CatalogItem[];
  updateItem: (id: string, field: keyof OrderItem, value: any) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [internalSearch, setInternalSearch] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredCatalog = catalog.filter(
    (c) =>
      c.name.toLowerCase().includes(internalSearch.toLowerCase()) ||
      (c.desc && c.desc.toLowerCase().includes(internalSearch.toLowerCase())),
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [internalSearch, isOpen]);

  useEffect(() => {
    if (listRef.current && listRef.current.children[selectedIndex]) {
      const activeItem = listRef.current.children[selectedIndex] as HTMLElement;
      activeItem.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen && e.key !== "Escape") {
      setIsOpen(true);
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) =>
        prev < filteredCatalog.length - 1 ? prev + 1 : prev,
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredCatalog[selectedIndex]) {
        const catItem = filteredCatalog[selectedIndex];
        updateItem(item.id, "name", catItem.name);
        updateItem(item.id, "desc", catItem.desc || "");
        if (catItem.price !== undefined) {
          updateItem(item.id, "price", catItem.price);
        }
        setIsOpen(false);
        setTimeout(() => {
          const priceInput = document.getElementById(`price-${item.id}`);
          if (priceInput) priceInput.focus();
        }, 50);
      } else if (internalSearch.trim()) {
        updateItem(item.id, "name", internalSearch.trim());
        updateItem(item.id, "desc", "");
        setIsOpen(false);
        setTimeout(() => {
          const priceInput = document.getElementById(`price-${item.id}`);
          if (priceInput) priceInput.focus();
        }, 50);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative w-full" ref={wrapperRef}>
      <div
        className={`relative cursor-pointer bg-[#FFFFFF] border ${isOpen ? "border-black/10 bg-white" : "border-black/10"} hover:border-black/10 rounded-lg px-4 py-2.5 transition-colors flex justify-between items-center group`}
        onClick={() => {
          setIsOpen(!isOpen);
          setInternalSearch("");
        }}
      >
        <div className="flex-1">
          <div className="font-semibold text-[#000000] text-sm">
            {item.name || (
              <span className="text-[#000000] font-normal">
                Select an item...
              </span>
            )}
          </div>
          {item.desc && !isOpen && (
            <div className="text-[10px] text-[#000000] mt-0.5">{item.desc}</div>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-[#000000] group-hover:text-[#C1272D] transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </div>

      {isOpen && (
        <div className="absolute z-50 w-full mt-2 bg-[#FFFFFF] border border-black/10 rounded-lg shadow-[0_10px_40px_rgba(0,0,0,0.12)] overflow-hidden ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-200">
          <div className="p-2 border-b border-black/10 bg-[#FFFFFF]">
            <div className="bg-[#FFFFFF] flex items-center px-3 py-2 rounded-md">
              <Search className="w-4 h-4 text-[#000000] mr-2" />
              <input
                type="text"
                placeholder="Search catalog..."
                className="w-full bg-transparent text-[#000000] text-sm focus:outline-none placeholder:text-[#000000]"
                value={internalSearch}
                onChange={(e) => setInternalSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filteredCatalog.length > 0 ? (
              <ul className="py-1" ref={listRef}>
                {filteredCatalog.map((catItem, idx) => (
                  <li
                    key={catItem.id}
                    className={`px-5 py-3 cursor-pointer border-b border-transparent last:border-0 transition-colors ${idx === selectedIndex ? "bg-[#FFFFFF] border-l-4 border-l-[#C1272D]" : "hover:bg-[#FFFFFF] border-l-4 border-l-transparent"}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      updateItem(item.id, "name", catItem.name);
                      updateItem(item.id, "desc", catItem.desc || "");
                      if (catItem.price !== undefined) {
                        updateItem(item.id, "price", catItem.price);
                      }
                      setIsOpen(false);
                      setTimeout(() => {
                        const priceInput = document.getElementById(
                          `price-${item.id}`,
                        );
                        if (priceInput) priceInput.focus();
                      }, 50);
                    }}
                    onTouchStart={(e) => {
                      e.preventDefault();
                      updateItem(item.id, "name", catItem.name);
                      updateItem(item.id, "desc", catItem.desc || "");
                      if (catItem.price !== undefined) {
                        updateItem(item.id, "price", catItem.price);
                      }
                      setIsOpen(false);
                      setTimeout(() => {
                        const priceInput = document.getElementById(
                          `price-${item.id}`,
                        );
                        if (priceInput) priceInput.focus();
                      }, 50);
                    }}
                    onClick={() => {
                      updateItem(item.id, "name", catItem.name);
                      updateItem(item.id, "desc", catItem.desc || "");
                      if (catItem.price !== undefined) {
                        updateItem(item.id, "price", catItem.price);
                      }
                      setIsOpen(false);
                      setTimeout(() => {
                        const priceInput = document.getElementById(
                          `price-${item.id}`,
                        );
                        if (priceInput) priceInput.focus();
                      }, 50);
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <div className="flex items-center gap-3">
                      {catItem.imageUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={catItem.imageUrl} alt="" className="w-10 h-10 rounded-md object-cover border border-black/10 shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-[#000000]">
                          {catItem.name}
                        </div>
                        {catItem.desc && (
                          <div className="text-[11px] font-semibold uppercase tracking-wider text-[#000000] mt-1">
                            {catItem.desc}
                          </div>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="px-5 py-6 text-sm text-[#000000] text-center font-semibold">
                Press Enter to use "{internalSearch}"
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default function POSBilling() {
  const [isMounted, setIsMounted] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      return (
        sessionStorage.getItem("pos_authorized") === "true" ||
        localStorage.getItem("pos_authorized") === "true"
      );
    }
    return false;
  });
  const [role, setRole] = useState<'staff' | 'admin' | null>(() => {
    if (typeof window !== "undefined") {
      const stored =
        sessionStorage.getItem("pos_role") ||
        localStorage.getItem("pos_role");
      return (stored as 'staff' | 'admin') || null;
    }
    return null;
  });
  const [passcode, setPasscode] = useState<string>("");
  const [passcodeError, setPasscodeError] = useState<string>("");
  const [showPasscode, setShowPasscode] = useState<boolean>(false);

  const [activeCategory, setActiveCategory] = useState<string>("ALL");
  const [activeTab, setActiveTab] = useState<
    "billing" | "orders" | "analytics" | "inventory" | "coupons" | "loyalty" | "expenses" | "settings"
  >("billing");
  const [isOnline, setIsOnline] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [items, setItems] = useState<OrderItem[]>([
    { id: "1", name: "", desc: "", price: 0, qty: 1 },
  ]);
  const [orders, setOrders] = useState<CompletedOrder[]>([]);
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountType, setDiscountType] = useState<"fixed" | "percent">(
    "fixed",
  );
  const [deliveryFee, setDeliveryFee] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<"CASH" | "CARD" | "GPAY" | "SPLIT">("CASH");
  // UPI: the shop's details come from .env; the channel records how the payment reached the shop.
  const [upiCfg, setUpiCfg] = useState<{ id: string; name: string; phone: string; minutes: number; shopName: string } | null>(null);
  const [upiVia, setUpiVia] = useState<string>("");
  // Shop name and phone, from Settings (used in headings and WhatsApp messages).
  const [shopProfile, setShopProfile] = useState({ shopName: "Daddy's Home", phone: "8056642706" });
  const [linkSent, setLinkSent] = useState(false);
  // Split payment: any mix of cash, UPI and card that adds up to the bill.
  const [splitCash, setSplitCash] = useState<number | "">("");
  const [splitUpi, setSplitUpi] = useState<number | "">("");
  const [splitCard, setSplitCard] = useState<number | "">("");

  // Loyalty: the member for the phone typed in billing, points being used, gifts handed over.
  const [member, setMember] = useState<(LoyaltyLookup & { products: { id: string; name: string; category: string }[] }) | null>(null);
  const [pointsToUse, setPointsToUse] = useState(0);
  const [claimedVouchers, setClaimedVouchers] = useState<string[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [billOffers, setBillOffers] = useState<GiftOffer[]>([]);
  const [addedOffers, setAddedOffers] = useState<string[]>([]);
  const [savedLoyaltyNote, setSavedLoyaltyNote] = useState("");

  const refreshMember = async (phone: string) => {
    try {
      setMember(await loyaltyLookupAction(phone));
    } catch {
      setMember(null);
    }
  };
  useEffect(() => {
    setPointsToUse(0);
    setClaimedVouchers([]);
    if (customerPhone.length !== 10) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMember(null);
      return;
    }
    let live = true;
    loyaltyLookupAction(customerPhone)
      .then((m) => live && setMember(m))
      .catch(() => live && setMember(null));
    return () => {
      live = false;
    };
  }, [customerPhone]);

  const enrolCustomer = async () => {
    if (enrolling) return;
    setEnrolling(true);
    try {
      await loyaltyRegisterAction({ phone: customerPhone, name: customerName });
      await refreshMember(customerPhone);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Could not add the customer.");
    } finally {
      setEnrolling(false);
    }
  };

  const [cashReceived, setCashReceived] = useState<number>(0);
  const [applyGST, setApplyGST] = useState<boolean>(false);
  const [gstPercentage, setGstPercentage] = useState<number>(5);
  const [gstInclusive, setGstInclusive] = useState<boolean>(false);

  // The item list is remembered on this device, so the picker has items the moment the page opens.
  const [catalog, setCatalog] = useState<CatalogItem[]>(() => {
    try {
      const raw = typeof window !== "undefined" ? localStorage.getItem("pos_catalog_cache") : null;
      return raw ? (JSON.parse(raw) as CatalogItem[]) : [];
    } catch {
      return [];
    }
  });
  // Distinguishes "still loading" from "genuinely empty", so the picker never
  // flashes a misleading `No items match ""` before the fetch lands.
  const [isCatalogLoading, setIsCatalogLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
  const [activeInvoiceId, setActiveInvoiceId] = useState<string | null>(null);

  // Analytics filter/navigation states
  // Expense amounts and dates, for Net Profit on the dashboard (admin only; empty for staff).
  const [expenseRows, setExpenseRows] = useState<{ amount: number; date: string }[]>([]);
  // All bills / GST invoices only / Non-GST bills only (narrows every analytics number).
  const [billTypeFilter, setBillTypeFilter] = useState<"all" | "gst" | "nongst">("all");
  const [analyticsPeriod, setAnalyticsPeriod] = useState<
    "all" | "today" | "week" | "month" | "year" | "custom"
  >("all");
  const [analyticsStartDate, setAnalyticsStartDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [analyticsEndDate, setAnalyticsEndDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [analyticsSubTab, setAnalyticsSubTab] = useState<
    "revenue" | "today" | "products" | "coupons"
  >("revenue");
  const [analyticsSearchPhone, setAnalyticsSearchPhone] = useState("");
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [couponSearchQuery, setCouponSearchQuery] = useState("");

  useEffect(() => {
    const auth =
      sessionStorage.getItem("pos_authorized") ||
      localStorage.getItem("pos_authorized");
    const storedRole = 
      sessionStorage.getItem("pos_role") ||
      localStorage.getItem("pos_role");
      
    if (auth === "true") {
      sessionStorage.setItem("pos_authorized", "true");
      if (storedRole) {
        sessionStorage.setItem("pos_role", storedRole);
        setRole(storedRole as 'staff' | 'admin');
        if (storedRole === 'staff') {
          setActiveTab('billing');
        }
      } else {
        setRole('admin');
      }
      setIsAuthorized(true);
    }
    setIsMounted(true);
  }, []);

  const handleVerifyPasscode = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const result = await verifyPasscode(passcode);
    if (result && result.success) {
      sessionStorage.setItem("pos_authorized", "true");
      sessionStorage.setItem("pos_role", result.role || "admin");
      setRole(result.role as 'staff' | 'admin');
      if (result.role === 'staff') {
        setActiveTab('billing');
      }
      setIsAuthorized(true);
      setPasscode("");
      setPasscodeError("");
      // Fetch catalog products and orders immediately upon successful authentication
      fetchData();
    } else {
      setPasscodeError("Incorrect passcode. Please try again.");
    }
  };

  const handleLogout = async () => {
    await logoutAction();
    sessionStorage.removeItem("pos_authorized");
    localStorage.removeItem("pos_authorized");
    sessionStorage.removeItem("pos_role");
    localStorage.removeItem("pos_role");
    setRole(null);
    setPasscode("");
    setPasscodeError("");
    setIsAuthorized(false);
  };

  const selectTab = (tab: "billing" | "orders" | "analytics" | "inventory" | "coupons" | "loyalty" | "expenses" | "settings") => {
    setActiveTab(tab);
    // On mobile/tablet the sidebar is an overlay — close it after navigating.
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  };

  const fetchData = async () => {
    setIsRefreshing(true);
    try {
      const productsData = await listProductsAction();
      const freshCatalog = productsData.map((p) => ({
        id: p.id,
        name: p.name,
        desc: p.description,
        imageUrl: p.image_url ?? null,
        price: p.default_price || undefined,
      }));
      setCatalog(freshCatalog);
      try {
        localStorage.setItem("pos_catalog_cache", JSON.stringify(freshCatalog));
      } catch {
        /* storage full or blocked: the list just loads fresh next time */
      }

      getUpiConfigAction().then(setUpiCfg).catch(() => {});
      // Warm the other tabs in the background so they open instantly (these quietly do nothing for staff).
      void prefetchLoyalty();
      void prefetchInventory();
      void prefetchCoupons();
      void prefetchExpenses();
      void prefetchSettings();
      getShopProfileAction().then((p) => setShopProfile({ shopName: p.shopName, phone: p.phone })).catch(() => {});
      listBillOffersAction().then(setBillOffers).catch(() => {});
      listExpensesAction()
        .then((rows) => setExpenseRows(rows.map((e) => ({ amount: e.amount, date: e.expense_date }))))
        .catch(() => {});
      // Coupons are admin-managed; staff just won't get the list (billing validates server-side).
      listCouponsAction().then(setDbCoupons).catch(() => {});

      const ordersData = await listOrdersAction();
      setOrders(
        ordersData.map((o) => {
          let phone = o.customer_phone || "";
          let method: "CASH" | "CARD" | "GPAY" | "SPLIT" = "CASH";
          if (phone.includes("_")) {
            const parts = phone.split("_");
            phone = parts[0];
            const pm = parts[1];
            if (pm === "CARD" || pm === "GPAY" || pm === "SPLIT") {
              method = pm;
            }
          }
          return {
            id: o.id,
            customerName: o.customer_name || "Guest",
            customerPhone: phone,
            source: o.source,
            items: o.order_items.map((i, idx) => ({
              id: `${o.id}-${idx}`,
              name: i.snapshot_name,
              desc: i.snapshot_desc || "",
              price: i.snapshot_price,
              qty: i.quantity,
            })),
            subtotal: o.subtotal,
            discount: o.discount_amount,
            discountType: o.discount_type,
            discountValue: o.discount_value,
            deliveryFee: o.delivery_fee,
            grandTotal: o.grand_total,
            cashReceived: o.cash_received,
            paymentMethod: method,
            splitCash: o.split_cash ?? 0,
            splitUpi: o.split_upi ?? 0,
            splitCard: o.split_card ?? 0,
            isGst: o.is_gst,
            date: o.created_at,
            status: (o.status === "COMPLETED" ? "Completed" : "Pending") as
              | "Completed"
              | "Pending",
          };
        }),
      );
    } catch (err) {
      console.error("Error refreshing data:", err);
    } finally {
      setIsRefreshing(false);
      setIsCatalogLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      fetchData();
    }
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setIsSidebarOpen(false);
    }
  }, [isAuthorized]);

  // Modal State
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<CompletedOrder | null>(
    null,
  );
  const [newCatName, setNewCatName] = useState("");
  const [newCatDesc, setNewCatDesc] = useState("");
  const [newCatPrice, setNewCatPrice] = useState<number | "">("");

  const [activeCatalogRowId, setActiveCatalogRowId] = useState<string | null>(
    null,
  );
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogTargetRowId, setCatalogTargetRowId] = useState<string | null>(
    null,
  );

  // Generic "Are you sure?" confirmation dialog — reused for destructive actions.
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    onConfirm: () => void | Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // Billing: "Save Order" & "Complete Sale" states
  const [isSavingOrder, setIsSavingOrder] = useState(false);
  const [savedOrderId, setSavedOrderId] = useState<string | null>(null);
  const [isCompletingSale, setIsCompletingSale] = useState(false);
  const [saleCompletedPrompt, setSaleCompletedPrompt] = useState<{
    orderId: string;
    customerName: string;
    customerPhone: string;
    grandTotal: number;
    orderSnapshot: OrderSnapshot;
  } | null>(null);
  // Which bill the "Print Settings" dialog is open for (thermal roll / sheet, paper size).
  const [printSettingsFor, setPrintSettingsFor] = useState<string | null>(null);
  const [promptPhone, setPromptPhone] = useState("");
  const [showPromptPhoneInput, setShowPromptPhoneInput] = useState(false);
  const [isSendingWhatsApp, setIsSendingWhatsApp] = useState(false);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);

  // Order search/filters state
  const [orderSearchId, setOrderSearchId] = useState("");
  const [orderSearchName, setOrderSearchName] = useState("");
  const [orderSearchPhone, setOrderSearchPhone] = useState("");
  const [orderFilterSource, setOrderFilterSource] = useState("ALL");
  const [orderFilterStatus, setOrderFilterStatus] = useState("ALL");
  const [historyPeriod, setHistoryPeriod] = useState<
    "all" | "today" | "week" | "month" | "year" | "custom"
  >("all");
  const [historyStartDate, setHistoryStartDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );
  const [historyEndDate, setHistoryEndDate] = useState<string>(
    new Date().toISOString().split("T")[0],
  );

  const [selectedCoupon, setSelectedCoupon] = useState<string>("none");
  // Coupons come from the Coupons tab (database), not a hardcoded list.
  const [dbCoupons, setDbCoupons] = useState<DbCoupon[]>([]);
  const [couponInput, setCouponInput] = useState("");
  const [couponMsg, setCouponMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [couponApplying, setCouponApplying] = useState(false);
  const coupons = [
    { code: "none", label: "No Coupon", type: "fixed", value: 0 },
    ...dbCoupons.map((c) => ({
      code: c.code,
      label: `${c.code} (${c.percent}% Off)`,
      type: "percent",
      value: c.percent,
    })),
  ];

  const applyCouponCode = async () => {
    const code = couponInput.trim();
    if (!code || couponApplying) return;
    const sub = items.reduce((acc, item) => acc + item.price * item.qty, 0);
    setCouponApplying(true);
    try {
      const r = await validateCouponAction(code, sub, customerPhone);
      if (r.ok) {
        setSelectedCoupon(r.code);
        setDiscountType("percent");
        setDiscountValue(r.percent);
        setCouponMsg({ ok: true, text: `${r.code} applied — ${r.percent}% off the subtotal.` });
      } else {
        setCouponMsg({ ok: false, text: r.reason });
      }
    } catch {
      setCouponMsg({ ok: false, text: "Could not check the coupon. Try again." });
    } finally {
      setCouponApplying(false);
    }
  };

  const clearCoupon = () => {
    setSelectedCoupon("none");
    setCouponInput("");
    setCouponMsg(null);
    setDiscountValue(0);
  };

  const handleCouponChange = (code: string) => {
    setSelectedCoupon(code);
    const coupon = coupons.find((c) => c.code === code);
    if (coupon) {
      setDiscountType(coupon.type as "fixed" | "percent");
      setDiscountValue(coupon.value);
    }
  };

  const getCouponCodeForOrder = (order: CompletedOrder) => {
    if (order.discount === 0) return "NONE";
    const matched = coupons.find((c) => {
      if (c.code === "none") return false;
      if (order.discountType && order.discountValue) {
        const typeMatches =
          c.type === (order.discountType === "PERCENT" ? "percent" : "fixed");
        const valMatches = c.value === order.discountValue;
        return typeMatches && valMatches;
      }
      if (c.type === "fixed") {
        return c.value === order.discount;
      } else {
        const calculated = order.subtotal * (c.value / 100);
        return Math.abs(calculated - order.discount) < 2;
      }
    });
    return matched ? matched.code.toUpperCase() : "PROMO";
  };

  const addItem = () => {
    setItems([
      ...items,
      { id: Math.random().toString(), name: "", desc: "", price: 0, qty: 1 },
    ]);
  };

  const removeItem = (id: string) => {
    setItems(items.filter((item) => item.id !== id));
  };

  const updateItem = (id: string, field: keyof OrderItem, value: any) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  };

  const clearOrder = () => {
    setItems([
      { id: Math.random().toString(), name: "", desc: "", price: 0, qty: 1 },
    ]);
  };

  const addToCatalog = async () => {
    if (!newCatName.trim()) return;

    const details = {
      name: newCatName,
      description: newCatDesc,
      default_price: newCatPrice || 0,
    };

    if (editingCatalogId) {
      const saved = await updateProductAction(editingCatalogId, details);

      if (!saved) {
        console.error("Could not find catalog item to update", editingCatalogId);
        return;
      }

      setCatalog(
        catalog.map((c) =>
          c.id === editingCatalogId
            ? {
                id: saved.id,
                name: saved.name,
                desc: saved.description,
                price: saved.default_price || undefined,
              }
            : c,
        ),
      );
      setNewCatName("");
      setNewCatDesc("");
      setNewCatPrice("");
      setEditingCatalogId(null);
      setShowCatalogModal(false);
      return;
    }

    const created = await createProductAction(details);

    setCatalog([
      ...catalog,
      {
        id: created.id,
        name: created.name,
        desc: created.description,
        price: created.default_price || undefined,
      },
    ]);

    if (catalogTargetRowId) {
      updateItem(catalogTargetRowId, "name", created.name);
      updateItem(catalogTargetRowId, "price", created.default_price || 0);
      setCatalogTargetRowId(null);
    }

    setNewCatName("");
    setNewCatDesc("");
    setNewCatPrice("");
    setShowCatalogModal(false);
  };

  const deleteFromCatalog = async (id: string) => {
    // Only drop it from the UI once the database write has actually succeeded,
    // so a failure can't leave the screen disagreeing with the catalog.
    await deleteProductAction(id);
    setCatalog((prev) => prev.filter((c) => c.id !== id));
  };

  const subtotal = items.reduce((acc, item) => acc + item.price * item.qty, 0);
  const manualDiscount =
    discountType === "percent"
      ? subtotal * (discountValue / 100)
      : discountValue;
  // Loyalty: the cap comes from the shop's rules; the server re-checks everything when the bill is saved.
  const loyaltyCap = (() => {
    if (!member?.customer || !member.enabled) return null;
    const prods = member.products;
    const lines = items
      .filter((i) => i.name && i.price > 0)
      .map((i) => ({ productId: prods.find((p) => p.name.toLowerCase() === i.name.toLowerCase())?.id ?? null, name: i.name, price: i.price, qty: i.qty }));
    return redeemCap({
      cfg: member.config,
      items: lines,
      catOf: (id) => prods.find((p) => p.id === id)?.category ?? "",
      subtotal,
      remaining: Math.max(0, subtotal - manualDiscount),
      available: member.customer.available,
      couponApplied: selectedCoupon !== "none",
      manualApplied: selectedCoupon === "none" && discountValue > 0,
      rewardApplied: claimedVouchers.length > 0,
    });
  })();
  const loyaltyPoints = loyaltyCap && loyaltyCap.maxPoints > 0 && pointsToUse >= loyaltyCap.minPoints ? Math.min(pointsToUse, loyaltyCap.maxPoints) : 0;
  const loyaltyDiscount = member?.customer && loyaltyPoints > 0 ? pointsValue(loyaltyPoints, member.config) : 0;
  const calculatedDiscount = Math.min(subtotal, manualDiscount + loyaltyDiscount);

  // Bill offers (work for any customer): which ones this bill qualifies for right now.
  const offerEntitled = (() => {
    if (!billOffers.length) return [];
    const lines = items
      .filter((i) => i.name && i.price > 0 && i.desc !== "FREE GIFT")
      .map((i) => ({ productId: catalog.find((c) => c.name.toLowerCase() === i.name.toLowerCase())?.id ?? null, name: i.name, price: i.price, qty: i.qty }));
    const paid = Math.max(0, subtotal - calculatedDiscount);
    return offerEntitlements(billOffers, lines, paid, Date.now(), !!member?.customer);
  })();
  const afterDiscount = Math.max(0, subtotal - calculatedDiscount);
  // Exclusive: GST is added on top. Inclusive: the prices already contain it, so it is only shown.
  const gstAmount = applyGST
    ? gstInclusive
      ? Math.round((afterDiscount - afterDiscount / (1 + gstPercentage / 100)) * 100) / 100
      : afterDiscount * (gstPercentage / 100)
    : 0;
  const taxableBase = applyGST && gstInclusive ? afterDiscount - gstAmount : afterDiscount;
  const grandTotal = afterDiscount + (gstInclusive ? 0 : gstAmount) + deliveryFee;

  const randomInvoiceSuffix = () => {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let randStr = "";
    for (let i = 0; i < 5; i++) {
      randStr += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return randStr;
  };

  const generateOrderId = async () => {
    const currentYear = new Date().getFullYear();
    let attempts = 0;
    try {
      while (attempts < 10) {
        const tempId = `INV-${currentYear}-${randomInvoiceSuffix()}`;
        if (
          !orders.some((o) => o.id === tempId) &&
          !(await orderExistsAction(tempId))
        ) {
          return tempId;
        }
        attempts++;
      }
    } catch (err) {
      console.error("Error generating secure random invoice number:", err);
    }
    return `INV-${currentYear}-${randomInvoiceSuffix()}`;
  };

  type OrderSnapshot = {
    id: string;
    customerName: string;
    customerPhone: string;
    subtotal: number;
    discount: number;
    applyGST: boolean;
    gstPercentage: number;
    gstAmount: number;
    grandTotal: number;
    paymentMethod?: "CASH" | "CARD" | "GPAY" | "SPLIT";
    // For the "Bill Generated" receipt
    deliveryFee?: number;
    cashReceived?: number;
    splitCash?: number;
    splitUpi?: number;
    splitCard?: number;
    upiChannel?: string | null;
    soldItems?: { name: string; qty: number; price: number; free: boolean }[];
  };

  // Validates the current cart, writes the order to the database, updates local
  // state and resets the form. Returns a snapshot for messaging, or null if the
  // cart was invalid or the write failed.
  const persistCurrentOrder = async (): Promise<OrderSnapshot | null> => {
    // Strict validation: every row must have a name and a price > 0.
    const hasInvalidItem = items.some(
      (i) =>
        !i.name ||
        i.name.trim() === "" ||
        i.price === undefined ||
        (i.price <= 0 && i.desc !== "FREE GIFT"),
    );
    if (hasInvalidItem || items.length === 0) {
      alert(
        "Please ensure all items have a valid name and a price greater than 0. Remove any empty rows before proceeding.",
      );
      return null;
    }

    if (paymentMethod === "SPLIT") {
      const parts = [Number(splitCash) || 0, Number(splitUpi) || 0, Number(splitCard) || 0];
      if (parts.filter((n) => n > 0).length < 2) {
        alert("Split payment: enter amounts for at least two of cash, UPI and card.");
        return null;
      }
      if (Math.abs(parts[0] + parts[1] + parts[2] - grandTotal) > 0.009) {
        alert(`Split payment: the parts add up to ₹${(parts[0] + parts[1] + parts[2]).toFixed(2)} but the bill is ₹${grandTotal.toFixed(2)}.`);
        return null;
      }
    }

    // A free offer gift only stays if the bill still qualifies for it (the bill may have changed since it was added).
    const stillEntitled = new Set(offerEntitled.map((e) => e.key));
    const lostOffer = addedOffers.find((k) => !stillEntitled.has(k));
    if (lostOffer) {
      alert("This bill no longer qualifies for the free gift offer that was added. Remove the free item or restore the bill.");
      return null;
    }

    const newOrderId = await generateOrderId();
    const itemsToSave = items;
    const createdAt = new Date().toISOString();
    const snapshot: OrderSnapshot = {
      id: newOrderId,
      customerName: customerName || "Guest",
      customerPhone,
      subtotal,
      discount: calculatedDiscount,
      applyGST,
      gstPercentage,
      gstAmount,
      grandTotal,
      paymentMethod,
      deliveryFee,
      cashReceived: paymentMethod === "CASH" ? cashReceived : paymentMethod === "SPLIT" ? Number(splitCash) || 0 : grandTotal,
      splitCash: paymentMethod === "SPLIT" ? Number(splitCash) || 0 : 0,
      splitUpi: paymentMethod === "SPLIT" ? Number(splitUpi) || 0 : 0,
      splitCard: paymentMethod === "SPLIT" ? Number(splitCard) || 0 : 0,
      upiChannel: paymentMethod === "GPAY" || (paymentMethod === "SPLIT" && Number(splitUpi) > 0) ? upiVia || defaultUpiVia : null,
      soldItems: items.map((i) => ({ name: i.name, qty: i.qty, price: i.price, free: i.desc === "FREE GIFT" })),
    };

    const phoneToSave = customerPhone ? `${customerPhone}_${paymentMethod}` : `_${paymentMethod}`;
    const actualCashReceived = paymentMethod === "CASH" ? cashReceived : paymentMethod === "SPLIT" ? Number(splitCash) || 0 : grandTotal;

    // The subtotal may have changed since the coupon was applied — check it again.
    const couponUsed = selectedCoupon !== "none" ? selectedCoupon : null;
    if (couponUsed) {
      const check = await validateCouponAction(couponUsed, subtotal, customerPhone);
      if (!check.ok) {
        alert(check.reason);
        return null;
      }
    }

    try {
      await createOrderAction({
        id: newOrderId,
        customer_name: customerName || "Guest",
        customer_phone: phoneToSave,
        source: isOnline ? "ONLINE" : "OFFLINE",
        status: "COMPLETED",
        subtotal,
        discount_type: discountType === "percent" ? "PERCENT" : "FIXED",
        discount_value: discountValue,
        discount_amount: calculatedDiscount,
        delivery_fee: deliveryFee,
        grand_total: grandTotal,
        cash_received: actualCashReceived,
        created_at: createdAt,
        is_gst: applyGST,
        gst_inclusive: applyGST && gstInclusive,
        gst_percent: applyGST ? gstPercentage : 0,
        gst_amount: applyGST ? gstAmount : 0,
        upi_channel: paymentMethod === "GPAY" || (paymentMethod === "SPLIT" && Number(splitUpi) > 0) ? upiVia || defaultUpiVia : null,
        split_cash: paymentMethod === "SPLIT" ? Number(splitCash) || 0 : 0,
        split_upi: paymentMethod === "SPLIT" ? Number(splitUpi) || 0 : 0,
        split_card: paymentMethod === "SPLIT" ? Number(splitCard) || 0 : 0,
        order_items: [
          ...itemsToSave.map((i) => ({
            snapshot_name: i.name,
            snapshot_desc: i.desc,
            snapshot_price: i.price,
            quantity: i.qty,
          })),
          ...(applyGST && gstAmount > 0
            ? [
                {
                  snapshot_name: `GST (${gstPercentage}%${gstInclusive ? " incl." : ""})`,
                  snapshot_desc: "",
                  snapshot_price: gstAmount,
                  quantity: 1,
                },
              ]
            : []),
        ],
      });
    } catch (err) {
      console.error("Error saving order:", err);
      alert("Could not save this order. Please check your connection and try again.");
      return null;
    }
    if (addedOffers.length > 0) {
      recordOffersGivenAction(
        offerEntitled.filter((e) => addedOffers.includes(e.key)).map((e) => ({ offerId: e.key.replace(/^offer:/, ""), qty: e.qty })),
      ).catch(() => {});
    }
    if (member?.customer) {
      const settled = await loyaltySettleAction({
        orderId: newOrderId,
        phone: customerPhone,
        pointsUsed: loyaltyPoints,
        voucherIds: claimedVouchers,
      }).catch(() => null);
      if (settled && settled.earned > 0) {
        setSavedLoyaltyNote(`${member.customer.name || "Customer"} earned ${settled.earned} points · balance ${settled.balance}`);
      }
    }
    if (couponUsed) {
      redeemCouponAction(couponUsed)
        .then(() => listCouponsAction().then(setDbCoupons))
        .catch(() => {});
    }

    const newOrder: CompletedOrder = {
      id: newOrderId,
      customerName: customerName || "Guest",
      customerPhone,
      source: isOnline ? "ONLINE" : "OFFLINE",
      items: [
        ...itemsToSave,
        ...(applyGST && gstAmount > 0
          ? [
              {
                id: Math.random().toString(),
                name: `GST (${gstPercentage}%${gstInclusive ? " incl." : ""})`,
                desc: "",
                price: gstAmount,
                qty: 1,
              },
            ]
          : []),
      ],
      subtotal,
      discount: calculatedDiscount,
      discountType: discountType === "percent" ? "PERCENT" : "FIXED",
      discountValue: discountValue,
      deliveryFee,
      grandTotal,
      cashReceived: actualCashReceived,
      paymentMethod,
      date: createdAt,
      status: "Completed",
    };

    setOrders((prev) => [newOrder, ...prev]);

    // Reset form
    setCustomerName("");
    setCustomerPhone("");
    setItems([{ id: "1", name: "", desc: "", price: 0, qty: 1 }]);
    setDiscountValue(0);
    setDeliveryFee(0);
    setCashReceived(0);
    setPaymentMethod("CASH");
    setApplyGST(false);
    setGstPercentage(5);
    setSelectedCoupon("none");
    setCouponInput("");
    setCouponMsg(null);
    setUpiVia("");
    setLinkSent(false);
    setPointsToUse(0);
    setClaimedVouchers([]);
    setMember(null);
    setSplitCash("");
    setSplitUpi("");
    setSplitCard("");
    setAddedOffers([]);
    setGstInclusive(false);

    return snapshot;
  };

  // Phone suggestions: matching numbers from loyalty members and earlier bills.
  const [phoneSuggestions, setPhoneSuggestions] = useState<
    { phone: string; name: string; source: "loyalty" | "bill"; points: number | null }[]
  >([]);
  const [showPhoneSuggestions, setShowPhoneSuggestions] = useState(false);
  const [suggestIndex, setSuggestIndex] = useState(-1);
  const phoneTypedRef = useRef(false); // only suggest while the user is typing, not after a pick

  useEffect(() => {
    if (!phoneTypedRef.current || customerPhone.length < 2 || customerPhone.length >= 10) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPhoneSuggestions([]);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      suggestCustomersAction(customerPhone)
        .then((r) => {
          if (!live) return;
          setPhoneSuggestions(r);
          setSuggestIndex(-1);
        })
        .catch(() => live && setPhoneSuggestions([]));
    }, 180);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [customerPhone]);

  const pickSuggestion = (s: { phone: string; name: string }) => {
    phoneTypedRef.current = false;
    setCustomerPhone(s.phone);
    // Fill the name from the saved customer, but never overwrite one already typed for this bill.
    if (s.name) setCustomerName(s.name);
    setPhoneSuggestions([]);
    setShowPhoneSuggestions(false);
  };

  const [isSendingPayLink, setIsSendingPayLink] = useState(false);
  const defaultUpiVia = linkSent ? "whatsapp_link" : "counter_qr";

  // WhatsApp message with the amount, the UPI ID and a link to the payment page (QR + "open my UPI app").
  const sendPayLink = async () => {
    const cleanPhone = customerPhone.replace(/\D/g, "").slice(0, 10);
    if (cleanPhone.length !== 10 || isSendingPayLink) return;
    const w = window.open("about:blank", "_blank"); // opened first so the browser doesn't block it
    setIsSendingPayLink(true);
    try {
      const d = await createPayLinkAction(grandTotal, customerName);
      if (!d.ok) throw new Error(d.error);
      const amt = `₹${grandTotal.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(grandTotal) ? 0 : 2, maximumFractionDigits: 2 })}`;
      const text = [
        `Hi ${(customerName || "there").split(" ")[0]}! Your bill at ${d.shopName} is ${amt}.`,
        "",
        `Pay by UPI: ${d.url}`,
        `Pay to: ${d.upiName}`,
        `UPI ID: ${d.upiId}`,
        ...(d.upiPhone ? [`GPay number: ${d.upiPhone.slice(0, 5)} ${d.upiPhone.slice(5)}`] : []),
        `Amount: ${amt}`,
        "",
        "After paying, please show the confirmation at the counter.",
      ].join("\n");
      const url = `https://api.whatsapp.com/send/?phone=91${cleanPhone}&text=${encodeURIComponent(text)}`;
      if (w) w.location.href = url;
      else window.location.href = url;
      setLinkSent(true); // if they then pay, it is recorded as paid through the WhatsApp link
    } catch (e) {
      w?.close();
      alert(e instanceof Error ? e.message : "Couldn't make the payment link.");
    } finally {
      setIsSendingPayLink(false);
    }
  };

  // Helper to send formatted WhatsApp invoice message to a designated phone number
  const sendWhatsAppForSnapshot = (snap: OrderSnapshot, targetPhone: string) => {
    const cleanPhone = targetPhone.replace(/\D/g, "").slice(0, 10);
    if (!cleanPhone || cleanPhone.length !== 10) {
      alert("Please enter a valid 10-digit mobile contact number to send the bill.");
      return;
    }

    const domain = typeof window !== "undefined" ? window.location.origin : "";
    const invoiceUrl = `${domain}/invoice/${snap.id}`;

    const shopEmoji = String.fromCodePoint(0x2728);
    const checkEmoji = String.fromCodePoint(0x2705);
    const moneyEmoji = String.fromCodePoint(0x1f4b0);
    const receiptEmoji = String.fromCodePoint(0x1f4e6);

    let message = `${shopEmoji} *${shopProfile.shopName}* ${shopEmoji}\n\n`;
    message += `${checkEmoji} Here are your invoice details!\n\n`;

    message += `*Subtotal:* ₹${snap.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n`;
    if (snap.discount > 0) {
      message += `*Discount Applied:* -₹${snap.discount.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n`;
    }
    if (snap.applyGST && snap.gstAmount > 0) {
      message += `*GST (${snap.gstPercentage}%):* ₹${snap.gstAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n`;
    }

    message += `\n${moneyEmoji} *Total Amount:* ₹${snap.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n`;
    
    if (snap.paymentMethod) {
      const modeEmoji = snap.paymentMethod === "CASH" ? "💵" : snap.paymentMethod === "CARD" ? "💳" : "📱";
      const modeText = snap.paymentMethod === "GPAY" ? "UPI" : snap.paymentMethod === "CARD" ? "Card" : snap.paymentMethod === "SPLIT" ? "Split" : "Cash";
      message += `${modeEmoji} *Payment Mode:* ${modeText}\n`;
    }
    message += `\n${receiptEmoji} View and download your detailed digital receipt here:\n${invoiceUrl}`;

    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://api.whatsapp.com/send/?phone=91${cleanPhone}&text=${encodedMessage}`;

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = whatsappUrl;
    } else {
      window.open(whatsappUrl, "_blank");
    }
  };

  // "Complete Sale" — validates cart, saves order, and immediately opens "Receipt or WhatsApp?" prompt
  const handleCompleteSale = async () => {
    if (isCompletingSale || isSavingOrder) return;
    setIsCompletingSale(true);
    try {
      const snap = await persistCurrentOrder();
      if (snap) {
        setSaleCompletedPrompt({
          orderId: snap.id,
          customerName: snap.customerName,
          customerPhone: snap.customerPhone,
          grandTotal: snap.grandTotal,
          orderSnapshot: snap,
        });
        setPromptPhone(snap.customerPhone || "");
        setShowPromptPhoneInput(false);
      }
    } finally {
      setIsCompletingSale(false);
    }
  };

  // "Save Order" — persist to database directly, without prompt
  const handleSaveOrder = async () => {
    if (isSavingOrder || isCompletingSale) return;
    setIsSavingOrder(true);
    try {
      const snap = await persistCurrentOrder();
      if (snap) {
        setSavedOrderId(snap.id);
        window.setTimeout(() => setSavedOrderId(null), 5000);
      }
    } finally {
      setIsSavingOrder(false);
    }
  };

  const handleSendWhatsApp = async () => {
    if (isSavingOrder || isCompletingSale || isSendingWhatsApp) return;
    if (!customerPhone || customerPhone.length !== 10) {
      alert(
        "Please enter a valid 10-digit mobile contact number to send the bill.",
      );
      return;
    }

    setIsSendingWhatsApp(true);
    try {
      const snap = await persistCurrentOrder();
      if (snap) {
        sendWhatsAppForSnapshot(snap, snap.customerPhone);
      }
    } finally {
      setIsSendingWhatsApp(false);
    }
  };

  // Permanently delete an invoice — removes it from the database and, because
  // every analytics figure is derived from `orders`, from the dashboard too.
  const handleDeleteOrder = async (id: string) => {
    setDeletingOrderId(id);
    try {
      await deleteOrderAction(id);
      setOrders((prev) => prev.filter((o) => o.id !== id));
      setActiveInvoiceId((prev) => (prev === id ? null : prev));
      setSelectedOrder((prev) => (prev && prev.id === id ? null : prev));
    } catch (err) {
      console.error("Error deleting order:", err);
      alert("Could not delete this invoice. Please try again.");
      throw err;
    } finally {
      setDeletingOrderId(null);
    }
  };

  const runConfirm = async () => {
    if (!confirmDialog) return;
    setConfirmBusy(true);
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog(null);
    } catch {
      // Keep the dialog open so the user can retry; the handler already alerted.
    } finally {
      setConfirmBusy(false);
    }
  };

  // Real-time analytics derived from orders with period filtering
  const now = new Date();

  // The saved flag decides; bills without one (before migration 0010) are recognised by their GST line.
  const isGstOrder = (o: CompletedOrder) => (o.isGst !== undefined ? o.isGst : o.items.some((i) => i.name.startsWith("GST (")));
  const analyticsFilteredOrders = orders.filter((o) => {
    if (billTypeFilter !== "all" && (billTypeFilter === "gst") !== isGstOrder(o)) return false;
    if (
      analyticsSearchPhone &&
      !o.customerPhone.includes(analyticsSearchPhone)
    ) {
      return false;
    }
    const orderDate = new Date(o.date);
    if (analyticsPeriod === "today") {
      return (
        orderDate.getDate() === now.getDate() &&
        orderDate.getMonth() === now.getMonth() &&
        orderDate.getFullYear() === now.getFullYear()
      );
    }
    if (analyticsPeriod === "week") {
      const startOfWeek = new Date(now);
      const dayOfWeek = startOfWeek.getDay();
      const distToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      startOfWeek.setDate(startOfWeek.getDate() + distToMonday); // Monday start of week
      startOfWeek.setHours(0, 0, 0, 0);
      return orderDate >= startOfWeek;
    }
    if (analyticsPeriod === "month") {
      return (
        orderDate.getMonth() === now.getMonth() &&
        orderDate.getFullYear() === now.getFullYear()
      );
    }
    if (analyticsPeriod === "year") {
      return orderDate.getFullYear() === now.getFullYear();
    }
    if (analyticsPeriod === "custom") {
      const orderTime = orderDate.getTime();
      const start = analyticsStartDate ? new Date(analyticsStartDate) : null;
      if (start) start.setHours(0, 0, 0, 0);
      const end = analyticsEndDate ? new Date(analyticsEndDate) : null;
      if (end) end.setHours(23, 59, 59, 999);

      if (start && end) {
        return orderTime >= start.getTime() && orderTime <= end.getTime();
      } else if (start) {
        return orderTime >= start.getTime();
      } else if (end) {
        return orderTime <= end.getTime();
      }
      return true;
    }
    return true; // "all"
  });

  const totalOrdersCount = analyticsFilteredOrders.length;
  const totalRevenueAmount = analyticsFilteredOrders.reduce(
    (acc, o) => acc + o.grandTotal,
    0,
  );
  const avgOrderValue =
    totalOrdersCount > 0 ? totalRevenueAmount / totalOrdersCount : 0;

  // Expenses in the same window as the dashboard period; Net Profit = revenue minus expenses.
  const analyticsExpensesTotal = expenseRows
    .filter((e) => {
      const d = new Date(`${e.date}T00:00:00`);
      const n = new Date();
      if (analyticsPeriod === "today") return d.toDateString() === n.toDateString();
      if (analyticsPeriod === "week") {
        const start = new Date(n);
        const dow = start.getDay();
        start.setDate(start.getDate() + (dow === 0 ? -6 : 1 - dow));
        start.setHours(0, 0, 0, 0);
        return d >= start;
      }
      if (analyticsPeriod === "month") return d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
      if (analyticsPeriod === "year") return d.getFullYear() === n.getFullYear();
      if (analyticsPeriod === "custom") {
        const st = analyticsStartDate ? new Date(`${analyticsStartDate}T00:00:00`) : null;
        const en = analyticsEndDate ? new Date(`${analyticsEndDate}T23:59:59.999`) : null;
        return (!st || d >= st) && (!en || d <= en);
      }
      return true;
    })
    .reduce((acc, e) => acc + e.amount, 0);
  const netProfitAmount = totalRevenueAmount - analyticsExpensesTotal;

  // Split channels
  const onlineOrders = analyticsFilteredOrders.filter(
    (o) => o.source === "ONLINE",
  ).length;
  const offlineOrders = analyticsFilteredOrders.filter(
    (o) => o.source === "OFFLINE",
  ).length;

  // Split revenues
  const onlineRevenue = analyticsFilteredOrders
    .filter((o) => o.source === "ONLINE")
    .reduce((acc, o) => acc + o.grandTotal, 0);
  const offlineRevenue = analyticsFilteredOrders
    .filter((o) => o.source === "OFFLINE")
    .reduce((acc, o) => acc + o.grandTotal, 0);

  // GST invoices vs non-GST bills
  const gstOrdersList = analyticsFilteredOrders.filter(isGstOrder);
  const gstSalesAmount = gstOrdersList.reduce((acc, o) => acc + o.grandTotal, 0);
  const nonGstOrdersList = analyticsFilteredOrders.filter((o) => !isGstOrder(o));
  const nonGstSalesAmount = nonGstOrdersList.reduce((acc, o) => acc + o.grandTotal, 0);

  // Money received by way of payment. A split bill's parts are counted in the Cash / GPay / Card boxes;
  // the Split box shows how much of the sales came from split bills.
  const payOf = (o: CompletedOrder) => o.paymentMethod ?? "CASH";
  const splitOrdersList = analyticsFilteredOrders.filter((o) => payOf(o) === "SPLIT");
  const sumSplit = (k: "splitCash" | "splitUpi" | "splitCard") => splitOrdersList.reduce((a, o) => a + (o[k] ?? 0), 0);
  const cashOrdersList = analyticsFilteredOrders.filter((o) => payOf(o) === "CASH");
  const gpayOrdersList = analyticsFilteredOrders.filter((o) => payOf(o) === "GPAY");
  const cardOrdersList = analyticsFilteredOrders.filter((o) => payOf(o) === "CARD");
  const cashReceivedTotal = cashOrdersList.reduce((a, o) => a + o.grandTotal, 0) + sumSplit("splitCash");
  const gpayReceivedTotal = gpayOrdersList.reduce((a, o) => a + o.grandTotal, 0) + sumSplit("splitUpi");
  const cardReceivedTotal = cardOrdersList.reduce((a, o) => a + o.grandTotal, 0) + sumSplit("splitCard");
  const splitReceivedTotal = splitOrdersList.reduce((a, o) => a + o.grandTotal, 0);
  const inr2 = (n: number) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  // Top items by revenue in analyticsFilteredOrders
  const itemSales: Record<
    string,
    { name: string; revenue: number; qty: number }
  > = {};
  analyticsFilteredOrders.forEach((order) => {
    order.items.forEach((item) => {
      if (!item.name || item.name.startsWith("GST (")) return;
      if (!itemSales[item.name])
        itemSales[item.name] = { name: item.name, revenue: 0, qty: 0 };
      itemSales[item.name].revenue += item.price * item.qty;
      itemSales[item.name].qty += item.qty;
    });
  });
  const topItems = Object.values(itemSales)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Helper to get ISO week number of the year
  const getWeekOfYear = (d: Date) => {
    const target = new Date(d.valueOf());
    const dayNr = (d.getDay() + 6) % 7; // Monday = 0, Sunday = 6
    target.setDate(target.getDate() - dayNr + 3); // Nearest Thursday
    const firstThursday = target.valueOf();
    target.setMonth(0, 1);
    if (target.getDay() !== 4) {
      target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
    }
    return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  };
  const currentWeekNumber = getWeekOfYear(now);

  // Revenue per day of current week (Mon–Sun) - CONSTANT (independent of analyticsPeriod filters)
  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weekRevenue = [0, 0, 0, 0, 0, 0, 0];
  
  // Find Monday to Sunday of current calendar week
  const currentDayOfWeek = now.getDay();
  const distToMon = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
  const mondayOfThisWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + distToMon);
  mondayOfThisWeek.setHours(0, 0, 0, 0);
  
  const sundayOfThisWeek = new Date(mondayOfThisWeek);
  sundayOfThisWeek.setDate(mondayOfThisWeek.getDate() + 6);
  sundayOfThisWeek.setHours(23, 59, 59, 999);

  orders.forEach((order) => {
    if (analyticsSearchPhone) {
      const q = analyticsSearchPhone.toLowerCase();
      const matchPhone = order.customerPhone.includes(q);
      const matchInvoice = order.id.toLowerCase().includes(q);
      if (!matchPhone && !matchInvoice) {
        return;
      }
    }
    const orderDate = new Date(order.date);
    const orderTime = orderDate.getTime();
    if (orderTime >= mondayOfThisWeek.getTime() && orderTime <= sundayOfThisWeek.getTime()) {
      const day = (orderDate.getDay() + 6) % 7;
      weekRevenue[day] += order.grandTotal;
    }
  });
  const maxWeekRevenue = Math.max(...weekRevenue, 1);

  // Revenue per month of current year - CONSTANT (independent of analyticsPeriod filters)
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const monthRevenue = Array(12).fill(0);
  orders.forEach((order) => {
    if (analyticsSearchPhone) {
      const q = analyticsSearchPhone.toLowerCase();
      const matchPhone = order.customerPhone.includes(q);
      const matchInvoice = order.id.toLowerCase().includes(q);
      if (!matchPhone && !matchInvoice) {
        return;
      }
    }
    const d = new Date(order.date);
    if (d.getFullYear() === now.getFullYear()) {
      monthRevenue[d.getMonth()] += order.grandTotal;
    }
  });
  const maxMonthRevenue = Math.max(...monthRevenue, 1);
  const totalYearRevenue = monthRevenue.reduce((a, b) => a + b, 0);
  const avgMonthRevenue = totalYearRevenue / 12;

  // New Detailed KPI Computations based on analyticsFilteredOrders
  const todayOrders = orders.filter((o) => {
    if (analyticsSearchPhone) {
      const q = analyticsSearchPhone.toLowerCase();
      const matchPhone = o.customerPhone.includes(q);
      const matchInvoice = o.id.toLowerCase().includes(q);
      if (!matchPhone && !matchInvoice) {
        return false;
      }
    }
    const d = new Date(o.date);
    return (
      d.getDate() === now.getDate() &&
      d.getMonth() === now.getMonth() &&
      d.getFullYear() === now.getFullYear()
    );
  });

  const todayRevenue = todayOrders.reduce((acc, o) => acc + o.grandTotal, 0);

  const todayOrdersCount = todayOrders.length;
  const todayOnlineOrdersCount = todayOrders.filter(
    (o) => o.source === "ONLINE",
  ).length;
  const todayOfflineOrdersCount = todayOrders.filter(
    (o) => o.source === "OFFLINE",
  ).length;

  const todayOnlineRevenue = todayOrders
    .filter((o) => o.source === "ONLINE")
    .reduce((acc, o) => acc + o.grandTotal, 0);
  const todayOfflineRevenue = todayOrders
    .filter((o) => o.source === "OFFLINE")
    .reduce((acc, o) => acc + o.grandTotal, 0);

  const todayItemsSold = todayOrders.reduce(
    (acc, o) => acc + o.items.reduce((sum, item) => sum + ((item.name && !item.name.startsWith("GST (")) ? item.qty : 0), 0),
    0,
  );

  // Today's top items
  const todayItemSales: Record<
    string,
    { name: string; revenue: number; qty: number }
  > = {};
  todayOrders.forEach((order) => {
    order.items.forEach((item) => {
      if (!item.name || item.name.startsWith("GST (")) return;
      if (!todayItemSales[item.name])
        todayItemSales[item.name] = { name: item.name, revenue: 0, qty: 0 };
      todayItemSales[item.name].revenue += item.price * item.qty;
      todayItemSales[item.name].qty += item.qty;
    });
  });
  const todayTopItems = Object.values(todayItemSales)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  const monthlyRevenue = orders
    .filter((o) => {
      const d = new Date(o.date);
      return (
        d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
      );
    })
    .reduce((acc, o) => acc + o.grandTotal, 0);

  const totalItemsSold = analyticsFilteredOrders.reduce(
    (acc, o) => acc + o.items.reduce((sum, item) => sum + ((item.name && !item.name.startsWith("GST (")) ? item.qty : 0), 0),
    0,
  );

  const categorySales: Record<string, number> = {};
  analyticsFilteredOrders.forEach((order) => {
    order.items.forEach((item) => {
      if (!item.name || item.name.startsWith("GST (")) return;
      const cat = item.desc || "Uncategorized";
      if (!categorySales[cat]) categorySales[cat] = 0;
      categorySales[cat] += item.price * item.qty;
    });
  });
  const topCategory =
    Object.keys(categorySales).length > 0
      ? Object.entries(categorySales).sort((a, b) => b[1] - a[1])[0][0]
      : "None";
  const topProduct = topItems[0]?.name || "None";

  if (!isMounted) {
    return <div className="min-h-screen bg-[#F5EFE6]" />;
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-[#0F0F0F] flex items-center justify-center p-6 relative overflow-hidden font-sans">
        {/* Abstract Background Orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#C1272D]/20 rounded-full blur-[120px] mix-blend-screen animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] bg-[#E0D5C3]/10 rounded-full blur-[120px] mix-blend-screen animate-pulse" style={{ animationDelay: '2s' }} />
        
        {/* Main Container */}
        <div className="relative z-10 w-full max-w-6xl flex flex-col lg:flex-row items-center gap-12 lg:gap-20">
          
          {/* Left Side Branding */}
          <div className="w-full lg:w-1/2 flex flex-col items-center lg:items-start text-center lg:text-left">
            <div className="w-24 h-24 bg-white/5 backdrop-blur-xl rounded-3xl p-4 border border-white/10 shadow-2xl mb-8 group hover:scale-105 transition-transform duration-500">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-contain drop-shadow-lg group-hover:rotate-12 transition-transform duration-500" />
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full mb-6 backdrop-blur-md">
              <span className="w-2 h-2 rounded-full bg-[#C1272D] animate-pulse" />
              <span className="text-[10px] font-bold text-white/80 tracking-widest uppercase">System Online</span>
            </div>
            <h1 className="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-br from-white via-white/90 to-white/40 tracking-tight leading-[1.1] mb-6">
              Next-Gen <br/> POS Control.
            </h1>
            <p className="text-white/50 text-base md:text-lg font-medium leading-relaxed max-w-md">
              Seamlessly manage orders, analytics, and digital invoices for Daddy's Home through a unified, hyper-fast portal.
            </p>
          </div>

          {/* Right Side Login Card */}
          <div className="w-full lg:w-1/2 max-w-md">
            <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-[2.5rem] p-8 md:p-12 shadow-[0_20px_70px_rgba(0,0,0,0.5)] relative overflow-hidden group">
              
              {/* Card internal glow */}
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#E0D5C3]/15 rounded-full blur-[60px] opacity-0 group-hover:opacity-100 transition-opacity duration-700" />
              
              <div className="relative z-10">
                <h3 className="text-2xl font-bold text-white mb-2">Welcome Back</h3>
                <p className="text-white/40 text-sm font-medium mb-10">Enter your secure passcode to access the terminal.</p>
                
                <form onSubmit={handleVerifyPasscode} className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-[10px] font-bold text-white/60 uppercase tracking-[0.2em] ml-1">
                      Security Passcode
                    </label>
                    <div className="relative">
                      <div className="absolute left-5 top-1/2 -translate-y-1/2 text-white/30">
                        <Lock className="w-5 h-5" />
                      </div>
                      <input
                        type={showPasscode ? "text" : "password"}
                        name="update-pos-passcode"
                        autoComplete="new-password"
                        placeholder="••••••••"
                        className="w-full bg-black/40 border border-white/10 hover:border-white/20 focus:border-[#C1272D] focus:bg-black/60 rounded-2xl pl-14 pr-14 py-4 text-white font-bold tracking-widest text-lg focus:outline-none transition-all placeholder:text-white/20"
                        value={passcode}
                        onChange={(e) => {
                          setPasscode(e.target.value);
                          if (passcodeError) setPasscodeError("");
                        }}
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => setShowPasscode(!showPasscode)}
                        className="absolute right-5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/80 transition-colors cursor-pointer"
                      >
                        {showPasscode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                    {passcodeError && (
                      <p className="text-xs text-[#C1272D] font-bold mt-2 ml-1 animate-in fade-in slide-in-from-top-1">
                        {passcodeError}
                      </p>
                    )}
                  </div>
                  
                  <button
                    type="submit"
                    className="w-full py-4 bg-gradient-to-r from-[#C1272D] to-[#9E1B20] hover:from-[#E03A3F] hover:to-[#C1272D] active:scale-[0.98] text-white rounded-2xl font-bold text-sm uppercase tracking-[0.15em] transition-all shadow-[0_10px_30px_rgba(193,39,45,0.35)] hover:shadow-[0_10px_40px_rgba(193,39,45,0.55)] flex items-center justify-center gap-3 mt-4 group cursor-pointer"
                  >
                    Authenticate
                    <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </form>
              </div>
            </div>
            
            <div className="mt-8 flex items-center justify-center gap-2 text-white/30 text-[10px] font-bold tracking-widest uppercase">
              <ShieldCheck className="w-3.5 h-3.5" />
              End-to-End Encrypted Session
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Filtered orders for Order History tab
  const historyFilteredOrders = orders.filter((order) => {
    const matchId = order.id
      .toLowerCase()
      .includes(orderSearchId.toLowerCase());
    const matchName = order.customerName
      .toLowerCase()
      .includes(orderSearchName.toLowerCase());
    const matchPhone = (order.customerPhone || "").includes(orderSearchPhone);
    const matchSource =
      orderFilterSource === "ALL" || order.source === orderFilterSource;
    const matchStatus =
      orderFilterStatus === "ALL" ||
      order.status.toUpperCase() === orderFilterStatus.toUpperCase();

    // Period match
    let matchPeriod = true;
    if (historyPeriod !== "all") {
      const orderDate = new Date(order.date);
      const orderTime = orderDate.getTime();
      const now = new Date();

      if (historyPeriod === "today") {
        matchPeriod = orderDate.toDateString() === now.toDateString();
      } else if (historyPeriod === "week") {
        const currentDay = now.getDay();
        const distanceToMon = currentDay === 0 ? -6 : 1 - currentDay;
        const startOfWeek = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() + distanceToMon,
        );
        startOfWeek.setHours(0, 0, 0, 0);
        matchPeriod = orderTime >= startOfWeek.getTime();
      } else if (historyPeriod === "month") {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        matchPeriod = orderTime >= startOfMonth.getTime();
      } else if (historyPeriod === "year") {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        matchPeriod = orderTime >= startOfYear.getTime();
      } else if (historyPeriod === "custom") {
        const start = historyStartDate ? new Date(historyStartDate) : null;
        if (start) start.setHours(0, 0, 0, 0);
        const end = historyEndDate ? new Date(historyEndDate) : null;
        if (end) end.setHours(23, 59, 59, 999);

        if (start && end) {
          matchPeriod =
            orderTime >= start.getTime() && orderTime <= end.getTime();
        } else if (start) {
          matchPeriod = orderTime >= start.getTime();
        } else if (end) {
          matchPeriod = orderTime <= end.getTime();
        }
      }
    }

    return (
      matchId &&
      matchName &&
      matchPhone &&
      matchSource &&
      matchStatus &&
      matchPeriod
    );
  });

  const handleExportCSV = () => {
    if (historyFilteredOrders.length === 0) {
      alert("No orders available to export.");
      return;
    }

    // CSV Headers padded with spaces to ensure columns default to a readable width in Excel
    const headers = [
      "Order ID          ",
      "Date                   ",
      "Customer Name           ",
      "Customer Phone          ",
      "Source        ",
      "Subtotal      ",
      "Discount      ",
      "Delivery Fee  ",
      "Grand Total   ",
      "Status        ",
      "Items                                                                               ",
    ];

    // CSV Rows
    const rows = historyFilteredOrders.map((o) => {
      const itemsStr = o.items.map((i) => `${i.name} (x${i.qty})`).join("; ");

      // Formatting date: MM/DD/YYYY HH:MM AM/PM as an Excel text formula to prevent ### errors
      const dateObj = new Date(o.date);
      const dateStr = dateObj.toLocaleDateString();
      const timeStr = dateObj.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
      const formattedDate = `"=""${dateStr} ${timeStr}"""`;

      // Formatting phone number as an Excel text formula to prevent scientific notation
      const formattedPhone = o.customerPhone
        ? `"=""${o.customerPhone}"""`
        : `"N/A"`;

      return [
        o.id,
        formattedDate,
        o.customerName,
        formattedPhone,
        o.source,
        o.subtotal,
        o.discount,
        o.deliveryFee,
        o.grandTotal,
        o.status,
        `"${itemsStr.replace(/"/g, '""')}"`,
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row
          .map((val) => {
            if (typeof val === "string" && !val.startsWith('"')) {
              return `"${val.replace(/"/g, '""')}"`;
            }
            return val;
          })
          .join(","),
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `Order_History_${historyPeriod}_${new Date().toISOString().split("T")[0]}.csv`,
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const resendWhatsApp = (order: CompletedOrder) => {
    if (!order.customerPhone || order.customerPhone.length < 10) {
      alert("Invalid customer phone number for this order.");
      return;
    }
    const domain = window.location.origin;
    const invoiceUrl = `${domain}/invoice/${order.id}`;

    const shopEmoji = String.fromCodePoint(0x2728);
    const checkEmoji = String.fromCodePoint(0x2705);
    const tagEmoji = String.fromCodePoint(0x1F516);
    const moneyEmoji = String.fromCodePoint(0x1F4B0);
    const receiptEmoji = String.fromCodePoint(0x1F4E6);

    let message = `${shopEmoji} *${shopProfile.shopName}* ${shopEmoji}\n\n`;
    message += `${checkEmoji} Here are your invoice details!\n\n`;
    
    message += `*Subtotal:* ₹${order.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n`;
    if (order.discount > 0) {
      message += `*Discount Applied:* -₹${order.discount.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n`;
    }
    
    const gstItem = order.items.find(i => i.name && i.name.startsWith("GST"));
    const calculatedGst = order.grandTotal - (order.subtotal - order.discount + order.deliveryFee);
    
    if (calculatedGst > 0.1) {
      const gstLabel = gstItem ? gstItem.name : "GST";
      message += `*${gstLabel}:* ₹${calculatedGst.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n`;
    }
    
    message += `\n${moneyEmoji} *Total Amount:* ₹${order.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}\n\n`;
    message += `${receiptEmoji} View and download your detailed digital receipt here:\n${invoiceUrl}`;

    const encodedMessage = encodeURIComponent(message);
    let whatsappUrl = `https://api.whatsapp.com/send/?phone=91${order.customerPhone.split('_')[0]}&text=${encodedMessage}`;

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if (isMobile) {
      window.location.href = whatsappUrl;
    } else {
      window.open(whatsappUrl, "_blank");
    }
  };

  return (
    <div className="min-h-screen bg-[#F5EFE6] text-[#000000] flex flex-row font-sans overflow-hidden">
      {/* Catalog Modal */}
      {showCatalogModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[#FFFFFF] rounded-xl shadow-[0_20px_60px_rgba(0,0,0,0.4)] w-full max-w-md overflow-hidden transform scale-100 animate-in zoom-in-95 duration-200">
            <div className="px-8 py-6 flex justify-between items-center bg-[#FFFFFF]">
              <h3 className="font-bold text-lg text-[#000000] flex items-center gap-3">
                <div className="w-10 h-10 bg-[#C1272D]/10 rounded-lg flex items-center justify-center">
                  <PackagePlus className="w-5 h-5 text-[#C1272D]" />
                </div>
                {editingCatalogId ? "Edit Item" : "Add New Item"}
              </h3>
              <button
                onClick={() => {
                  setShowCatalogModal(false);
                  setEditingCatalogId(null);
                }}
                className="w-8 h-8 flex items-center justify-center bg-[#000000] text-[#FFFFFF] hover:bg-black/80 rounded-md transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-8 py-8 space-y-6">
              <div>
                <label className="block text-[10px] font-bold text-[#000000] uppercase tracking-[0.15em] mb-2">
                  Item Name
                </label>
                <input
                  type="text"
                  placeholder="e.g., Premium T-Shirt"
                  className="minimal-input font-bold text-sm"
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[#000000] uppercase tracking-[0.15em] mb-2">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g., MENSWEAR"
                  className="minimal-input text-sm"
                  value={newCatDesc}
                  onChange={(e) => setNewCatDesc(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-[#000000] uppercase tracking-[0.15em] mb-2">
                  Default Price (Optional)
                </label>
                <input
                  type="number"
                  placeholder="e.g., 299"
                  className="minimal-input text-sm font-semibold"
                  value={newCatPrice}
                  onWheel={(e) => e.currentTarget.blur()}
                  onChange={(e) =>
                    setNewCatPrice(
                      e.target.value === "" ? "" : parseFloat(e.target.value),
                    )
                  }
                />
              </div>
              <button
                onClick={addToCatalog}
                className="w-full py-4 mt-4 bg-[#9E1B20] hover:bg-[#C1272D] text-[#FFFFFF] rounded-lg font-bold text-xs uppercase tracking-[0.15em] transition-colors"
              >
                {editingCatalogId ? "Update Catalog Item" : "Save to Catalog"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile/Tablet Sidebar Backdrop */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/40 backdrop-blur-xs z-30 lg:hidden"
        />
      )}

      {/* Collapsible Left Sidebar. On mobile it is a fixed overlay drawer that
          slides via transform only and snaps instantly (no transition — a
          transitioned width/transform here can stall and leave the panel stuck
          off-screen). On desktop it keeps the smooth collapse. */}
      <aside
        className={`fixed lg:sticky top-0 bottom-0 left-0 z-40 h-screen shrink-0 overflow-hidden bg-[#0F0F0F] text-[#FFFFFF] flex flex-col justify-between shadow-xl w-64 border-r border-white/10 lg:transition-all lg:duration-300 lg:ease-in-out ${isSidebarOpen ? "translate-x-0 lg:w-64" : "-translate-x-full lg:w-0 lg:border-r-0 lg:translate-x-0"}`}
      >
        <div className="w-64 flex flex-col justify-between h-full shrink-0 overflow-hidden relative">
          <div className="flex flex-col">
            {/* Header branding */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#1A1A1A] border border-white/10 rounded-xl flex items-center justify-center overflow-hidden shrink-0">
                  <img
                    src="/logo.png"
                    alt="Logo"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <span className="font-black text-sm tracking-tight text-[#FFFFFF] block ">
                    {shopProfile.shopName}
                  </span>
                </div>
              </div>

              {/* Close Button Inside Sidebar */}
              <button
                onClick={() => setIsSidebarOpen(false)}
                className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-white font-bold hover:text-white transition-all cursor-pointer"
                title="Close Menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation Links */}
            <nav className="px-4 py-6 space-y-2">
              <button
                onClick={() => selectTab("billing")}
                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                  activeTab === "billing"
                    ? "bg-[#FFFFFF] text-[#C1272D] shadow-lg scale-102"
                    : "text-white font-bold hover:bg-white/10 hover:text-white"
                }`}
              >
                <Receipt className="w-5 h-5" />
                Billing Panel
              </button>
              {role === 'admin' && (
                <>
                  <button
                    onClick={() => selectTab("orders")}
                    className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                      activeTab === "orders"
                        ? "bg-[#FFFFFF] text-[#C1272D] shadow-lg scale-102"
                        : "text-white font-bold hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <History className="w-5 h-5" />
                    Order History
                  </button>
                  <button
                    onClick={() => selectTab("inventory")}
                    className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                      activeTab === "inventory"
                        ? "bg-[#FFFFFF] text-[#C1272D] shadow-lg scale-102"
                        : "text-white font-bold hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Package className="w-5 h-5" />
                    Inventory
                  </button>
                  <button
                    onClick={() => selectTab("analytics")}
                    className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                      activeTab === "analytics"
                        ? "bg-[#FFFFFF] text-[#C1272D] shadow-lg scale-102"
                        : "text-white font-bold hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <BarChart2 className="w-5 h-5" />
                    Analytics Dashboard
                  </button>
                  <button
                    onClick={() => selectTab("expenses")}
                    className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                      activeTab === "expenses"
                        ? "bg-[#FFFFFF] text-[#C1272D] shadow-lg scale-102"
                        : "text-white font-bold hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <IndianRupee className="w-5 h-5" />
                    Expense Tracker
                  </button>
                  <button
                    onClick={() => selectTab("coupons")}
                    className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                      activeTab === "coupons"
                        ? "bg-[#FFFFFF] text-[#C1272D] shadow-lg scale-102"
                        : "text-white font-bold hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Percent className="w-5 h-5" />
                    Coupons
                  </button>
                </>
              )}
              <button
                onClick={() => selectTab("loyalty")}
                className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                  activeTab === "loyalty"
                    ? "bg-[#FFFFFF] text-[#C1272D] shadow-lg scale-102"
                    : "text-white font-bold hover:bg-white/10 hover:text-white"
                }`}
              >
                <Star className="w-5 h-5" />
                Loyalty
              </button>
              {role === 'admin' && (
                <button
                  onClick={() => selectTab("settings")}
                  className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                    activeTab === "settings"
                      ? "bg-[#FFFFFF] text-[#C1272D] shadow-lg scale-102"
                      : "text-white font-bold hover:bg-white/10 hover:text-white"
                  }`}
                >
                  <SettingsIcon className="w-5 h-5" />
                  Settings
                </button>
              )}

              <div className="pt-4 border-t border-white/10 mt-4">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-4 px-4 py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider text-white bg-black/20 hover:bg-[#E03A3F]/10 transition-all cursor-pointer"
                >
                  <LogOut className="w-5 h-5" />
                  Log Out
                </button>
              </div>
            </nav>
          </div>

          {/* Footer branding */}
          <div className="p-6 border-t border-white/10 flex items-center justify-start gap-4">
            <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center bg-[#C1272D] shrink-0">
              <span className="text-white font-bold text-sm">U</span>
            </div>
            <p className="text-[10px] text-[#E0D5C3]/70 mt-1 font-semibold uppercase tracking-wider">
              V2.1.0 • PREMIUM POS
            </p>
          </div>
        </div>
      </aside>
      {/* Main Content Area */}
      <main className="flex-1 h-screen overflow-y-auto px-3 sm:px-8 lg:px-12 pt-3 pb-8 relative flex flex-col animate-in fade-in duration-300">
        {/* Global Top Navbar */}
        <header className="flex-shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center py-4 border-b border-black/10 w-full mb-6 gap-4">
          <div className="flex items-center gap-4">
            {/* Always available on mobile/tablet; on desktop only when the
                sidebar is collapsed. */}
            <button
              onClick={() => setIsSidebarOpen((v) => !v)}
              className={`w-9 h-9 bg-white border border-black/10 hover:bg-[#F5EFE6] rounded-lg flex items-center justify-center transition-colors shadow-sm cursor-pointer shrink-0 ${isSidebarOpen ? "lg:hidden" : ""}`}
              title={isSidebarOpen ? "Close menu" : "Open menu"}
              aria-label="Toggle menu"
            >
              <Menu className="w-5 h-5 text-[#C1272D]" />
            </button>
            <div>
              <h1 className="text-lg font-black text-[#000000] tracking-tight ">
                {shopProfile.shopName}
              </h1>
            </div>
            <InstallAppButton />
          </div>

          {/* OFFLINE / ONLINE Toggle (only shown when billing tab is active) */}
          {activeTab === "billing" && (
            <div className="flex items-center bg-[#FFFFFF]/60 border border-black/10 rounded-full p-1 shadow-sm">
              <button
                onClick={() => setIsOnline(false)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-bold tracking-wider transition-all uppercase cursor-pointer ${!isOnline ? "bg-[#C1272D] text-[#FFFFFF] shadow-sm" : "text-[#000000] hover:text-[#000000]"}`}
              >
                <span className="w-2 h-2 rounded-full bg-[#C1272D]"></span>
                OFFLINE (POS)
              </button>
              <button
                onClick={() => setIsOnline(true)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[10px] font-bold tracking-wider transition-all uppercase cursor-pointer ${isOnline ? "bg-[#1A1A1A] text-[#FFFFFF] shadow-sm" : "text-[#000000] hover:text-[#000000]"}`}
              >
                <span className="w-2 h-2 rounded-full bg-[#1A1A1A]"></span>
                ONLINE ORDER
              </button>
            </div>
          )}
        </header>

        {activeTab === "billing" && (
          <div className="flex-1 flex flex-col gap-6 max-w-[1400px] min-w-0 mx-auto w-full">
            {/* Subheader Accent Bar and Title */}
            <div className="flex justify-between items-center py-2 border-b border-black/10 w-full">
              <div className="flex items-center gap-4">
                <span className="w-1.5 h-8 bg-[#C1272D] rounded-full"></span>
                <div>
                  <h2 className="text-xl font-black text-[#000000] tracking-tight">
                    POS Billing Panel
                  </h2>
                  <p className="text-[11px] text-[#000000] font-semibold mt-0.5">
                    Quick Invoice generator & database synced checkout
                  </p>
                </div>
              </div>
            </div>

            {/* Grid Layout */}
            <div className="flex flex-col lg:flex-row gap-8 w-full">
              {/* Left Column */}
              <div className="w-full lg:w-[60%] xl:w-[65%] flex flex-col gap-6 h-auto lg:h-full">
                {/* Customer Details */}
                <div className="flex-shrink-0 bg-white border border-black/10 rounded-xl p-4 sm:p-6 shadow-sm hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-all duration-300 relative overflow-hidden group">
                  <h2 className="text-base font-black flex items-center gap-3 text-[#000000] mb-6 tracking-tight">
                    <User className="w-4 h-4 text-[#C1272D]" />
                    Customer Details
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <div>
                      <label className="block text-[10px] font-bold text-[#000000] uppercase tracking-[0.15em] mb-2">
                        Customer Name
                      </label>
                      <input
                        type="text"
                        placeholder="Enter name"
                        className="w-full bg-[#FFFFFF]/40 border border-black/10 hover:border-black/10 focus:border-[#C1272D] focus:bg-white rounded-lg px-4 py-2.5 text-[#000000] text-sm font-semibold focus:outline-none transition-colors placeholder:text-[#000000] placeholder:font-normal shadow-sm"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-[#000000] uppercase tracking-[0.15em] mb-2">
                        Mobile Number (WhatsApp)
                      </label>
                      <div className="relative">
                        <input
                          type="tel"
                          placeholder="Enter 10-digit number"
                          maxLength={10}
                          autoComplete="off"
                          className="w-full bg-[#FFFFFF]/40 border border-black/10 hover:border-black/10 focus:border-[#C1272D] focus:bg-white rounded-lg px-4 py-2.5 text-[#000000] text-sm font-semibold focus:outline-none transition-colors placeholder:text-[#000000] placeholder:font-normal shadow-sm"
                          value={customerPhone}
                          onFocus={() => setShowPhoneSuggestions(true)}
                          onBlur={() => setTimeout(() => setShowPhoneSuggestions(false), 150)}
                          onChange={(e) => {
                            phoneTypedRef.current = true;
                            setShowPhoneSuggestions(true);
                            setCustomerPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                          }}
                          onKeyDown={(e) => {
                            if (!showPhoneSuggestions || phoneSuggestions.length === 0) return;
                            if (e.key === "ArrowDown") {
                              e.preventDefault();
                              setSuggestIndex((i) => Math.min(phoneSuggestions.length - 1, i + 1));
                            } else if (e.key === "ArrowUp") {
                              e.preventDefault();
                              setSuggestIndex((i) => Math.max(0, i - 1));
                            } else if (e.key === "Enter" && suggestIndex >= 0) {
                              e.preventDefault();
                              pickSuggestion(phoneSuggestions[suggestIndex]);
                            } else if (e.key === "Escape") {
                              setShowPhoneSuggestions(false);
                            }
                          }}
                        />
                        {showPhoneSuggestions && phoneSuggestions.length > 0 && (
                          <ul className="absolute z-30 left-0 right-0 mt-1 bg-white border border-black/10 rounded-lg shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                            {phoneSuggestions.map((s, i) => (
                              <li key={s.phone}>
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => pickSuggestion(s)}
                                  className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left cursor-pointer ${i === suggestIndex ? "bg-[#C1272D]/10" : "hover:bg-[#FAF7F2]"}`}
                                >
                                  <span className="min-w-0">
                                    <span className="block text-sm font-bold text-black tracking-wide">
                                      {s.phone.slice(0, customerPhone.length) === customerPhone ? (
                                        <>
                                          <span className="text-[#C1272D]">{customerPhone}</span>
                                          {s.phone.slice(customerPhone.length)}
                                        </>
                                      ) : (
                                        s.phone
                                      )}
                                    </span>
                                    <span className="block text-[11px] font-semibold text-black/60 truncate">
                                      {s.name || "No name saved"}
                                    </span>
                                  </span>
                                  <span
                                    className={`shrink-0 text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${s.source === "loyalty" ? "text-emerald-700 bg-emerald-50 border-emerald-200" : "text-black/50 bg-black/5 border-black/10"}`}
                                  >
                                    {s.source === "loyalty" ? `Loyalty · ${s.points ?? 0} pts` : "Past bill"}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  </div>
                </div>


                {/* Order Items Ledger */}
                <div className="flex-1 bg-white border border-black/10 rounded-xl shadow-sm hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-all duration-300 flex flex-col overflow-visible">
                  <div className="flex-shrink-0 flex flex-col sm:flex-row justify-between items-start sm:items-center px-4 sm:px-6 pt-4 sm:pt-6 pb-2 border-b border-transparent gap-4">
                    <h2 className="text-base font-black flex items-center gap-3 text-[#000000] tracking-tight">
                      <Receipt className="w-4 h-4 text-[#C1272D]" />
                      Order Items
                    </h2>
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto justify-start sm:justify-end">
                      <button
                        onClick={clearOrder}
                        className="text-[10px] font-bold text-[#000000] bg-[#FFFFFF] hover:bg-[#FFFFFF] border border-black/10 px-4 py-2 rounded-lg uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Clear Order
                      </button>
                      <button
                        onClick={() => {
                          setNewCatName("");
                          setNewCatDesc("");
                          setNewCatPrice("");
                          setCatalogTargetRowId(null);
                          setShowCatalogModal(true);
                        }}
                        className="text-[10px] font-bold text-[#000000] bg-[#FFFFFF] hover:bg-[#FFFFFF] border border-black/10 px-4 py-2 rounded-lg uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <PackagePlus className="w-3.5 h-3.5 text-[#C1272D]" />{" "}
                        Add To Catalog
                      </button>
                      <button
                        onClick={addItem}
                        className="text-[10px] font-bold text-[#C1272D] bg-[#C1272D]/5 hover:bg-[#C1272D]/10 border border-[#C1272D]/20 px-4 py-2 rounded-lg uppercase tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Custom Item
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 px-4 sm:px-6 pb-4 sm:pb-6 overflow-visible">
                    {/* Table Header */}
                    <div className="hidden sm:grid grid-cols-12 gap-4 pb-3 border-b border-black/10 text-[9px] font-black text-[#000000] uppercase tracking-[0.15em] mt-4 mb-2">
                      <div className="col-span-7 pl-2">
                        Item Name / Description
                      </div>
                      <div className="col-span-2 text-center">Price (₹)</div>
                      <div className="col-span-2 text-center">Qty</div>
                      <div className="col-span-1"></div>
                    </div>

                    {/* Items List */}
                    <div className="space-y-4 pt-2 overflow-visible">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="flex flex-col sm:grid sm:grid-cols-12 gap-3 sm:gap-4 items-stretch sm:items-center group border-b border-transparent pb-4 pt-1 overflow-visible relative"
                        >
                          {/* Item Name / Description Input + Catalog Button */}
                          <div className="col-span-7 relative flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full">
                            <input
                              type="text"
                              placeholder="Type custom product description..."
                              className="flex-1 bg-white border border-black/10 focus:border-[#C1272D] rounded-lg px-4 py-2 text-xs font-semibold text-[#000000] focus:outline-none transition-colors placeholder:text-[#000000] min-w-0"
                              value={item.name}
                              onChange={(e) =>
                                updateItem(item.id, "name", e.target.value)
                              }
                            />
                            <button
                              onClick={() => {
                                setActiveCatalogRowId(
                                  activeCatalogRowId === item.id
                                    ? null
                                    : item.id,
                                );
                                setCatalogSearch("");
                              }}
                              className="flex items-center justify-center gap-1.5 border border-[#C1272D]/30 bg-[#C1272D]/5 text-[#C1272D] hover:bg-[#C1272D]/10 px-3 py-2 rounded-lg text-[10px] font-bold transition-colors uppercase tracking-wider shrink-0 cursor-pointer w-full sm:w-auto"
                            >
                              <List className="w-3.5 h-3.5" />
                              Catalog
                            </button>

                            {/* Catalog Dropdown Popover */}
                            {activeCatalogRowId === item.id && (
                              <div className="absolute z-[80] top-full left-0 mt-1 w-full sm:w-80 max-w-[calc(100vw-2.5rem)] bg-[#FFFFFF] border-2 border-black/10 rounded-lg shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                                <div className="p-2 border-b border-black/10 bg-[#FFFFFF] flex items-center justify-between gap-2">
                                  <input
                                    type="text"
                                    placeholder="Search catalog items..."
                                    className="w-full bg-white border border-black/10 focus:border-[#C1272D] rounded-md px-3 py-1.5 text-xs font-semibold focus:outline-none transition-colors"
                                    value={catalogSearch}
                                    onChange={(e) =>
                                      setCatalogSearch(e.target.value)
                                    }
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => fetchData()}
                                    disabled={isRefreshing}
                                    className="text-[#000000] hover:text-[#C1272D] p-1.5 rounded transition-colors cursor-pointer shrink-0"
                                    title="Refresh catalog from database"
                                  >
                                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-[#C1272D]" : ""}`} />
                                  </button>
                                  <button
                                    onClick={() => setActiveCatalogRowId(null)}
                                    className="text-[#000000] hover:text-[#C1272D] p-1.5 rounded transition-colors cursor-pointer shrink-0"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                                <div className="max-h-48 overflow-y-auto">
                                  {catalog.filter((c) =>
                                    c.name
                                      .toLowerCase()
                                      .includes(catalogSearch.toLowerCase()),
                                  ).length > 0 ? (
                                    catalog
                                      .filter((c) =>
                                        c.name
                                          .toLowerCase()
                                          .includes(
                                            catalogSearch.toLowerCase(),
                                          ),
                                      )
                                      .map((catItem) => (
                                        <div
                                          key={catItem.id}
                                          className="w-full flex items-center border-b border-transparent last:border-0 hover:bg-[#FFFFFF] transition-colors"
                                        >
                                          <button
                                            className="flex-1 text-left px-4 py-2.5 flex flex-col cursor-pointer"
                                            onClick={() => {
                                              updateItem(
                                                item.id,
                                                "name",
                                                catItem.name,
                                              );
                                              if (catItem.price !== undefined) {
                                                updateItem(
                                                  item.id,
                                                  "price",
                                                  catItem.price,
                                                );
                                              }
                                              setActiveCatalogRowId(null);
                                            }}
                                          >
                                            <span className="text-xs font-bold text-[#000000]">
                                              {catItem.name}
                                            </span>
                                            {catItem.desc && (
                                              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#000000] mt-0.5">
                                                {catItem.desc}
                                              </span>
                                            )}
                                            {catItem.price !== undefined && (
                                              <span className="text-[10px] font-bold text-[#C1272D] mt-0.5">
                                                ₹{catItem.price}
                                              </span>
                                            )}
                                          </button>
                                          <div className="flex shrink-0">
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setNewCatName(catItem.name);
                                                setNewCatDesc(catItem.desc || "");
                                                setNewCatPrice(catItem.price || "");
                                                setEditingCatalogId(catItem.id);
                                                setShowCatalogModal(true);
                                                setActiveCatalogRowId(null);
                                              }}
                                              className="px-3 py-2.5 text-[#000000] hover:text-[#1A1A1A] transition-colors cursor-pointer"
                                              title="Edit item"
                                            >
                                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                            </button>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                setConfirmDialog({
                                                  title: "Delete catalog item?",
                                                  message: `"${catItem.name}" will be removed from the catalog. This won't affect invoices that already use it.`,
                                                  confirmLabel: "Delete item",
                                                  onConfirm: () => deleteFromCatalog(catItem.id),
                                                });
                                              }}
                                              className="px-3 py-2.5 text-[#000000] hover:text-[#C1272D] transition-colors cursor-pointer"
                                              title="Delete item"
                                            >
                                              <Trash2 className="w-4 h-4" />
                                            </button>
                                          </div>
                                        </div>
                                      ))
                                  ) : (
                                    <div className="px-4 py-4 text-center">
                                      <div className="text-xs text-[#000000] font-semibold mb-2 flex items-center justify-center gap-2">
                                        {isCatalogLoading ? (
                                          <div className="w-full animate-pulse space-y-2 py-1" aria-label="Loading items">
                                            {[0, 1, 2].map((i) => (
                                              <div key={i} className="h-8 rounded-lg bg-black/5" />
                                            ))}
                                          </div>
                                        ) : catalogSearch.trim() ? (
                                          `No items match "${catalogSearch}"`
                                        ) : (
                                          "No catalog items yet"
                                        )}
                                      </div>
                                      <div className="flex items-center justify-center gap-2 flex-wrap">
                                        <button
                                          onClick={() => fetchData()}
                                          disabled={isRefreshing}
                                          className="text-[10px] font-bold text-[#6B5F52] bg-black/5 hover:bg-black/10 px-3 py-1.5 rounded uppercase tracking-wider transition-colors cursor-pointer flex items-center gap-1.5"
                                          title="Sync from database"
                                        >
                                          <RefreshCw className={`w-3 h-3 ${isRefreshing ? "animate-spin" : ""}`} />
                                          Sync
                                        </button>
                                        <button
                                          onClick={() => {
                                            setNewCatName(catalogSearch);
                                            setCatalogTargetRowId(item.id);
                                            setShowCatalogModal(true);
                                            setActiveCatalogRowId(null);
                                          }}
                                          className={`text-[10px] font-bold text-[#C1272D] bg-[#C1272D]/10 hover:bg-[#C1272D]/20 px-3 py-1.5 rounded uppercase tracking-wider transition-colors cursor-pointer ${isCatalogLoading ? "hidden" : ""}`}
                                        >
                                          + Add to Catalog
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Price, Qty, and Trash (Grid layout to prevent overflow on tiny 300px screens) */}
                          <div className="col-span-5 grid grid-cols-[minmax(0,1fr)_auto_auto] sm:grid-cols-5 gap-2 sm:gap-4 w-full items-center">
                            {/* Price Input */}
                            <div className="sm:col-span-2 flex items-center gap-1.5 sm:gap-2 sm:block min-w-0 w-full">
                              <span className="text-[10px] font-bold text-[#000000] uppercase sm:hidden shrink-0">
                                Price:
                              </span>
                              <input
                                type="number"
                                className="w-full min-w-0 text-center bg-white border border-black/10 focus:border-[#C1272D] rounded-lg px-2 sm:px-3 py-2 text-xs font-semibold text-[#000000] focus:outline-none transition-colors"
                                value={item.price || ""}
                                onChange={(e) =>
                                  updateItem(
                                    item.id,
                                    "price",
                                    parseFloat(e.target.value) || 0,
                                  )
                                }
                                onWheel={(e) => e.currentTarget.blur()}
                                placeholder="0"
                              />
                            </div>

                            {/* Quantity Counter */}
                            <div className="sm:col-span-2 flex items-center justify-end gap-1.5 sm:gap-2 sm:block shrink-0">
                              <span className="text-[10px] font-bold text-[#000000] uppercase sm:hidden shrink-0">
                                Qty:
                              </span>
                              <div className="flex items-center border border-black/10 bg-white rounded-lg overflow-hidden h-[36px] max-w-[90px] shrink-0">
                                <button
                                  className="w-7 h-full flex items-center justify-center text-[#000000] hover:bg-[#FFFFFF] hover:text-[#C1272D] font-bold text-xs transition-colors cursor-pointer"
                                  onClick={() =>
                                    updateItem(
                                      item.id,
                                      "qty",
                                      Math.max(1, item.qty - 1),
                                    )
                                  }
                                >
                                  −
                                </button>
                                <span className="flex-1 text-center font-bold text-xs text-[#000000] min-w-[18px]">
                                  {item.qty}
                                </span>
                                <button
                                  className="w-7 h-full flex items-center justify-center text-[#000000] hover:bg-[#FFFFFF] hover:text-[#C1272D] font-bold text-xs transition-colors cursor-pointer"
                                  onClick={() =>
                                    updateItem(item.id, "qty", item.qty + 1)
                                  }
                                >
                                  +
                                </button>
                              </div>
                            </div>

                            {/* Trash Button */}
                            <div className="sm:col-span-1 flex justify-end shrink-0">
                              <button
                                onClick={() => removeItem(item.id)}
                                className="text-[#000000] hover:text-[#C1272D] hover:bg-[#F6E4E1] p-2 rounded-lg border border-black/10 hover:border-transparent transition-colors flex items-center justify-center cursor-pointer"
                                title="Remove Item"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>{" "}
              {/* Right Column - Premium Light Order Panel */}
              <div className="w-full lg:w-[40%] xl:w-[35%] flex flex-col shrink-0 bg-white text-[#000000] border border-black/10 rounded-2xl shadow-sm lg:sticky lg:top-28 lg:self-start lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto transition-shadow duration-500 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] overflow-hidden group">
                <div className="p-4 sm:p-6 pb-4 border-b border-black/10 flex justify-between items-center bg-[#FFFFFF]">
                  <h2 className="text-base font-black flex items-center gap-3 text-[#000000] tracking-tight">
                    <ShoppingBag className="w-4 h-4 text-[#C1272D]" />
                    Current Order
                  </h2>
                  <span
                    className={`flex items-center gap-2 bg-white border border-black/10 px-3 py-1 rounded-full font-bold text-[9px] ${isOnline ? "text-[#1A1A1A]" : "text-[#C1272D]"}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${isOnline ? "bg-[#1A1A1A]" : "bg-[#C1272D]"}`}
                    ></span>
                    {isOnline ? "ONLINE ORDER" : "OFFLINE (POS)"}
                  </span>
                </div>

                <div className="p-4 sm:p-6 space-y-5">
                  {/* Customer Details Box */}
                  <div className="bg-[#FFFFFF]/40 border border-black/10 rounded-xl p-4 space-y-2.5">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#000000] font-semibold">
                        SOURCE
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-widest border ${isOnline ? "border-[#1A1A1A] text-[#1A1A1A] bg-[#1A1A1A]/10" : "border-[#C1272D] text-[#C1272D] bg-[#C1272D]/10"}`}
                      >
                        {isOnline ? "ONLINE" : "OFFLINE"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#000000] font-semibold">
                        CUSTOMER
                      </span>
                      <span className="font-bold text-[#000000] truncate max-w-[65%] text-right">
                        {customerName || "-"}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-[#000000] font-semibold">
                        PHONE
                      </span>
                      <span className="font-bold text-[#000000]">
                        {customerPhone || "-"}
                      </span>
                    </div>

                    {/* Items summary list inside customer details box */}
                    <div className="border-t border-black/10 pt-2.5 mt-2.5">
                      {items.filter((i) => i.name).length === 0 ? (
                        <div className="text-center py-2 text-[10px] text-[#000000] font-semibold italic">
                          No items added yet
                        </div>
                      ) : (
                        <div className="max-h-24 overflow-y-auto space-y-1.5 scrollbar-thin pr-1">
                          {items
                            .filter((i) => i.name)
                            .map((item) => (
                              <div
                                key={item.id}
                                className="flex justify-between items-center text-[10px]"
                              >
                                <span className="text-[#000000] font-semibold">
                                  {item.qty}x {item.name}
                                </span>
                                <span className="font-bold text-[#C1272D]">
                                  ₹
                                  {(item.price * item.qty).toLocaleString(
                                    undefined,
                                    { minimumFractionDigits: 2 },
                                  )}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Discounts section */}
                  <div className="space-y-4 pt-1">
                    {/* Coupon code (managed in the Coupons tab) */}
                    <div>
                      <label className="block text-[10px] font-bold text-[#000000] uppercase tracking-[0.1em] mb-1.5">
                        Coupon Code
                      </label>
                      {selectedCoupon !== "none" ? (
                        <div className="flex items-center justify-between gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                          <span className="text-xs font-black text-emerald-800 font-mono tracking-wider">
                            {selectedCoupon} · {discountValue}% off
                          </span>
                          <button
                            type="button"
                            onClick={clearCoupon}
                            className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 hover:underline cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={couponInput}
                            maxLength={24}
                            onChange={(e) => {
                              setCouponInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
                              setCouponMsg(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") applyCouponCode();
                            }}
                            placeholder="Enter code"
                            className="flex-1 min-w-0 bg-white border border-black/10 rounded-lg px-3 py-2 text-xs font-bold text-[#000000] uppercase tracking-wider focus:outline-none focus:border-[#C1272D]"
                          />
                          <button
                            type="button"
                            onClick={applyCouponCode}
                            disabled={couponApplying || !couponInput.trim()}
                            className="px-3 py-2 rounded-lg bg-[#C1272D] text-white text-[10px] font-bold uppercase tracking-wider hover:bg-[#9B1C21] disabled:opacity-50 cursor-pointer"
                          >
                            {couponApplying ? "…" : "Apply"}
                          </button>
                        </div>
                      )}
                      {couponMsg && selectedCoupon === "none" && (
                        <p className={`mt-1 text-[10px] font-semibold ${couponMsg.ok ? "text-emerald-700" : "text-[#B91C1C]"}`}>
                          {couponMsg.text}
                        </p>
                      )}
                    </div>

                    {/* Loyalty: member card, points and free gifts */}
                    {customerPhone.length === 10 && member?.enabled && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-2.5">
                        {!member.customer ? (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[11px] font-semibold text-emerald-900">Not in the loyalty programme yet.</span>
                            <button
                              type="button"
                              onClick={enrolCustomer}
                              disabled={enrolling}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-700 disabled:opacity-60 cursor-pointer"
                            >
                              {enrolling ? "Adding…" : "Add to loyalty"}
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-900">
                                Loyalty · {member.customer.name || member.customer.phone}
                              </span>
                              <span className="text-xs font-black text-emerald-800">{member.customer.available} pts</span>
                            </div>
                            {loyaltyCap && loyaltyCap.maxPoints > 0 ? (
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={0}
                                  max={loyaltyCap.maxPoints}
                                  value={pointsToUse || ""}
                                  placeholder={`Use ${loyaltyCap.minPoints}–${loyaltyCap.maxPoints} points`}
                                  onWheel={(e) => e.currentTarget.blur()}
                                  onChange={(e) => setPointsToUse(Math.max(0, Math.floor(parseFloat(e.target.value) || 0)))}
                                  className="flex-1 min-w-0 bg-white border border-emerald-200 rounded-lg px-3 py-2 text-xs font-bold focus:outline-none focus:border-emerald-500"
                                />
                                <button
                                  type="button"
                                  onClick={() => setPointsToUse(loyaltyCap.maxPoints)}
                                  className="px-2.5 py-2 rounded-lg bg-white border border-emerald-300 text-[10px] font-bold uppercase text-emerald-800 hover:bg-emerald-100 cursor-pointer"
                                >
                                  Max
                                </button>
                              </div>
                            ) : (
                              loyaltyCap?.reason && <p className="text-[10px] font-semibold text-emerald-900/70">{loyaltyCap.reason}</p>
                            )}
                            {pointsToUse > 0 && loyaltyPoints === 0 && loyaltyCap && loyaltyCap.maxPoints > 0 && (
                              <p className="text-[10px] font-semibold text-[#B91C1C]">Use at least {loyaltyCap.minPoints} points on this bill.</p>
                            )}
                            {loyaltyDiscount > 0 && (
                              <p className="text-[11px] font-bold text-emerald-800">
                                {loyaltyPoints} points = ₹{loyaltyDiscount.toLocaleString("en-IN")} off this bill
                              </p>
                            )}
                            {member.vouchers.length > 0 && (
                              <div className="space-y-1.5 border-t border-emerald-200 pt-2">
                                <span className="block text-[10px] font-black uppercase tracking-wider text-emerald-900">Free gifts unlocked</span>
                                {member.vouchers.map((v) => {
                                  const prod = member.products.find((p) => p.id === v.productId);
                                  const added = claimedVouchers.includes(v.id);
                                  return (
                                    <div key={v.id} className="flex items-center justify-between gap-2 text-[11px]">
                                      <span className="font-semibold">
                                        {v.name} × {v.giftQty}
                                        {v.pointsCost > 0 && <span className="text-emerald-800/70"> · uses {v.pointsCost} pts</span>}
                                      </span>
                                      <button
                                        type="button"
                                        disabled={added || !prod}
                                        onClick={() => {
                                          if (!prod) return;
                                          setItems((prev) => [
                                            ...prev.filter((x) => x.name || x.price),
                                            { id: Math.random().toString(), name: prod.name, desc: "FREE GIFT", price: 0, qty: v.giftQty },
                                          ]);
                                          setClaimedVouchers((c) => [...c, v.id]);
                                        }}
                                        className="px-2.5 py-1 rounded bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-emerald-700 disabled:opacity-50 cursor-pointer"
                                      >
                                        {added ? "Added" : "Add to bill"}
                                      </button>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {/* Offers on the bill: shown when the bill qualifies, added with one tap */}
                    {offerEntitled.length > 0 && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2">
                        <span className="block text-[10px] font-black uppercase tracking-wider text-amber-900">Offer on this bill</span>
                        {offerEntitled.map((e) => {
                          const prod = catalog.find((c) => c.id === e.productId);
                          const added = addedOffers.includes(e.key);
                          return (
                            <div key={e.key} className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="font-semibold text-amber-950">
                                {e.name}: free {e.qty} × {prod?.name ?? "item"}
                              </span>
                              <button
                                type="button"
                                disabled={added || !prod}
                                onClick={() => {
                                  if (!prod) return;
                                  setItems((prev) => [
                                    ...prev.filter((x) => x.name || x.price),
                                    { id: Math.random().toString(), name: prod.name, desc: "FREE GIFT", price: 0, qty: e.qty },
                                  ]);
                                  setAddedOffers((a) => [...a, e.key]);
                                }}
                                className="px-2.5 py-1 rounded bg-amber-600 text-white text-[10px] font-bold uppercase tracking-wider hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
                              >
                                {added ? "Added" : "Add free gift"}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Manual Discount */}
                    <div>
                      <label className="block text-[10px] font-bold text-[#000000] uppercase tracking-[0.1em] mb-1.5">
                        Manual Discount
                      </label>
                      <div className="flex gap-2">
                        <select
                          value={discountType}
                          onChange={(e) => {
                            setDiscountType(
                              e.target.value as "fixed" | "percent",
                            );
                            setSelectedCoupon("none");
                          }}
                          className="bg-white border border-black/10 text-[#000000] rounded-lg px-3 py-2 text-xs font-bold focus:outline-none focus:border-[#C1272D] cursor-pointer"
                        >
                          <option value="fixed">₹</option>
                          <option value="percent">%</option>
                        </select>
                        <input
                          type="number"
                          className="flex-1 text-right bg-white border border-black/10 rounded-lg px-3 py-2 text-xs font-bold text-[#000000] placeholder:text-[#000000] focus:outline-none focus:border-[#C1272D] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none min-w-0"
                          value={discountValue || ""}
                          onWheel={(e) => e.currentTarget.blur()}
                          onChange={(e) => {
                            setDiscountValue(parseFloat(e.target.value) || 0);
                            setSelectedCoupon("none");
                          }}
                          placeholder="0"
                        />
                      </div>
                    </div>

                    {/* Subtotal & Delivery */}
                    <div className="space-y-3 pt-3 border-t border-black/10">
                      <div className="flex justify-between items-center text-[13px] font-semibold">
                        <span className="text-[#000000]">
                          Subtotal ({items.filter((i) => i.name).reduce((sum, i) => sum + i.qty, 0)} items)
                        </span>
                        <span className="font-mono font-bold text-[#000000]">
                          ₹{subtotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      {calculatedDiscount > 0 && (
                        <div className="flex justify-between items-center text-[13px] font-semibold">
                          <span className="text-[#000000]">Discount</span>
                          <span className="font-mono font-bold text-emerald-700">
                            − ₹{calculatedDiscount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center text-[13px] font-semibold">
                        <span className="text-[#000000]">Delivery</span>
                        <input
                          type="number"
                          className="w-24 text-right bg-white border border-black/10 rounded-xl px-3 py-2 text-sm font-bold font-mono text-[#000000] placeholder:text-black/40 focus:outline-none focus:border-[#C1272D] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={deliveryFee || ""}
                          onWheel={(e) => e.currentTarget.blur()}
                          onChange={(e) => setDeliveryFee(parseFloat(e.target.value) || 0)}
                          placeholder="0"
                        />
                      </div>
                    </div>

                    {/* Non-GST bill / GST invoice */}
                    <div className="flex rounded-full border border-black/10 bg-white p-1">
                      <button
                        type="button"
                        onClick={() => setApplyGST(false)}
                        className={`flex-1 rounded-full py-2.5 text-[11px] font-extrabold uppercase tracking-wider cursor-pointer transition ${!applyGST ? "bg-[#111] text-white shadow-sm" : "text-[#000000] hover:bg-black/5"}`}
                      >
                        Non-GST Bill
                      </button>
                      <button
                        type="button"
                        onClick={() => setApplyGST(true)}
                        className={`flex-1 rounded-full py-2.5 text-[11px] font-extrabold uppercase tracking-wider cursor-pointer transition ${applyGST ? "bg-[#C1272D] text-white shadow-sm" : "text-[#000000] hover:bg-black/5"}`}
                      >
                        GST Invoice
                      </button>
                    </div>

                    {applyGST && (
                      <div className="rounded-2xl border border-black/10 bg-white p-3 space-y-3">
                        <div className="flex rounded-xl border border-black/10 p-1">
                          <button
                            type="button"
                            onClick={() => setGstInclusive(false)}
                            className={`flex-1 rounded-lg py-2 text-[10px] font-extrabold uppercase tracking-wider cursor-pointer transition ${!gstInclusive ? "bg-[#111] text-white" : "text-[#000000] hover:bg-black/5"}`}
                          >
                            Exclusive (+GST)
                          </button>
                          <button
                            type="button"
                            onClick={() => setGstInclusive(true)}
                            className={`flex-1 rounded-lg py-2 text-[10px] font-extrabold uppercase tracking-wider cursor-pointer transition ${gstInclusive ? "bg-[#111] text-white" : "text-[#000000] hover:bg-black/5"}`}
                          >
                            Inclusive (Tax incl.)
                          </button>
                        </div>
                        <div className="flex items-center justify-between px-1">
                          <span className="text-[13px] font-extrabold text-[#000000]">GST RATE</span>
                          <span className="flex items-center gap-1.5">
                            <input
                              type="number"
                              className="w-16 text-center bg-white border border-black/10 rounded-lg px-2 py-1.5 text-sm font-bold text-[#000000] focus:outline-none focus:border-[#C1272D] [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              value={gstPercentage || ""}
                              onWheel={(e) => e.currentTarget.blur()}
                              onChange={(e) => setGstPercentage(parseFloat(e.target.value) || 0)}
                              placeholder="%"
                            />
                            <span className="text-sm font-bold text-[#000000]">%</span>
                          </span>
                        </div>
                        <div className="flex justify-between items-center px-1 text-[12px] text-[#6B5F52]">
                          <span>Taxable Base Value</span>
                          <span className="font-mono font-bold text-[#000000]">₹{taxableBase.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                        </div>
                        <div className="flex justify-between items-center px-1 text-[12px] font-bold">
                          <span className="text-[#000000]">GST Total ({gstInclusive ? `included @ ${gstPercentage}%` : `@ ${gstPercentage}%`})</span>
                          <span className="font-mono font-black text-[#C1272D]">₹{gstAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                        </div>
                      </div>
                    )}

                    {/* Grand Total */}
                    <div className="flex justify-between items-center pt-4 border-t border-black/10">
                      <span className="text-[15px] font-black text-[#000000] uppercase tracking-wide">Grand Total</span>
                      <span className="text-[26px] text-[#C1272D] font-black font-mono">
                        ₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    {/* Payment Method Selector */}
                    <div className="mt-4">
                      <span className="block text-[10px] font-bold text-[#6B5F52] uppercase tracking-wider mb-2">
                        Payment Method
                      </span>
                      <div className="flex bg-[#E0D5C3]/30 p-1 rounded-lg">
                        <button
                          onClick={() => setPaymentMethod("CASH")}
                          className={`flex-1 flex items-center justify-center py-2 text-xs font-bold rounded-md transition-all ${paymentMethod === "CASH" ? "bg-white text-[#C1272D] shadow-sm" : "text-[#4A4038] hover:text-[#000000]"}`}
                        >
                          Cash
                        </button>
                        <button
                          onClick={() => setPaymentMethod("CARD")}
                          className={`flex-1 flex items-center justify-center py-2 text-xs font-bold rounded-md transition-all ${paymentMethod === "CARD" ? "bg-white text-[#C1272D] shadow-sm" : "text-[#4A4038] hover:text-[#000000]"}`}
                        >
                          Card
                        </button>
                        <button
                          onClick={() => setPaymentMethod("GPAY")}
                          className={`flex-1 flex items-center justify-center py-2 text-xs font-bold rounded-md transition-all ${paymentMethod === "GPAY" ? "bg-white text-[#C1272D] shadow-sm" : "text-[#4A4038] hover:text-[#000000]"}`}
                        >
                          UPI
                        </button>
                        <button
                          onClick={() => setPaymentMethod("SPLIT")}
                          className={`flex-1 flex items-center justify-center py-2 text-xs font-bold rounded-md transition-all ${paymentMethod === "SPLIT" ? "bg-white text-[#C1272D] shadow-sm" : "text-[#4A4038] hover:text-[#000000]"}`}
                        >
                          Split
                        </button>
                      </div>
                    </div>

                    {/* Cash payment */}
                    {paymentMethod === "CASH" && (
                      <div className="rounded-2xl border border-black/10 bg-white p-4">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div>
                            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[#6B5F52]">Cash Payment</p>
                            <p className="text-[12px] font-extrabold text-[#000000]">Amount Received (₹)</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setCashReceived(grandTotal)}
                            className="text-[10px] font-bold text-[#C1272D] bg-[#C1272D]/10 px-2.5 py-1 rounded-md hover:bg-[#C1272D]/20 cursor-pointer"
                          >
                            Exact Amount
                          </button>
                        </div>
                        <input
                          type="number"
                          className="w-full bg-white border border-black/10 focus:border-[#C1272D] rounded-xl px-4 py-3 text-base font-bold text-[#000000] placeholder:text-black/40 focus:outline-none transition-colors"
                          value={cashReceived || ""}
                          onWheel={(e) => e.currentTarget.blur()}
                          onChange={(e) => setCashReceived(parseFloat(e.target.value) || 0)}
                          placeholder="0.00"
                        />
                        {cashReceived > 0 && (
                          <div className="mt-3 flex items-center justify-between rounded-lg bg-black/[0.04] px-3 py-2 text-[12px]">
                            <span className="font-extrabold uppercase tracking-wide text-[#000000]">Change to Return</span>
                            <span className={`font-mono font-black ${cashReceived >= grandTotal ? "text-emerald-600" : "text-[#C1272D]"}`}>
                              ₹{Math.max(0, cashReceived - grandTotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Split: any mix of cash, UPI and card; each box can take "the rest" in one tap */}
                    {paymentMethod === "SPLIT" && (() => {
                      const sc = Number(splitCash) || 0;
                      const su = Number(splitUpi) || 0;
                      const sd = Number(splitCard) || 0;
                      const off = Math.round((grandTotal - sc - su - sd) * 100) / 100;
                      const rows: [string, number | "", (v: number | "") => void, number][] = [
                        ["Cash", splitCash, setSplitCash, sc],
                        ["UPI", splitUpi, setSplitUpi, su],
                        ["Card", splitCard, setSplitCard, sd],
                      ];
                      return (
                        <div className="mt-2 space-y-2.5">
                          <p className="text-[12px] text-[#4A4038]">Split ₹{grandTotal.toLocaleString("en-IN")} between cash, UPI and card.</p>
                          {rows.map(([label, val, setter, cur]) => (
                            <div key={label} className="flex items-center gap-2">
                              <span className="w-12 text-[11px] font-bold uppercase tracking-wider text-[#6B5F52]">{label}</span>
                              <input
                                type="number"
                                min={0}
                                value={val}
                                placeholder="0.00"
                                onWheel={(e) => e.currentTarget.blur()}
                                onChange={(e) => setter(e.target.value === "" ? "" : Math.max(0, parseFloat(e.target.value) || 0))}
                                className="flex-1 min-w-0 bg-white border border-black/10 rounded-lg px-3 py-2 text-sm font-bold text-right focus:outline-none focus:border-[#C1272D]"
                              />
                              <button
                                type="button"
                                onClick={() => setter(Math.max(0, Math.round((cur + off) * 100) / 100))}
                                className="px-2.5 py-2 rounded-lg bg-[#C1272D]/10 text-[#C1272D] text-[10px] font-bold uppercase hover:bg-[#C1272D]/20 cursor-pointer"
                              >
                                Rest
                              </button>
                            </div>
                          ))}
                          <div className={`flex justify-between rounded-lg px-3 py-2 text-xs font-bold ${Math.abs(off) < 0.01 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                            <span>{Math.abs(off) < 0.01 ? "Adds up to the bill" : off > 0 ? "Still to collect" : "Over the bill by"}</span>
                            <span>₹{Math.abs(off).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                          </div>
                          {su > 0 && (
                            <>
                              <label className="block">
                                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#6B5F52]">UPI part came through</span>
                                <select
                                  className="h-11 w-full rounded-xl border border-black/15 bg-white px-4 text-sm font-semibold outline-none focus:border-[#C1272D] cursor-pointer"
                                  value={upiVia || defaultUpiVia}
                                  onChange={(e) => setUpiVia(e.target.value)}
                                >
                                  {UPI_CHANNELS.map((c) => (
                                    <option key={c.key} value={c.key}>{c.label}</option>
                                  ))}
                                </select>
                              </label>
                              {upiCfg && (
                                <UpiQrCard
                                  upi={{ id: upiCfg.id, name: upiCfg.name, minutes: upiCfg.minutes, phone: upiCfg.phone }}
                                  amount={su}
                                  shop={upiCfg.shopName}
                                  label="Scan to pay the UPI part:"
                                />
                              )}
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {/* UPI: how it arrived, counter QR, and the WhatsApp payment link */}
                    {paymentMethod === "GPAY" && (
                      <div className="mt-2">
                        <p className="text-[12px] text-[#4A4038] mb-3">
                          Collect ₹{grandTotal.toLocaleString("en-IN", { minimumFractionDigits: Number.isInteger(grandTotal) ? 0 : 2, maximumFractionDigits: 2 })} by UPI, then complete the bill.
                        </p>
                        <label className="block">
                          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-[#6B5F52]">
                            UPI payment came through
                          </span>
                          <select
                            className="h-11 w-full rounded-xl border border-black/15 bg-white px-4 text-sm font-semibold text-black outline-none focus:border-[#C1272D] cursor-pointer"
                            value={upiVia || defaultUpiVia}
                            onChange={(e) => setUpiVia(e.target.value)}
                          >
                            {UPI_CHANNELS.map((c) => (
                              <option key={c.key} value={c.key}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                          <span className="mt-1 block text-[11px] text-[#6B5F52]">
                            Kept with the bill, so payments from a WhatsApp link, the counter QR and a guest&apos;s phone can be told apart.
                          </span>
                        </label>
                        {upiCfg && grandTotal > 0 ? (
                          <UpiQrCard
                            upi={{ id: upiCfg.id, name: upiCfg.name, minutes: upiCfg.minutes, phone: upiCfg.phone }}
                            amount={grandTotal}
                            shop={upiCfg.shopName}
                            label="Scan to pay"
                          />
                        ) : (
                          !upiCfg && (
                            <p className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] font-semibold text-amber-800">
                              Add your UPI ID in Settings to show the counter QR.
                            </p>
                          )
                        )}
                      </div>
                    )}

                    {upiCfg && grandTotal > 0 && customerPhone.replace(/\D/g, "").length === 10 && (paymentMethod === "CASH" || paymentMethod === "GPAY" || paymentMethod === "SPLIT") && (
                      <div className="mt-3 space-y-2 rounded-2xl border border-dashed border-[#6B5F52]/40 p-3">
                        <span className="block text-[10px] font-bold uppercase tracking-wider text-[#6B5F52]">
                          Ask the customer to pay by UPI
                        </span>
                        <button
                          type="button"
                          onClick={sendPayLink}
                          disabled={isSendingPayLink}
                          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#22c55e] bg-white text-[13px] font-bold text-[#16a34a] hover:bg-emerald-50 disabled:opacity-60 cursor-pointer"
                        >
                          {isSendingPayLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
                          Send payment link on WhatsApp
                        </button>
                        {linkSent && (
                          <p className="text-[11px] font-semibold text-emerald-700">
                            Link sent. If they pay it, choose UPI and complete the bill.
                          </p>
                        )}
                      </div>
                    )}

                    {/* Saved confirmation */}
                    {savedOrderId && (
                      <div className="flex items-center gap-2 bg-[#10B981]/10 border border-[#10B981]/30 text-[#059669] rounded-lg p-3 text-[11px] font-bold">
                        <ShieldCheck className="w-4 h-4 shrink-0" />
                        Order {savedOrderId} saved to the database.
                        {savedLoyaltyNote && <span className="ml-1 font-semibold">· {savedLoyaltyNote}</span>}
                      </div>
                    )}

                    {/* Action Buttons */}
                    <button
                      onClick={handleCompleteSale}
                      disabled={isCompletingSale || isSavingOrder}
                      className="w-full mt-2 bg-[#C1272D] hover:bg-[#9E1B20] text-white py-4 rounded-2xl font-extrabold text-[12px] uppercase tracking-[0.12em] flex items-center justify-center gap-2 transition-transform active:scale-[0.98] shadow-[0_8px_20px_-8px_rgba(193,39,45,0.7)] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isCompletingSale ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      {isCompletingSale ? "Processing…" : "Complete Sale"}
                    </button>

                    <button
                      onClick={handleSaveOrder}
                      disabled={isSavingOrder || isCompletingSale}
                      className="w-full mt-2 bg-white hover:bg-amber-50 text-amber-800 border-2 border-amber-400 py-3.5 rounded-2xl font-extrabold text-[11px] uppercase tracking-[0.12em] flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {isSavingOrder ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {isSavingOrder ? "Saving…" : "Save Order"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {role === "admin" && activeTab === "inventory" && <InventoryPanel />}
        {role === "admin" && activeTab === "coupons" && <CouponsPanel />}
        {role === "admin" && activeTab === "expenses" && <ExpensesPanel />}
        {role === "admin" && activeTab === "settings" && <SettingsPanel />}
        {activeTab === "loyalty" && <LoyaltyPanel admin={role === "admin"} />}

        {role === "admin" && activeTab === "orders" && (
          <div className="flex-1 flex flex-col max-w-[1400px] mx-auto w-full pb-8 pr-2 animate-in fade-in duration-300">
            {/* Header Panel */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
              <div>
                <h2 className="text-[28px] font-black text-[#000000] tracking-tight">
                  Order History
                </h2>
                <p className="text-xs text-[#000000] font-semibold mt-1">
                  Manage and track past invoices
                </p>
              </div>

              {orders.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                  <div className="flex flex-wrap items-center bg-[#FFFFFF] border border-black/10 rounded-xl p-1 gap-1 max-w-full">
                    <span className="text-[9px] font-bold text-[#000000] uppercase tracking-wider px-2">
                      Period:
                    </span>
                    {(["all", "today", "week", "month", "year"] as const).map(
                      (p) => {
                        const displayLabel =
                          p === "all"
                            ? "All Time"
                            : p === "today"
                              ? "Today"
                              : p === "week"
                                ? "This Week"
                                : p === "month"
                                  ? "This Month"
                                  : "This Year";
                        const isActive = historyPeriod === p;
                        return (
                          <button
                            key={p}
                            onClick={() => {
                              setHistoryPeriod(p);
                              setHistoryStartDate("");
                              setHistoryEndDate("");
                            }}
                            className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                              isActive
                                ? "bg-[#9E1B20] text-[#FFFFFF] shadow-sm"
                                : "text-[#000000] hover:bg-[#000000]/5"
                            }`}
                          >
                            {displayLabel}
                          </button>
                        );
                      },
                    )}
                  </div>

                  <div className="flex flex-wrap items-center border rounded-xl px-3 py-1.5 gap-2 shadow-sm bg-white border-black/10 min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#000000]">
                        From:
                      </span>
                      <input
                        type="date"
                        value={historyStartDate}
                        onChange={(e) => {
                          setHistoryPeriod("custom");
                          setHistoryStartDate(e.target.value);
                        }}
                        className="text-xs font-bold bg-transparent border-none outline-none focus:ring-0 cursor-pointer text-[#000000] w-[115px]"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-[#000000]">
                        To:
                      </span>
                      <input
                        type="date"
                        value={historyEndDate}
                        onChange={(e) => {
                          setHistoryPeriod("custom");
                          setHistoryEndDate(e.target.value);
                        }}
                        className="text-xs font-bold bg-transparent border-none outline-none focus:ring-0 cursor-pointer text-[#000000] w-[115px]"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleExportCSV}
                    className="flex items-center gap-1.5 px-4 py-2 border-2 border-[#C1272D] bg-transparent text-[#C1272D] hover:bg-[#C1272D] hover:text-[#FFFFFF] rounded-xl text-xs font-black uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-sm"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </button>
                </div>
              )}
            </div>

            {orders.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-black/10 rounded-xl bg-[#FFFFFF] py-12">
                <p className="text-[#000000] font-medium">
                  No past transactions yet.
                </p>
              </div>
            ) : (
              <>
                {/* Search and Filters Bar */}
                <div className="bg-white border-2 border-black/10 rounded-xl p-4 mb-6 shadow-sm flex flex-wrap gap-4 items-center justify-between">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 w-full">
                    <div>
                      <label className="block text-[9px] font-bold text-[#000000] uppercase tracking-wider mb-1">
                        Search Order ID
                      </label>
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-[#000000] absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          placeholder="e.g. INV-..."
                          className="w-full bg-[#FFFFFF]/30 border border-black/10 focus:border-[#C1272D] rounded-lg pl-8 pr-3 py-1.5 text-xs font-semibold text-[#000000] focus:outline-none"
                          value={orderSearchId}
                          onChange={(e) => setOrderSearchId(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-[#000000] uppercase tracking-wider mb-1">
                        Customer Name
                      </label>
                      <input
                        type="text"
                        placeholder="Search name..."
                        className="w-full bg-[#FFFFFF]/30 border border-black/10 focus:border-[#C1272D] rounded-lg px-3 py-1.5 text-xs font-semibold text-[#000000] focus:outline-none"
                        value={orderSearchName}
                        onChange={(e) => setOrderSearchName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-[#000000] uppercase tracking-wider mb-1">
                        Customer Phone
                      </label>
                      <input
                        type="text"
                        placeholder="Search phone..."
                        className="w-full bg-[#FFFFFF]/30 border border-black/10 focus:border-[#C1272D] rounded-lg px-3 py-1.5 text-xs font-semibold text-[#000000] focus:outline-none"
                        value={orderSearchPhone}
                        onChange={(e) => setOrderSearchPhone(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-[#000000] uppercase tracking-wider mb-1">
                        Order Source
                      </label>
                      <select
                        className="w-full bg-[#FFFFFF]/30 border border-black/10 focus:border-[#C1272D] rounded-lg px-3 py-1.5 text-xs font-bold text-[#000000] focus:outline-none cursor-pointer"
                        value={orderFilterSource}
                        onChange={(e) => setOrderFilterSource(e.target.value)}
                      >
                        <option value="ALL">All Sources</option>
                        <option value="ONLINE">Online Orders</option>
                        <option value="OFFLINE">Offline (POS)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {(() => {
                  const filteredOrders = historyFilteredOrders;

                  if (filteredOrders.length === 0) {
                    return (
                      <div className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-black/10 rounded-xl bg-[#FFFFFF] py-12">
                        <p className="text-[#000000] font-semibold">
                          No transactions match your search filters.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="bg-[#FFFFFF] border-2 border-black/10 rounded-xl shadow-sm overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-[#FFFFFF] border-b border-black/10">
                            <th className="p-4 text-[10px] font-bold text-[#000000] uppercase tracking-widest">
                              Order ID
                            </th>
                            <th className="p-4 text-[10px] font-bold text-[#000000] uppercase tracking-widest">
                              Customer Name
                            </th>
                            <th className="p-4 text-[10px] font-bold text-[#000000] uppercase tracking-widest">
                              Mobile Number
                            </th>
                            <th className="p-4 text-[10px] font-bold text-[#000000] uppercase tracking-widest">
                              Source
                            </th>
                            <th className="p-4 text-[10px] font-bold text-[#000000] uppercase tracking-widest">
                              Total Due
                            </th>
                            <th className="p-4 text-[10px] font-bold text-[#000000] uppercase tracking-widest text-right">
                              Status
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredOrders.map((order) => (
                            <tr
                              key={order.id}
                              className="border-b border-transparent hover:bg-[#FFFFFF] transition-colors"
                            >
                              <td className="p-4 text-xs font-semibold text-[#000000]">
                                {order.id}
                              </td>
                              <td className="p-4 text-xs font-bold text-[#000000]">
                                {order.customerName}
                              </td>
                              <td className="p-4 text-xs font-mono font-bold text-[#000000]">
                                {order.customerPhone || "-"}
                              </td>
                              <td className="p-4">
                                <span
                                  className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-widest border ${order.source === "ONLINE" ? "border-[#1A1A1A] text-[#1A1A1A] bg-[#1A1A1A]/10" : "border-[#C1272D] text-[#C1272D] bg-[#C1272D]/10"}`}
                                >
                                  {order.source}
                                </span>
                              </td>
                              <td className="p-4 text-sm font-black text-[#C1272D]">
                                ₹{order.grandTotal.toLocaleString()}
                              </td>
                              <td className="p-4 text-right">
                                <div className="flex flex-row items-center justify-end gap-2 sm:gap-3">
                                  <span className="px-3 py-1 rounded bg-[#10B981]/10 text-[#10B981] text-[10px] font-bold uppercase tracking-wider hidden sm:inline-block">
                                    {order.status}
                                  </span>
                                  <button
                                    onClick={() => resendWhatsApp(order)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#10B981] hover:bg-[#059669] text-white rounded-md text-[9px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap shrink-0"
                                  >
                                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.012c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
                                    </svg>
                                    WhatsApp
                                  </button>
                                  <button
                                    onClick={() => setActiveInvoiceId(order.id)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#C1272D] hover:bg-[#C1272D] text-white rounded-md text-[9px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap cursor-pointer shrink-0"
                                  >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    Invoice
                                  </button>
                                  <button
                                    onClick={() =>
                                      setConfirmDialog({
                                        title: "Delete this invoice?",
                                        message: `Invoice ${order.id} for ${order.customerName || "Guest"} (₹${order.grandTotal.toLocaleString()}) will be permanently deleted from the database and removed from every analytics report. This cannot be undone.`,
                                        confirmLabel: "Delete invoice",
                                        onConfirm: () => handleDeleteOrder(order.id),
                                      })
                                    }
                                    disabled={deletingOrderId === order.id}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#C1272D]/40 text-[#C1272D] hover:bg-[#C1272D] hover:text-white rounded-md text-[9px] font-bold uppercase tracking-wider transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                                  >
                                    {deletingOrderId === order.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-3 h-3" />
                                    )}
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {role === "admin" && activeTab === "analytics" && (
          <div className="flex-1 flex flex-col max-w-[1400px] min-w-0 mx-auto w-full pb-8 pr-2">
            {/* Header Panel */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 mb-6">
              <div>
                <h2 className="text-[28px] font-black text-[#000000] tracking-tight">
                  Revenue Analytics
                </h2>
                <p className="text-xs text-[#000000] font-semibold mt-1">
                  {billTypeFilter === "gst" ? "GST invoices only" : billTypeFilter === "nongst" ? "Non-GST bills only" : "All bills"} — full store & channel insights
                </p>
                <div className="mt-4 inline-flex flex-wrap items-center bg-white border border-black/10 rounded-2xl p-1 gap-1">
                  {([["all", "All Bills"], ["gst", "GST Invoices"], ["nongst", "Non-GST Bills"]] as const).map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setBillTypeFilter(key)}
                      className={`px-4 py-2 rounded-xl text-[10px] font-extrabold uppercase tracking-wider transition-all cursor-pointer ${billTypeFilter === key ? "bg-[#C1272D] text-white shadow-sm" : "text-[#000000] hover:bg-black/5"}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Period Filters & Refresh Button */}
              <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                {analyticsSubTab !== "today" && (
                  <>
                    <div className="flex flex-wrap items-center bg-[#FFFFFF] border border-black/10 rounded-xl p-1 gap-1 max-w-full">
                      <span className="text-[9px] font-bold text-[#000000] uppercase tracking-wider px-2">
                        Period:
                      </span>
                      {(["all", "today", "week", "month", "year"] as const).map(
                        (p) => {
                          const displayLabel =
                            p === "all"
                              ? "All Time"
                              : p === "today"
                                ? "Today"
                                : p === "week"
                                  ? "This Week"
                                  : p === "month"
                                    ? "This Month"
                                    : "This Year";
                          const isActive = analyticsPeriod === p;
                          return (
                            <button
                              key={p}
                              onClick={() => {
                                setAnalyticsPeriod(p);
                                setAnalyticsStartDate("");
                                setAnalyticsEndDate("");
                              }}
                              className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                isActive
                                  ? "bg-[#9E1B20] text-[#FFFFFF] shadow-sm"
                                  : "text-[#000000] hover:bg-[#000000]/5"
                              }`}
                            >
                              {displayLabel}
                            </button>
                          );
                        },
                      )}
                    </div>

                    <div className="flex flex-wrap items-center border rounded-xl px-3 py-1.5 gap-2 shadow-sm bg-white border-black/10 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[#000000]">
                          From:
                        </span>
                        <input
                          type="date"
                          value={analyticsStartDate}
                          onChange={(e) => {
                            setAnalyticsPeriod("custom");
                            setAnalyticsStartDate(e.target.value);
                          }}
                          className="text-xs font-bold bg-transparent border-none outline-none focus:ring-0 cursor-pointer text-[#000000] w-[115px]"
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-bold uppercase tracking-wider text-[#000000]">
                          To:
                        </span>
                        <input
                          type="date"
                          value={analyticsEndDate}
                          onChange={(e) => {
                            setAnalyticsPeriod("custom");
                            setAnalyticsEndDate(e.target.value);
                          }}
                          className="text-xs font-bold bg-transparent border-none outline-none focus:ring-0 cursor-pointer text-[#000000] w-[115px]"
                        />
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Sub Navigation Tabs */}
            <div className="flex border-b border-black/10 mb-6 gap-6 overflow-x-auto scrollbar-none pb-0.5 w-full shrink-0">
              {(["revenue", "today", "products", "coupons"] as const).map(
                (tab) => {
                  const isActive = analyticsSubTab === tab;
                  const displayLabel =
                    tab === "today"
                      ? "Today's Sales"
                      : tab === "revenue"
                        ? "Revenue"
                        : tab === "products"
                          ? "Products"
                          : "Coupons";
                  return (
                    <button
                      key={tab}
                      onClick={() => setAnalyticsSubTab(tab)}
                      className={`pb-3 text-xs font-bold uppercase tracking-wider transition-all relative cursor-pointer shrink-0 ${
                        isActive
                          ? "text-[#C1272D]"
                          : "text-[#000000] hover:text-[#000000]"
                      }`}
                    >
                      {displayLabel}
                      {isActive && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C1272D] rounded-full" />
                      )}
                    </button>
                  );
                },
              )}
            </div>

            {/* Tab Contents */}
            {analyticsSubTab === "today" && (
              <>
                {/* Today's KPI Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                  <div className="bg-white border border-black/10 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                        Today's Revenue
                      </span>
                      <div className="w-6 h-6 rounded-full bg-[#1A1A1A]/10 flex items-center justify-center">
                        <IndianRupee className="w-3 h-3 text-[#1A1A1A] animate-pulse" />
                      </div>
                    </div>
                    <div className="text-xl font-black text-[#000000] mb-1">
                      ₹{todayRevenue.toLocaleString()}
                    </div>
                    <div className="text-[9px] text-[#000000] font-semibold">
                      Completed today
                    </div>
                  </div>

                  <div className="bg-white border border-black/10 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                        Today's Bills
                      </span>
                      <div className="w-6 h-6 rounded-full bg-[#1A1A1A]/10 flex items-center justify-center">
                        <Trophy className="w-3 h-3 text-[#1A1A1A] animate-swing" />
                      </div>
                    </div>
                    <div className="text-xl font-black text-[#000000] mb-1">
                      {todayOrdersCount}
                    </div>
                    <div className="text-[9px] text-[#000000] font-semibold">
                      Completed today
                    </div>
                  </div>

                  <div className="bg-white border border-black/10 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                        Today's Items Sold
                      </span>
                      <div className="w-6 h-6 rounded-full bg-[#C1272D]/10 flex items-center justify-center">
                        <Package className="w-3 h-3 text-[#C1272D] animate-pop" />
                      </div>
                    </div>
                    <div className="text-xl font-black text-[#000000] mb-1">
                      {todayItemsSold} pcs
                    </div>
                    <div className="text-[9px] text-[#000000] font-semibold">
                      Quantity sold today
                    </div>
                  </div>

                  <div className="bg-white border border-black/10 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                        Today's Avg Order Value
                      </span>
                      <div className="w-6 h-6 rounded-full bg-[#9E1B20]/10 flex items-center justify-center">
                        <Zap className="w-3 h-3 text-[#9E1B20] animate-pulse" />
                      </div>
                    </div>
                    <div className="text-xl font-black text-[#000000] mb-1">
                      ₹
                      {Math.round(
                        todayOrdersCount > 0
                          ? todayRevenue / todayOrdersCount
                          : 0,
                      ).toLocaleString()}
                    </div>
                    <div className="text-[9px] text-[#000000] font-semibold">
                      Per invoice today
                    </div>
                  </div>
                </div>

                {/* Today's Detailed Split */}
                <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6 mb-8">
                  {/* Left Side: Today's Order Source & Leaderboard */}
                  <div className="col-span-8 w-full flex flex-col gap-6">
                    {/* Today's Transactions Table */}
                    <div className="bg-white border border-black/10 rounded-xl p-6 shadow-sm flex-1">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                        <h3 className="font-bold text-[#000000] text-sm">
                          Today's Transactions
                        </h3>

                        {/* Contact Search Input */}
                        <div className="flex items-center border border-black/10 bg-[#FFFFFF] rounded-lg px-3 py-1.5 gap-2 shadow-xs w-full sm:w-auto animate-in fade-in duration-200">
                          <Search className="w-3.5 h-3.5 text-[#000000]" />
                          <input
                            type="text"
                            placeholder="Search contact/invoice..."
                            className="text-xs font-semibold bg-transparent border-none outline-none focus:ring-0 text-[#000000] placeholder:text-[#000000]/50 w-full sm:w-[170px]"
                            value={analyticsSearchPhone}
                            onChange={(e) =>
                              setAnalyticsSearchPhone(e.target.value)
                            }
                          />
                        </div>
                      </div>
                      {todayOrders.length === 0 ? (
                        <div className="text-center text-[#000000] text-xs font-semibold py-12">
                          {analyticsSearchPhone
                            ? "No matching transactions found."
                            : "No orders placed today."}
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-[#FFFFFF] border-b border-black/10">
                                <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider">
                                  Invoice ID
                                </th>
                                <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider">
                                  Customer No
                                </th>
                                <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider">
                                  Source
                                </th>
                                <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider text-right">
                                  Items
                                </th>
                                <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider text-right">
                                  Grand Total
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {todayOrders.map((order) => (
                                <tr
                                  key={order.id}
                                  className="border-b border-transparent hover:bg-[#FFFFFF]/50 transition-colors"
                                >
                                  <td className="p-3 text-xs font-semibold text-[#000000]">
                                    {order.id}
                                  </td>
                                  <td className="p-3 text-xs font-mono font-bold text-[#000000]">
                                    {order.customerPhone || "-"}
                                  </td>
                                  <td className="p-3">
                                    <span
                                      className={`px-2 py-0.5 rounded text-[9px] font-bold tracking-widest border ${order.source === "ONLINE" ? "border-[#1A1A1A] text-[#1A1A1A] bg-[#1A1A1A]/10" : "border-[#C1272D] text-[#C1272D] bg-[#C1272D]/10"}`}
                                    >
                                      {order.source}
                                    </span>
                                  </td>
                                  <td className="p-3 text-xs font-semibold text-[#000000] text-right">
                                    {order.items.reduce(
                                      (sum, i) => sum + ((i.name && !i.name.startsWith("GST (")) ? i.qty : 0),
                                      0,
                                    )}{" "}
                                    pcs
                                  </td>
                                  <td className="p-3 text-xs font-black text-[#C1272D] text-right">
                                    ₹{order.grandTotal.toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Side: Channel Split & Top items */}
                  <div className="col-span-4 w-full flex flex-col gap-6">
                    {/* Today's Channel Split Card */}
                    <div className="bg-white border border-black/10 rounded-xl p-6 shadow-sm">
                      <h3 className="font-bold text-[#000000] mb-4 text-sm">
                        Today's Channel Split
                      </h3>
                      {todayOrdersCount === 0 ? (
                        <div className="text-center text-[#000000] text-xs font-semibold py-6">
                          No sales today.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-[#C1272D] uppercase tracking-wider w-14">
                              Offline
                            </span>
                            <div className="flex-1 h-2.5 bg-[#EDE4D6] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#C1272D] rounded-full transition-all duration-700"
                                style={{
                                  width: `${(todayOfflineOrdersCount / todayOrdersCount) * 100}%`,
                                }}
                              />
                            </div>
                            <span className="text-[11px] font-black text-[#000000] w-12 text-right">
                              ₹{todayOfflineRevenue.toLocaleString()}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider w-14">
                              Online
                            </span>
                            <div className="flex-1 h-2.5 bg-[#EDE4D6] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#1A1A1A] rounded-full transition-all duration-700"
                                style={{
                                  width: `${(todayOnlineOrdersCount / todayOrdersCount) * 100}%`,
                                }}
                              />
                            </div>
                            <span className="text-[11px] font-black text-[#000000] w-12 text-right">
                              ₹{todayOnlineRevenue.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Today's Top Products Sold Card */}
                    <div className="bg-white border border-black/10 rounded-xl p-6 shadow-sm flex-1">
                      <h3 className="font-bold text-[#000000] text-sm mb-4">
                        Today's Top Items
                      </h3>
                      {todayTopItems.length === 0 ? (
                        <div className="text-center text-[#000000] text-xs font-semibold py-6">
                          No items sold today.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {todayTopItems.map((item, idx) => (
                            <div
                              key={item.name}
                              className="flex items-center gap-3"
                            >
                              <span className="text-[11px] font-black text-[#000000] w-4">
                                {idx + 1}
                              </span>
                              <div className="flex-1">
                                <div className="flex justify-between items-center mb-1">
                                  <span className="text-xs font-bold text-[#000000]">
                                    {item.name}
                                  </span>
                                  <span className="text-xs font-black text-[#C1272D]">
                                    ₹{item.revenue.toLocaleString()}
                                  </span>
                                </div>
                                <div className="h-1.5 bg-[#EDE4D6] rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-[#C1272D] rounded-full transition-all duration-700"
                                    style={{
                                      width: `${(item.revenue / todayTopItems[0].revenue) * 100}%`,
                                    }}
                                  />
                                </div>
                              </div>
                              <span className="text-[10px] text-[#000000] font-semibold w-10 text-right">
                                {item.qty} pcs
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {analyticsSubTab === "revenue" && (
              <>
                {/* Net earnings, GST / non-GST sales, expenses */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <div className="rounded-2xl p-5 text-white shadow-sm bg-gradient-to-br from-[#0E9F6E] to-[#1A1A1A]">
                    <div className="flex justify-between items-start">
                      <span className="text-[11px] font-extrabold uppercase tracking-wide text-white/90">Net Earnings</span>
                      <span className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center"><PiggyBank className="w-4 h-4" /></span>
                    </div>
                    <div className="mt-5 text-[28px] leading-none font-black tracking-tight truncate">
                      {netProfitAmount < 0 ? "− " : ""}₹{inr2(Math.abs(netProfitAmount))}
                    </div>
                    <div className="mt-2 text-[10px] font-extrabold uppercase tracking-wide text-white/85">GST + Non-GST − Expenses</div>
                  </div>
                  <div className="bg-white border border-[#C1272D]/30 rounded-2xl p-5 shadow-sm">
                    <div className="flex justify-between items-start">
                      <span className="text-[11px] font-extrabold uppercase tracking-wide text-[#000000]">GST Sales</span>
                      <span className="w-8 h-8 rounded-full bg-[#C1272D]/10 text-[#C1272D] flex items-center justify-center"><IndianRupee className="w-4 h-4" /></span>
                    </div>
                    <div className="mt-5 text-[28px] leading-none font-black tracking-tight text-[#C1272D] truncate">₹{inr2(gstSalesAmount)}</div>
                    <div className="mt-2 text-[10.5px] font-semibold text-[#000000]/70">{gstOrdersList.length} GST invoice{gstOrdersList.length === 1 ? "" : "s"}</div>
                  </div>
                  <div className="bg-white border border-emerald-200 rounded-2xl p-5 shadow-sm">
                    <div className="flex justify-between items-start">
                      <span className="text-[11px] font-extrabold uppercase tracking-wide text-[#000000]">Non-GST Sales</span>
                      <span className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center"><TrendingUp className="w-4 h-4" /></span>
                    </div>
                    <div className="mt-5 text-[28px] leading-none font-black tracking-tight text-emerald-600 truncate">+ ₹{inr2(nonGstSalesAmount)}</div>
                    <div className="mt-2 text-[10.5px] font-semibold text-[#000000]/70">{nonGstOrdersList.length} retail bill{nonGstOrdersList.length === 1 ? "" : "s"}</div>
                  </div>
                  <div className="bg-white border border-[#C1272D]/30 rounded-2xl p-5 shadow-sm">
                    <div className="flex justify-between items-start">
                      <span className="text-[11px] font-extrabold uppercase tracking-wide text-[#000000]">Total Expenses</span>
                      <span className="w-8 h-8 rounded-full bg-[#C1272D]/10 text-[#C1272D] flex items-center justify-center"><TrendingDown className="w-4 h-4" /></span>
                    </div>
                    <div className="mt-5 text-[28px] leading-none font-black tracking-tight text-[#B91C1C] truncate">− ₹{inr2(analyticsExpensesTotal)}</div>
                    <button onClick={() => selectTab("expenses")} className="mt-2 text-[10.5px] font-bold text-[#B91C1C] underline cursor-pointer">
                      Money out — Expense Tracker
                    </button>
                  </div>
                </div>

                {/* Calculation formula */}
                <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-black/10 rounded-2xl px-4 py-3 mb-4 text-[12.5px] text-[#4A4038]">
                  <div className="flex flex-wrap items-center gap-3 min-w-0">
                    <span className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wide text-indigo-700">Calculation Formula</span>
                    <span>GST (₹{inr2(gstSalesAmount)}) + Non-GST (₹{inr2(nonGstSalesAmount)}) − Expenses (₹{inr2(analyticsExpensesTotal)})</span>
                  </div>
                  <span className="font-semibold">
                    = Net Profit: <b className={`font-mono text-[14px] ${netProfitAmount < 0 ? "text-[#B91C1C]" : "text-emerald-600"}`}>{netProfitAmount < 0 ? "−" : ""}₹{inr2(Math.abs(netProfitAmount))}</b>
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <AnalyticsCard label="Total Revenue" tone="green" icon={<IndianRupee className="w-4 h-4" />}
                    value={`₹${inr2(totalRevenueAmount)}`} sub={`GST (₹${Math.round(gstSalesAmount).toLocaleString("en-IN")}) + Non-GST (₹${Math.round(nonGstSalesAmount).toLocaleString("en-IN")})`} />
                  <AnalyticsCard label="Completed Bills" tone="green" icon={<Trophy className="w-4 h-4" />} value={totalOrdersCount} sub="POS + manual bills" />
                  <AnalyticsCard label="Offline Bills" tone="teal" icon={<IndianRupee className="w-4 h-4" />} value={`₹${inr2(offlineRevenue)}`} sub="Walk-in POS sales" />
                  <AnalyticsCard label="Online Bills" tone="slate" icon={<IndianRupee className="w-4 h-4" />} value={`₹${inr2(onlineRevenue)}`} sub="Online POS sales" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                  <AnalyticsCard label="Total Offline Bills" icon={<ShoppingBag className="w-4 h-4" />} value={offlineOrders} sub="Walk-in POS orders" />
                  <AnalyticsCard label="Total Online Bills" icon={<Globe className="w-4 h-4" />} value={onlineOrders} sub="Online channel orders" />
                  <AnalyticsCard label="Total Items Sold" icon={<Package className="w-4 h-4" />} value={totalItemsSold} sub="From completed bills" />
                  <AnalyticsCard label="Top Product" tone="pink" icon={<Trophy className="w-4 h-4" />} value={<span title={topProduct}>{topProduct}</span>} sub="Most sold item" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-2">
                  <AnalyticsCard label="Cash Received" tone="green" icon={<IndianRupee className="w-4 h-4" />} value={`₹${inr2(cashReceivedTotal)}`} sub={`${cashOrdersList.length + splitOrdersList.filter((o) => (o.splitCash ?? 0) > 0).length} bills`} />
                  <AnalyticsCard label="GPay / UPI Received" icon={<IndianRupee className="w-4 h-4" />} value={`₹${inr2(gpayReceivedTotal)}`} sub={`${gpayOrdersList.length + splitOrdersList.filter((o) => (o.splitUpi ?? 0) > 0).length} bills`} />
                  <AnalyticsCard label="Split Received" tone="pink" icon={<IndianRupee className="w-4 h-4" />} value={`₹${inr2(splitReceivedTotal)}`}
                    sub={`${splitOrdersList.length} bill${splitOrdersList.length === 1 ? "" : "s"} - Cash ₹${inr2(sumSplit("splitCash"))} + UPI ₹${inr2(sumSplit("splitUpi"))}${sumSplit("splitCard") > 0 ? ` + Card ₹${inr2(sumSplit("splitCard"))}` : ""}`} />
                  <AnalyticsCard label="Card Received" tone="violet" icon={<IndianRupee className="w-4 h-4" />} value={`₹${inr2(cardReceivedTotal)}`} sub={`${cardOrdersList.length + splitOrdersList.filter((o) => (o.splitCard ?? 0) > 0).length} bills`} />
                </div>
                <p className="mb-8 text-[11.5px] text-[#4A4038]">
                  Split bills are already included in the Cash, GPay / UPI and Card boxes (the Split box shows how much of them came from split payments).
                </p>

                {/* Main Charts & Breakdowns */}
                <div className="flex flex-col lg:grid lg:grid-cols-12 gap-6">
                  {/* Left Chart Column */}
                  <div className="col-span-8 w-full flex flex-col gap-6">
                    {/* Monthly Revenue Trend Chart */}
                    <div className="bg-white border border-black/10 rounded-xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col min-h-[300px]">
                      <div className="flex justify-between items-center mb-6">
                        <div>
                          <h3 className="font-bold text-[#000000] text-sm mb-2 flex items-center">
                            Revenue Trend This Year <span className="text-[#C1272D] font-black ml-1.5">{now.getFullYear()}</span>
                          </h3>
                          <div className="flex items-center gap-3">
                            <span className="text-xl font-black text-[#000000]">
                              ₹{totalYearRevenue.toLocaleString()}
                            </span>
                            {avgMonthRevenue > 0 && (
                              <span className="bg-[#FFFFFF] border border-black/10 text-[#C1272D] px-2 py-0.5 rounded text-[10px] font-bold">
                                Avg ₹
                                {Math.round(avgMonthRevenue).toLocaleString()}
                                /mo
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {orders.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-[#000000] text-sm font-semibold">
                          Process orders to see yearly revenue trend.
                        </div>
                      ) : (
                        <div className="flex-1 overflow-x-auto scrollbar-thin pb-2">
                          <div className="flex items-end justify-between px-2 gap-1 relative mt-4 min-w-[500px] h-[170px] pt-10">
                            {monthNames.map((month, i) => (
                              <div
                                key={month}
                                className="flex flex-col items-center gap-1.5 w-full group/bar relative outline-none"
                                tabIndex={0}
                              >
                                {/* Monthly sales text on top for mobile/visibility */}
                                <span className="text-[8px] font-black text-[#C1272D] h-3 flex items-end">
                                  {monthRevenue[i] > 0
                                    ? monthRevenue[i] >= 1000
                                      ? `₹${(monthRevenue[i] / 1000).toFixed(1)}k`
                                      : `₹${monthRevenue[i]}`
                                    : ""}
                                </span>

                                {/* Tooltip */}
                                <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#000000] text-white text-[10px] font-bold px-2 py-1.5 rounded-lg opacity-0 group-hover/bar:opacity-100 group-focus/bar:opacity-100 transition-all duration-200 whitespace-nowrap pointer-events-none z-10 shadow-lg">
                                  <div className="text-[9px] text-white/70 font-semibold mb-0.5">
                                    {monthNames[i]}
                                  </div>
                                  ₹{(monthRevenue[i] || 0).toLocaleString()}
                                  <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#000000]"></div>
                                </div>
                                <div
                                  className="w-full max-w-[24px] bg-[#C1272D] rounded-t-sm transition-all duration-1000 group-hover/bar:bg-[#C1272D] cursor-pointer min-h-[4px]"
                                  style={{
                                    height: `${Math.max(4, (monthRevenue[i] / maxMonthRevenue) * 100)}px`,
                                  }}
                                />
                                <span className="text-[10px] font-bold text-[#000000] uppercase">
                                  {month}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Weekly Revenue Bar Chart */}
                    <div className="bg-white border border-black/10 rounded-xl p-6 shadow-sm hover:shadow-md transition-all flex flex-col min-h-[250px]">
                      <div className="flex justify-between items-center mb-6">
                        <div>
                          <h3 className="font-bold text-[#000000] text-sm flex items-center">
                            Revenue This Week <span className="text-[#C1272D] font-black ml-1.5">(Week {currentWeekNumber} of {now.getFullYear()})</span>
                          </h3>
                          <p className="text-[10px] text-[#000000] font-semibold mt-1">
                            ₹
                            {weekRevenue
                              .reduce((a, b) => a + b, 0)
                              .toLocaleString()}{" "}
                            total
                          </p>
                        </div>
                      </div>

                      {orders.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-[#000000] text-sm font-semibold">
                          Process orders to see weekly revenue.
                        </div>
                      ) : (
                        <div className="flex-1 flex items-end justify-between px-2 gap-2">
                          {dayNames.map((day, i) => (
                            <div
                              key={day}
                              className="flex flex-col items-center gap-3 w-full group/bar relative outline-none"
                              tabIndex={0}
                            >
                              <span className="text-[9px] font-black text-[#C1272D]">
                                {weekRevenue[i] > 0
                                  ? `₹${weekRevenue[i] >= 1000 ? (weekRevenue[i] / 1000).toFixed(1) + "k" : weekRevenue[i]}`
                                  : ""}
                              </span>

                              {/* Tooltip for exact weekly revenue */}
                              <div className="absolute bottom-[52px] mb-2 left-1/2 -translate-x-1/2 bg-[#000000] text-white text-[10px] font-bold px-2 py-1.5 rounded-lg opacity-0 group-hover/bar:opacity-100 group-focus/bar:opacity-100 transition-all duration-200 whitespace-nowrap pointer-events-none z-10 shadow-lg">
                                <div className="text-[9px] text-white/70 font-semibold mb-0.5">
                                  {dayNames[i]}
                                </div>
                                ₹{(weekRevenue[i] || 0).toLocaleString()}
                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-[#000000]"></div>
                              </div>

                              <div className="w-full max-w-[20px] h-32 bg-[#EDE4D6] rounded-full relative overflow-hidden cursor-pointer">
                                <div
                                  className="absolute bottom-0 w-full bg-[#C1272D] rounded-full transition-all duration-1000 group-hover/bar:bg-[#C1272D]"
                                  style={{
                                    height: `${(weekRevenue[i] / maxWeekRevenue) * 100}%`,
                                  }}
                                />
                              </div>
                              <span className="text-[10px] font-bold text-[#000000] uppercase">
                                {day}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right Column (Breakdowns) */}
                  <div className="col-span-4 w-full flex flex-col gap-6">
                    {/* Order Source Breakdown */}
                    <div className="bg-white border border-black/10 rounded-xl p-6 shadow-sm hover:shadow-md transition-all">
                      <h3 className="font-bold text-[#000000] mb-4 text-sm">
                        Order Source
                      </h3>
                      {totalOrdersCount === 0 ? (
                        <div className="text-center text-[#000000] text-sm font-semibold py-6">
                          No orders yet.
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-3 mb-4">
                            <span className="text-[10px] font-bold text-[#C1272D] uppercase tracking-wider w-14">
                              Offline
                            </span>
                            <div className="flex-1 h-2.5 bg-[#EDE4D6] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#C1272D] rounded-full transition-all duration-700"
                                style={{
                                  width: `${(offlineOrders / totalOrdersCount) * 100}%`,
                                }}
                              />
                            </div>
                            <span className="text-[11px] font-black text-[#000000] w-8 text-right">
                              {offlineOrders}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-[#1A1A1A] uppercase tracking-wider w-14">
                              Online
                            </span>
                            <div className="flex-1 h-2.5 bg-[#EDE4D6] rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#1A1A1A] rounded-full transition-all duration-700"
                                style={{
                                  width: `${(onlineOrders / totalOrdersCount) * 100}%`,
                                }}
                              />
                            </div>
                            <span className="text-[11px] font-black text-[#000000] w-8 text-right">
                              {onlineOrders}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Top Items by Revenue */}
                    <div className="bg-white border border-black/10 rounded-xl p-6 shadow-sm hover:shadow-md transition-all flex-1">
                      <h3 className="font-bold text-[#000000] text-sm mb-4">
                        Top Items by Revenue
                      </h3>
                      {topItems.length === 0 ? (
                        <div className="text-center text-[#000000] text-sm font-semibold py-6">
                          No items sold yet.
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {topItems.map((item, idx) => (
                            <div
                              key={item.name}
                              className="flex items-center gap-3"
                            >
                              <span className="text-[11px] font-black text-[#000000] w-4">
                                {idx + 1}
                              </span>
                              <div className="flex-1">
                                <div className="flex justify-between items-center mb-1.5">
                                  <span className="text-xs font-bold text-[#000000]">
                                    {item.name}
                                  </span>
                                  <span className="text-xs font-black text-[#C1272D]">
                                    ₹{item.revenue.toLocaleString()}
                                  </span>
                                </div>
                                <div className="h-1.5 bg-[#EDE4D6] rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-[#C1272D] rounded-full transition-all duration-700"
                                    style={{
                                      width: `${(item.revenue / topItems[0].revenue) * 100}%`,
                                    }}
                                  />
                                </div>
                              </div>
                              <span className="text-[10px] text-[#000000] font-semibold w-10 text-right">
                                {item.qty} pcs
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            {analyticsSubTab === "products" && (
              <div className="bg-white border border-black/10 rounded-xl p-6 shadow-sm">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                  <h3 className="font-bold text-[#000000] text-sm">
                    Product Sales Leaderboard
                  </h3>

                  {/* Product Search Input */}
                  <div className="flex items-center border border-black/10 bg-[#FFFFFF] rounded-lg px-3 py-1.5 gap-2 shadow-xs w-full sm:w-auto animate-in fade-in duration-200">
                    <Search className="w-3.5 h-3.5 text-[#000000]" />
                    <input
                      type="text"
                      placeholder="Search product..."
                      className="text-xs font-semibold bg-transparent border-none outline-none focus:ring-0 text-[#000000] placeholder:text-[#000000]/50 w-full sm:w-[180px]"
                      value={productSearchQuery}
                      onChange={(e) => setProductSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                {Object.keys(itemSales).length === 0 ? (
                  <div className="text-center text-[#000000] text-sm font-semibold py-12">
                    No products sold in this period.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-[#FFFFFF] border-b border-black/10">
                          <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider">
                            Rank
                          </th>
                          <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider">
                            Product Name
                          </th>
                          <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider text-right">
                            Qty Sold
                          </th>
                          <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider text-right">
                            Revenue
                          </th>
                          <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider">
                            Market Share
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.values(itemSales).filter((item) =>
                          item.name
                            .toLowerCase()
                            .includes(productSearchQuery.toLowerCase()),
                        ).length === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="text-center py-12 text-sm font-semibold text-[#000000]"
                            >
                              No matching products found.
                            </td>
                          </tr>
                        ) : (
                          Object.values(itemSales)
                            .filter((item) =>
                              item.name
                                .toLowerCase()
                                .includes(productSearchQuery.toLowerCase()),
                            )
                            .sort((a, b) => b.revenue - a.revenue)
                            .map((item, idx) => {
                              const share =
                                totalRevenueAmount > 0
                                  ? (item.revenue / totalRevenueAmount) * 100
                                  : 0;
                              return (
                                <tr
                                  key={item.name}
                                  className="border-b border-transparent hover:bg-[#FFFFFF]/50 transition-colors"
                                >
                                  <td className="p-3 text-xs font-black text-[#000000]">
                                    {idx + 1}
                                  </td>
                                  <td className="p-3 text-xs font-bold text-[#000000]">
                                    {item.name}
                                  </td>
                                  <td className="p-3 text-xs font-bold text-[#000000] text-right">
                                    {item.qty} pcs
                                  </td>
                                  <td className="p-3 text-xs font-black text-[#C1272D] text-right">
                                    ₹{item.revenue.toLocaleString()}
                                  </td>
                                  <td className="p-3 w-1/4">
                                    <div className="flex items-center gap-3">
                                      <div className="flex-1 h-2 bg-[#EDE4D6] rounded-full overflow-hidden">
                                        <div
                                          className="h-full bg-[#C1272D] rounded-full"
                                          style={{ width: `${share}%` }}
                                        />
                                      </div>
                                      <span className="text-[10px] font-bold text-[#000000] w-8">
                                        {share.toFixed(1)}%
                                      </span>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {analyticsSubTab === "coupons" && (
              <div className="flex flex-col lg:grid lg:grid-cols-3 gap-6">
                <div className="col-span-1 w-full bg-white border border-black/10 rounded-xl p-6 shadow-sm flex flex-col gap-6">
                  <h3 className="font-bold text-[#000000] text-sm">
                    Discount Summary
                  </h3>

                  <div className="p-4 bg-[#FFFFFF] border border-black/10 rounded-lg">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                        Total Discounts Given
                      </span>
                      <Percent className="w-4 h-4 text-[#C1272D]" />
                    </div>
                    <span className="text-2xl font-black text-[#C1272D]">
                      ₹
                      {analyticsFilteredOrders
                        .reduce((acc, o) => acc + o.discount, 0)
                        .toLocaleString()}
                    </span>
                  </div>

                  <div className="p-4 bg-[#FFFFFF] border border-black/10 rounded-lg">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                        Discounted Orders
                      </span>
                      <Calendar className="w-4 h-4 text-[#1A1A1A]" />
                    </div>
                    <span className="text-2xl font-black text-[#000000]">
                      {
                        analyticsFilteredOrders.filter((o) => o.discount > 0)
                          .length
                      }
                    </span>
                  </div>

                  <div className="p-4 bg-[#FFFFFF] border border-black/10 rounded-lg">
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#000000]">
                        Avg Discount Per Order
                      </span>
                      <IndianRupee className="w-4 h-4 text-[#1A1A1A]" />
                    </div>
                    <span className="text-2xl font-black text-[#000000]">
                      ₹
                      {Math.round(
                        analyticsFilteredOrders.filter((o) => o.discount > 0)
                          .length > 0
                          ? analyticsFilteredOrders.reduce(
                              (acc, o) => acc + o.discount,
                              0,
                            ) /
                              analyticsFilteredOrders.filter(
                                (o) => o.discount > 0,
                              ).length
                          : 0,
                      ).toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="col-span-2 w-full bg-white border border-black/10 rounded-xl p-6 shadow-sm">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <h3 className="font-bold text-[#000000] text-sm">
                      Promo Campaign Performance
                    </h3>

                    {/* Coupons Search Input */}
                    <div className="flex items-center border border-black/10 bg-[#FFFFFF] rounded-lg px-3 py-1.5 gap-2 shadow-xs w-full sm:w-auto animate-in fade-in duration-200">
                      <Search className="w-3.5 h-3.5 text-[#000000]" />
                      <input
                        type="text"
                        placeholder="Search code/mobile/amount..."
                        className="text-xs font-semibold bg-transparent border-none outline-none focus:ring-0 text-[#000000] placeholder:text-[#000000]/50 w-full sm:w-[220px]"
                        value={couponSearchQuery}
                        onChange={(e) => setCouponSearchQuery(e.target.value)}
                      />
                    </div>
                  </div>

                  {analyticsFilteredOrders.filter((o) => o.discount > 0).length ===
                  0 ? (
                    <div className="text-center text-[#000000] text-sm font-semibold py-12">
                      No promotional discounts given in this period.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-[#FFFFFF] border-b border-black/10">
                            <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider">
                              Transaction ID
                            </th>
                            <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider">
                              Customer Mobile
                            </th>
                            <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider text-right">
                              Order Total
                            </th>
                            <th className="p-3 text-[10px] font-bold text-[#000000] uppercase tracking-wider text-right">
                              Discount Applied
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {analyticsFilteredOrders
                            .filter((o) => o.discount > 0)
                            .filter((o) => {
                              const q = couponSearchQuery.toLowerCase();
                              const couponCode = getCouponCodeForOrder(o).toLowerCase();
                              return (
                                o.id.toLowerCase().includes(q) ||
                                couponCode.includes(q) ||
                                (o.customerPhone || "").includes(q) ||
                                o.discount.toString().includes(q) ||
                                o.grandTotal.toString().includes(q)
                              );
                            }).length === 0 ? (
                            <tr>
                              <td
                                colSpan={4}
                                className="text-center py-12 text-sm font-semibold text-[#000000]"
                              >
                                No matching coupon performance records found.
                              </td>
                            </tr>
                          ) : (
                            analyticsFilteredOrders
                              .filter((o) => o.discount > 0)
                              .filter((o) => {
                                const q = couponSearchQuery.toLowerCase();
                                const couponCode = getCouponCodeForOrder(o).toLowerCase();
                                return (
                                  o.id.toLowerCase().includes(q) ||
                                  couponCode.includes(q) ||
                                  (o.customerPhone || "").includes(q) ||
                                  o.discount.toString().includes(q) ||
                                  o.grandTotal.toString().includes(q)
                                );
                              })
                              .map((order) => (
                                <tr
                                  key={order.id}
                                  className="border-b border-transparent hover:bg-[#FFFFFF]/50 transition-colors"
                                >
                                  <td className="p-3 text-xs font-semibold text-[#000000]">
                                    {order.id}
                                  </td>
                                  <td className="p-3 text-xs font-mono font-bold text-[#000000]">
                                    {order.customerPhone || "-"}
                                  </td>
                                  <td className="p-3 text-xs font-bold text-right text-[#000000]">
                                    ₹{order.grandTotal.toLocaleString()}
                                  </td>
                                  <td className="p-3 text-xs font-black text-[#C1272D] text-right">
                                    -₹{order.discount.toLocaleString()}
                                  </td>
                                </tr>
                              ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Order Details Modal */}
        {selectedOrder && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
            <div className="bg-[#FFFFFF] rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
              {/* Modal Header */}
              <div className="p-6 border-b border-black/10 flex justify-between items-center bg-[#FFFFFF]">
                <div>
                  <h3 className="text-xl font-bold text-[#000000]">
                    Order Details
                  </h3>
                  <p className="text-sm text-[#000000] font-medium mt-1">
                    {selectedOrder.id}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedOrder(null)}
                  className="p-2 hover:bg-black/10 rounded-full transition-colors group cursor-pointer"
                >
                  <X className="w-5 h-5 text-[#000000] group-hover:text-[#C1272D] transition-colors" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 overflow-y-auto">
                <div className="grid grid-cols-2 gap-6 mb-8">
                  <div>
                    <div className="text-[10px] font-bold text-[#000000] uppercase tracking-wider mb-1">
                      Customer Name
                    </div>
                    <div className="text-sm font-semibold text-[#000000]">
                      {selectedOrder.customerName}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-[#000000] uppercase tracking-wider mb-1">
                      Contact Number
                    </div>
                    <div className="text-sm font-semibold text-[#000000]">
                      {selectedOrder.customerPhone || "N/A"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-[#000000] uppercase tracking-wider mb-1">
                      Order Source
                    </div>
                    <div className="text-sm font-semibold text-[#000000]">
                      {selectedOrder.source}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-[#000000] uppercase tracking-wider mb-1">
                      Date & Time
                    </div>
                    <div className="text-sm font-semibold text-[#000000]">
                      {new Date(selectedOrder.date).toLocaleString()}
                    </div>
                  </div>
                </div>

                <div className="mb-4 text-[11px] font-bold text-[#000000] uppercase tracking-[0.1em] border-b border-black/10 pb-2">
                  Order Items
                </div>
                <div className="space-y-3 mb-8">
                  {selectedOrder.items.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center"
                    >
                      <div>
                        <div className="text-sm font-bold text-[#000000]">
                          {item.name}
                        </div>
                        {item.desc && (
                          <div className="text-[10px] text-[#000000] font-medium">
                            {item.desc}
                          </div>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-bold text-[#000000]">
                          ₹{(item.price * item.qty).toLocaleString()}
                        </div>
                        <div className="text-[10px] text-[#000000] font-medium">
                          {item.qty} x ₹{item.price.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="border-t border-black/10 pt-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-[#000000] font-semibold">
                      Subtotal
                    </span>
                    <span className="text-[#000000] font-bold">
                      ₹{selectedOrder.subtotal.toLocaleString()}
                    </span>
                  </div>
                  {selectedOrder.discount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[#000000] font-semibold">
                        Discount
                      </span>
                      <span className="text-[#C1272D] font-bold">
                        -₹{selectedOrder.discount.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {selectedOrder.deliveryFee > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-[#000000] font-semibold">
                        Delivery Fee
                      </span>
                      <span className="text-[#000000] font-bold">
                        ₹{selectedOrder.deliveryFee.toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between text-lg pt-2 mt-2 border-t border-transparent">
                    <span className="text-[#000000] font-black uppercase tracking-tight">
                      Total{" "}
                    </span>
                    <span className="text-[#C1272D] font-black">
                      ₹{selectedOrder.grandTotal.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Classy Footer */}
        <footer className="mt-auto pt-10 pb-2 border-t border-black/10 flex flex-col md:flex-row justify-between items-center text-[10px] text-[#000000] font-semibold uppercase tracking-wider gap-4">
          <div className="text-[#000000]">
            &copy; 2026 All Rights Reserved. Daddy&apos;s Home.
          </div>
          <div>
            Powered By{" "}
            <a
              href="https://www.cenexasystems.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#C1272D] hover:underline font-bold transition-all"
            >
              Cenexa Systems
            </a>{" "}
            &middot; 2026
          </div>
          <div className="italic text-[#6B5F52] font-bold tracking-[0.15em] flex items-center gap-1.5">
            <span className="w-1 h-1 bg-[#C1272D] rounded-full"></span>
            Style. Comfort. Everyday.
          </div>
        </footer>
      </main>

      {/* "Bill Generated" receipt after Complete Sale */}
      {saleCompletedPrompt && (() => {
        const snap = saleCompletedPrompt.orderSnapshot;
        const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const method = snap.paymentMethod ?? "CASH";
        const modeBadge = method === "GPAY" ? "UPI" : method;
        const channelLabel = snap.upiChannel ? UPI_CHANNELS.find((c) => c.key === snap.upiChannel)?.label : "";
        const paidVia =
          method === "CASH" ? "Cash" : method === "CARD" ? "Card" : method === "GPAY" ? `UPI${channelLabel ? ` · ${channelLabel}` : ""}` :
          [snap.splitCash ? "Cash" : "", snap.splitUpi ? "UPI" : "", snap.splitCard ? "Card" : ""].filter(Boolean).join(" + ");
        const received = method === "CASH" ? (snap.cashReceived && snap.cashReceived > 0 ? snap.cashReceived : snap.grandTotal) : snap.grandTotal;
        const balanceDue = Math.max(0, Math.round((snap.grandTotal - received) * 100) / 100);
        const change = method === "CASH" ? Math.max(0, Math.round((received - snap.grandTotal) * 100) / 100) : 0;
        const close = () => {
          setSaleCompletedPrompt(null);
          setShowPromptPhoneInput(false);
          setSavedLoyaltyNote("");
        };
        const row = "flex items-center justify-between gap-4 text-[14px]";
        return (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[250] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-[560px] max-h-[94vh] overflow-y-auto border border-black/10 animate-in zoom-in-95 duration-200">
              {/* Header */}
              <div className="px-7 pt-7 pb-4 border-b border-black/10">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-[28px] font-black tracking-tight text-black">Bill Generated</h3>
                      <span className="rounded-md bg-black/5 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-black">
                        {snap.applyGST ? `GST ${snap.gstPercentage}%` : "Non-GST"}
                      </span>
                    </div>
                    <p className="mt-1 font-mono text-[12px] font-semibold tracking-wide text-[#C1272D]">#{saleCompletedPrompt.orderId}</p>
                  </div>
                  <button onClick={close} className="w-9 h-9 rounded-lg hover:bg-black/5 flex items-center justify-center text-slate-600 cursor-pointer" title="Close" aria-label="Close">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              <div className="p-7 space-y-5">
                {/* Payment receipt */}
                <div className="rounded-2xl border border-black/10 p-6">
                  <div className="flex items-center justify-between border-b border-black/10 pb-3 mb-4">
                    <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">Payment Receipt</span>
                    <span className="rounded-md bg-[#C1272D]/10 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider text-[#C1272D]">{modeBadge}</span>
                  </div>
                  <div className="space-y-2 pb-4 border-b border-dashed border-black/15">
                    <div className={row}><span className="text-slate-600">Subtotal</span><b className="text-black">{money(snap.subtotal)}</b></div>
                    {snap.discount > 0 && (
                      <div className={row}><span className="text-slate-600">Discount</span><b className="text-emerald-700">− {money(snap.discount)}</b></div>
                    )}
                    {(snap.deliveryFee ?? 0) > 0 && (
                      <div className={row}><span className="text-slate-600">Delivery</span><b className="text-black">{money(snap.deliveryFee ?? 0)}</b></div>
                    )}
                    <div className={row}>
                      <span className="text-slate-600">{snap.applyGST ? `GST (${snap.gstPercentage}%)` : "GST"}</span>
                      <b className="text-black">{snap.applyGST ? money(snap.gstAmount) : "Non-GST bill"}</b>
                    </div>
                  </div>
                  <div className="space-y-3 pt-4">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-[15px] font-semibold text-slate-600">Grand Total</span>
                      <b className="text-[28px] font-black text-black">{money(snap.grandTotal)}</b>
                    </div>
                    <div className={row}><span className="text-slate-600">Paid Via:</span><b className="text-black">{paidVia}</b></div>
                    {method === "SPLIT" && (
                      <div className="rounded-lg bg-black/[0.03] px-3 py-2 text-[12.5px] text-slate-600 space-y-1">
                        {!!snap.splitCash && <div className="flex justify-between"><span>Cash</span><b className="text-black">{money(snap.splitCash)}</b></div>}
                        {!!snap.splitUpi && <div className="flex justify-between"><span>UPI</span><b className="text-black">{money(snap.splitUpi)}</b></div>}
                        {!!snap.splitCard && <div className="flex justify-between"><span>Card</span><b className="text-black">{money(snap.splitCard)}</b></div>}
                      </div>
                    )}
                    <div className={row}><span className="text-slate-600">Amount Paid:</span><b className="text-black">{money(received)}</b></div>
                    <div className={row}>
                      <span className="text-slate-600">Balance Due:</span>
                      <b className={balanceDue > 0 ? "text-[#C1272D]" : "text-emerald-600"}>{money(balanceDue)}</b>
                    </div>
                    {method === "CASH" && (
                      <div className="flex items-center justify-between rounded-xl bg-black/[0.05] px-5 py-4">
                        <span className="text-[14px] font-extrabold text-[#6B5F52]">Change Returned</span>
                        <b className="text-[22px] font-black text-[#6B5F52]">{money(change)}</b>
                      </div>
                    )}
                    {savedLoyaltyNote && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-[12.5px] font-semibold text-emerald-800">
                        ⭐ {savedLoyaltyNote}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <button
                    onClick={() => setPrintSettingsFor(saleCompletedPrompt.orderId)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-black/15 bg-white px-3 py-4 text-[12px] font-extrabold uppercase tracking-wide text-black hover:bg-slate-50 cursor-pointer"
                  >
                    <Printer className="w-4 h-4 text-[#C1272D]" /> Print Receipt
                  </button>
                  <button
                    onClick={() => {
                      const orderId = saleCompletedPrompt.orderId;
                      close();
                      setActiveInvoiceId(orderId);
                    }}
                    className="flex items-center justify-center gap-2 rounded-xl border border-black/15 bg-white px-3 py-4 text-[12px] font-extrabold uppercase tracking-wide text-black hover:bg-slate-50 cursor-pointer"
                  >
                    <Eye className="w-4 h-4 text-[#C1272D]" /> View
                  </button>
                  <button
                    onClick={() => {
                      if (saleCompletedPrompt.customerPhone && saleCompletedPrompt.customerPhone.length === 10) {
                        sendWhatsAppForSnapshot(snap, saleCompletedPrompt.customerPhone);
                        close();
                      } else {
                        setShowPromptPhoneInput(true);
                      }
                    }}
                    className="flex items-center justify-center gap-2 rounded-xl bg-[#10B981] px-3 py-4 text-[12px] font-extrabold uppercase leading-tight tracking-wide text-white hover:bg-[#059669] cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4 shrink-0" /> WhatsApp Invoice
                  </button>
                  <button
                    onClick={close}
                    className="flex items-center justify-center gap-2 rounded-xl bg-black px-3 py-4 text-[12px] font-extrabold uppercase tracking-wide text-white hover:bg-slate-800 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> New Sale
                  </button>
                </div>

                {/* Inline WhatsApp phone input, when the bill has no number */}
                {showPromptPhoneInput && (
                  <div className="bg-[#FAF7F2] border border-black/10 rounded-xl p-4 space-y-3 animate-in fade-in duration-150">
                    <label className="block text-[11px] font-bold text-black uppercase tracking-wider">Enter WhatsApp Mobile Number:</label>
                    <div className="flex gap-2">
                      <div className="flex items-center bg-white border border-black/10 rounded-lg px-3 text-xs font-bold text-[#6B5F52]">+91</div>
                      <input
                        type="tel"
                        maxLength={10}
                        placeholder="10-digit number"
                        className="flex-1 bg-white border border-black/10 focus:border-[#10B981] rounded-lg px-3 py-2 text-xs font-bold text-black focus:outline-none"
                        value={promptPhone}
                        onChange={(e) => setPromptPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        autoFocus
                      />
                      <button
                        onClick={() => {
                          if (!promptPhone || promptPhone.length !== 10) {
                            alert("Please enter a valid 10-digit mobile number.");
                            return;
                          }
                          sendWhatsAppForSnapshot(snap, promptPhone);
                          close();
                        }}
                        disabled={promptPhone.length !== 10}
                        className="bg-[#10B981] hover:bg-[#059669] text-white px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                      >
                        Send Bill
                      </button>
                    </div>
                  </div>
                )}

                {/* Items sold */}
                <div className="rounded-2xl border border-black/10 p-6">
                  <p className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 border-b border-black/10 pb-3 mb-3">Items Sold</p>
                  <ul className="space-y-2.5">
                    {(snap.soldItems ?? []).map((it, i) => (
                      <li key={i} className="flex items-baseline justify-between gap-3 text-[14px]">
                        <span className="min-w-0 text-black font-semibold">
                          {it.name}
                          <span className="ml-2 text-[11.5px] font-semibold text-slate-400">× {it.qty} {it.qty === 1 ? "piece" : "pieces"}</span>
                          {it.free && <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-emerald-700">Free gift</span>}
                        </span>
                        <b className="shrink-0 text-black">{it.free ? "FREE" : money(it.price * it.qty)}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {printSettingsFor && (
        <PrintSettingsModal
          onCancel={() => setPrintSettingsFor(null)}
          onPrint={(p) => {
            window.open(`/invoice/${printSettingsFor}?print=true&type=${p.type}&size=${p.size}`, "_blank");
            setPrintSettingsFor(null);
          }}
        />
      )}

      {/* Invoice Modal */}
      {activeInvoiceId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-2 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-[#F5EFE6] rounded-2xl shadow-2xl w-full max-w-4xl h-[90vh] sm:h-[85vh] flex flex-col overflow-hidden transform scale-100 animate-in zoom-in-95 duration-200">
            <div className="px-4 py-3 flex justify-between items-center bg-white border-b border-black/10 shrink-0">
              <h3 className="font-bold text-sm uppercase tracking-wider flex items-center gap-2 text-[#000000] truncate">
                <Printer className="w-4 h-4 text-[#C1272D] shrink-0" />
                <span className="truncate">Invoice #{activeInvoiceId}</span>
              </h3>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    const id = activeInvoiceId;
                    if (!id) return;
                    setPrintSettingsFor(id);
                  }}
                  className="flex items-center gap-1.5 px-3 h-8 bg-[#C1272D] text-white hover:bg-[#9E1B20] rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer shadow-sm"
                  title="Print / Save PDF"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Receipt
                </button>
                {role === "admin" && (
                  <button
                    onClick={() => {
                      const id = activeInvoiceId;
                      if (!id) return;
                      setConfirmDialog({
                        title: "Delete this invoice?",
                        message: `Invoice ${id} will be permanently deleted from the database and removed from every analytics report. This cannot be undone.`,
                        confirmLabel: "Delete invoice",
                        onConfirm: () => handleDeleteOrder(id),
                      });
                    }}
                    disabled={deletingOrderId === activeInvoiceId}
                    className="flex items-center gap-1.5 px-3 h-8 bg-white border border-[#C1272D]/40 text-[#C1272D] hover:bg-[#C1272D] hover:text-white rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deletingOrderId === activeInvoiceId ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    Delete
                  </button>
                )}
                <button
                  onClick={() => setActiveInvoiceId(null)}
                  className="w-8 h-8 flex items-center justify-center bg-black hover:bg-black/80 text-white rounded-md transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 w-full bg-[#F5EFE6] overflow-hidden relative">
              <iframe
                src={`/invoice/${activeInvoiceId}`}
                className="w-full h-full border-none absolute inset-0"
                title={`Invoice ${activeInvoiceId}`}
              />
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Dialog ("Are you sure?") */}
      {confirmDialog && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => {
            if (!confirmBusy) setConfirmDialog(null);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.4)] w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 pt-6 pb-4 flex items-start gap-4">
              <div className="w-11 h-11 rounded-full bg-[#C1272D]/10 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-[#C1272D]" />
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-black text-[#000000] tracking-tight">
                  {confirmDialog.title}
                </h3>
                <p className="text-[13px] font-medium text-[#4A4038] mt-1.5 leading-relaxed">
                  {confirmDialog.message}
                </p>
              </div>
            </div>
            <div className="px-6 py-4 bg-[#F5EFE6]/60 border-t border-black/10 flex justify-end gap-3">
              <button
                onClick={() => setConfirmDialog(null)}
                disabled={confirmBusy}
                className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-[#000000] bg-white border border-black/15 hover:bg-[#F5EFE6] transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={runConfirm}
                disabled={confirmBusy}
                className="px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider text-white bg-[#C1272D] hover:bg-[#9E1B20] transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {confirmBusy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {confirmBusy ? "Working…" : confirmDialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
