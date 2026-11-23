import "server-only";

/** The shop's UPI details, from .env (SHOP_UPI_ID etc.). Null when no UPI ID is set. */
export type UpiConfig = { id: string; name: string; phone: string; minutes: number; shopName: string };

export function getUpiConfig(): UpiConfig | null {
  const id = (process.env.SHOP_UPI_ID ?? "").trim();
  if (!id) return null;
  const minutes = Number(process.env.SHOP_UPI_QR_MINUTES);
  return {
    id,
    name: (process.env.SHOP_UPI_NAME ?? "").trim() || "Daddy's Home",
    phone: (process.env.SHOP_UPI_PHONE ?? "").replace(/\D/g, "").slice(-10),
    minutes: minutes > 0 ? minutes : 5,
    shopName: "Daddy's Home",
  };
}
