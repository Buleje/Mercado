/**
 * GET /api/cron/vendor-identity-recheck
 *
 * Cron diario que re-verifica RUC/DNI de TODOS los vendors aprobados
 * contra RENIEC/SUNAT. Si detecta cambio de estado (NO HABIDO, BAJA DE
 * OFICIO, DNI ya no existe), emite logger.warn estructurado que Sentry
 * captura como alerta crítica.
 *
 * Workflow:
 *   1. Lee VendorApplication.status="approved" con tenantId not null
 *   2. Para cada uno: verifyRuc (siempre) + verifyDni (si contactDni)
 *   3. Compara contra snapshot anterior (cacheStore, TTL 7d)
 *   4. Si cambió: emit Sentry alert + activity log + persistir nuevo snapshot
 *   5. Reporta KPIs en response (total, checked, changed, errors)
 *
 * Auth: withCronHealth valida CRON_SECRET via Vercel Cron + persiste
 * ejecución en CronHealthLog.
 *
 * Schedule: 02:00 UTC daily (después del backup nocturno, antes del
 * tráfico AM en Perú GMT-5 = 21:00 local).
 *
 * Audit ref: TD-058 RENIEC/SUNAT scaffold. Cierra el ciclo de
 * verificación inicial → endpoint manual → cron de re-check automático.
 */
import { NextRequest, NextResponse } from "next/server";
import { withCronHealth } from "@/lib/cron/with-cron-health";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { cacheStore } from "@/lib/cache";
import { verifyRuc, isInvoiceable, type SunatRucResult } from "@/lib/integrations/sunat-ruc";
import { verifyDni, type ReniecResult } from "@/lib/integrations/reniec";
import { NotificationCenterDB } from "@/lib/db/notification-center.db";
import { sendVendorIdentityAlert } from "@/lib/notifications/vendor-identity-alert";

/** Snapshot persistido por vendor para detectar cambios entre runs. */
interface VendorSnapshot {
  /** RUC del vendor */
  ruc: string;
  /** Último estado SUNAT visto (HABIDO, NO HABIDO, ...) */
  rucCondicion?: string;
  /** Último estado SUNAT (ACTIVO, BAJA DE OFICIO, ...) */
  rucEstado?: string;
  /** Último invoiceable computado */
  invoiceable?: boolean;
  /** DNI del contacto (último ok visto) */
  contactDniOk?: boolean;
  /** Timestamp ISO último check */
  checkedAt: string;
}

const SNAPSHOT_TTL_SEC = 7 * 24 * 60 * 60; // 7 días (>>> cron diario)
const MAX_VENDORS_PER_RUN = 200; // safety cap — apisperu tier free 100/día

// eslint-disable-next-line no-restricted-properties -- cron platform-level, scope all tenants
const prismaUnscoped = prisma;

export const GET = withCronHealth(
  "vendor-identity-recheck",
  async (_req: NextRequest) => {
    // Lee vendors aprobados con tenantId asignado.
    const vendors = await prismaUnscoped.vendorApplication.findMany({
      where: {
        status: "approved",
        tenantId: { not: null },
      },
      select: {
        id: true,
        ruc: true,
        contactDni: true,
        contactName: true,
        contactPhone: true,
        contactEmail: true,
        businessName: true,
        tenantId: true,
        tenantSlug: true,
      },
      orderBy: { decidedAt: "desc" },
      take: MAX_VENDORS_PER_RUN,
    });

    let checked = 0;
    let changed = 0;
    let errors = 0;
    let notifiedCount = 0;
    let waSentCount = 0;
    let emailSentCount = 0;
    const alerts: Array<{
      vendorId: string;
      tenantSlug: string | null;
      kind: "ruc-changed" | "ruc-not-found" | "dni-not-found";
      detail: string;
    }> = [];

    for (const vendor of vendors) {
      checked++;
      const snapKey = `vendor-identity-snapshot:${vendor.id}`;
      const previous = cacheStore.get<VendorSnapshot>(snapKey);

      let rucResult: SunatRucResult | null = null;
      let dniResult: ReniecResult | null = null;

      try {
        rucResult = await verifyRuc(vendor.ruc);
      } catch (err) {
        errors++;
        logger.warn("[cron/vendor-identity-recheck] verifyRuc failed", {
          vendorId: vendor.id,
          rucLast4: vendor.ruc.slice(-4),
          err: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      if (vendor.contactDni) {
        try {
          dniResult = await verifyDni(vendor.contactDni);
        } catch (err) {
          // No es bloqueante — solo loguea
          logger.warn("[cron/vendor-identity-recheck] verifyDni failed", {
            vendorId: vendor.id,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const currentInvoiceable = isInvoiceable(rucResult);
      const snapshot: VendorSnapshot = {
        ruc: vendor.ruc,
        rucCondicion: rucResult.condicion,
        rucEstado: rucResult.estado,
        invoiceable: currentInvoiceable,
        contactDniOk: dniResult?.ok,
        checkedAt: new Date().toISOString(),
      };

      // Helper local: pushea alert al array Y crea notification persistente
      // en el panel del admin del tenant (idempotente — no duplica si ya
      // existe una sin leer en las últimas 24h). Si la notification se creó
      // NUEVA (no reuse), además envía WA al contactPhone del vendor.
      let notificationsCreated = 0;
      let waSentDelta = 0;
      let emailSentDelta = 0;
      const emitAlert = async (
        kind: "ruc-changed" | "ruc-not-found" | "dni-not-found",
        severity: "HIGH" | "MEDIUM",
        title: string,
        detail: string,
      ) => {
        changed++;
        alerts.push({
          vendorId: vendor.id,
          tenantSlug: vendor.tenantSlug,
          kind,
          detail,
        });
        logger.warn(`[cron/vendor-identity-recheck] ${kind}`, {
          vendorId: vendor.id,
          tenantSlug: vendor.tenantSlug,
          businessName: vendor.businessName,
          rucLast4: vendor.ruc.slice(-4),
          severity: severity.toLowerCase(),
        });
        if (!vendor.tenantId) return;
        try {
          const result = await NotificationCenterDB.createOrReuse({
            tenantId: vendor.tenantId,
            type: "VENDOR_IDENTITY_ALERT",
            severity,
            title,
            body: detail,
            actionUrl: "/admin/settings/business",
            actionLabel: "Revisar identidad",
            entityId: vendor.id,
            dedupWindowHours: 24,
          });
          if (result.created) {
            notificationsCreated++;
            // Audit 2026-05-17 TD-058 capa 6+7: alerta multi-canal con fallback.
            // sendVendorIdentityAlert intenta WA primero; si falla o no hay
            // phone, manda email. Solo se dispara cuando notification fue
            // CREADA (created=true) — si fue reusada (created=false), runs
            // anteriores ya alertaron dentro de la ventana 24h → no spam.
            if (vendor.contactPhone || vendor.contactEmail) {
              try {
                const alertRes = await sendVendorIdentityAlert({
                  tenantId: vendor.tenantId,
                  vendorId: vendor.id,
                  businessName: vendor.businessName,
                  contactPhone: vendor.contactPhone,
                  contactEmail: vendor.contactEmail,
                  kind,
                  rucLast4: vendor.ruc.slice(-4),
                });
                if (alertRes.waSent) waSentDelta++;
                if (alertRes.emailSent) emailSentDelta++;
              } catch (err) {
                logger.warn("[cron/vendor-identity-recheck] alert dispatch failed", {
                  vendorId: vendor.id,
                  tenantId: vendor.tenantId,
                  err: err instanceof Error ? err.message : String(err),
                });
              }
            }
          }
        } catch (err) {
          logger.warn("[cron/vendor-identity-recheck] notification create failed", {
            vendorId: vendor.id,
            tenantId: vendor.tenantId,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      };

      // Detección de cambios vs snapshot anterior.
      if (previous) {
        if (previous.invoiceable === true && currentInvoiceable === false) {
          await emitAlert(
            "ruc-changed",
            "HIGH",
            "Tu RUC pasó a estado no apto para facturar",
            `${vendor.businessName} (RUC ***${vendor.ruc.slice(-4)}) ahora ${rucResult.estado}/${rucResult.condicion}. Tus facturas dejarán de ser deducibles para tus clientes. Regulariza tu situación con SUNAT.`,
          );
        }
        if (previous.contactDniOk === true && dniResult?.ok === false) {
          await emitAlert(
            "dni-not-found",
            "MEDIUM",
            "El DNI del titular ya no figura en RENIEC",
            `${vendor.businessName}: El DNI registrado como contacto principal ya no existe en RENIEC. Esto puede indicar fallecimiento, cambio de documento o registro incorrecto.`,
          );
        }
      } else {
        // Primera vez que vemos al vendor — si ya viene NO HABIDO o RUC no-found, alertar.
        if (!rucResult.ok) {
          await emitAlert(
            "ruc-not-found",
            "HIGH",
            "Tu RUC no figura en SUNAT",
            `${vendor.businessName} (RUC ***${vendor.ruc.slice(-4)}) no fue encontrado en el padrón de SUNAT. Revisa el número o regulariza tu inscripción.`,
          );
        } else if (!currentInvoiceable) {
          await emitAlert(
            "ruc-changed",
            "MEDIUM",
            "Tu RUC requiere atención",
            `${vendor.businessName} aprobado pero el RUC está en ${rucResult.estado}/${rucResult.condicion}. No podrás emitir facturas deducibles hasta regularizar.`,
          );
        }
      }


      // Track counts for summary reporting.
      if (notificationsCreated > 0) notifiedCount += notificationsCreated;
      if (waSentDelta > 0) waSentCount += waSentDelta;
      if (emailSentDelta > 0) emailSentCount += emailSentDelta;

      cacheStore.set(snapKey, snapshot, SNAPSHOT_TTL_SEC);
    }

    logger.info("[cron/vendor-identity-recheck] run complete", {
      total: vendors.length,
      checked,
      changed,
      errors,
      notifiedCount,
      waSentCount,
      emailSentCount,
      alertSample: alerts.slice(0, 5).map((a) => `${a.kind}:${a.tenantSlug}`),
    });

    // Persistir summary global para el dashboard /superadmin/vendor-health.
    // TTL 25h cubre con margen el cron diario (07:00 UTC daily).
    const summary: VendorHealthSummary = {
      lastRunAt: new Date().toISOString(),
      total: vendors.length,
      checked,
      changed,
      errors,
      notifiedCount,
      waSentCount,
      emailSentCount,
      alerts,
    };
    cacheStore.set("vendor-health:summary", summary, 25 * 60 * 60);

    return NextResponse.json({ ok: true, processedAt: summary.lastRunAt, ...summary });
  },
);

/** Shape persistido en cacheStore para el dashboard /superadmin/vendor-health. */
export interface VendorHealthSummary {
  lastRunAt: string;
  total: number;
  checked: number;
  changed: number;
  errors: number;
  /** Total de notifications NUEVAS creadas en este run (dedup idempotente) */
  notifiedCount: number;
  /** Total de mensajes WhatsApp enviados al vendor (mismo gate idempotente) */
  waSentCount: number;
  /** Total de emails enviados al vendor — solo cuando WA falló o no había phone */
  emailSentCount: number;
  alerts: Array<{
    vendorId: string;
    tenantSlug: string | null;
    kind: "ruc-changed" | "ruc-not-found" | "dni-not-found";
    detail: string;
  }>;
}
