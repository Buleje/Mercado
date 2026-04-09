/**
 * lib/db/roadmap-status.db.ts
 *
 * DB class para el estado mutable de los 84 items del Master Roadmap 2026-04-09.
 *
 * - El contenido de los items vive estático en `lib/roadmap/items.ts`.
 * - Esta tabla solo guarda estado (planned/in_progress/done/blocked/skipped),
 *   progreso 0-100, notas y auditoría.
 * - Es PLATFORM-LEVEL (no tiene tenantId) porque es operado desde superadmin.
 *
 * Cache:
 *   - Key: `roadmap-status:map` — Map completo, invalidado tras cada write.
 *   - TTL: 60s (corta, los cambios son manuales y deben reflejarse ya).
 */

import "server-only";
import { prisma } from "@/lib/prisma";
import type { RoadmapItemStatus as PRoadmapItemStatusRow } from "@/lib/generated/prisma/client";
import { getOrSet, invalidate } from "@/lib/cache";

// ── Types ──────────────────────────────────────────────────────────────────

export type RoadmapStatusValue =
  | "planned"
  | "in_progress"
  | "done"
  | "blocked"
  | "skipped";

const VALID_STATUSES: ReadonlySet<RoadmapStatusValue> = new Set([
  "planned",
  "in_progress",
  "done",
  "blocked",
  "skipped",
]);

export function isValidStatus(value: unknown): value is RoadmapStatusValue {
  return typeof value === "string" && VALID_STATUSES.has(value as RoadmapStatusValue);
}

export interface DbRoadmapItemStatus {
  id: string;
  itemId: string;
  status: RoadmapStatusValue;
  progress: number;
  startedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertRoadmapStatusInput {
  status?: RoadmapStatusValue;
  progress?: number;
  notes?: string;
  updatedBy?: string;
}

// ── Cache keys ─────────────────────────────────────────────────────────────

const CACHE_KEY_ALL = "roadmap-status:map";
const CACHE_TTL_SEC = 60;

// ── Mappers ────────────────────────────────────────────────────────────────

function toISO(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function mapRow(row: PRoadmapItemStatusRow): DbRoadmapItemStatus {
  return {
    id: row.id,
    itemId: row.itemId,
    status: isValidStatus(row.status) ? row.status : "planned",
    progress: row.progress,
    startedAt: toISO(row.startedAt),
    completedAt: toISO(row.completedAt),
    notes: row.notes,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── DB class ───────────────────────────────────────────────────────────────

export const RoadmapStatusDB = {
  /**
   * Devuelve TODAS las filas de RoadmapItemStatus como array (no indexado).
   * Cacheado 60s. Los items sin row en DB se consideran "planned" por default
   * (ver getStatusMap() para el merge con el catálogo estático).
   */
  async getAll(): Promise<DbRoadmapItemStatus[]> {
    return getOrSet(CACHE_KEY_ALL, CACHE_TTL_SEC, async () => {
      const rows = await prisma.roadmapItemStatus.findMany({
        orderBy: { updatedAt: "desc" },
      });
      return rows.map(mapRow);
    });
  },

  /**
   * Devuelve un Map<itemId, DbRoadmapItemStatus> listo para merge con el
   * catálogo estático. Los items sin row no aparecen en el Map (el caller
   * debe asumir "planned" como default).
   */
  async getStatusMap(): Promise<Map<string, DbRoadmapItemStatus>> {
    const all = await this.getAll();
    const map = new Map<string, DbRoadmapItemStatus>();
    for (const row of all) {
      map.set(row.itemId, row);
    }
    return map;
  },

  /**
   * Obtiene una fila puntual (o null si no existe aún).
   */
  async getByItemId(itemId: string): Promise<DbRoadmapItemStatus | null> {
    const row = await prisma.roadmapItemStatus.findUnique({
      where: { itemId },
    });
    return row ? mapRow(row) : null;
  },

  /**
   * Upsert — crea si no existe, actualiza si existe. Auto-gestiona
   * startedAt / completedAt en base a transiciones de status.
   * Invalida cache tras write.
   */
  async upsert(
    itemId: string,
    input: UpsertRoadmapStatusInput,
  ): Promise<DbRoadmapItemStatus> {
    const now = new Date();
    const existing = await this.getByItemId(itemId);

    // Normaliza progress a 0-100
    const progress =
      typeof input.progress === "number"
        ? Math.max(0, Math.min(100, Math.round(input.progress)))
        : undefined;

    // Auto-transiciones:
    //  - "in_progress" sin startedAt → stamp startedAt = now
    //  - "done" → stamp completedAt = now + progress = 100
    //  - volver a "planned" → limpiar startedAt/completedAt
    let nextStartedAt: Date | null | undefined = undefined;
    let nextCompletedAt: Date | null | undefined = undefined;
    let nextProgress = progress;

    if (input.status === "in_progress") {
      if (!existing?.startedAt) nextStartedAt = now;
      nextCompletedAt = null;
    } else if (input.status === "done") {
      if (!existing?.startedAt) nextStartedAt = now;
      nextCompletedAt = now;
      if (nextProgress === undefined) nextProgress = 100;
    } else if (input.status === "planned") {
      nextStartedAt = null;
      nextCompletedAt = null;
      if (nextProgress === undefined) nextProgress = 0;
    } else if (input.status === "blocked" || input.status === "skipped") {
      nextCompletedAt = null;
    }

    // Append notes con timestamp + updatedBy inline (append-only)
    let notesValue: string | undefined | null = undefined;
    if (input.notes !== undefined) {
      const stamp = `[${now.toISOString()}${input.updatedBy ? ` · ${input.updatedBy}` : ""}]`;
      const newNote = `${stamp} ${input.notes.trim()}`;
      notesValue = existing?.notes ? `${existing.notes}\n${newNote}` : newNote;
    }

    const row = await prisma.roadmapItemStatus.upsert({
      where: { itemId },
      create: {
        itemId,
        status: input.status ?? "planned",
        progress: nextProgress ?? 0,
        startedAt: nextStartedAt ?? null,
        completedAt: nextCompletedAt ?? null,
        notes: notesValue ?? null,
        updatedBy: input.updatedBy ?? null,
      },
      update: {
        ...(input.status !== undefined && { status: input.status }),
        ...(nextProgress !== undefined && { progress: nextProgress }),
        ...(nextStartedAt !== undefined && { startedAt: nextStartedAt }),
        ...(nextCompletedAt !== undefined && { completedAt: nextCompletedAt }),
        ...(notesValue !== undefined && { notes: notesValue }),
        ...(input.updatedBy !== undefined && { updatedBy: input.updatedBy }),
      },
    });

    // Invalida caché tras write (regla CLAUDE.md #5)
    invalidate(CACHE_KEY_ALL);

    return mapRow(row);
  },

  /**
   * Conveniencia: marca un item como done (stampa completedAt, progress=100).
   */
  async markDone(
    itemId: string,
    updatedBy?: string,
  ): Promise<DbRoadmapItemStatus> {
    return this.upsert(itemId, { status: "done", progress: 100, updatedBy });
  },

  /**
   * Conveniencia: marca un item como in_progress (stampa startedAt).
   */
  async markInProgress(
    itemId: string,
    updatedBy?: string,
    progress = 10,
  ): Promise<DbRoadmapItemStatus> {
    return this.upsert(itemId, { status: "in_progress", progress, updatedBy });
  },

  /**
   * Conveniencia: marca un item como blocked con nota explicativa.
   */
  async markBlocked(
    itemId: string,
    reason: string,
    updatedBy?: string,
  ): Promise<DbRoadmapItemStatus> {
    return this.upsert(itemId, {
      status: "blocked",
      notes: reason,
      updatedBy,
    });
  },
};
