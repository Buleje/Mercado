import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";
import { runWithAuditContext } from "@/lib/audit/audit-context";

/**
 * POST /api/compliance/data-delete
 *
 * Ley 29733 Art. 21 — Derecho de supresión (eliminación) de datos personales.
 *
 * Implementa soft-delete + anonimización de campos PII con período de gracia
 * de 30 días. NO elimina registros financieros requeridos por SUNAT (boletas,
 * facturas, notas de crédito) — la obligación tributaria prevalece sobre el
 * derecho de supresión (Art. 14.6 Ley 29733).
 *
 * Auth: requireAdmin ["admin"]
 * Audit: se registra cada solicitud de eliminación con motivo
 */

const DeleteSchema = z.object({
  dni: z
    .string()
    .min(8, "DNI debe tener al menos 8 caracteres")
    .max(15, "Documento no puede exceder 15 caracteres"),
  tenantId: z.string().min(1, "tenantId es obligatorio"),
  reason: z
    .string()
    .min(5, "Motivo de eliminación es obligatorio (mín. 5 caracteres)")
    .max(500, "Motivo no puede exceder 500 caracteres"),
});

/** Fields to anonymize (replace with placeholder values) */
const ANONYMIZED_PLACEHOLDER = "[DATOS ELIMINADOS - Ley 29733]";
const ANONYMIZED_PHONE = "0000000000";

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "MODERATE", "compliance-data-delete"); if (_rl) return _rl;
  // Defense-in-depth: el proxy ya valida CSRF para /api/* pero compliance
  // mueve PII sensible — agregamos check explícito en el handler.
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;
  // Round 15 M004: PRIORIDAD MÁX — Ley 29733 art. 21 (derecho de supresión).
  // Cada anonimización debe quedar registrada con admin actor + IP en audit chain.
  return runWithAuditContext(req, `compliance:${auth.username}`, () => deleteHandler(req, auth));
}

async function deleteHandler(
  req: NextRequest,
  auth: { tenantId: string; username: string },
): Promise<NextResponse> {
  const body = await req.json().catch((err) => {
    void err; // body inválido → 400 abajo con mensaje claro.
    return null;
  });
  if (!body) {
    return NextResponse.json(
      { error: "Cuerpo de solicitud inválido" },
      { status: 400 },
    );
  }

  const parsed = DeleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { dni, tenantId, reason } = parsed.data;

  // Enforce tenantId matches session (CLAUDE.md rule #3)
  if (tenantId !== auth.tenantId) {
    return NextResponse.json(
      { error: "No autorizado para este tenant" },
      { status: 403 },
    );
  }

  try {
    // Find customer by documento
    const customer = await prisma.customer.findFirst({
      where: { tenantId, documento: dni },
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

    const now = new Date();
    const gracePeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Track what gets deleted vs retained
    const deletedData: string[] = [];
    const retainedData: Array<{ table: string; reason: string }> = [];

    // Atomicidad Ley 29733 Art. 21: la supresión debe ser completa o no
    // realizarse. Sin $transaction, un fallo intermedio dejaría al cliente
    // anonimizado pero con SavedLocations vivas (estado inconsistente).
    // Timeout 30s holgado: el flujo toca hasta 8 tablas con tenants grandes.
    const { deletedLocationsCount, deletedNotifsCount, anonymizedOrdersCount,
            fiadosCount, prestamosCount, invoicesCount, anonymizedSalesCount } =
      await prisma.$transaction(async (tx) => {
        // 1. Anonymize Customer PII fields (soft-delete)
        await tx.customer.update({
          where: { phone: customer.phone },
          data: {
            name: ANONYMIZED_PLACEHOLDER,
            email: null,
            location: "",
            reference: "",
            whatsappSecundario: null,
            direccion: null,
            departamento: null,
            provincia: null,
            distrito: null,
            lat: null,
            lng: null,
            birthday: null,
            fechaNacimiento: null,
            genero: null,
            comoLlego: null,
            observaciones: null,
            privateNotes: null,
            aiNotes: null,
            aiNotesDate: null,
            razonSocial: null,
            tags: null,
            referralCode: null,
            referredBy: null,
            vendedorAsignado: null,
            estado: "eliminado",
          },
        });

        // 2. Delete saved locations
         
        const dLocations = await tx.savedLocation.deleteMany({
          where: { customerPhone: customer.phone },
        });
         

        // 3. Delete customer notifications
        const dNotifs = await tx.customerNotification.deleteMany({
          where: { tenantId, customerPhone: customer.phone },
        });

        // 4. Anonymize Order customer data (retain order for accounting)
        const aOrders = await tx.order.updateMany({
          where: { tenantId, customerPhone: customer.phone },
          data: {
            customerName: ANONYMIZED_PLACEHOLDER,
            customerLocation: "",
            customerReference: "",
            notes: null,
          },
        });

        // 5. Fiados — anonymize description but retain financial data
        const fiadosList = await tx.fiado.findMany({
          where: { tenantId, customerId: customer.phone },
        });
        if (fiadosList.length > 0) {
          await tx.fiado.updateMany({
            where: { tenantId, customerId: customer.phone },
            data: { descripcion: ANONYMIZED_PLACEHOLDER },
          });
        }

        // 6. Prestamos — retain financial records (solo conteo)
        const prestamosList = await tx.prestamo.findMany({
          where: { tenantId, customerId: customer.phone },
          select: { id: true },
        });

        // 7. SunatInvoice — NEVER delete (SUNAT legal requirement)
        const invoicesList = await tx.sunatInvoice.findMany({
          where: { tenantId, customerRuc: customer.documento },
          select: { id: true },
        });

        // 8. Sales — retain financial records, anonymize customer reference
        const aSales = await tx.sale.updateMany({
          where: { tenantId, customerPhone: customer.phone },
          data: { customerPhone: null },
        });

        return {
          deletedLocationsCount: dLocations.count,
          deletedNotifsCount: dNotifs.count,
          anonymizedOrdersCount: aOrders.count,
          fiadosCount: fiadosList.length,
          prestamosCount: prestamosList.length,
          invoicesCount: invoicesList.length,
          anonymizedSalesCount: aSales.count,
        };
      }, { timeout: 30_000 });

    deletedData.push("Customer: nombre, email, dirección, teléfono secundario, notas, ubicación GPS");
    deletedData.push(`SavedLocation: ${deletedLocationsCount} ubicaciones guardadas`);
    deletedData.push(`CustomerNotification: ${deletedNotifsCount} notificaciones`);
    deletedData.push(`Order: datos personales anonimizados en ${anonymizedOrdersCount} pedidos`);
    if (fiadosCount > 0) {
      deletedData.push(`Fiado: descripción anonimizada en ${fiadosCount} fiados`);
      retainedData.push({
        table: "Fiado",
        reason:
          "Montos y saldos retenidos por obligación tributaria SUNAT (Art. 14.6 Ley 29733)",
      });
    }
    if (prestamosCount > 0) {
      retainedData.push({
        table: "Prestamo",
        reason:
          "Registros de préstamos retenidos por obligación contable (5 años mínimo)",
      });
    }
    if (invoicesCount > 0) {
      retainedData.push({
        table: "SunatInvoice",
        reason: `${invoicesCount} comprobantes electrónicos retenidos. Obligación SUNAT — conservación 5 años mínimo (Art. 87 Código Tributario)`,
      });
    }
    if (anonymizedSalesCount > 0) {
      deletedData.push(
        `Sale: referencia de cliente eliminada en ${anonymizedSalesCount} ventas`,
      );
      retainedData.push({
        table: "Sale",
        reason: "Montos de venta retenidos por obligación contable SUNAT",
      });
    }

    // Fire-and-forget audit log (CLAUDE.md rule #7)
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    prisma.activityLog
      .create({
        data: {
          action: "DATA_DELETE_REQUEST",
          entity: "[L29733] Customer",
          entityId: customer.phone,
          detail: JSON.stringify({
            ley29733: true,
            article: "Art. 21",
            right: "Derecho de supresión",
            documento: dni,
            reason,
            gracePeriodEnd: gracePeriodEnd.toISOString(),
            deletedData,
            retainedData,
            requestedBy: auth.username,
            requestedAt: now.toISOString(),
          }),
          user: auth.username,
          ipAddress: ip,
          tenantId,
        },
      })
      .catch((err) => {
        logger.error("[COMPLIANCE] activityLog DATA_DELETE_REQUEST failed", {
          err: err instanceof Error ? err.message : String(err),
          dni,
        });
      });

    logger.info("[COMPLIANCE] Data deletion request processed", {
      tenantId,
      documento: dni,
      requestedBy: auth.username,
      deletedCount: deletedData.length,
      retainedCount: retainedData.length,
    });

    return NextResponse.json({
      success: true,
      message: "Solicitud de eliminación procesada exitosamente",
      gracePeriod: {
        startDate: now.toISOString(),
        endDate: gracePeriodEnd.toISOString(),
        note: "Los datos serán permanentemente eliminados después del período de gracia de 30 días",
      },
      deletedData,
      retainedData,
      legalNotice:
        "Algunos datos financieros son retenidos por obligación legal (SUNAT Art. 87 Código Tributario, Ley 29733 Art. 14.6). Estos datos serán eliminados después del período de retención legal de 5 años.",
    });
  } catch (error) {
    logger.error("[COMPLIANCE] Data deletion failed", {
      tenantId,
      dni,
      error: String(error),
    });
    return NextResponse.json(
      { error: "Error al procesar solicitud de eliminación" },
      { status: 500 },
    );
  }
}
