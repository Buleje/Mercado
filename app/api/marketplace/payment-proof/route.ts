import "server-only";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { z } from "zod";
import { PaymentProofsDB, type PaymentMethod, type BillingCycle } from "@/lib/db/payment-proofs.db";
import { getSupabaseAdmin } from "@/lib/supabase";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

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
const BUCKET = "media";

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
    optimized = await sharp(buf).rotate().resize({ width: 1000, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  } catch (err) {
    logger.error("[payment-proof] sharp failed", { error: String(err) });
    return NextResponse.json({ error: "No pudimos procesar la imagen" }, { status: 500 });
  }

  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const path = `payment-proofs/${parsed.data.tenantSlug}-${ts}-${rand}.webp`;

  let publicUrl: string;
  try {
    const supabase = getSupabaseAdmin();
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, optimized, { contentType: "image/webp", upsert: false });
    if (upErr) {
      logger.error("[payment-proof] supabase upload failed", { error: upErr.message });
      return NextResponse.json({ error: "Error subiendo la imagen" }, { status: 500 });
    }
    publicUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
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
      proofUrl: publicUrl,
      reference: parsed.data.reference ?? null,
    });
    return NextResponse.json({ ok: true, id: proof.id });
  } catch (err) {
    logger.error("[payment-proof] db insert failed", { error: String(err) });
    return NextResponse.json({ error: "No pudimos guardar tu pago" }, { status: 500 });
  }
}
