import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicCoupon } from "@/lib/coupons";
import { getShopProfile } from "@/lib/shopSettings";
import CouponCard from "./CouponCard";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ n?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const c = await getPublicCoupon(code).catch(() => null);
  const shop = await getShopProfile();
  if (!c) return { title: `Coupon — ${shop.shopName}` };
  const title = `${c.percent}% OFF at ${shop.shopName}`;
  // WhatsApp needs an absolute address for the preview picture.
  const logo = shop.publicUrl ? `${shop.publicUrl}/logo.png` : "/logo.png";
  const description = `Your code: ${c.code}${c.minOrder ? ` · valid on purchases of ₹${c.minOrder.toLocaleString("en-IN")} or more` : ""}`;
  // WhatsApp builds the link preview from these tags.
  return {
    title,
    description,
    openGraph: { title, description, siteName: shop.shopName, images: [logo] },
    twitter: { card: "summary", title, description, images: [logo] },
    robots: { index: false, follow: false },
  };
}

export default async function CouponPage({ params, searchParams }: Props) {
  const { code } = await params;
  const { n } = await searchParams;
  const coupon = await getPublicCoupon(code).catch(() => null);
  if (!coupon) notFound();
  const shop = await getShopProfile();
  return <CouponCard coupon={coupon} customerName={n?.slice(0, 40) ?? ""} shop={{ name: shop.shopName, tagline: shop.tagline, phone: shop.phone }} />;
}
