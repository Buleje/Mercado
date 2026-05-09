import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";

/**
 * POST /api/compliance/data-export
 *
 * Ley 29733 Art. 18-20 — Derecho de acceso a datos personales.
 *
 * Genera un export completo de TODOS los datos personales de un cliente
 * identificado por DNI/documento. Incluye: datos de perfil, pedidos,
 * ventas, fiados, pagos, ubicaciones, notificaciones, facturas.
 *
 * Auth: requireAdmin ["admin"] (solo el administrador puede exportar)
 * Rate limit: 10 req/hora por tenant (via header check)
 * Audit: se registra cada exportación en ActivityLog
 */

const ExportSchema = z.object({
  dni: z
    .string()
    .min(8, "DNI debe tener al menos 8 caracteres")
    .max(15, "Documento no puede exceder 15 caracteres"),
  tenantId: z.string().min(1, "tenantId es obligatorio"),
});

// Simple in-memory rate limiter (per tenant, 10 req/hour)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(tenantId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(tenantId);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(tenantId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "compliance-data-export"); if (_rl) return _rl;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: "Cuerpo de solicitud inválido" },
      { status: 400 },
    );
  }

  const parsed = ExportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { dni, tenantId } = parsed.data;

  // Enforce tenantId matches session (CLAUDE.md rule #3)
  if (tenantId !== auth.tenantId) {
    return NextResponse.json(
      { error: "No autorizado para este tenant" },
      { status: 403 },
    );
  }

  // Rate limit check
  if (!checkRateLimit(tenantId)) {
    return NextResponse.json(
      {
        error: "Límite de solicitudes excedido",
        message: "Máximo 10 exportaciones por hora por tenant",
      },
      { status: 429 },
    );
  }

  try {
    // Find customer by documento (DNI) within this tenant
    const customer = await prisma.customer.findFirst({
      where: {
        tenantId,
        documento: dni,
      },
    });

    if (!customer) {
      return NextResponse.json(
        {
          error: "Cliente no encontrado",
          message: `No se encontró un cliente con documento ${dni} en este tenant`,
        },
        { status: 404 },
      );
    }

    // Fetch ALL related data in parallel
    const [orders, sales, fiados, savedLocations, notifications, sunatInvoices, prestamos] =
      await Promise.all([
        prisma.order.findMany({
          where: { tenantId, customerPhone: customer.phone },
          include: { items: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.sale.findMany({
          where: { tenantId, customerPhone: customer.phone },
          include: { items: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.fiado.findMany({
          where: { tenantId, customerId: customer.phone },
          include: { cuotas: true },
          orderBy: { createdAt: "desc" },
        }),
        // Customer.phone es @id global y SavedLocation no tiene tenantId
        // (relación directa por phone). Customer es global, tenantId es solo
        // referencia informativa. Confirmé que customer.phone único = OK.
        prisma.savedLocation.findMany({
          where: { customerPhone: customer.phone },
        }),
        prisma.customerNotification.findMany({
          where: { tenantId, customerPhone: customer.phone },
          orderBy: { createdAt: "desc" },
          take: 100,
        }),
        prisma.sunatInvoice.findMany({
          where: { tenantId, customerRuc: customer.documento },
          orderBy: { createdAt: "desc" },
        }),
        prisma.prestamo.findMany({
          where: { tenantId, customerId: customer.phone },
          orderBy: { createdAt: "desc" },
        }),
      ]);

    const exportData = {
      metadata: {
        exportDate: new Date().toISOString(),
        legalBasis: "Ley 29733 Art. 18-20 — Derecho de acceso",
        requestedBy: auth.username,
        tenantId,
        customerDocument: dni,
      },
      personalData: {
        phone: customer.phone,
        name: customer.name,
        email: customer.email,
        tipoDocumento: customer.tipoDocumento,
        documento: customer.documento,
        tipoPersona: customer.tipoPersona,
        razonSocial: customer.razonSocial,
        location: customer.location,
        reference: customer.reference,
        departamento: customer.departamento,
        provincia: customer.provincia,
        distrito: customer.distrito,
        direccion: customer.direccion,
        whatsappSecundario: customer.whatsappSecundario,
        birthday: customer.birthday,
        fechaNacimiento: customer.fechaNacimiento,
        genero: customer.genero,
        comoLlego: customer.comoLlego,
        observaciones: customer.observaciones,
        privateNotes: customer.privateNotes,
        aiNotes: customer.aiNotes,
        categoria: customer.categoria,
        canal: customer.canal,
        createdAt: customer.createdAt,
        updatedAt: customer.updatedAt,
      },
      commercialData: {
        loyaltyPoints: customer.loyaltyPoints,
        loyaltyTier: customer.loyaltyTier,
        totalSpent: customer.totalSpent,
        creditBalance: customer.creditBalance,
        creditLimit: customer.creditLimit,
        listaPrecio: customer.listaPrecio,
        tags: customer.tags,
        referralCode: customer.referralCode,
        referredBy: customer.referredBy,
      },
      preferences: {
        notifOrderUpdates: customer.notifOrderUpdates,
        notifPromotions: customer.notifPromotions,
        notifRestock: customer.notifRestock,
        alertasWhatsapp: customer.alertasWhatsapp,
      },
      savedLocations,
      orders: orders.map((o) => ({
        id: o.id,
        total: o.total,
        status: o.status,
        paymentMethod: o.paymentMethod,
        notes: o.notes,
        source: o.source,
        createdAt: o.createdAt,
        items: o.items.map((i) => ({
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          unit: i.unit,
        })),
      })),
      sales: sales.map((s) => ({
        id: s.id,
        total: s.total,
        payment: s.payment,
        comprobanteTipo: s.comprobanteTipo,
        createdAt: s.createdAt,
        items: s.items.map((i) => ({
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          unit: i.unit,
        })),
      })),
      fiados: fiados.map((f) => ({
        id: f.id,
        total: f.total,
        saldo: f.saldo,
        status: f.status,
        descripcion: f.descripcion,
        fechaVence: f.fechaVence,
        createdAt: f.createdAt,
        cuotas: f.cuotas.map((c) => ({
          monto: c.monto,
          pagadoEn: c.pagadoEn,
          notas: c.notas,
        })),
      })),
      prestamos: prestamos.map((p) => ({
        id: p.id,
        monto: p.monto,
        status: p.status,
        createdAt: p.createdAt,
      })),
      invoices: sunatInvoices.map((inv) => ({
        id: inv.id,
        type: inv.type,
        series: inv.series,
        number: inv.number,
        total: inv.total,
        sunatStatus: inv.sunatStatus,
        createdAt: inv.createdAt,
      })),
      notifications: notifications.map((n) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        read: n.read,
        createdAt: n.createdAt,
      })),
    };

    // Fire-and-forget audit log (CLAUDE.md rule #7)
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    prisma.activityLog
      .create({
        data: {
          action: "DATA_EXPORT",
          entity: "[L29733] Customer",
          entityId: customer.phone,
          detail: JSON.stringify({
            ley29733: true,
            article: "Art. 18-20",
            right: "Derecho de acceso",
            documento: dni,
            exportedTables: [
              "Customer",
              "Order",
              "Sale",
              "Fiado",
              "Prestamo",
              "SunatInvoice",
              "SavedLocation",
              "CustomerNotification",
            ],
            recordCounts: {
              orders: orders.length,
              sales: sales.length,
              fiados: fiados.length,
              prestamos: prestamos.length,
              invoices: sunatInvoices.length,
              notifications: notifications.length,
              savedLocations: savedLocations.length,
            },
          }),
          user: auth.username,
          ipAddress: ip,
          tenantId,
        },
      })
      .catch(() => {
      /* fire-and-forget per CLAUDE.md rule #7 */
    });

    logger.info("[COMPLIANCE] Data export completed", {
      tenantId,
      documento: dni,
      requestedBy: auth.username,
    });

    return NextResponse.json(exportData);
  } catch (error) {
    logger.error("[COMPLIANCE] Data export failed", {
      tenantId,
      dni,
      error: String(error),
    });
    return NextResponse.json(
      { error: "Error al exportar datos del cliente" },
      { status: 500 },
    );
  }
}
