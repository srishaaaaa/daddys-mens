"use server";

import { listProductsAction, listOrdersAction } from "./actions";
import { getUpiConfigAction } from "./pay-actions";
import { getShopProfileAction, getShopSettingsAction } from "./settings-actions";
import { listBillOffersAction, memberPhonesAction } from "./loyalty-actions";
import { listExpensesAction } from "./expense-actions";
import { listCouponsAction } from "./coupon-actions";

// Server actions run one after another from the browser, so ten small calls queue up.
// This reads everything at once on the server and answers in a single round trip.
// Admin-only parts quietly come back empty for staff.
const soft = <T,>(p: Promise<T>) => p.then((v) => v, () => null);

export async function bootstrapAction() {
  const [products, orders, upi, profile, offers, expenses, coupons, settings, members] = await Promise.all([
    listProductsAction(),
    listOrdersAction(),
    soft(getUpiConfigAction()),
    soft(getShopProfileAction()),
    soft(listBillOffersAction()),
    soft(listExpensesAction()),
    soft(listCouponsAction()),
    soft(getShopSettingsAction()),
    soft(memberPhonesAction()),
  ]);
  return { products, orders, upi, profile, offers, expenses, coupons, settings, members };
}
