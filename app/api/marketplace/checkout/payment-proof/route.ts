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
import * as Sentry from "@sentry/nextjs";

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
// PENTEST-002 (2026-05-18): capturas Yape contienen PII — mover a bucket
// privado `order-proofs`. Se configura vía SUPABASE_PROOF_BUCKET para poder
// apuntar al bucket correcto sin redeploy. El bucket debe existir en Supabase
// con public=false. Ver commit message para instrucciones manuales de Brandon.
const BUCKET = process.env.SUPABASE_PROOF_BUCKET ?? "order-proofs";

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

  // PENTEST-002 cerrado: bucket privado + sin fallback público.
  // Path en bucket privado: no es accesible desde URL pública.
  const ts = Date.now();
  const rand = randomBytes(24).toString("hex");
  const safeCustomerId = customerId.replace(/[^a-z0-9-]/gi, "");
  const safeId = safeCustomerId.length >= 4
    ? safeCustomerId
    : `cust-${randomBytes(6).toString("hex")}`;
  const storagePath = `order-proofs/${parsed.data.storeSlug}/${safeId}-${ts}-${rand}.webp`;

  // PENTEST-002: signed URL corta (7d) para que el cliente pueda ver su
  // captura en el flujo de confirmación. La re-firma on-demand la hace
  // GET /api/marketplace/orders/[id]/proof-url (TTL 30 min, para admins).
  // NO hay fallback a getPublicUrl: si la firma falla, devolvemos 500.
  const INITIAL_SIGNED_TTL_SEC = 7 * 24 * 3600; // 7 días — flujo de confirmación
  let initialSignedUrl: string;
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
        bucket: BUCKET,
      });
      return NextResponse.json(
        { error: "Error subiendo la imagen" },
        { status: 500 },
      );
    }
    const signed = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, INITIAL_SIGNED_TTL_SEC);
    if (!signed.data?.signedUrl) {
      // Sin fallback público — el bucket es privado y la PII no debe exponerse.
      Sentry.captureException(
        new Error(`[checkout-proof] createSignedUrl failed: ${signed.error?.message ?? "unknown"}`),
        { extra: { storagePath, bucket: BUCKET } },
      );
      logger.error("[checkout-proof] createSignedUrl failed — PENTEST-002 no-fallback", {
        error: signed.error?.message,
        storagePath,
        bucket: BUCKET,
      });
      return NextResponse.json(
        { error: "Error generando URL segura para la imagen" },
        { status: 500 },
      );
    }
    initialSignedUrl = signed.data.signedUrl;
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

  logger.info("[checkout-proof] uploaded — bucket privado", {
    customerId,
    storeSlug: parsed.data.storeSlug,
    method: parsed.data.method,
    amountCents,
    path: storagePath,
    bucket: BUCKET,
  });

  return NextResponse.json({
    ok: true,
    proofUrl: initialSignedUrl,
    proofToken,
  });
}
