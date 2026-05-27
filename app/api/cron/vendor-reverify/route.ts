/**
 * GET /api/cron/vendor-reverify
 *
 * Cron diario 6 AM Lima (11:00 UTC) — TD-058 capas 4, 6 y 7.
 *
 * Re-verifica RUC/DNI de vendors aprobados contra SUNAT y RENIEC.
 * Cuando detecta degradación:
 *   - Capa 4: marcar status interno (snapshot actualizado en cacheStore)
 *   - Capa 6: crear PersistentNotification en el panel del vendor (dedup 24h)
 *   - Capa 7: enviar WhatsApp al contactPhone; fallback a email
 *
 * Diferencias frente a vendor-identity-recheck (02:29 UTC):
 *   - Schedule 11:00 UTC = 6 AM Lima (horario laboral, no madrugada)
 *   - Limit 100 vendors/run (mitad del otro run — API budget apisperu 100/día)
 *   - jobName separado → health-tracker registra ambas corridas independientes
 *
 * Auth: withCronHealth valida CRON_SECRET via timingSafeCompare + persiste
 * en CronHealthLog para el dashboard /superadmin/vendor-health.
 *
 * Response: { ok, processed, succeeded, failed, durationMs }
 *
 * vercel.json schedule: "0 11 * * *"
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
import { VendorGraceDB } from "@/lib/db/vendor-grace.db";

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Snapshot en cacheStore para detectar cambios entre runs (TTL 7 días). */
interface VendorSnapshot {
  ruc: string;
  rucCondicion?: string;
  rucEstado?: string;
  invoiceable?: boolean;
  contactDniOk?: boolean;
  checkedAt: string;
}

type AlertKind = "ruc-changed" | "ruc-not-found" | "dni-not-found";

interface RunAlert {
  vendorId: string;
  tenantSlug: string | null;
  kind: AlertKind;
  detail: string;
}

interface RunGrace {
  tenantId: string;
  tenantSlug: string | null;
  vendorId: string;
  businessName: string;
  kind: AlertKind;
  until: string;
  graceDays: number;
  reason?: string;
  acknowledgedBy: string;
}

// ── Constantes ───────────────────────────────────────────────────────────────

const SNAPSHOT_TTL_SEC = 7 * 24 * 60 * 60; // 7 días
/** 100 vendors/run — respeta tier free de apisperu (100 consultas/día). */
const MAX_VENDORS_PER_RUN = 100;
const SUMMARY_CACHE_KEY = "vendor-health:summary";
/** TTL 25h cubre con margen el cron diario. */
const SUMMARY_TTL_SEC = 25 * 60 * 60;

// Prisma sin scope de tenant — cron tiene acceso plataforma.
 
const prismaUnscoped = prisma;

// ── Handler ──────────────────────────────────────────────────────────────────

export const GET = withCronHealth(
  "vendor-reverify",
  async (_req: NextRequest) => {
    const runStart = Date.now();

    // Capa 4: leer vendors aprobados, ordenados por los que llevan más tiempo
    // sin reverificar (decidedAt asc = aprobados hace más tiempo primero).
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
      // Más tiempo sin revisar primero — distribución equitativa en batches de 100.
      orderBy: { decidedAt: "asc" },
      take: MAX_VENDORS_PER_RUN,
    });

    let processed = 0;
    let succeeded = 0;
    let failed = 0;
    let notifiedCount = 0;
    let waSentCount = 0;
    let emailSentCount = 0;
    let gracedCount = 0;
    const alerts: RunAlert[] = [];
    const graces: RunGrace[] = [];

    for (const vendor of vendors) {
      processed++;
      const t0 = Date.now();
      const snapKey = `vendor-identity-snapshot:${vendor.id}`;
      const previous = cacheStore.get<VendorSnapshot>(snapKey);

      let rucResult: SunatRucResult | null = null;
      let dniResult: ReniecResult | null = null;

      // ── SUNAT RUC check ────────────────────────────────────────────────────
      try {
        rucResult = await verifyRuc(vendor.ruc);
      } catch (err) {
        failed++;
        logger.warn("[cron/vendor-reverify] verifyRuc failed", {
          vendorId: vendor.id,
          rucLast4: vendor.ruc.slice(-4),
          durationMs: Date.now() - t0,
          err: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      // ── RENIEC DNI check (solo si hay DNI registrado) ─────────────────────
      if (vendor.contactDni) {
        try {
          dniResult = await verifyDni(vendor.contactDni);
        } catch (err) {
          // No bloqueante: DNI falla → solo log, RUC ya se chequeó.
          logger.warn("[cron/vendor-reverify] verifyDni failed", {
            vendorId: vendor.id,
            durationMs: Date.now() - t0,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      }

      const currentInvoiceable = isInvoiceable(rucResult);

      // Actualizar snapshot (capa 4 — registro del estado actual).
      const snapshot: VendorSnapshot = {
        ruc: vendor.ruc,
        rucCondicion: rucResult.condicion,
        rucEstado: rucResult.estado,
        invoiceable: currentInvoiceable,
        contactDniOk: dniResult?.ok,
        checkedAt: new Date().toISOString(),
      };

      // ── emitAlert — capas 6 y 7 ───────────────────────────────────────────
      // Crea PersistentNotification (capa 6) + envía WA/email (capa 7).
      // Idempotente: dedupWindowHours=24 evita spam si cron corre 2× en el día.
      // Grace period (capa 8): skip si el superadmin/admin ya reconoció el problema.
      let notificationsDelta = 0;
      let waDelta = 0;
      let emailDelta = 0;

      const emitAlert = async (
        kind: AlertKind,
        severity: "HIGH" | "MEDIUM",
        title: string,
        detail: string,
      ) => {
        alerts.push({ vendorId: vendor.id, tenantSlug: vendor.tenantSlug, kind, detail });

        logger.warn(`[cron/vendor-reverify] ${kind}`, {
          vendorId: vendor.id,
          tenantSlug: vendor.tenantSlug,
          businessName: vendor.businessName,
          rucLast4: vendor.ruc.slice(-4),
          severity: severity.toLowerCase(),
        });

        if (!vendor.tenantId) return;

        // Capa 8: grace period activo → no notificar (superadmin visibility via Sentry).
        if (VendorGraceDB.shouldSkip(vendor.tenantId, vendor.id, kind)) {
          gracedCount++;
          const graceRec = VendorGraceDB.get(vendor.tenantId);
          if (graceRec) {
            graces.push({
              tenantId: vendor.tenantId,
              tenantSlug: vendor.tenantSlug,
              vendorId: vendor.id,
              businessName: vendor.businessName,
              kind,
              until: graceRec.until,
              graceDays: graceRec.graceDays,
              ...(graceRec.reason != null && { reason: graceRec.reason }),
              acknowledgedBy: graceRec.acknowledgedBy,
            });
          }
          logger.info("[cron/vendor-reverify] grace active — skip alert", {
            vendorId: vendor.id,
            tenantSlug: vendor.tenantSlug,
            kind,
          });
          return;
        }

        // Capa 6: PersistentNotification en panel del vendor.
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
            notificationsDelta++;

            // Capa 7: WhatsApp primero, fallback email.
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
                if (alertRes.waSent) waDelta++;
                if (alertRes.emailSent) emailDelta++;
              } catch (err) {
                logger.warn("[cron/vendor-reverify] alert dispatch failed", {
                  vendorId: vendor.id,
                  tenantId: vendor.tenantId,
                  err: err instanceof Error ? err.message : String(err),
                });
              }
            }
          }
        } catch (err) {
          logger.warn("[cron/vendor-reverify] notification create failed", {
            vendorId: vendor.id,
            tenantId: vendor.tenantId,
            err: err instanceof Error ? err.message : String(err),
          });
        }
      };

      // ── Detección de cambios vs snapshot anterior ──────────────────────────
      if (previous) {
        // Vendor ya visto: alertar solo si el estado EMPEORÓ.
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
        // Primera vez: alertar si ya llega en mal estado.
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

      // Acumular contadores.
      notifiedCount += notificationsDelta;
      waSentCount += waDelta;
      emailSentCount += emailDelta;

      // Persistir snapshot actualizado (capa 4).
      cacheStore.set(snapKey, snapshot, SNAPSHOT_TTL_SEC);

      succeeded++;
      logger.info("[cron/vendor-reverify] vendor processed", {
        vendorId: vendor.id,
        tenantSlug: vendor.tenantSlug,
        status: rucResult.estado,
        condicion: rucResult.condicion,
        invoiceable: currentInvoiceable,
        durationMs: Date.now() - t0,
      });
    }

    const durationMs = Date.now() - runStart;

    logger.info("[cron/vendor-reverify] run complete", {
      processed,
      succeeded,
      failed,
      notifiedCount,
      waSentCount,
      emailSentCount,
      gracedCount,
      alertSample: alerts.slice(0, 5).map((a) => `${a.kind}:${a.tenantSlug}`),
      durationMs,
    });

    // Persistir summary para dashboard /superadmin/vendor-health.
    cacheStore.set(
      SUMMARY_CACHE_KEY,
      {
        lastRunAt: new Date().toISOString(),
        total: vendors.length,
        checked: processed,
        changed: alerts.length,
        errors: failed,
        notifiedCount,
        waSentCount,
        emailSentCount,
        gracedCount,
        alerts,
        graces,
      },
      SUMMARY_TTL_SEC,
    );

    return NextResponse.json({
      ok: true,
      processed,
      succeeded,
      failed,
      notifiedCount,
      waSentCount,
      emailSentCount,
      gracedCount,
      durationMs,
    });
  },
);
