/**
 * BackupsDB — DB class canónica para historial de backups.
 *
 * Audit project-wide 2026-05-19: extrae la query `prisma.activityLog.findMany`
 * de app/api/backups/route.ts. El sistema de backup real reside en /api/backup
 * (descarga JSON directo); este módulo solo gestiona el historial de eventos
 * de backup registrados en ActivityLog.
 *
 * tenantId es SIEMPRE el primer argumento (regla crítica #3 CLAUDE.md).
 */
import "server-only";
import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DbBackupEntry = {
  id: string;
  name: string;
  type: "manual" | "auto";
  size: string;
  sizeBytes: number;
  modules: string[];
  createdAt: string;
  status: "completado" | "en-progreso" | "fallido";
  retention: string;
  downloadUrl?: string;
};

// ── BackupsDB ─────────────────────────────────────────────────────────────────

export const BackupsDB = {
  /**
   * Retorna el historial de backups del tenant desde ActivityLog.
   * Lanza si no hay registros (el caller debe hacer fallback a datos demo).
   */
  async listFromActivityLog(
    tenantId: string,
    take = 20,
  ): Promise<DbBackupEntry[]> {
    const rows = await prisma.activityLog.findMany({
      where: { tenantId, entity: "configuracion", action: "Backup" },
      orderBy: { createdAt: "desc" },
      take,
    });

    if (rows.length === 0) {
      throw new Error("empty");
    }

    return rows.map((r) => ({
      id: r.id,
      name: r.detail.includes("manual") ? "Backup manual" : "Backup automático",
      type: (r.detail.includes("manual") ? "manual" : "auto") as "manual" | "auto",
      size: "~4 MB",
      sizeBytes: 4_000_000,
      modules: ["Productos", "Pedidos", "Clientes", "Ventas"],
      createdAt: r.createdAt.toISOString(),
      status: "completado" as const,
      retention: "30 días",
    }));
  },
};
