import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { logger } from "@/lib/logger";

/**
 * POST /api/compliance/breach-report
 *
 * Ley 29733 Art. 38 — Notificación de incidentes de seguridad.
 *
 * Registra un incidente de seguridad internamente y genera un reporte
 * con el template para notificación a la ANPD (Autoridad Nacional de
 * Protección de Datos Personales) dentro del plazo de 72 horas.
 *
 * Auth: requireAdmin ["admin"]
 */

const DATA_TYPE_OPTIONS = [
  "nombre",
  "dni",
  "telefono",
  "email",
  "direccion",
  "datos_financieros",
  "historial_compras",
  "datos_credito",
  "ubicacion_gps",
  "datos_salud",
  "otros",
] as const;

const BreachReportSchema = z.object({
  tenantId: z.string().min(1, "tenantId es obligatorio"),
  description: z
    .string()
    .min(20, "Descripción del incidente es obligatoria (mín. 20 caracteres)")
    .max(5000),
  affectedCustomers: z
    .number()
    .int()
    .min(0, "Número de clientes afectados debe ser >= 0"),
  dataTypes: z
    .array(z.enum(DATA_TYPE_OPTIONS))
    .min(1, "Debe especificar al menos un tipo de dato comprometido"),
  discoveredAt: z.string().refine(
    (d) => !isNaN(Date.parse(d)),
    "discoveredAt debe ser una fecha válida ISO 8601",
  ),
  severity: z
    .enum(["low", "medium", "high", "critical"])
    .optional()
    .default("high"),
  containmentActions: z.string().optional(),
  suspectedCause: z.string().optional(),
});

/**
 * Data type labels in Spanish for the ANPD report.
 */
const DATA_TYPE_LABELS: Record<string, string> = {
  nombre: "Nombres y apellidos",
  dni: "Documento Nacional de Identidad (DNI)",
  telefono: "Número de teléfono",
  email: "Correo electrónico",
  direccion: "Dirección domiciliaria",
  datos_financieros: "Datos financieros (pagos, cuentas)",
  historial_compras: "Historial de compras",
  datos_credito: "Datos crediticios (fiados, préstamos)",
  ubicacion_gps: "Coordenadas de ubicación GPS",
  datos_salud: "Datos de salud",
  otros: "Otros datos personales",
};

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: "Cuerpo de solicitud inválido" },
      { status: 400 },
    );
  }

  const parsed = BreachReportSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validación fallida", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const {
    tenantId,
    description,
    affectedCustomers,
    dataTypes,
    discoveredAt,
    severity,
    containmentActions,
    suspectedCause,
  } = parsed.data;

  // Enforce tenantId matches session (CLAUDE.md rule #3)
  if (tenantId !== auth.tenantId) {
    return NextResponse.json(
      { error: "No autorizado para este tenant" },
      { status: 403 },
    );
  }

  try {
    const discoveredDate = new Date(discoveredAt);
    const now = new Date();

    // 72-hour deadline for ANPD notification
    const deadlineMs = discoveredDate.getTime() + 72 * 60 * 60 * 1000;
    const deadlineDate = new Date(deadlineMs);
    const hoursRemaining = Math.max(
      0,
      (deadlineMs - now.getTime()) / (60 * 60 * 1000),
    );
    const isOverdue = now.getTime() > deadlineMs;

    // Generate breach report ID
    const breachId = `BREACH-${tenantId.slice(0, 6).toUpperCase()}-${Date.now()}`;

    // Get tenant info for the report
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, slug: true, ownerEmail: true, ownerPhone: true },
    });

    // Build ANPD notification template
    const anpdTemplate = {
      titulo: "NOTIFICACIÓN DE INCIDENTE DE SEGURIDAD DE DATOS PERSONALES",
      marco_legal:
        "Ley N 29733 — Ley de Protección de Datos Personales, Art. 38",
      autoridad:
        "Autoridad Nacional de Protección de Datos Personales (ANPD) — Ministerio de Justicia y Derechos Humanos",
      seccion_1_responsable: {
        razon_social: tenant?.name ?? "Bodega San Martín",
        identificador_tenant: tenantId,
        contacto_email: tenant?.ownerEmail ?? "[COMPLETAR]",
        contacto_telefono: tenant?.ownerPhone ?? "[COMPLETAR]",
        responsable_reporte: auth.username,
      },
      seccion_2_incidente: {
        id_incidente: breachId,
        fecha_descubrimiento: discoveredDate.toISOString(),
        fecha_reporte: now.toISOString(),
        descripcion: description,
        causa_sospechada: suspectedCause ?? "[POR DETERMINAR]",
        severidad: severity,
      },
      seccion_3_datos_comprometidos: {
        tipos_datos: dataTypes.map((t) => ({
          codigo: t,
          descripcion: DATA_TYPE_LABELS[t] ?? t,
        })),
        numero_titulares_afectados: affectedCustomers,
        incluye_datos_sensibles: dataTypes.some((t) =>
          ["datos_salud", "datos_financieros", "datos_credito"].includes(t),
        ),
      },
      seccion_4_medidas: {
        acciones_contencion:
          containmentActions ?? "[COMPLETAR — describir medidas tomadas]",
        medidas_correctivas: [
          "Revisión de controles de acceso",
          "Notificación a titulares afectados",
          "Auditoría de seguridad del sistema",
          "Actualización de políticas de protección de datos",
        ],
      },
      seccion_5_plazos: {
        plazo_notificacion_anpd: "72 horas desde el descubrimiento",
        fecha_limite: deadlineDate.toISOString(),
        horas_restantes: Math.round(hoursRemaining * 10) / 10,
        estado: isOverdue ? "VENCIDO" : "DENTRO DE PLAZO",
      },
      nota_legal:
        "Esta notificación se realiza en cumplimiento del Art. 38 de la Ley 29733 y el Art. 26 del Reglamento (DS 003-2013-JUS). El incumplimiento puede resultar en sanciones de hasta 100 UIT (~S/500,000).",
    };

    // Store breach report in audit log (CLAUDE.md rule #7 — fire-and-forget
    // for the audit, but we await the main record to return its ID)
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown";

    await prisma.activityLog.create({
      data: {
        action: "BREACH_REPORT_CREATED",
        entity: "[L29733] BreachReport",
        entityId: breachId,
        detail: JSON.stringify({
          ley29733: true,
          article: "Art. 38",
          breachId,
          severity,
          affectedCustomers,
          dataTypes,
          discoveredAt: discoveredDate.toISOString(),
          deadline: deadlineDate.toISOString(),
          isOverdue,
          description,
          containmentActions,
          suspectedCause,
          anpdTemplate,
        }),
        user: auth.username,
        ipAddress: ip,
        tenantId,
      },
    });

    logger.warn("[COMPLIANCE] Security breach report created", {
      tenantId,
      breachId,
      severity,
      affectedCustomers,
      isOverdue,
      hoursRemaining: Math.round(hoursRemaining),
    });

    return NextResponse.json({
      success: true,
      breachId,
      severity,
      deadline: {
        date: deadlineDate.toISOString(),
        hoursRemaining: Math.round(hoursRemaining * 10) / 10,
        isOverdue,
        status: isOverdue
          ? "ATENCIÓN: Plazo de notificación ANPD vencido. Notificar inmediatamente."
          : `Quedan ${Math.round(hoursRemaining)} horas para notificar a la ANPD.`,
      },
      anpdNotificationTemplate: anpdTemplate,
      nextSteps: [
        isOverdue
          ? "1. URGENTE: Enviar notificación a ANPD inmediatamente"
          : "1. Revisar y completar el template de notificación ANPD",
        "2. Notificar a los titulares de datos afectados",
        "3. Documentar todas las medidas de contención tomadas",
        "4. Realizar auditoría de seguridad post-incidente",
        "5. Actualizar políticas de protección de datos si es necesario",
        "6. Presentar notificación formal ante la ANPD (Dirección de Protección de Datos Personales)",
      ],
      contacto_anpd: {
        entidad: "Autoridad Nacional de Protección de Datos Personales",
        ministerio: "Ministerio de Justicia y Derechos Humanos",
        web: "https://www.gob.pe/anpd",
        email: "protecciondedatospersonales@minjus.gob.pe",
      },
    });
  } catch (error) {
    logger.error("[COMPLIANCE] Breach report creation failed", {
      tenantId,
      error: String(error),
    });
    return NextResponse.json(
      { error: "Error al crear reporte de incidente" },
      { status: 500 },
    );
  }
}
