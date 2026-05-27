import "server-only";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { prisma } from "@/lib/prisma";
import { requirePartner } from "@/lib/delivery/partner-session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

/**
 * POST /api/delivery/me/assignments/[id]/proof
 *
 * El repartidor sube la foto de comprobante de entrega ANTES de marcar
 * el pedido como `delivered`. La foto se redimensiona a 800px max y
 * se guarda en Supabase storage bajo `delivery-proofs/{tenantId}/`.
 *
 * El URL público se persiste en `DeliveryAssignment.notes` como JSON
 * `{ proofPhotoUrl, proofTakenAt }` — evita schema migration en
 * runtime (Brandon mayo 2026: prefer-no-migration en hot path).
 *
 * Auth: cookie `buleje-partner-sess` + el assignment debe ser del
 * partner autenticado.
 */
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB raw — sharp lo achica
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const BUCKET = "media";
const MAX_WIDTH = 800;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requirePartner(req);
  if (session instanceof NextResponse) return session;

  const rl = await applyRateLimit(req, "STRICT", "delivery-proof-upload");
  if (rl) return rl;

  const { id: assignmentId } = await params;

  // Verificar ownership. TODO: extraer a DeliveryAssignmentsDB en lib/db/delivery.db.ts.
   
  const assignment = await prisma.deliveryAssignment.findUnique({
    where: { id: assignmentId },
    select: { partnerId: true, tenantId: true, status: true, notes: true },
  });
  if (!assignment || assignment.partnerId !== session.partnerId) {
    return NextResponse.json({ error: "Assignment no encontrado" }, { status: 404 });
  }
  if (assignment.status === "delivered" || assignment.status === "cancelled") {
    return NextResponse.json({ error: "Pedido ya cerrado" }, { status: 409 });
  }

  let file: File | null;
  try {
    const formData = await req.formData();
    file = formData.get("file") as File | null;
  } catch {
    return NextResponse.json({ error: "Cuerpo inválido" }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ error: "Falta el archivo" }, { status: 400 });
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

  let optimized: Buffer;
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    optimized = await sharp(buffer)
      .rotate() // respetar EXIF orientation (móviles)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
  } catch (err) {
    logger.error("[delivery/proof] sharp failed", { error: String(err) });
    return NextResponse.json({ error: "No pudimos procesar la foto" }, { status: 500 });
  }

  // SECURITY 2026-05-05 (pentest delivery H001+H014): UUID criptográfico + path
  // privado. Antes path determinístico `${assignmentId}-${ts}-${6chars}` con
  // entropy 36^6 (~2B) + bucket público vía getPublicUrl exponía PII de Ley
  // 29733 (DNI, casa, rostro del cliente) por brute-force. Ahora `randomUUID`
  // (122 bits) + se persiste solo el `path` y el GET resuelve URL firmada
  // on-demand (60min) tras re-auth.
  const random = (await import("crypto")).randomUUID();
  const path = `delivery-proofs/${assignment.tenantId}/${assignmentId}-${random}.webp`;

  let publicUrl: string;
  try {
    const supabase = getSupabaseAdmin();
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, optimized, {
        contentType: "image/webp",
        upsert: false,
      });
    if (uploadError) {
      logger.error("[delivery/proof] supabase upload failed", { error: uploadError.message });
      return NextResponse.json({ error: "Error subiendo la foto" }, { status: 500 });
    }
    // SECURITY: signed URL en vez de public — TTL 1h, rotada por GET autenticado.
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 60);
    if (signErr || !signed) {
      logger.error("[delivery/proof] signed URL failed", { error: signErr?.message });
      return NextResponse.json({ error: "Error subiendo la foto" }, { status: 500 });
    }
    publicUrl = signed.signedUrl;
  } catch (err) {
    logger.error("[delivery/proof] upload threw", { error: String(err) });
    return NextResponse.json({ error: "Error subiendo la foto" }, { status: 500 });
  }

  // Persistir en `notes` como JSON. Si ya hay notes con otro JSON,
  // mergeamos (no clobbering).
  let nextNotesObj: Record<string, unknown> = {};
  if (assignment.notes) {
    try {
      const parsed = JSON.parse(assignment.notes);
      if (parsed && typeof parsed === "object") nextNotesObj = parsed as Record<string, unknown>;
    } catch {
      // Notes no era JSON — preservamos como `text`.
      nextNotesObj = { text: assignment.notes };
    }
  }
  nextNotesObj.proofPhotoUrl = publicUrl;
  nextNotesObj.proofPhotoPath = path; // SECURITY: persistir path para re-firmar URL al expirar
  nextNotesObj.proofTakenAt = new Date().toISOString();

  // Ownership validado arriba. TODO: extraer a DeliveryAssignmentsDB.
   
  await prisma.deliveryAssignment.update({
    where: { id: assignmentId },
    data: { notes: JSON.stringify(nextNotesObj) },
  });

  return NextResponse.json({ ok: true, proofPhotoUrl: publicUrl });
}
