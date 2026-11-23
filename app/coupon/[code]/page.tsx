import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublicCoupon } from "@/lib/coupons";
import CouponCard from "./CouponCard";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ n?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const c = await getPublicCoupon(code).catch(() => null);
  if (!c) return { title: "Coupon — Daddy's Home" };
  const title = `${c.percent}% OFF at Daddy's Home`;
  const description = `Your code: ${c.code}${c.minOrder ? ` · valid on purchases of ₹${c.minOrder.toLocaleString("en-IN")} or more` : ""}`;
  // WhatsApp builds the link preview from these tags.
  return {
    title,
    description,
    openGraph: { title, description, siteName: "Daddy's Home", images: ["/logo.png"] },
    twitter: { card: "summary", title, description, images: ["/logo.png"] },
    robots: { index: false, follow: false },
  };
}

export default async function CouponPage({ params, searchParams }: Props) {
  const { code } = await params;
  const { n } = await searchParams;
  const coupon = await getPublicCoupon(code).catch(() => null);
  if (!coupon) notFound();
  return <CouponCard coupon={coupon} customerName={n?.slice(0, 40) ?? ""} />;
}
