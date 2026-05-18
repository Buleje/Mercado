/**
 * GET /api/marketplace/orders/[id]/proof-url
 *
 * Re-firma la URL del comprobante de pago (Yape/Plin/Transferencia) de una
 * orden. El bucket `order-proofs` es privado (PENTEST-002): las imágenes no
 * tienen URL pública permanente.
 *
 * Auth: customer dueño del pedido O admin/manager del mismo tenant.
 *   - Customer: sesión cookie `buleje-customer-sess`, solo puede ver sus propios pedidos.
 *   - Admin: sesión de admin, debe pertenecer al mismo tenant que la orden.
 *
 * Rate limit: MODERATE (20 req / 5 min por IP) — endpoint para modal de
 * aprobación del admin, no es un hot-path de storefront.
 *
 * Response: { url: string, expiresAt: string (ISO) }
 * TTL de la URL re-firmada: 30 minutos (suficiente para revisar en el modal).
 */

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { requireCustomer } from "@/lib/auth/require-customer";
import { getSupabaseAdmin } from "@/lib/supabase";
import { applyRateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import * as Sentry from "@sentry/nextjs";
import { prisma } from "@/lib/prisma";

// TTL de la URL re-firmada: 30 minutos
const SIGNED_TTL_SEC = 30 * 60;

// Bucket privado de comprobantes (debe coincidir con el de upload)
const BUCKET = process.env.SUPABASE_PROOF_BUCKET ?? "order-proofs";

/**
 * Extrae el storagePath relativo de una URL signed de Supabase Storage.
 *
 * Formato Supabase signed URL:
 *   https://<project>.supabase.co/storage/v1/object/sign/<bucket>/<path...>?token=...
 *
 * También soporta URLs públicas (bucket `media` legacy):
 *   https://<project>.supabase.co/storage/v1/object/public/<bucket>/<path...>
 *
 * Retorna el path relativo dentro del bucket, o null si no es reconocible.
 */
function extractStoragePath(imageUrl: string): string | null {
  try {
    const url = new URL(imageUrl);
    const pathname = url.pathname;

    // Signed: /storage/v1/object/sign/<bucket>/<path>
    const signMatch = pathname.match(/^\/storage\/v1\/object\/sign\/[^/]+\/(.+)$/);
    if (signMatch?.[1]) return decodeURIComponent(signMatch[1]);

    // Public (legacy bucket media): /storage/v1/object/public/<bucket>/<path>
    const publicMatch = pathname.match(/^\/storage\/v1\/object\/public\/[^/]+\/(.+)$/);
    if (publicMatch?.[1]) return decodeURIComponent(publicMatch[1]);

    return null;
  } catch {
    return null;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const rl = await applyRateLimit(req, "MODERATE", "proof-url-resign");
  if (rl) return rl;

  const { id } = await params;

  // Intentar auth como admin primero, luego como customer.
  // Dos paths separados para RBAC correcto.
  const adminAuth = await requireAdmin(req, ["owner", "admin", "manager"]).catch(() => null);
  const customerAuth = adminAuth instanceof NextResponse || adminAuth === null
    ? await requireCustomer(req)
    : null;

  // Determinar identidad autenticada
  let authTenantId: string | null = null;
  let authCustomerId: string | null = null;
  let isAdmin = false;

  if (adminAuth && !(adminAuth instanceof NextResponse)) {
    authTenantId = adminAuth.tenantId;
    isAdmin = true;
  } else if (customerAuth && !(customerAuth instanceof NextResponse)) {
    authTenantId = customerAuth.tenantId ?? null;
    authCustomerId = customerAuth.customerId ?? customerAuth.email ?? null;
  } else {
    // Ninguna sesión válida
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Leer la orden con scope de tenant. Order NO tiene relación Prisma a
  // PaymentApproval (solo FK escalar paymentApprovalId), así que consultamos
  // PaymentApproval por separado.
  let order: {
    id: string;
    tenantId: string;
    customerPhone: string | null;
    paymentApprovalId: string | null;
  } | null;

  try {
    // eslint-disable-next-line no-restricted-properties -- @prisma-direct ok: tenant guard explícito abajo y no hay clase DB dedicada
    order = await prisma.order.findFirst({
      where: {
        id,
        ...(authTenantId ? { tenantId: authTenantId } : {}),
        deletedAt: null,
      },
      select: {
        id: true,
        tenantId: true,
        customerPhone: true,
        paymentApprovalId: true,
      },
    });
  } catch (err) {
    logger.error("[proof-url] db read failed", { error: String(err), orderId: id });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }

  if (!order) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  // Guard para customer: solo puede ver sus propios pedidos.
  // En CustomerPayload, `customerId` ES el Customer.phone (ver lib/auth/customer-session.ts:27).
  if (!isAdmin && authCustomerId) {
    const customerSession = customerAuth as Exclude<typeof customerAuth, NextResponse | null>;
    const sessionPhone = customerSession?.customerId ?? null;
    const sessionEmail = customerSession?.email ?? null;
    const orderPhone = order.customerPhone ?? null;

    const phoneMatch = sessionPhone && orderPhone && sessionPhone === orderPhone;
    const emailAsPhone = sessionEmail === order.customerPhone;
    if (!phoneMatch && !emailAsPhone) {
      logger.warn("[proof-url] customer tried to access another customer's order", {
        orderId: id,
        sessionPhone,
        orderPhone,
      });
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  if (!order.paymentApprovalId) {
    return NextResponse.json(
      { error: "Esta orden no tiene comprobante de pago" },
      { status: 404 },
    );
  }

  // eslint-disable-next-line no-restricted-properties -- PaymentApproval no tiene clase DB dedicada todavía
  const approval = await prisma.paymentApproval.findUnique({
    where: { id: order.paymentApprovalId },
    select: { id: true, imageUrl: true, tenantId: true },
  });

  if (!approval || approval.tenantId !== order.tenantId) {
    return NextResponse.json(
      { error: "Comprobante no encontrado" },
      { status: 404 },
    );
  }

  const imageUrl = approval.imageUrl;
  const storagePath = extractStoragePath(imageUrl);

  if (!storagePath) {
    Sentry.captureException(
      new Error(`[proof-url] No se pudo extraer storagePath de imageUrl`),
      { extra: { orderId: id, approvalId: approval.id, imageUrl } },
    );
    logger.error("[proof-url] imageUrl format unrecognized — cannot re-sign", {
      orderId: id,
      approvalId: approval.id,
      imageUrl,
    });
    return NextResponse.json(
      { error: "No se pudo resolver el comprobante de pago" },
      { status: 500 },
    );
  }

  // Re-firmar con TTL corto (30 min — suficiente para el modal de aprobación)
  try {
    const supabase = getSupabaseAdmin();
    const signed = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, SIGNED_TTL_SEC);

    if (!signed.data?.signedUrl) {
      Sentry.captureException(
        new Error(`[proof-url] createSignedUrl failed: ${signed.error?.message ?? "unknown"}`),
        { extra: { storagePath, bucket: BUCKET, orderId: id } },
      );
      logger.error("[proof-url] createSignedUrl failed", {
        error: signed.error?.message,
        storagePath,
        bucket: BUCKET,
        orderId: id,
      });
      return NextResponse.json(
        { error: "No se pudo generar URL de acceso al comprobante" },
        { status: 500 },
      );
    }

    const expiresAt = new Date(Date.now() + SIGNED_TTL_SEC * 1000).toISOString();

    logger.info("[proof-url] re-signed", {
      orderId: id,
      approvalId: approval.id,
      bucket: BUCKET,
      isAdmin,
      expiresAt,
    });

    return NextResponse.json({
      url: signed.data.signedUrl,
      expiresAt,
    });
  } catch (err) {
    logger.error("[proof-url] signing threw", { error: String(err), orderId: id });
    return NextResponse.json(
      { error: "Error generando URL de acceso" },
      { status: 500 },
    );
  }
}
