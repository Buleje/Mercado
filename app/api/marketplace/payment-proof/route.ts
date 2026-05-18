import "server-only";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { randomBytes } from "crypto";
import { PaymentProofsDB, type PaymentMethod, type BillingCycle } from "@/lib/db/payment-proofs.db";
import { getSupabaseAdmin } from "@/lib/supabase";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";

/**
 * POST /api/marketplace/payment-proof  (multipart/form-data)
 *
 * Cliente termina el form de registro (Yape/Plin/transfer), sube la
 * captura del pago + datos del registro. El sistema persiste en
 * PaymentProof con status="pending" y el superadmin lo revisa después.
 *
 * Campos:
 *   - file: archivo imagen (JPG/PNG/WebP/HEIC, ≤ 5 MB)
 *   - tenantSlug, ownerName, ownerPhone, ownerEmail (opt), storeName,
 *     category, departamento (opt), provincia (opt), distrito (opt),
 *     direccion (opt), planTier, billingCycle, amountPEN, method,
 *     reference (opt — N° operación que aparece en la captura)
 */
const SchemaFields = z.object({
  tenantSlug: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/),
  ownerName: z.string().min(2).max(120),
  ownerPhone: z.string().min(7).max(20),
  ownerEmail: z.string().email().optional().nullable(),
  storeName: z.string().min(2).max(120),
  category: z.string().min(2).max(40),
  departamento: z.string().optional().nullable(),
  provincia: z.string().optional().nullable(),
  distrito: z.string().optional().nullable(),
  direccion: z.string().optional().nullable(),
  planTier: z.enum(["basico", "pro", "enterprise", "max"]),
  billingCycle: z.enum(["mensual", "anual"]),
  amountPEN: z.coerce.number().min(1).max(100000),
  method: z.enum(["yape", "plin", "transfer"]),
  reference: z.string().optional().nullable(),
});

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
// PENTEST-002 (2026-05-18): bucket privado para PII de comprobantes.
// Mismo env var que checkout/payment-proof para consistencia.
const BUCKET = process.env.SUPABASE_PROOF_BUCKET ?? "order-proofs";

/**
 * F5: Validar magic bytes — el Content-Type puede ser spoofed fácilmente.
 * Leemos los primeros 12 bytes del buffer para confirmar el formato real.
 */
function validateMagicBytes(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
  // WebP: RIFF????WEBP (bytes 0-3 = RIFF, bytes 8-11 = WEBP)
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return true;
  // HEIC/HEIF: no tienen magic bytes fijos confiables — aceptamos y dejamos que sharp lo valide
  return false;
}

export async function POST(req: NextRequest) {
  const rl = await applyRateLimit(req, "STRICT", "payment-proof-upload");
  if (rl) return rl;

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
    return NextResponse.json({ error: "Captura muy grande (máx 5 MB)" }, { status: 400 });
  }

  const fields = Object.fromEntries(formData.entries());
  delete fields.file;
  const parsed = SchemaFields.safeParse(fields);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Datos incompletos", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  // Optimizar imagen
  let optimized: Buffer;
  try {
    const buf = Buffer.from(await file.arrayBuffer());

    // F5: validar magic bytes reales (el Content-Type del cliente puede estar spoofed)
    const isHeic = file.type === "image/heic" || file.type === "image/heif";
    if (!isHeic && !validateMagicBytes(buf)) {
      return NextResponse.json({ error: "Tipo de archivo no permitido (magic bytes inválidos)" }, { status: 400 });
    }

    optimized = await sharp(buf).rotate().resize({ width: 1000, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  } catch (err) {
    logger.error("[payment-proof] sharp failed", { error: String(err) });
    return NextResponse.json({ error: "No pudimos procesar la imagen" }, { status: 500 });
  }

  // PENTEST-002 cerrado: bucket privado `order-proofs` (sin acceso público).
  const ts = Date.now();
  const rand = randomBytes(24).toString("hex");
  const path = `payment-proofs/${parsed.data.tenantSlug}-${ts}-${rand}.webp`;

  // PENTEST-002: sin fallback a getPublicUrl. Bucket privado obligatorio.
  const SIGNED_TTL_SEC = 7 * 24 * 3600; // 7 días para revisión de superadmin
  let proofUrl: string;
  try {
    const supabase = getSupabaseAdmin();
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, optimized, { contentType: "image/webp", upsert: false });
    if (upErr) {
      logger.error("[payment-proof] supabase upload failed", {
        error: upErr.message,
        bucket: BUCKET,
      });
      return NextResponse.json({ error: "Error subiendo la imagen" }, { status: 500 });
    }
    const signed = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, SIGNED_TTL_SEC);
    if (!signed.data?.signedUrl) {
      // Sin fallback público — PII protegida, Ley 29733.
      Sentry.captureException(
        new Error(`[payment-proof] createSignedUrl failed: ${signed.error?.message ?? "unknown"}`),
        { extra: { path, bucket: BUCKET } },
      );
      logger.error("[payment-proof] createSignedUrl failed — PENTEST-002 no-fallback", {
        error: signed.error?.message,
        path,
        bucket: BUCKET,
      });
      return NextResponse.json(
        { error: "Error generando URL segura para la imagen" },
        { status: 500 },
      );
    }
    proofUrl = signed.data.signedUrl;
  } catch (err) {
    logger.error("[payment-proof] upload threw", { error: String(err) });
    return NextResponse.json({ error: "Error subiendo la imagen" }, { status: 500 });
  }

  try {
    const proof = await PaymentProofsDB.create({
      tenantSlug: parsed.data.tenantSlug,
      ownerName: parsed.data.ownerName,
      ownerPhone: parsed.data.ownerPhone,
      ownerEmail: parsed.data.ownerEmail ?? null,
      storeName: parsed.data.storeName,
      category: parsed.data.category,
      departamento: parsed.data.departamento ?? null,
      provincia: parsed.data.provincia ?? null,
      distrito: parsed.data.distrito ?? null,
      direccion: parsed.data.direccion ?? null,
      planTier: parsed.data.planTier,
      billingCycle: parsed.data.billingCycle as BillingCycle,
      amountPEN: parsed.data.amountPEN,
      method: parsed.data.method as PaymentMethod,
      proofUrl: proofUrl,
      reference: parsed.data.reference ?? null,
    });
    return NextResponse.json({ ok: true, id: proof.id });
  } catch (err) {
    logger.error("[payment-proof] db insert failed", { error: String(err) });
    return NextResponse.json({ error: "No pudimos guardar tu pago" }, { status: 500 });
  }
}
