"use client";

import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";

type PublicCoupon = {
  code: string;
  percent: number;
  minOrder: number;
  expiresAt: string | null;
  status: "active" | "expired" | "exhausted" | "paused";
};

const PHONE = "8056642706";
const BANNER = {
  expired: "This coupon has expired.",
  exhausted: "This coupon has been fully used.",
  paused: "This coupon is not active right now.",
} as const;

const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return `${day}/${m}/${y}`;
};

export default function CouponCard({ coupon: c, customerName }: { coupon: PublicCoupon; customerName: string }) {
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
    try {
      await document.fonts?.load("700 40px Poppins");
    } catch {}
    const W = 1080;
    const H = 1350;
    const cv = document.createElement("canvas");
    cv.width = W;
    cv.height = H;
    const g = cv.getContext("2d");
    if (!g) return;
    const font = (w: number, s: number) => `${w} ${s}px Poppins, Arial, sans-serif`;
    const rr = (x: number, y: number, w: number, h: number, r: number) => {
      g.beginPath();
      g.roundRect(x, y, w, h, r);
    };

    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#3A0B0E");
    bg.addColorStop(1, "#1A0405");
    g.fillStyle = bg;
    g.fillRect(0, 0, W, H);

    g.textAlign = "center";
    g.fillStyle = "#F5EFE6";
    g.font = font(800, 56);
    g.fillText("DADDY'S HOME", W / 2, 120);
    g.fillStyle = "#D9B26A";
    g.font = font(600, 26);
    g.fillText("PREMIUM MENSWEAR & ACCESSORIES", W / 2, 168);

    // card
    const x = 90;
    const y = 230;
    const w = W - 180;
    const h = 900;
    g.save();
    rr(x, y, w, h, 44);
    g.clip();
    g.fillStyle = "#FAF7F2";
    g.fillRect(x, y, w, h);
    const head = g.createLinearGradient(x, y, x + w, y + 380);
    head.addColorStop(0, "#C1272D");
    head.addColorStop(1, "#8E1B20");
    g.fillStyle = head;
    g.fillRect(x, y, w, 380);
    g.restore();

    g.fillStyle = "#F3D8A0";
    g.font = font(700, 28);
    g.fillText("A GIFT FOR YOU", W / 2, y + 90);
    g.fillStyle = "#FFFFFF";
    g.font = font(800, 150);
    g.fillText(`${c.percent}% OFF`, W / 2, y + 245);
    g.fillStyle = "#FBE9E9";
    g.font = font(500, 32);
    g.fillText("on your next purchase", W / 2, y + 310);

    g.fillStyle = "#9B7A3A";
    g.font = font(700, 26);
    g.fillText("YOUR COUPON CODE", W / 2, y + 450);
    rr(x + 60, y + 480, w - 120, 130, 26);
    g.fillStyle = "#FFFFFF";
    g.fill();
    g.strokeStyle = "#D9B26A";
    g.lineWidth = 3;
    g.stroke();
    g.fillStyle = "#3A0B0E";
    g.font = `700 76px "Courier New", monospace`;
    g.fillText(c.code, W / 2, y + 570);

    g.textAlign = "left";
    g.font = font(500, 32);
    rules.forEach((r, i) => {
      g.fillStyle = "#C1272D";
      g.fillText("•", x + 80, y + 700 + i * 70);
      g.fillStyle = "#4A4038";
      g.fillText(r, x + 130, y + 700 + i * 70);
    });

    g.textAlign = "center";
    g.fillStyle = "#E7D9C3";
    g.font = font(500, 28);
    g.fillText(`Show this code at the store or enter it at checkout. · ${PHONE}`, W / 2, y + h + 90);

    const a = document.createElement("a");
    a.href = cv.toDataURL("image/png");
    a.download = `coupon-${c.code}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const dead = c.status !== "active";

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-10 bg-[radial-gradient(ellipse_at_top,#4A0E12_0%,#220607_55%,#140304_100%)] text-[#F5EFE6]">
      <div className="w-full max-w-[460px]">
        <header className="text-center mb-7">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Daddy's Home" className="mx-auto h-16 w-16 object-contain mb-3" />
          <h1 className="text-[26px] font-extrabold tracking-[0.18em] uppercase">Daddy&apos;s Home</h1>
          <p className="mt-1 text-[10px] font-semibold tracking-[0.32em] uppercase text-[#D9B26A]">
            Premium Menswear &amp; Accessories
          </p>
        </header>

        {customerName && (
          <p className="text-center text-sm font-semibold text-[#F3D8A0] mb-4">Hi {customerName}, this one&apos;s for you!</p>
        )}

        <section className={`relative rounded-[26px] overflow-hidden border border-[#D9B26A]/50 shadow-[0_30px_60px_-20px_rgba(0,0,0,.7)] ${dead ? "opacity-80" : ""}`}>
          <div className="bg-gradient-to-br from-[#C1272D] to-[#8E1B20] px-6 pt-8 pb-10 text-center">
            <p className="text-[11px] font-bold tracking-[0.38em] uppercase text-[#F3D8A0]">A gift for you</p>
            <p className="mt-2 text-[64px] leading-none font-black text-white">{c.percent}% OFF</p>
            <p className="mt-2 text-sm font-medium text-[#FBE9E9]">on your next purchase</p>
          </div>

          <div className="relative bg-[#FAF7F2] px-6 pt-7 pb-8 text-[#4A4038]">
            <span className="absolute -top-3 -left-3 h-6 w-6 rounded-full bg-[#2A0709]" />
            <span className="absolute -top-3 -right-3 h-6 w-6 rounded-full bg-[#2A0709]" />
            <p className="text-center text-[10px] font-extrabold tracking-[0.3em] uppercase text-[#9B7A3A]">Your coupon code</p>
            <div className="mt-2 rounded-xl border border-[#D9B26A] bg-white py-4 text-center font-mono text-[34px] font-bold tracking-[0.18em] text-[#3A0B0E]">
              {c.code}
            </div>
            <div className="mt-4 flex justify-center">
              <button
                onClick={copy}
                className="inline-flex items-center gap-2 rounded-full border border-[#3A0B0E] px-6 py-2 text-[13px] font-bold text-[#3A0B0E] hover:bg-[#3A0B0E] hover:text-white transition cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "Copied!" : "Copy code"}
              </button>
            </div>
            <ul className="mt-6 space-y-2.5 text-[14px] font-medium">
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

        <a
          href={`tel:+91${PHONE}`}
          className="mt-5 block rounded-xl bg-gradient-to-r from-[#D9B26A] to-[#EAD29B] py-4 text-center text-[13px] font-extrabold tracking-[0.25em] uppercase text-[#3A0B0E] shadow-[0_10px_30px_-10px_rgba(217,178,106,.6)]"
        >
          Call the store
        </a>
        <button
          onClick={saveImage}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 py-3.5 text-[14px] font-bold text-white hover:bg-white/10 transition cursor-pointer"
        >
          <Download className="w-4 h-4" /> Save coupon as image
        </button>
        <p className="mt-5 text-center text-xs text-[#E7D9C3]/80">
          Show this code at the store or enter it at checkout. · {PHONE}
        </p>
      </div>
    </main>
  );
}
