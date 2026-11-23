import { getOrder } from "@/lib/db";
import { getConfig, orderLoyalty } from "@/lib/loyalty/server";
import { getShopProfile } from "@/lib/shopSettings";
import { notFound } from "next/navigation";
import InvoiceActions from "./invoice-actions";
import type { Metadata } from "next";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `Invoice - ${id}` };
}

const UPI_CHANNEL_LABELS: Record<string, string> = {
  counter_qr: "Counter QR",
  whatsapp_link: "WhatsApp payment link",
  guest_phone: "Guest's phone QR",
  gpay_number: "GPay number",
  other: "Other UPI",
};

const money = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/* ₹ in words, the Indian way: crore, lakh, thousand. */
const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
function below1000(n: number): string {
  const out: string[] = [];
  if (n >= 100) {
    out.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) out.push(TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : ""));
  else if (n > 0) out.push(ONES[n]);
  return out.join(" ");
}
function rupeesInWords(amount: number): string {
  const total = Math.round(Math.max(0, amount) * 100);
  let rupees = Math.floor(total / 100);
  const paise = total % 100;
  if (rupees === 0 && paise === 0) return "Zero Rupees Only";
  const parts: string[] = [];
  const crore = Math.floor(rupees / 10_000_000);
  rupees %= 10_000_000;
  const lakh = Math.floor(rupees / 100_000);
  rupees %= 100_000;
  const thousand = Math.floor(rupees / 1000);
  rupees %= 1000;
  if (crore) parts.push(`${below1000(crore)} Crore`);
  if (lakh) parts.push(`${below1000(lakh)} Lakh`);
  if (thousand) parts.push(`${below1000(thousand)} Thousand`);
  if (rupees) parts.push(below1000(rupees));
  let words = parts.join(" ");
  words = words ? `${words} Rupees` : "";
  if (paise) words += `${words ? " and " : ""}${below1000(paise)} Paise`;
  return `${words} Only`;
}

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [order, shop, loyalty, cfg] = await Promise.all([
    getOrder(id),
    getShopProfile(),
    orderLoyalty(id).catch(() => null),
    getConfig().catch(() => null),
  ]);
  if (!order) notFound();

  // Loyalty summary: only for bills with a loyalty customer, and only when the setting is on.
  const showLoyalty = loyalty ? cfg?.display.receiptSummary : false;

  const [rawPhone, rawMethod] = (order.customer_phone || "").split("_");
  const phone = (rawPhone || "").replace(/\D/g, "").slice(-10);
  const method = (rawMethod || "CASH").toUpperCase();
  const modeLabel = method === "GPAY" ? "UPI" : method;
  const date = new Date(order.created_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  const lines = order.order_items.filter((i) => !i.snapshot_name.startsWith("GST ("));
  const gstItem = order.order_items.find((i) => i.snapshot_name.startsWith("GST ("));
  const gstAmount = gstItem ? gstItem.snapshot_price * gstItem.quantity : 0;

  // GST is shown as CGST + SGST (half each) with the percentage and amount.
  const gstPct = Number(gstItem?.snapshot_name.match(/\(([\d.]+)%/)?.[1] ?? order.gst_percent ?? 0);
  const gstIncl = !!gstItem && /incl/i.test(gstItem.snapshot_name);
  const cgst = Math.round((gstAmount / 2) * 100) / 100;
  const sgst = Math.round((gstAmount - cgst) * 100) / 100;
  const halfPct = gstPct / 2;
  const when = new Date(order.created_at).toLocaleString("en-GB", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
  const itemCount = lines.reduce((n, i) => n + i.quantity, 0);

  const split = (order.split_cash ?? 0) + (order.split_upi ?? 0) + (order.split_card ?? 0) > 0;
  const channel = order.upi_channel ? UPI_CHANNEL_LABELS[order.upi_channel] : "";
  const paidVia =
    method === "CASH" ? "Cash"
    : method === "CARD" ? "Card"
    : method === "GPAY" ? `UPI${channel ? ` · ${channel}` : ""}`
    : split ? [order.split_cash ? "Cash" : "", order.split_upi ? "UPI" : "", order.split_card ? "Card" : ""].filter(Boolean).join(" + ")
    : "Split";
  const paid = method === "CASH" && order.cash_received > 0 ? order.cash_received : order.grand_total;
  const balance = Math.max(0, Math.round((order.grand_total - paid) * 100) / 100);
  const change = method === "CASH" ? Math.max(0, Math.round((paid - order.grand_total) * 100) / 100) : 0;

  const lab = "text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500";

  return (
    <div className="min-h-screen bg-[#F7F7F7] text-black font-sans py-8 px-4 flex flex-col items-center">
      <style>{`
        @media print {
          body { background-color: #F7F7F7 !important; color: black !important; margin: 0 !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* Print handling only (no buttons for customers) */}
      <InvoiceActions />

      <div id="invoice-doc" className="w-full max-w-[780px] bg-white border border-black/10 rounded-2xl shadow-sm p-8 sm:p-10 print:p-10">
        {/* Header */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-start sm:justify-between print:flex-row print:items-start print:justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[22px] sm:text-[24px] font-black uppercase tracking-tight leading-tight text-black">{shop.shopName}</h1>
            {shop.address && <p className="mt-2 max-w-sm text-[12.5px] leading-relaxed text-slate-600">{shop.address}</p>}
            {shop.phone && <p className="mt-1.5 text-[12.5px] font-semibold text-slate-800">Phone: +91 {shop.phone}</p>}
            {shop.email && <p className="text-[12.5px] font-semibold text-slate-800">Email: {shop.email}</p>}
          </div>
          <div className="sm:text-right print:text-right shrink-0">
            <span className="inline-block rounded-md bg-[#C1272D]/10 px-3.5 py-1.5 text-[12px] font-black uppercase tracking-wider text-[#C1272D]">Invoice</span>
            <p className="mt-2 font-mono text-[12px] font-bold text-slate-800">#{order.id}</p>
            <p className="text-[12.5px] text-slate-500">{date}</p>
            <p className="text-[12.5px] text-slate-500">MODE: {modeLabel}</p>
          </div>
        </div>

        {/* Billed to */}
        <div className="mt-6 flex items-start justify-between gap-4 border-t border-black/10 pt-5">
          <div>
            <p className={lab}>Billed to</p>
            <p className="mt-1.5 text-[15px] font-bold text-black">{order.customer_name || "Guest"}</p>
            {phone && <p className="font-mono text-[12.5px] text-slate-600">+91 {phone}</p>}
          </div>
          <div className="text-right">
            <p className={lab}>Place of supply</p>
            <p className="mt-1.5 text-[13.5px] font-bold text-black">Tamil Nadu (33)</p>
          </div>
        </div>

        {/* Items */}
        <div className="mt-5 border-t border-black/10 pt-5">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left">
              <thead>
                <tr className="bg-[#F8F8FA]">
                  <th className={`${lab} px-3 py-3 w-8`}>#</th>
                  <th className={`${lab} px-3 py-3`}>Item description</th>
                  <th className={`${lab} px-3 py-3 text-center`}>Qty</th>
                  <th className={`${lab} px-3 py-3 text-right`}>Rate (₹)</th>
                  <th className={`${lab} px-3 py-3 text-right`}>Total (₹)</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((item, i) => (
                  <tr key={i} className="border-b border-black/5">
                    <td className="px-3 py-3.5 text-[12.5px] text-slate-400">{i + 1}</td>
                    <td className="px-3 py-3.5 text-[13.5px] font-bold text-black">
                      {item.snapshot_name}
                      {item.snapshot_price === 0 && <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-emerald-700">Free gift</span>}
                    </td>
                    <td className="px-3 py-3.5 text-center text-[13.5px] font-bold text-black">{item.quantity}</td>
                    <td className="px-3 py-3.5 text-right font-mono text-[12.5px] text-slate-600">{money(item.snapshot_price)}</td>
                    <td className="px-3 py-3.5 text-right font-mono text-[13px] font-bold text-black">{money(item.snapshot_price * item.quantity)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Words, payment and totals */}
        <div className="mt-6 grid grid-cols-1 gap-8 border-t border-black/10 pt-6 sm:grid-cols-2 print:grid-cols-2">
          <div>
            <p className={lab}>Amount in words</p>
            <p className="mt-1.5 text-[13px] font-bold italic text-black">{rupeesInWords(order.grand_total)}</p>

            <div className="mt-5 space-y-3 border-t border-black/10 pt-4 text-[13px]">
              <div className="flex items-baseline justify-between gap-3"><span className="text-slate-600">Paid Via:</span><span className="font-semibold text-black">{paidVia}</span></div>
              {split && (
                <div className="space-y-1 rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-600">
                  {!!order.split_cash && <div className="flex justify-between"><span>Cash</span><b className="font-mono text-black">{money(order.split_cash)}</b></div>}
                  {!!order.split_upi && <div className="flex justify-between"><span>UPI</span><b className="font-mono text-black">{money(order.split_upi)}</b></div>}
                  {!!order.split_card && <div className="flex justify-between"><span>Card</span><b className="font-mono text-black">{money(order.split_card)}</b></div>}
                </div>
              )}
              <div className="flex items-baseline justify-between gap-3"><span className="text-slate-600">Amount Paid:</span><b className="font-mono text-black">{money(paid)}</b></div>
              {change > 0 && <div className="flex items-baseline justify-between gap-3"><span className="text-slate-600">Change Returned:</span><b className="font-mono text-black">{money(change)}</b></div>}
              <div className="flex items-baseline justify-between gap-3"><span className="text-slate-600">Balance Due:</span><b className={`font-mono ${balance > 0 ? "text-[#C1272D]" : "text-emerald-600"}`}>{money(balance)}</b></div>
            </div>

            <div className="mt-5 border-t border-black/10 pt-4 text-[12px] text-slate-600">
              <p className="font-semibold text-black">Terms &amp; Notes:</p>
              <p className="mt-1">• Thank you for choosing {shop.shopName}.</p>
              <p>• Please carry this receipt when collecting your order.</p>
            </div>
          </div>

          <div>
            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between"><span className="text-slate-700">Subtotal</span><span className="font-mono font-semibold text-black">{money(order.subtotal)}</span></div>
              {order.discount_amount > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-700">Discount{order.discount_type === "PERCENT" && order.discount_value ? ` (${order.discount_value}%)` : ""}</span>
                  <span className="font-mono font-semibold text-[#C1272D]">− {money(order.discount_amount)}</span>
                </div>
              )}
              {order.delivery_fee > 0 && (
                <div className="flex justify-between"><span className="text-slate-700">Delivery</span><span className="font-mono font-semibold text-black">{money(order.delivery_fee)}</span></div>
              )}
              {gstItem ? (
                <>
                  <div className="flex justify-between"><span className="text-slate-700">CGST ({halfPct}%)</span><span className="font-mono font-semibold text-black">{money(cgst)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-700">SGST ({halfPct}%)</span><span className="font-mono font-semibold text-black">{money(sgst)}</span></div>
                  <div className="flex justify-between text-[12px]"><span className="text-slate-500">Total GST ({gstPct}%{gstIncl ? ", included in prices" : ""})</span><span className="font-mono text-slate-600">{money(gstAmount)}</span></div>
                </>
              ) : (
                <div className="flex justify-between"><span className="text-slate-500">GST</span><span className="text-slate-500">Non-GST bill</span></div>
              )}
            </div>
            <div className="mt-3 flex items-baseline justify-between border-t-2 border-[#C1272D] pt-3">
              <span className="text-[17px] font-black uppercase tracking-wide text-[#C1272D]">Total</span>
              <span className="font-mono text-[20px] font-black text-[#C1272D]">{money(order.grand_total)}</span>
            </div>

            {loyalty && showLoyalty && (
              <div className="mt-6 rounded-xl border border-black/10 bg-slate-50 p-4 text-[12.5px]">
                <p className={`${lab} mb-2`}>Loyalty points</p>
                <div className="grid grid-cols-2 gap-3 font-semibold text-slate-600">
                  <div>Previous<br /><b className="text-black">{loyalty.prev}</b></div>
                  <div>Earned<br /><b className="text-emerald-700">+{loyalty.earned}</b></div>
                  <div>Redeemed<br /><b className="text-[#C1272D]">-{loyalty.used}</b></div>
                  <div>Remaining<br /><b className="text-black">{loyalty.balance}</b></div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 border-t border-black/10 pt-4 text-center text-[11px] text-slate-400">
          Powered by Cenexa Systems © {new Date().getFullYear()}
        </div>
      </div>

      {/* Thermal receipt: hidden on screen, shown only when printing on a thermal roll */}
      <div id="thermal-receipt" className="hidden font-mono text-black">
        <div className="text-center">
          <p className="rc-name">{shop.shopName}</p>
          {shop.address && <p>{shop.address}</p>}
          {shop.phone && <p>Ph: +91 {shop.phone}</p>}
          {shop.email && <p>{shop.email}</p>}
        </div>
        <hr />
        <div className="rc-row"><span>{order.id}</span><span>{modeLabel}</span></div>
        <p>{when}</p>
        <p>{order.customer_name || "Walk-in customer"}{phone ? ` · +91 ${phone}` : ""}</p>
        <hr />
        {lines.map((item, i) => (
          <div key={i} className="rc-item">
            <p>{item.snapshot_name}{item.snapshot_price === 0 ? " (free gift)" : ""}</p>
            <div className="rc-row"><span>{item.quantity} × {money(item.snapshot_price)}</span><span>{money(item.snapshot_price * item.quantity)}</span></div>
          </div>
        ))}
        <hr />
        <div className="rc-row"><span>Subtotal ({itemCount})</span><span>{money(order.subtotal)}</span></div>
        {order.discount_amount > 0 && <div className="rc-row"><span>Discount{order.discount_type === "PERCENT" && order.discount_value ? ` (${order.discount_value}%)` : ""}</span><span>− {money(order.discount_amount)}</span></div>}
        {order.delivery_fee > 0 && <div className="rc-row"><span>Delivery</span><span>{money(order.delivery_fee)}</span></div>}
        {gstItem ? (
          <>
            <div className="rc-row"><span>CGST ({halfPct}%)</span><span>{money(cgst)}</span></div>
            <div className="rc-row"><span>SGST ({halfPct}%)</span><span>{money(sgst)}</span></div>
            <div className="rc-row"><span>GST {gstPct}%{gstIncl ? " (incl.)" : ""}</span><span>{money(gstAmount)}</span></div>
          </>
        ) : (
          <div className="rc-row"><span>GST</span><span>Non-GST bill</span></div>
        )}
        <hr />
        <div className="rc-row rc-total"><span>TOTAL</span><span>{money(order.grand_total)}</span></div>
        <hr />
        <div className="rc-row"><span>Paid via</span><span>{paidVia}</span></div>
        {split && (
          <>
            {!!order.split_cash && <div className="rc-row"><span>&nbsp;&nbsp;Cash</span><span>{money(order.split_cash)}</span></div>}
            {!!order.split_upi && <div className="rc-row"><span>&nbsp;&nbsp;UPI</span><span>{money(order.split_upi)}</span></div>}
            {!!order.split_card && <div className="rc-row"><span>&nbsp;&nbsp;Card</span><span>{money(order.split_card)}</span></div>}
          </>
        )}
        <div className="rc-row"><span>Amount paid</span><span>{money(paid)}</span></div>
        {change > 0 && <div className="rc-row"><span>Change returned</span><span>{money(change)}</span></div>}
        <div className="rc-row"><span>Balance due</span><span>{money(balance)}</span></div>
        {loyalty && showLoyalty && (
          <>
            <hr />
            <p className="font-bold">LOYALTY POINTS</p>
            <div className="rc-row"><span>Previous</span><span>{loyalty.prev}</span></div>
            <div className="rc-row"><span>Earned</span><span>+{loyalty.earned}</span></div>
            <div className="rc-row"><span>Redeemed</span><span>-{loyalty.used}</span></div>
            <div className="rc-row"><span>Remaining</span><span>{loyalty.balance}</span></div>
          </>
        )}
        <hr />
        <p className="text-center font-bold">thank you — come again</p>
        <p className="text-center rc-small">Powered by Cenexa Systems © {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
