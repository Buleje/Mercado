// ═══════════════════════════════════════════════════════
// CMS DATABASE HELPERS - Media CRUD
// ═══════════════════════════════════════════════════════

import { prisma } from "@/lib/prisma";
import type { MediaInput } from "../cms/types";

export async function getAllMedia(folder?: string) {
  return await prisma.media.findMany({
    where: folder ? { folder } : undefined,
    orderBy: { createdAt: "desc" },
  });
}

export async function getMediaById(id: string) {
  return await prisma.media.findUnique({
    where: { id },
  });
}

export async function createMedia(data: MediaInput, tenantId = "main") {
  return await prisma.media.create({
    data: { ...data, tenantId },
  });
}

export async function updateMedia(id: string, data: Partial<MediaInput>) {
  return await prisma.media.update({
    where: { id },
    data,
  });
}

export async function deleteMedia(id: string) {
  return await prisma.media.delete({
    where: { id },
  });
}

export async function incrementMediaUsage(id: string) {
  return await prisma.media.update({
    where: { id },
    data: {
      usageCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  });
}

export async function searchMedia(query: string) {
  return await prisma.media.findMany({
    where: {
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
