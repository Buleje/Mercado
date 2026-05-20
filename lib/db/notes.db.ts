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
};
