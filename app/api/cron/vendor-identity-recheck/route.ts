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

      // Detección de cambios vs snapshot anterior.
      if (previous) {
        if (previous.invoiceable === true && currentInvoiceable === false) {
          changed++;
          alerts.push({
            vendorId: vendor.id,
            tenantSlug: vendor.tenantSlug,
            kind: "ruc-changed",
            detail: `${vendor.businessName} (RUC ***${vendor.ruc.slice(-4)}) ahora ${rucResult.estado}/${rucResult.condicion}`,
          });
          logger.warn("[cron/vendor-identity-recheck] RUC degradado", {
            vendorId: vendor.id,
            tenantSlug: vendor.tenantSlug,
            businessName: vendor.businessName,
            rucLast4: vendor.ruc.slice(-4),
            prevEstado: previous.rucEstado,
            prevCondicion: previous.rucCondicion,
            curEstado: rucResult.estado,
            curCondicion: rucResult.condicion,
            severity: "high",
          });
        }
        if (previous.contactDniOk === true && dniResult?.ok === false) {
          changed++;
          alerts.push({
            vendorId: vendor.id,
            tenantSlug: vendor.tenantSlug,
            kind: "dni-not-found",
            detail: `${vendor.businessName}: DNI del contacto ya no existe en RENIEC`,
          });
          logger.warn("[cron/vendor-identity-recheck] DNI ya no existe", {
            vendorId: vendor.id,
            tenantSlug: vendor.tenantSlug,
            severity: "medium",
          });
        }
      } else {
        // Primera vez que vemos al vendor — si ya viene NO HABIDO o RUC no-found, alertar.
        if (!rucResult.ok) {
          changed++;
          alerts.push({
            vendorId: vendor.id,
            tenantSlug: vendor.tenantSlug,
            kind: "ruc-not-found",
            detail: `${vendor.businessName} (RUC ***${vendor.ruc.slice(-4)}) no encontrado en SUNAT`,
          });
          logger.warn("[cron/vendor-identity-recheck] RUC no encontrado (primera consulta)", {
            vendorId: vendor.id,
            tenantSlug: vendor.tenantSlug,
            severity: "high",
          });
        } else if (!currentInvoiceable) {
          changed++;
          alerts.push({
            vendorId: vendor.id,
            tenantSlug: vendor.tenantSlug,
            kind: "ruc-changed",
            detail: `${vendor.businessName} aprobado pero RUC ${rucResult.estado}/${rucResult.condicion}`,
          });
          logger.warn("[cron/vendor-identity-recheck] RUC no invoiceable detectado", {
            vendorId: vendor.id,
            tenantSlug: vendor.tenantSlug,
            severity: "medium",
          });
        }
      }

      cacheStore.set(snapKey, snapshot, SNAPSHOT_TTL_SEC);
    }

    logger.info("[cron/vendor-identity-recheck] run complete", {
      total: vendors.length,
      checked,
      changed,
      errors,
      alertSample: alerts.slice(0, 5).map((a) => `${a.kind}:${a.tenantSlug}`),
    });

    return NextResponse.json({
      ok: true,
      processedAt: new Date().toISOString(),
      total: vendors.length,
      checked,
      changed,
      errors,
      alerts,
    });
  },
);
