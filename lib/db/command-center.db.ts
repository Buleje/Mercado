import "server-only";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getRescueQueue } from "@/lib/db/rescue.db";
import { getClientErrorStats } from "@/lib/db/client-errors.db";
import { getEventDlqStats } from "@/lib/db/dlq.db";

/**
 * lib/db/command-center.db.ts — Centro de comando (Brandon 2026-06-19). Junta en
 * vivo TODO lo que necesita la atención del operador, reusando los agregadores
 * que ya construimos (rescate, errores, DLQ) + conteos directos (pagos, vendors,
 * jobs stale). Un solo lugar para saber "qué hago primero".
 */

export type Severity = "bad" | "warn" | "good";
export interface AttentionItem { key: string; label: string; count: number; sub?: string; href: string; severity: Severity }
export interface CommandCenter { items: AttentionItem[]; totalUrgent: number; generatedAt: string }

export async function getCommandCenter(): Promise<CommandCenter> {
  try {
    const [rescue, errors, dlq, proofsRows, approvalsPending, vendorApps, staleRows] = await Promise.all([
      getRescueQueue(),
      getClientErrorStats(),
      getEventDlqStats(),
      // PaymentProof es tabla raw (no modelo Prisma) → count via SQL.
      prisma.$queryRawUnsafe<Array<{ n: bigint }>>(`SELECT COUNT(*)::bigint AS n FROM "PaymentProof" WHERE status = 'pending'`),
      prisma.paymentApproval.count({ where: { status: "pending" } }),
      prisma.vendorApplication.count({ where: { status: "pending" } }),
      prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT COUNT(*)::bigint AS n FROM (
           SELECT "jobName", MAX("createdAt") AS last FROM "CronHealthLog"
           WHERE "createdAt" > NOW() - INTERVAL '7 days' GROUP BY "jobName"
         ) s WHERE s.last < NOW() - INTERVAL '26 hours'`,
      ),
    ]);
    const stale = Number(staleRows[0]?.n ?? 0);
    const proofsPending = Number(proofsRows[0]?.n ?? 0);
    const payments = proofsPending + approvalsPending;

    const sev = (n: number, bad = false): Severity => (n === 0 ? "good" : bad ? "bad" : "warn");
    const items: AttentionItem[] = [
      { key: "rescue", label: "Negocios en riesgo", count: rescue.kpis.critical + rescue.kpis.high, sub: `${rescue.kpis.critical} críticos · ${rescue.kpis.paidAtRisk} pagados`, href: "/superadmin/rescue", severity: rescue.kpis.critical > 0 ? "bad" : rescue.kpis.high > 0 ? "warn" : "good" },
      { key: "errors", label: "Errores en paneles", count: errors.groups, sub: `${errors.affectedTenants} negocios`, href: "/superadmin/tenant-errors", severity: sev(errors.groups) },
      { key: "payments", label: "Pagos por aprobar", count: payments, sub: `${proofsPending} plan · ${approvalsPending} Yape`, href: "/superadmin/pagos-pendientes", severity: sev(payments) },
      { key: "vendors", label: "Vendors por aprobar", count: vendorApps, sub: "solicitudes", href: "/superadmin/vendor-applications", severity: sev(vendorApps) },
      { key: "dlq", label: "Eventos en DLQ", count: dlq.unresolved, sub: `${dlq.nearMax} casi sin reintentos`, href: "/superadmin/dlq", severity: dlq.unresolved > 0 ? (dlq.nearMax > 0 ? "bad" : "warn") : "good" },
      { key: "jobs", label: "Jobs sin correr", count: stale, sub: ">26h", href: "/superadmin/slo", severity: sev(stale) },
      { key: "trials", label: "Trials por vencer", count: rescue.kpis.trialsExpiring, sub: "≤7 días", href: "/superadmin/rescue", severity: sev(rescue.kpis.trialsExpiring) },
    ];
    const totalUrgent = items.filter((i) => i.severity !== "good").reduce((s, i) => s + i.count, 0);
    return { items, totalUrgent, generatedAt: new Date().toISOString() };
  } catch (err) {
    logger.error("[command-center.db] getCommandCenter failed", { error: String(err) });
    return { items: [], totalUrgent: 0, generatedAt: new Date().toISOString() };
  }
}
