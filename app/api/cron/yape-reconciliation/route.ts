import "server-only";
import { NextResponse } from "next/server";
import { withCronHealth } from "@/lib/cron/with-cron-health";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

/**
 * /api/cron/yape-reconciliation
 *
 * Brandon 2026-05-18 (audit profundo arquitectura Sprint 3):
 * Reporte diario de pagos Yape/Plin manuales para detectar fraude o
 * inconsistencias contra el bank statement del owner. Mostrado en
 * /superadmin/dlq + email a Brandon si hay anomalías.
 *
 * Hoy: comprobantes Yape se aprueban manualmente desde admin sin
 * conciliación automática vs bank. Si un cliente sube un screenshot
 * de Yape de OTRO pago (fraude) y el admin aprueba, no hay alarma.
 *
 * Schedule: cada día 23:51 (después del corte del día comercial).
 *
 * Algoritmo:
 *   1. Lista PaymentApproval del día (approved=true, source=yape/plin/transfer)
 *   2. Agrupa por tenant + yapeLast4 (último 4 dígitos del operation code)
 *   3. Detecta duplicates: mismo yapeOpCode aprobado para 2+ órdenes distintas
 *   4. Detecta mismatch: detectedAmount vs expectedAmount > S/0.50
 *   5. Genera resumen — TODO Sprint 4: email a Brandon + notification
 *      en /superadmin/dlq cuando hay anomalías
 *
 * Score de salud por tenant:
 *   - 100% = todos los pagos con detectedAmount=expectedAmount, sin duplicates
 *   - >90% = OK
 *   - 70-90% = revisar manualmente
 *   - <70% = posible fraude sistemático
 */

const DAY_MS = 24 * 60 * 60 * 1000;

interface AnomalyEntry {
  tenantId: string;
  type: "duplicate" | "amount-mismatch" | "missing-opcode";
  details: string;
  approvalIds: string[];
}

async function handler() {
  const since = new Date(Date.now() - DAY_MS);

  // @prisma-direct ok — cron system-wide, sin tenantId scope
   
  const approvals = await prisma.paymentApproval.findMany({
    where: {
      status: "approved",
      reviewedAt: { gte: since },
    },
    select: {
      id: true,
      tenantId: true,
      yapeOpCode: true,
      yapeLast4: true,
      expectedAmount: true,
      detectedAmount: true,
      customerPhone: true,
      reviewedAt: true,
    },
  });

  if (approvals.length === 0) {
    return NextResponse.json({
      checked: 0,
      anomalies: 0,
      message: "No payment approvals approved in last 24h",
    });
  }

  // 1. Detectar duplicates por (tenantId + yapeOpCode)
  const opCodeMap = new Map<string, typeof approvals>();
  for (const a of approvals) {
    if (!a.yapeOpCode) continue;
    const key = `${a.tenantId}::${a.yapeOpCode}`;
    if (!opCodeMap.has(key)) opCodeMap.set(key, []);
    opCodeMap.get(key)!.push(a);
  }

  const anomalies: AnomalyEntry[] = [];

  for (const [key, group] of opCodeMap) {
    if (group.length > 1) {
      const [tenantId, opCode] = key.split("::");
      anomalies.push({
        tenantId,
        type: "duplicate",
        details: `yapeOpCode=${opCode} aprobado ${group.length}× en distintas órdenes`,
        approvalIds: group.map((g) => g.id),
      });
    }
  }

  // 2. Detectar mismatch detectedAmount vs expectedAmount
  for (const a of approvals) {
    if (a.detectedAmount == null) continue;
    const expected = Number(a.expectedAmount);
    const detected = Number(a.detectedAmount);
    const diff = Math.abs(expected - detected);
    if (diff > 0.5) {
      anomalies.push({
        tenantId: a.tenantId,
        type: "amount-mismatch",
        details: `expected=S/${expected.toFixed(2)} vs detected=S/${detected.toFixed(2)} (diff=S/${diff.toFixed(2)})`,
        approvalIds: [a.id],
      });
    }
  }

  // 3. Detectar approvals sin opCode (revisar manualmente — debería haberlo)
  const missingOpCode = approvals.filter((a) => !a.yapeOpCode);
  if (missingOpCode.length > 0) {
    anomalies.push({
      tenantId: "_system_",
      type: "missing-opcode",
      details: `${missingOpCode.length} approvals aprobados SIN yapeOpCode — el admin debería rechazar estos`,
      approvalIds: missingOpCode.map((a) => a.id),
    });
  }

  // 4. Score de salud por tenant
  const tenantStats = new Map<string, { total: number; anomalous: number }>();
  for (const a of approvals) {
    const stats = tenantStats.get(a.tenantId) ?? { total: 0, anomalous: 0 };
    stats.total++;
    if (anomalies.some((an) => an.approvalIds.includes(a.id))) {
      stats.anomalous++;
    }
    tenantStats.set(a.tenantId, stats);
  }

  const lowHealth = Array.from(tenantStats.entries())
    .map(([tenantId, s]) => ({
      tenantId,
      total: s.total,
      anomalous: s.anomalous,
      healthScore: s.total === 0 ? 100 : Math.round(((s.total - s.anomalous) / s.total) * 100),
    }))
    .filter((s) => s.healthScore < 90);

  // TODO Sprint 4: emitir notification a /superadmin/dlq + email a Brandon
  // cuando lowHealth.length > 0 o anomalies > umbral.

  if (anomalies.length > 0) {
    logger.warn("[cron/yape-reconciliation] anomalies detected", {
      anomalyCount: anomalies.length,
      lowHealthTenants: lowHealth.length,
      sampleAnomaly: anomalies[0],
    });
  } else {
    logger.info("[cron/yape-reconciliation] all clean", {
      approvalsChecked: approvals.length,
    });
  }

  return NextResponse.json({
    checked: approvals.length,
    anomalies: anomalies.length,
    lowHealthTenants: lowHealth.length,
    tenantHealthScores: Array.from(tenantStats.entries()).map(([tenantId, s]) => ({
      tenantId,
      total: s.total,
      anomalous: s.anomalous,
      healthScore: s.total === 0 ? 100 : Math.round(((s.total - s.anomalous) / s.total) * 100),
    })),
    anomalyDetails: anomalies.slice(0, 50), // limit en response
  });
}

export const GET = withCronHealth("yape-reconciliation", handler);
