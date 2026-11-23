/* Draws a coupon onto a canvas (for "Save as image") and wraps it in a PDF (for "Generate & share PDF").
   Browser only. No libraries: the PDF is one page holding the coupon as a JPEG. */

export type CouponArt = {
  code: string;
  percent: number;
  minOrder: number;
  expiresAt: string | null;
  customerName?: string;
  /** shown on the image; defaults are the shop's original details */
  shopName?: string;
  tagline?: string;
  phone?: string;
};
const fmtDate = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return `${day}/${m}/${y}`;
};

export const couponRules = (c: Pick<CouponArt, "minOrder" | "expiresAt">) => [
  c.minOrder ? `Valid on purchases of ₹${c.minOrder.toLocaleString("en-IN")} or more` : "No minimum purchase",
  c.expiresAt ? `Valid till ${fmtDate(c.expiresAt)}` : "No expiry date",
  "Discount applies to the item value only",
];

export async function drawCouponCanvas(c: CouponArt): Promise<HTMLCanvasElement> {
  try {
    await document.fonts?.load("700 40px Poppins");
  } catch {}
  const W = 1080;
  const H = 1350;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d")!;
  const font = (w: number, s: number) => `${w} ${s}px Poppins, Arial, sans-serif`;

  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#3A0B0E");
  bg.addColorStop(1, "#1A0405");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);

  g.textAlign = "center";
  g.fillStyle = "#F5EFE6";
  g.font = font(800, 56);
  g.fillText((c.shopName ?? "Daddy's Home").toUpperCase().slice(0, 28), W / 2, 120);
  g.fillStyle = "#D9B26A";
  g.font = font(600, 26);
  g.fillText((c.tagline ?? "Premium Menswear & Accessories").toUpperCase().slice(0, 44), W / 2, 168);

  const x = 90, y = 230, w = W - 180, h = 900;
  g.save();
  g.beginPath();
  g.roundRect(x, y, w, h, 44);
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
  g.fillText(c.customerName ? `A GIFT FOR ${c.customerName.toUpperCase().slice(0, 24)}` : "A GIFT FOR YOU", W / 2, y + 90);
  g.fillStyle = "#FFFFFF";
  g.font = font(800, 150);
  g.fillText(`${c.percent}% OFF`, W / 2, y + 245);
  g.fillStyle = "#FBE9E9";
  g.font = font(500, 32);
  g.fillText("on your next purchase", W / 2, y + 310);

  g.fillStyle = "#9B7A3A";
  g.font = font(700, 26);
  g.fillText("YOUR COUPON CODE", W / 2, y + 450);
  g.beginPath();
  g.roundRect(x + 60, y + 480, w - 120, 130, 26);
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
  couponRules(c).forEach((r, i) => {
    g.fillStyle = "#C1272D";
    g.fillText("•", x + 80, y + 700 + i * 70);
    g.fillStyle = "#4A4038";
    g.fillText(r, x + 130, y + 700 + i * 70);
  });

  g.textAlign = "center";
  g.fillStyle = "#E7D9C3";
  g.font = font(500, 28);
  g.fillText(`Show this code at the store or enter it at checkout.${(c.phone ?? "8056642706") ? ` · ${c.phone ?? "8056642706"}` : ""}`, W / 2, y + h + 90);
  return cv;
}

/** A one-page PDF holding the canvas as a JPEG. */
export function canvasToPdf(cv: HTMLCanvasElement): Blob {
  const jpegB64 = cv.toDataURL("image/jpeg", 0.92).split(",")[1];
  const bin = atob(jpegB64);
  const jpeg = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) jpeg[i] = bin.charCodeAt(i);

  const pw = 432; // points; 4:5 like the image
  const ph = 540;
  const enc = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let len = 0;
  const push = (b: Uint8Array) => {
    chunks.push(b);
    len += b.length;
  };
  const text = (t: string) => push(enc.encode(t));
  const obj = (n: number, body: string) => {
    offsets[n] = len;
    text(`${n} 0 obj\n${body}\nendobj\n`);
  };

  text("%PDF-1.4\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`);
  const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  obj(4, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  offsets[5] = len;
  text(`5 0 obj\n<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
  push(jpeg);
  text("\nendstream\nendobj\n");
  const xref = len;
  text(`xref\n0 6\n0000000000 65535 f \n`);
  for (let n = 1; n <= 5; n++) text(`${String(offsets[n]).padStart(10, "0")} 00000 n \n`);
  text(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);

  const out = new Uint8Array(len);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return new Blob([out], { type: "application/pdf" });
}

/** Opens the phone's share sheet with the PDF when it can; otherwise downloads it. */
export async function sharePdf(file: File, text: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text });
      return "shared";
    } catch (e) {
      if ((e as Error).name === "AbortError") return "cancelled";
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "downloaded";
}
