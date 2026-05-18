/**
 * POST /api/marketplace/checkout/payment-proof   (multipart/form-data)
 *
 * Cliente subió foto del Yape/Plin/transferencia ANTES de confirmar el
 * pedido. Validamos imagen, comprimimos con Sharp, subimos a Supabase
 * Storage en `media/order-proofs/...` y devolvemos `{ proofUrl, proofToken }`.
 *
 * El `proofToken` es un cuid corto firmado en memoria que el cliente
 * vuelve a enviar al crear la Order — el endpoint de Orders verifica que
 * el token venga del mismo customerId + slug + método + monto antes de
 * persistirlo en `PaymentApproval.imageUrl`.
 *
 * Requiere sesión de customer (cookie buleje-customer-sess).
 *
 * Distinto a `/api/marketplace/payment-proof`:
 *   - aquel es PRE-tenant (abrir tienda)
 *   - éste es POST-cart, PRE-order (cliente final del marketplace)
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod/v4";
import { randomBytes, createHmac } from "crypto";
import { requireCustomer } from "@/lib/auth/require-customer";
import { getSupabaseAdmin } from "@/lib/supabase";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

const FieldsSchema = z.object({
  storeSlug: z.string().regex(/^[a-z0-9-]{2,64}$/),
  method: z.enum(["yape", "plin", "transfer"]),
  amountPEN: z.coerce.number().min(0.1).max(100000),
  reference: z.string().max(40).optional().nullable(),
});

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const BUCKET = "media";

function validateMagicBytes(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true; // JPEG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true; // PNG
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  )
    return true;
  return false; // HEIC sin magic confiable; lo procesa sharp
}

/**
 * Firma el `proofToken` con HMAC del AUTH_SECRET para que el endpoint de
 * Orders pueda verificar la integridad sin guardar nada en DB.
 *
 * Formato: `${customerId}.${storeSlug}.${method}.${amountCents}.${pathHash}.${sig}`
 */
function signProofToken(input: {
  customerId: string;
  storeSlug: string;
  method: string;
  amountCents: number;
  storagePath: string;
}): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET required");
  const pathHash = createHmac("sha256", secret + "-proof-path")
    .update(input.storagePath)
    .digest("hex")
    .slice(0, 12);
  const base = `${input.customerId}.${input.storeSlug}.${input.method}.${input.amountCents}.${pathHash}`;
  const sig = createHmac("sha256", secret + "-proof-token")
    .update(base)
    .digest("hex")
    .slice(0, 16);
  return `${base}.${sig}`;
}

/**
 * Verifica un proofToken emitido por este endpoint. Re-exportado para que
 * el endpoint de creación de Orders lo use al recibir la confirmación.
 */
export function verifyProofToken(token: string, expected: {
  customerId: string;
  storeSlug: string;
  method: string;
  amountCents: number;
}): { ok: true } | { ok: false; reason: string } {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return { ok: false, reason: "no-secret" };
  const parts = token.split(".");
  if (parts.length !== 6) return { ok: false, reason: "bad-format" };
  const [customerId, storeSlug, method, amountCentsStr, _pathHash, sig] = parts;
  if (
    customerId !== expected.customerId ||
    storeSlug !== expected.storeSlug ||
    method !== expected.method ||
    Number(amountCentsStr) !== expected.amountCents
  ) {
    return { ok: false, reason: "mismatch" };
  }
  const base = `${customerId}.${storeSlug}.${method}.${amountCentsStr}.${_pathHash}`;
  const expectedSig = createHmac("sha256", secret + "-proof-token")
    .update(base)
    .digest("hex")
    .slice(0, 16);
  if (sig !== expectedSig) return { ok: false, reason: "bad-sig" };
  return { ok: true };
}

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "STRICT", "checkout-payment-proof");
  if (rl) return rl;

  const customer = await requireCustomer(req);
  if (customer instanceof NextResponse) return customer;

  // El customer-session no garantiza customerId (phone) — usamos email como
  // identidad estable para firmar el token. La Order se asocia al customerId
  // al confirmar.
  const customerId = customer.customerId ?? customer.email;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "Falta la captura" }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Tipo de archivo no permitido" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: "Captura muy grande (máx 5 MB)" },
      { status: 400 },
    );
  }

  const rawFields = Object.fromEntries(formData.entries());
  delete rawFields.file;
  const parsed = FieldsSchema.safeParse(rawFields);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos incompletos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  let optimized: Buffer;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const isHeic = file.type === "image/heic" || file.type === "image/heif";
    if (!isHeic && !validateMagicBytes(buf)) {
      return NextResponse.json(
        { error: "Tipo de archivo no permitido (magic bytes inválidos)" },
        { status: 400 },
      );
    }
    optimized = await sharp(buf)
      .rotate()
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (err) {
    logger.error("[checkout-proof] sharp failed", { error: String(err) });
    return NextResponse.json(
      { error: "No pudimos procesar la imagen" },
      { status: 500 },
    );
  }

  // audit P0 #2 (Brandon 2026-05-18): capturas Yape del cliente final
  // contienen PII (nombre cliente, número operación, teléfono visible en
  // muchas apps). +24 bytes random ofusca el path mientras la dirección
  // sigue siendo bucket `media` (público). Followup: bucket privado
  // dedicado `order-proofs` + presigned 24-48h on-demand.
  const ts = Date.now();
  const rand = randomBytes(24).toString("hex");
  const safeCustomerId = customerId.replace(/[^a-z0-9-]/gi, "");
  // Si safeCustomerId queda demasiado corto (email atípico) usamos solo
  // rand como discriminador. Evita colisiones path.
  const safeId = safeCustomerId.length >= 4
    ? safeCustomerId
    : `cust-${randomBytes(6).toString("hex")}`;
  const storagePath = `order-proofs/${parsed.data.storeSlug}/${safeId}-${ts}-${rand}.webp`;

  let publicUrl: string;
  try {
    const supabase = getSupabaseAdmin();
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, optimized, {
        contentType: "image/webp",
        upsert: false,
      });
    if (upErr) {
      logger.error("[checkout-proof] supabase upload failed", {
        error: upErr.message,
      });
      return NextResponse.json(
        { error: "Error subiendo la imagen" },
        { status: 500 },
      );
    }
    // Signed URL 7d. Fallback graceful a getPublicUrl si la firma falla.
    const SIGNED_TTL_SEC = 7 * 24 * 3600;
    const signed = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_TTL_SEC);
    if (signed.data?.signedUrl) {
      publicUrl = signed.data.signedUrl;
    } else {
      logger.warn("[checkout-proof] signed url failed, falling back to public", {
        error: signed.error?.message,
      });
      publicUrl = supabase.storage
        .from(BUCKET)
        .getPublicUrl(storagePath).data.publicUrl;
    }
  } catch (err) {
    logger.error("[checkout-proof] upload threw", { error: String(err) });
    return NextResponse.json(
      { error: "Error subiendo la imagen" },
      { status: 500 },
    );
  }

  const amountCents = Math.round(parsed.data.amountPEN * 100);
  const proofToken = signProofToken({
    customerId,
    storeSlug: parsed.data.storeSlug,
    method: parsed.data.method,
    amountCents,
    storagePath,
  });

  logger.info("[checkout-proof] uploaded", {
    customerId,
    storeSlug: parsed.data.storeSlug,
    method: parsed.data.method,
    amountCents,
    path: storagePath,
  });

  return NextResponse.json({
    ok: true,
    proofUrl: publicUrl,
    proofToken,
    storagePath,
  });
}
