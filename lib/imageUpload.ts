/* Turns a chosen photo into a small JPEG data URL (max 480px) so it can be stored with the product. Browser only. */
export async function productImageToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose an image file (PNG or JPG).");
  if (file.size > 15 * 1024 * 1024) throw new Error("That image is too large. Choose one under 15 MB.");
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 480 / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const g = cv.getContext("2d");
  if (!g) throw new Error("Could not process the image.");
  g.fillStyle = "#fff";
  g.fillRect(0, 0, w, h);
  g.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  let q = 0.82;
  let out = cv.toDataURL("image/jpeg", q);
  while (out.length > 180_000 && q > 0.4) {
    q -= 0.1;
    out = cv.toDataURL("image/jpeg", q);
  }
  return out;
}
