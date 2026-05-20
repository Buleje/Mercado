import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * SupportTicketsDB
 *
 * Acceso canonico a `SupportTicket` (formulario de contacto + tickets
 * del admin). Audit project-wide 2026-05-19 — migracion de /api/contact.
 */

interface CreateData {
  tenantId: string;
  subject: string;
  message: string;
  status?: string;
  priority?: string;
  createdBy?: string | null;
}

export const SupportTicketsDB = {
  async create(data: CreateData) {
    return prisma.supportTicket.create({
      data: {
        tenantId: data.tenantId,
        subject: data.subject,
        message: data.message,
        status: data.status ?? "open",
        priority: data.priority ?? "medium",
        createdBy: data.createdBy ?? undefined,
      },
    });
  },
};
