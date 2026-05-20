import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * NotesDB
 *
 * Audit project-wide 2026-05-19 — migracion de /api/notes.
 * CRUD canonico de notas tipo "sticky" con tenantId obligatorio.
 */

interface CreateData {
  title: string;
  content: string;
  color: string;
  pinned: boolean;
}

interface UpdateData {
  title?: string;
  content?: string;
  color?: string;
  pinned?: boolean;
}

export const NotesDB = {
  async list(tenantId: string) {
    return prisma.note.findMany({
      where: { tenantId },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    });
  },

  async create(tenantId: string, data: CreateData) {
    return prisma.note.create({
      data: { ...data, tenantId },
    });
  },

  async updateForTenant(tenantId: string, id: string, data: UpdateData) {
    const existing = await prisma.note.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) return null;
    return prisma.note.update({ where: { id }, data });
  },

  async deleteForTenant(tenantId: string, id: string): Promise<boolean> {
    const existing = await prisma.note.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) return false;
    await prisma.note.delete({ where: { id } });
    return true;
  },

  /**
   * Lista notas con un titulo que empieza con un prefijo + filtros opcionales.
   * Util para entidades que se almacenan como Notes serializadas en JSON
   * (ej. contratos, plantillas dinamicas).
   *
   * Audit project-wide 2026-05-19 — migracion de /api/contratos.
   */
  async listByTitlePrefix(
    tenantId: string,
    prefix: string,
    opts: {
      search?: string;
      from?: Date;
      to?: Date;
    } = {},
  ) {
    const where: Record<string, unknown> = {
      tenantId,
      title: opts.search?.trim()
        ? { startsWith: prefix, contains: opts.search.trim() }
        : { startsWith: prefix },
    };
    if (opts.from || opts.to) {
      const dateFilter: Record<string, Date> = {};
      if (opts.from) dateFilter.gte = opts.from;
      if (opts.to) dateFilter.lte = opts.to;
      where.createdAt = dateFilter;
    }
    return prisma.note.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  },

  /**
   * Cuenta notas con filtros. Util para correlativos auto-incrementales.
   */
  async count(
    tenantId: string,
    opts: { titleStartsWith?: string; contentContains?: string } = {},
  ): Promise<number> {
    return prisma.note.count({
      where: {
        tenantId,
        ...(opts.titleStartsWith ? { title: { startsWith: opts.titleStartsWith } } : {}),
        ...(opts.contentContains ? { content: { contains: opts.contentContains } } : {}),
      },
    });
  },

  /**
   * Variante de count que combina titleStartsWith + contentContains
   * (AND logico — necesario para algunos correlativos legacy).
   */
  async countWithBothFilters(
    tenantId: string,
    titleStartsWith: string,
    contentContains: string,
  ): Promise<number> {
    return prisma.note.count({
      where: {
        tenantId,
        title: { startsWith: titleStartsWith },
        content: { contains: contentContains },
      },
    });
  },
};
