import type { Customer } from "@/contexts/customer-context";
import type { CartItem } from "@/contexts/cart-context";

/** Minimal item shape required by order utilities — superset of CartItem without requiring category */
type OrderItem = { id: number; name: string; price: number; quantity: number; unit: string; image: string };

 
type _CartItemCompat = CartItem extends OrderItem ? true : false; // compile-time check

// Theme colors
const PC = {
  primaryDark: "#009690",
  primary: "#00B4A6",
  secondary: "#f97316",
  bgLight: "#F0FDF4",
  border: "#D1FAE5",
  text: "#111827",
  muted: "#6B7280",
  light: "#9CA3AF",
};
const FONT = "'Segoe UI', system-ui, -apple-system, sans-serif";

// Google Maps URL
export function googleMapsUrl(location: string): string {
  const match = location.match(/GPS:\s*([-\d.]+),\s*([-\d.]+)/);
  if (match) return `https://maps.google.com/maps?q=${match[1]},${match[2]}`;
  return `https://maps.google.com/maps?q=${encodeURIComponent(location)}`;
}

// WhatsApp plain-text message
export function formatWhatsAppMessage(
  customer: Customer,
  items: OrderItem[],
  total: number
): string {
  const lines = items
    .map((i) => `  - ${i.name} x${i.quantity}  =>  S/ ${(i.price * i.quantity).toFixed(2)}`)
    .join("\n");
  return (
    `*Nuevo Pedido - Buleje*\n\n` +
    `*Cliente:* ${customer.name}\n` +
    `*Ubicacion:* ${customer.location}\n` +
    `*Ver en Maps:* ${googleMapsUrl(customer.location)}\n` +
    `*Referencia:* ${customer.reference}\n\n` +
    `*Pedido:*\n${lines}\n\n` +
    `*Total: S/ ${total.toFixed(2)}*\n\n` +
    `Adjunto la imagen del pedido. Gracias!`
  );
}

// Canvas helpers
function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | number[]
) {
  const radii = Array.isArray(r) ? r : [r, r, r, r];
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radii);
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  // Skip empty, data-URI, or suspiciously long URLs — they won't render on canvas
  if (!src || src.startsWith("data:") || src.length > 800) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    setTimeout(() => resolve(null), 6000);
    img.src = src;
  });
}

// Receipt PNG - 2-column card grid (extra large text)
export async function generateReceiptBlob(
  customer: Customer,
  items: OrderItem[],
  total: number
): Promise<Blob | null> {
  const productImages = await Promise.all(items.map((i) => loadImage(i.image)));

  const W = 940;
  const PAD = 20;
  const GAP = 16;
  const COLS = 2;
  const INNER_W = W - PAD * 2;
  const CARD_W = (INNER_W - GAP) / 2;
  const IMG_H = 200;
  // INFO_H must fit: name(38) + gap(10) + pill(32) + gap(14) + divider + gap(14) + price row(54)
  const INFO_H = 178;
  const CARD_H = IMG_H + INFO_H;
  const TOP_BAR_H = 76;
  const FOOTER_H = 86;
  const V_GAP = 18;

  const rows = Math.ceil(items.length / COLS);
  const totalH =
    TOP_BAR_H +
    GAP +
    rows * (CARD_H + V_GAP) -
    V_GAP +
    GAP +
    FOOTER_H +
    PAD;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = totalH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Background
  ctx.fillStyle = "#ECF4EF";
  ctx.fillRect(0, 0, W, totalH);

  // TOP BAR
  const tGrad = ctx.createLinearGradient(0, 0, W, 0);
  tGrad.addColorStop(0, PC.primaryDark);
  tGrad.addColorStop(0.6, PC.primary);
  tGrad.addColorStop(1, PC.primaryDark);
  ctx.fillStyle = tGrad;
  ctx.fillRect(0, 0, W, TOP_BAR_H);

  // Accent stripe
  const stripe = ctx.createLinearGradient(0, 0, W, 0);
  stripe.addColorStop(0, PC.primary);
  stripe.addColorStop(0.5, PC.secondary);
  stripe.addColorStop(1, PC.primary);
  ctx.fillStyle = stripe;
  ctx.fillRect(0, TOP_BAR_H - 4, W, 4);

  ctx.fillStyle = "#fff";
  ctx.font = `bold 26px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("Buleje", PAD + 10, TOP_BAR_H / 2 - 9);
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.font = `15px ${FONT}`;
  ctx.fillText(`${items.length} producto${items.length !== 1 ? "s" : ""}`, PAD + 10, TOP_BAR_H / 2 + 15);

  ctx.fillStyle = PC.secondary;
  ctx.font = `bold 32px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(`S/ ${total.toFixed(2)}`, W - PAD - 10, TOP_BAR_H / 2 - 9);
  ctx.fillStyle = "rgba(255,255,255,0.60)";
  ctx.font = `14px ${FONT}`;
  ctx.fillText(customer.name, W - PAD - 10, TOP_BAR_H / 2 + 15);

  // CARD GRID
  const startY = TOP_BAR_H + GAP;

  items.forEach((item, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const cx = PAD + col * (CARD_W + GAP);
    const cy = startY + row * (CARD_H + V_GAP);
    const pImg = productImages[i];

    // Card drop shadow
    ctx.fillStyle = "rgba(0,0,0,0.07)";
    rr(ctx, cx + 2, cy + 4, CARD_W, CARD_H, 16);
    ctx.fill();

    // Card background
    ctx.fillStyle = "#ffffff";
    rr(ctx, cx, cy, CARD_W, CARD_H, 16);
    ctx.fill();

    // ---- IMAGE (cover-fit, rounded top) ----
    ctx.save();
    rr(ctx, cx, cy, CARD_W, IMG_H, [16, 16, 0, 0]);
    ctx.clip();

    if (pImg) {
      const iAspect = pImg.naturalWidth / pImg.naturalHeight;
      const cAspect = CARD_W / IMG_H;
      let sx = 0, sy = 0, sw = pImg.naturalWidth, sh = pImg.naturalHeight;
      if (iAspect > cAspect) {
        sw = pImg.naturalHeight * cAspect;
        sx = (pImg.naturalWidth - sw) / 2;
      } else {
        sh = pImg.naturalWidth / cAspect;
        sy = (pImg.naturalHeight - sh) / 2;
      }
      ctx.drawImage(pImg, sx, sy, sw, sh, cx, cy, CARD_W, IMG_H);
    } else {
      const pg = ctx.createLinearGradient(cx, cy, cx + CARD_W, cy + IMG_H);
      pg.addColorStop(0, PC.bgLight);
      pg.addColorStop(1, PC.border);
      ctx.fillStyle = pg;
      ctx.fillRect(cx, cy, CARD_W, IMG_H);
      ctx.fillStyle = PC.primary;
      ctx.font = `bold 72px ${FONT}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(item.name.charAt(0).toUpperCase(), cx + CARD_W / 2, cy + IMG_H / 2);
    }
    ctx.restore();

    // Image bottom fade
    const fade = ctx.createLinearGradient(cx, cy + IMG_H - 55, cx, cy + IMG_H);
    fade.addColorStop(0, "rgba(0,0,0,0)");
    fade.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = fade;
    ctx.fillRect(cx, cy + IMG_H - 55, CARD_W, 55);

    // Quantity badge — top-right
    const BW = 84, BH = 48;
    const BX = cx + CARD_W - BW - 10;
    const BY = cy + 10;
    ctx.fillStyle = "rgba(27,67,50,0.92)";
    rr(ctx, BX, BY, BW, BH, 13);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold 34px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`x${item.quantity}`, BX + BW / 2, BY + BH / 2);

    // ---- INFO SECTION ----
    const infoY = cy + IMG_H;
    const IP = 14;

    // Product name — 30px bold
    ctx.fillStyle = PC.text;
    ctx.font = `bold 30px ${FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const maxNameW = CARD_W - IP * 2;
    let name = item.name;
    while (ctx.measureText(name).width > maxNameW && name.length > 2)
      name = name.slice(0, -1);
    if (name !== item.name) name = name.slice(0, -1) + "...";
    ctx.fillText(name, cx + IP, infoY + 12);

    // Unit pill badge — 15px bold
    ctx.font = `bold 15px ${FONT}`;
    const pillLabel = `por ${item.unit}`;
    const pillW = ctx.measureText(pillLabel).width + 20;
    ctx.fillStyle = `${PC.primary}22`;
    rr(ctx, cx + IP, infoY + 52, pillW, 28, 7);
    ctx.fill();
    ctx.fillStyle = PC.primary;
    ctx.textBaseline = "middle";
    ctx.fillText(pillLabel, cx + IP + 10, infoY + 66);

    // Divider line
    const divY = infoY + INFO_H - 80;
    ctx.strokeStyle = "#E0E0E0";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx + IP, divY);
    ctx.lineTo(cx + CARD_W - IP, divY);
    ctx.stroke();

    // Unit price — 22px bold muted (left)
    ctx.fillStyle = PC.muted;
    ctx.font = `bold 22px ${FONT}`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`S/ ${item.price.toFixed(2)} c/u`, cx + IP, divY + 40);

    // Subtotal — 46px bold green (right)
    ctx.fillStyle = PC.primary;
    ctx.font = `bold 46px ${FONT}`;
    ctx.textAlign = "right";
    ctx.fillText(`S/ ${(item.price * item.quantity).toFixed(2)}`, cx + CARD_W - IP, divY + 40);
  });

  // ---- FOOTER ----
  const footerY = TOP_BAR_H + GAP + rows * (CARD_H + V_GAP) - V_GAP + GAP;

  const totalGrad = ctx.createLinearGradient(0, footerY, W, footerY);
  totalGrad.addColorStop(0, PC.primaryDark);
  totalGrad.addColorStop(1, PC.primary);
  rr(ctx, PAD, footerY, INNER_W, FOOTER_H, 16);
  ctx.fillStyle = totalGrad;
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.40)";
  ctx.font = `bold 16px ${FONT}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`${items.length} producto${items.length !== 1 ? "s" : ""}`, PAD + 20, footerY + FOOTER_H / 2);

  ctx.fillStyle = "rgba(255,255,255,0.35)";
  ctx.font = `bold 16px ${FONT}`;
  ctx.textAlign = "center";
  ctx.fillText("TOTAL A PAGAR", W / 2, footerY + FOOTER_H / 2);

  ctx.fillStyle = PC.secondary;
  ctx.font = `bold 44px ${FONT}`;
  ctx.textAlign = "right";
  ctx.fillText(`S/ ${total.toFixed(2)}`, W - PAD - 20, footerY + FOOTER_H / 2);

  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
}

// Main send function
export type SendResult = "shared" | "clipboard" | "fallback";

export async function sendOrder(
  customer: Customer,
  items: OrderItem[],
  total: number
): Promise<SendResult> {
  const plainText = formatWhatsAppMessage(customer, items, total);
  const waUrl = `https://wa.me/51916409675?text=${encodeURIComponent(plainText)}`;
  const safeName = customer.name.replace(/\s+/g, "-");
  const filename = `Pedido-Buleje-${safeName}.png`;

  // Check mobile share capability before any async (within gesture context)
  const testFile = new File([""], "test.png", { type: "image/png" });
  const canShareFiles =
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [testFile] });

  // Open WhatsApp on desktop before async (popup blocker safe)
  if (!canShareFiles) {
    window.open(waUrl, "_blank", "noopener");
  }

  const pngBlob = await generateReceiptBlob(customer, items, total);
  if (!pngBlob) {
    if (canShareFiles) window.open(waUrl, "_blank", "noopener");
    return "fallback";
  }

  const pngFile = new File([pngBlob], filename, { type: "image/png" });

  if (canShareFiles) {
    try {
      await navigator.share({
        files: [pngFile],
        title: `Pedido Buleje - ${customer.name}`,
        text: plainText,
      });
      return "shared";
    } catch {
      window.open(waUrl, "_blank", "noopener");
      return "fallback";
    }
  }

  // Desktop: copy image to clipboard -> paste in WhatsApp Web
  try {
    await navigator.clipboard.write([
      new ClipboardItem({ "image/png": pngBlob }),
    ]);
    return "clipboard";
  } catch {
    const url = URL.createObjectURL(pngBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 300);
    return "fallback";
  }
}