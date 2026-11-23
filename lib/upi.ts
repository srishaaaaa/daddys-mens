import "server-only";
import { getShopSettings } from "@/lib/shopSettings";

/** The shop's UPI details. Null when no UPI ID is set. */
export type UpiConfig = { id: string; name: string; phone: string; minutes: number; shopName: string };

/** Settings screen first, .env (SHOP_UPI_ID etc.) as a fallback. */
export async function getUpiConfig(): Promise<UpiConfig | null> {
  const s = await getShopSettings();
  const id = (s.upiId || process.env.SHOP_UPI_ID || "").trim();
  if (!id) return null;
  const envMinutes = Number(process.env.SHOP_UPI_QR_MINUTES);
  const minutes = s.upiQrMinutes > 0 ? s.upiQrMinutes : envMinutes > 0 ? envMinutes : 5;
  return {
    id,
    name: (s.upiName || process.env.SHOP_UPI_NAME || "").trim() || s.shopName,
    phone: (s.upiPhone || process.env.SHOP_UPI_PHONE || "").replace(/\D/g, "").slice(-10),
    minutes,
    shopName: s.shopName,
  };
}
