"use client";

import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { drawCouponCanvas } from "@/lib/couponImage";

type PublicCoupon = {
  code: string;
  percent: number;
  minOrder: number;
  expiresAt: string | null;
  status: "active" | "expired" | "exhausted" | "paused";
};

const BANNER = {
  expired: "This coupon has expired.",
  exhausted: "This coupon has been fully used.",
  paused: "This coupon is not active right now.",
} as const;

const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return `${day}/${m}/${y}`;
};

type Shop = { name: string; tagline: string; phone: string };

export default function CouponCard({ coupon: c, customerName, shop }: { coupon: PublicCoupon; customerName: string; shop: Shop }) {
  const [copied, setCopied] = useState(false);
  const rules = [
    c.minOrder ? `Valid on purchases of ₹${c.minOrder.toLocaleString("en-IN")} or more` : "No minimum purchase",
    c.expiresAt ? `Valid till ${fmtDate(c.expiresAt)}` : "No expiry date",
    "Discount applies to the item value only",
  ];

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(c.code);
    } catch {
      const t = document.createElement("textarea");
      t.value = c.code;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      document.body.removeChild(t);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Draws the coupon onto a canvas and downloads it as a PNG.
  const saveImage = async () => {
    const cv = await drawCouponCanvas({ code: c.code, percent: c.percent, minOrder: c.minOrder, expiresAt: c.expiresAt, customerName, shopName: shop.name, tagline: shop.tagline, phone: shop.phone });
    const a = document.createElement("a");
    a.href = cv.toDataURL("image/png");
    a.download = `coupon-${c.code}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const dead = c.status !== "active";

  return (
    <main className="min-h-dvh flex flex-col items-center justify-center px-4 py-3 bg-[radial-gradient(ellipse_at_top,#4A0E12_0%,#220607_55%,#140304_100%)] text-[#F5EFE6]">
      <div className="w-full max-w-[460px]">
        <header className="text-center mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt={shop.name} className="mx-auto h-12 w-12 object-contain mb-2" />
          <h1 className="text-[22px] font-extrabold tracking-[0.18em] uppercase">{shop.name}</h1>
          <p className="mt-1 text-[10px] font-semibold tracking-[0.32em] uppercase text-[#D9B26A]">
            {shop.tagline}
          </p>
        </header>

        {customerName && (
          <p className="text-center text-[13px] font-semibold text-[#F3D8A0] mb-2">Hi {customerName}, this one&apos;s for you!</p>
        )}

        <section className={`relative rounded-[26px] overflow-hidden border border-[#D9B26A]/50 shadow-[0_30px_60px_-20px_rgba(0,0,0,.7)] ${dead ? "opacity-80" : ""}`}>
          <div className="bg-gradient-to-br from-[#C1272D] to-[#8E1B20] px-6 pt-4 pb-6 text-center">
            <p className="text-[11px] font-bold tracking-[0.38em] uppercase text-[#F3D8A0]">A gift for you</p>
            <p className="mt-1 text-[52px] leading-none font-black text-white">{c.percent}% OFF</p>
            <p className="mt-1 text-[13px] font-medium text-[#FBE9E9]">on your next purchase</p>
          </div>

          <div className="relative bg-[#FAF7F2] px-6 pt-5 pb-4 text-[#4A4038]">
            <span className="absolute -top-3 -left-3 h-6 w-6 rounded-full bg-[#2A0709]" />
            <span className="absolute -top-3 -right-3 h-6 w-6 rounded-full bg-[#2A0709]" />
            <p className="text-center text-[10px] font-extrabold tracking-[0.3em] uppercase text-[#9B7A3A]">Your coupon code</p>
            <div className="mt-1.5 rounded-xl border border-[#D9B26A] bg-white py-2.5 text-center font-mono text-[30px] font-bold tracking-[0.18em] text-[#3A0B0E]">
              {c.code}
            </div>
            <div className="mt-3 flex justify-center">
              <button
                onClick={copy}
                className="inline-flex items-center gap-2 rounded-full border border-[#3A0B0E] px-5 py-1.5 text-[13px] font-bold text-[#3A0B0E] hover:bg-[#3A0B0E] hover:text-white transition cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied!" : "Copy code"}
              </button>
            </div>
            <ul className="mt-3 space-y-1 text-[13px] font-medium">
              {rules.map((r) => (
                <li key={r} className="flex gap-3">
                  <span className="text-[#C1272D]">✦</span>
                  {r}
                </li>
              ))}
            </ul>
            {dead && (
              <p className="mt-5 rounded-lg bg-[#C1272D]/10 px-3 py-2 text-center text-[13px] font-bold text-[#8E1B20]">
                {BANNER[c.status as keyof typeof BANNER]}
              </p>
            )}
          </div>
        </section>

        {shop.phone && <a
          href={`tel:+91${shop.phone}`}
          className="mt-3 block rounded-xl bg-gradient-to-r from-[#D9B26A] to-[#EAD29B] py-3 text-center text-[13px] font-extrabold tracking-[0.25em] uppercase text-[#3A0B0E] shadow-[0_10px_30px_-10px_rgba(217,178,106,.6)]"
        >
          Call the store
        </a>}
        <button
          onClick={saveImage}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 py-2.5 text-[14px] font-bold text-white hover:bg-white/10 transition cursor-pointer"
        >
          <Download className="w-4 h-4" /> Save coupon as image
        </button>
        <p className="mt-2 text-center text-[11px] text-[#E7D9C3]/80">
          Show this code at the store or enter it at checkout.{shop.phone ? ` · ${shop.phone}` : ""}
        </p>
      </div>
    </main>
  );
}
