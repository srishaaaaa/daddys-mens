/** A line on a bill, as the loyalty code sees it. */
export type OrderItem = {
  productId: string | null;
  name: string;
  price: number;
  qty: number;
  /** A free gift line (loyalty reward or bill offer): always ₹0 and never earns points. */
  free?: boolean;
  gift?: string;
};
