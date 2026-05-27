import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/delivery/partner-session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { applyRateLimit } from "@/lib/rate-limit";
import { logActivity } from "@/lib/activity-logger";
import { logger } from "@/lib/logger";

/**
 * POST /api/delivery/assignments/[id]/deliver
 *
 * El repartidor entrega el pedido con foto de prueba en un solo paso.
 * Body: multipart/form-data con campo "photo" (File).
 *
 * Flujo:
 *   1. Validar auth (requirePartner) + ownership + estado in_transit.
 *   2. Validar archivo: max 5MB, mime image/jpeg|png|webp|heic.
 *   3. Optimizar con sharp (800px max, webp q78, corregir EXIF).
 *   4. Subir a Supabase Storage bucket "media".
 *   5. Tx: persistir proofPhotoUrl en assignment + deliveredAt +
 *      Order.status = "entregado" + liberar partner.currentOrderId.
 *   6. Response: { ok, status: "entregado", proofPhotoUrl }.
 *
 * Auth: cookie buleje-partner-sess.
 */

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const BUCKET = "media";
const MAX_WIDTH = 800;

const ParamsSchema = z.object({ id: z.string().min(1) });

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePartner(req);
  if (session instanceof NextResponse) return session;

  const rl = await applyRateLimit(req, "STRICT", "delivery-deliver-upload");
  if (rl) return rl;

  const rawParams = await params;
  const parsedParams = ParamsSchema.safeParse(rawParams);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Params inválidos" }, { status: 400 });
  }
  const { id: assignmentId } = parsedParams.data;

  // SECURITY 2026-05-06 (audit team): defense-in-depth tenantId scope.
  // Antes findUnique solo validaba partnerId; si por bug del flow un partner
  // obtuviera un assignmentId de otro tenant donde tiene mismo partnerId
  // (improbable pero posible), podría operar sobre assignment ajeno.
   
  const assignment = await prisma.deliveryAssignment.findFirst({
    where: { id: assignmentId, tenantId: session.tenantId },
    select: {
      id: true,
      partnerId: true,
      orderId: true,
      tenantId: true,
      status: true,
    },
  });

  if (!assignment || assignment.partnerId !== session.partnerId) {
    return NextResponse.json({ error: "Assignment no encontrado" }, { status: 404 });
  }
  if (assignment.status === "delivered" || assignment.status === "cancelled") {
    return NextResponse.json({ error: "Pedido ya cerrado" }, { status: 409 });
  }
  if (assignment.status !== "in_transit") {
    return NextResponse.json(
      { error: `Iniciá la ruta antes de entregar (estado actual: ${assignment.status})` },
      { status: 409 },
    );
  }

  // Parsear multipart
  let file: File | null;
  try {
    const formData = await req.formData();
    file = (formData.get("photo") ?? formData.get("file")) as File | null;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ error: "Falta el campo 'photo'" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Tipo no permitido: ${file.type}. Usá JPG, PNG, WebP o HEIC.` },
      { status: 400 },
    );
  }
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: `Foto muy grande (${(file.size / 1024 / 1024).toFixed(1)} MB). Máx 5 MB.` },
      { status: 400 },
    );
  }

  // SECURITY 2026-05-07 (CRM-SEC F5): validar magic bytes para evitar que un
  // atacante suba un archivo malicioso con Content-Type falso (polyglot attack).
  // JPEG: FF D8 FF | PNG: 89 50 4E 47 | WebP: RIFF????WEBP | HEIC: ftypheic @ offset 4
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const isJpeg = fileBuffer[0] === 0xFF && fileBuffer[1] === 0xD8 && fileBuffer[2] === 0xFF;
  const isPng  = fileBuffer[0] === 0x89 && fileBuffer[1] === 0x50 && fileBuffer[2] === 0x4E && fileBuffer[3] === 0x47;
  const isWebP = fileBuffer.slice(0, 4).toString("ascii") === "RIFF" &&
                 fileBuffer.slice(8, 12).toString("ascii") === "WEBP";
  const heicFtyp = fileBuffer.slice(4, 12).toString("ascii");
  const isHeic = heicFtyp.startsWith("ftypheic") || heicFtyp.startsWith("ftypmif1") ||
                 heicFtyp.startsWith("ftypmsf1") || heicFtyp.startsWith("ftypheis");
  if (!isJpeg && !isPng && !isWebP && !isHeic) {
    return NextResponse.json(
      { error: "Archivo no reconocido como imagen válida (magic bytes inválidos)." },
      { status: 415 },
    );
  }

  // Optimizar imagen (fileBuffer ya leído arriba para magic bytes)
  let optimized: Buffer;
  try {
    optimized = await sharp(fileBuffer)
      .rotate()
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
  } catch (err) {
    logger.error("[delivery/deliver] sharp failed", { error: String(err) });
    return NextResponse.json({ error: "No pudimos procesar la foto" }, { status: 500 });
  }

  // SECURITY 2026-05-05 (pentest delivery H001+H014): UUID + signed URL.
  const random = (await import("crypto")).randomUUID();
  const path = `delivery-proofs/${assignment.tenantId}/${assignment.orderId}-${random}.webp`;
  let proofPhotoUrl: string;

  try {
    const supabase = getSupabaseAdmin();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, optimized, { contentType: "image/webp", upsert: false });
    if (uploadError) {
      logger.error("[delivery/deliver] supabase upload failed", { error: uploadError.message });
      return NextResponse.json({ error: "Error subiendo la foto" }, { status: 500 });
    }
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60);
    if (signErr || !signed) {
      logger.error("[delivery/deliver] signed URL failed", { error: signErr?.message });
      return NextResponse.json({ error: "Error subiendo la foto" }, { status: 500 });
    }
    proofPhotoUrl = signed.signedUrl;
  } catch (err) {
    logger.error("[delivery/deliver] upload threw", { error: String(err) });
    return NextResponse.json({ error: "Error subiendo la foto" }, { status: 500 });
  }

  // Transaccion: assignment + Order + DeliveryPartner
  try {
    await prisma.$transaction(async (tx) => {
      const now = new Date();

      await tx.deliveryAssignment.update({
        where: { id: assignmentId },
        data: {
          status: "delivered",
          deliveredAt: now,
          proofPhotoUrl,
        },
      });

      await tx.order.update({
        where: { id: assignment.orderId },
        data: {
          status: "entregado",
          deliveredAt: now,
        },
      });

      // Liberar partner
      await tx.deliveryPartner.update({
        where: { id: session.partnerId },
        data: { currentOrderId: null },
      });
    });
  } catch (err) {
    logger.error("[delivery/deliver] tx failed", { error: String(err) });
    return NextResponse.json({ error: "Error al registrar la entrega" }, { status: 500 });
  }

  logger.info("[delivery/deliver] entregado", {
    partnerId: session.partnerId,
    assignmentId,
    orderId: assignment.orderId,
    // SECURITY 2026-05-06: no loggear signed URL (token sensible). Solo path.
    proofPath: path,
  });

  logActivity(
    "delivery_delivered",
    "DeliveryAssignment",
    `Entregado con foto de prueba`,
    assignmentId,
    session.partnerId,
    undefined,
    assignment.tenantId,
  ).catch((err) => logger.error("[delivery/deliver] activity log failed", { error: String(err) }));

  return NextResponse.json({ ok: true, status: "entregado", proofPhotoUrl });
}
