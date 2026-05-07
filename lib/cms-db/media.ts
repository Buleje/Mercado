// ═══════════════════════════════════════════════════════
// CMS DATABASE HELPERS - Media CRUD
// SECURITY 2026-05-06 (audit CMS #2 + storefront H05): tenantId obligatorio
// en queries de lectura y escritura. Antes admin de tenant A podía listar/
// buscar/leer/borrar TODOS los assets de todos los tenants (filenames, URLs,
// alt text, tags — incluyendo branding de competidores).
// ═══════════════════════════════════════════════════════

import { prisma } from "@/lib/prisma";
import type { MediaInput } from "../cms/types";

export async function getAllMedia(tenantId: string, folder?: string) {
  return await prisma.media.findMany({
    where: { tenantId, ...(folder ? { folder } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

export async function getMediaById(id: string, tenantId: string) {
  return await prisma.media.findFirst({
    where: { id, tenantId },
  });
}

export async function createMedia(data: MediaInput, tenantId: string) {
  return await prisma.media.create({
    data: { ...data, tenantId },
  });
}

export async function updateMedia(id: string, tenantId: string, data: Partial<MediaInput>) {
  // updateMany con where compuesto evita update cross-tenant.
  const result = await prisma.media.updateMany({
    where: { id, tenantId },
    data,
  });
  if (result.count === 0) return null;
  return await prisma.media.findUnique({ where: { id } });
}

export async function deleteMedia(id: string, tenantId: string) {
  return await prisma.media.deleteMany({
    where: { id, tenantId },
  });
}

export async function incrementMediaUsage(id: string, tenantId: string) {
  const result = await prisma.media.updateMany({
    where: { id, tenantId },
    data: {
      usageCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  });
  return result.count > 0;
}

export async function searchMedia(query: string, tenantId: string) {
  return await prisma.media.findMany({
    where: {
      tenantId,
      OR: [
        { filename: { contains: query, mode: "insensitive" } },
        { alt: { contains: query, mode: "insensitive" } },
        { title: { contains: query, mode: "insensitive" } },
        { tags: { has: query } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
}
