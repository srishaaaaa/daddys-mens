import { fmtYmd, type MessageKind } from "@/lib/membershipTypes";

/* The membership WhatsApp messages. The shop name comes from Settings. */

export const waLink = (phone: string, text: string) =>
  `https://api.whatsapp.com/send/?phone=91${phone.replace(/\D/g, "").slice(-10)}&text=${encodeURIComponent(text)}`;

export const KIND_LABEL: Record<MessageKind, string> = {
  activation: "Welcome", upgrade: "Upgrade", renewal: "Renewal", expiry: "Expiry reminder", eligibility: "Eligible", offer: "Offer",
};

type Base = { shop: string; name: string };
const hi = (b: Base) => `Hi ${b.name || "there"}!`;

export const msgActivation = (b: Base & { plan: string; memberNo: string; discountPct: number; expiresAt: string | null; offer?: string }) =>
  `${hi(b)} 🎉 Welcome to ${b.shop} Membership!\n\nYou are now a ${b.plan} member.\n\nMembership ID: ${b.memberNo}\nExclusive Discount: ${b.discountPct}%\n${b.offer ? `Special benefit: ${b.offer}\n` : ""}Valid Until: ${b.expiresAt ? fmtYmd(b.expiresAt) : "No expiry"}\n\nEnjoy exclusive offers and benefits on your shopping with us!\n\nThank you for shopping at ${b.shop} ❤️`;

export const msgUpgrade = (b: Base & { from: string; plan: string; memberNo: string; discountPct: number; expiresAt: string | null; offer?: string }) =>
  `${hi(b)} 🎉 Your ${b.shop} Membership has been upgraded!\n\nPrevious plan: ${b.from || "—"}\nNew plan: ${b.plan}\n\nMembership ID: ${b.memberNo}\nNew Discount: ${b.discountPct}%\n${b.offer ? `New benefit: ${b.offer}\n` : ""}Valid Until: ${b.expiresAt ? fmtYmd(b.expiresAt) : "No expiry"}\n\nThank you for shopping at ${b.shop} ❤️`;

export const msgRenewal = (b: Base & { plan: string; memberNo: string; discountPct: number; expiresAt: string | null }) =>
  `${hi(b)} ✅ Your ${b.shop} ${b.plan} Membership has been renewed.\n\nMembership ID: ${b.memberNo}\nMember Discount: ${b.discountPct}%\nNew expiry date: ${b.expiresAt ? fmtYmd(b.expiresAt) : "No expiry"}\n\nThank you for staying with us ❤️`;

export const msgExpiry = (b: Base & { plan: string; expiresAt: string; daysLeft: number }) =>
  `${hi(b)} ❤️ Your ${b.shop} ${b.plan} Membership ${b.daysLeft <= 0 ? "expires today" : `is expiring on ${fmtYmd(b.expiresAt)}`}.\n\nRenew your membership to continue enjoying your exclusive member discounts and benefits.\n\nVisit ${b.shop} to renew!`;

export const msgEligibility = (b: Base & { plan: string; discountPct: number; offer?: string }) =>
  `Congratulations ${b.name || "there"}! 🎉\n\nYour shopping at ${b.shop} has qualified you for ${b.plan}!\n\nYou are eligible for:\n✨ ${b.discountPct}% Member Discount\n${b.offer ? `✨ ${b.offer}\n` : ""}\nVisit our store to activate your membership and enjoy exclusive benefits!`;

/** A promotion typed by the admin. {name}, {plan} and {shop} are filled in for each member. */
export const fillOffer = (text: string, v: { name: string; plan: string; shop: string }) =>
  text.replace(/\{name\}/gi, v.name || "there").replace(/\{plan\}/gi, v.plan || "member").replace(/\{shop\}/gi, v.shop);
