// ═══════════════════════════════════════════════════════
// CMS DATABASE HELPERS - Pages CRUD
// ═══════════════════════════════════════════════════════

import { prisma } from "@/lib/prisma";
import type { PageInput, BlockInput } from "../cms/types";

// ─── Pages ──────────────────────────────────────────────
// SECURITY 2026-05-06 (audit CMS #1): tenantId requerido. Antes
// getAllPages/getPageById no filtraban → admin de tenant A podía ver/editar
// páginas de tenant B en una arquitectura multi-tenant escalada.

export async function getAllPages(tenantId: string) {
  return await prisma.page.findMany({
    where: { tenantId },
    include: {
      blocks: {
        orderBy: { order: "asc" },
      },
      _count: {
        select: { blocks: true, versions: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export async function getPageBySlug(slug: string, tenantId: string, includeBlocks = true) {
  // Page tiene @@unique([tenantId, slug]) — usar findFirst con where compuesto
  return await prisma.page.findFirst({
    where: { tenantId, slug },
    include: {
      blocks: includeBlocks ? { orderBy: { order: "asc" } } : false,
    },
  });
}

export async function getPageById(id: string, tenantId: string, includeBlocks = true) {
  return await prisma.page.findFirst({
    where: { id, tenantId },
    include: {
      blocks: includeBlocks ? { orderBy: { order: "asc" } } : false,
    },
  });
}

export async function createPage(data: PageInput) {
  return await prisma.page.create({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: data as any,
  });
}

// SECURITY 2026-05-06 (audit CMS Critical #1): tenantId obligatorio en
// mutations. Antes admin de tenant A podía pasar id de tenant B y mutar
// páginas ajenas (IDOR cross-tenant trivial).
export async function updatePage(id: string, tenantId: string, data: Partial<PageInput>) {
  const result = await prisma.page.updateMany({
    where: { id, tenantId },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: data as any,
  });
  if (result.count === 0) return null;
  return await prisma.page.findUnique({ where: { id } });
}

export async function deletePage(id: string, tenantId: string) {
  // Cascade delete blocks and versions — verifica ownership primero.
  const page = await prisma.page.findFirst({ where: { id, tenantId }, select: { id: true } });
  if (!page) return null;
  return await prisma.page.delete({ where: { id } });
}

export async function publishPage(id: string, tenantId: string) {
  const result = await prisma.page.updateMany({
    where: { id, tenantId },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
  });
  if (result.count === 0) return null;
  const page = await prisma.page.findUnique({
    where: { id },
    include: { blocks: true },
  });
  if (!page) return null;

  // Create version snapshot
  await prisma.pageVersion.create({
    data: {
      pageId: id,
      title: page.title,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      blocks: page.blocks as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      settings: page.settings as any,
      comment: "Publicación",
    },
  });

  return page;
}

export async function draftPage(id: string, tenantId: string) {
  const result = await prisma.page.updateMany({
    where: { id, tenantId },
    data: { status: "DRAFT" },
  });
  if (result.count === 0) return null;
  return await prisma.page.findUnique({ where: { id } });
}

export async function archivePage(id: string, tenantId: string) {
  const result = await prisma.page.updateMany({
    where: { id, tenantId },
    data: { status: "ARCHIVED" },
  });
  if (result.count === 0) return null;
  return await prisma.page.findUnique({ where: { id } });
}

// ─── Blocks ─────────────────────────────────────────────

export async function getPageBlocks(pageId: string) {
  return await prisma.pageBlock.findMany({
    where: { pageId },
    orderBy: { order: "asc" },
  });
}

export async function createBlock(pageId: string, data: BlockInput) {
  // Get max order
  const maxOrder = await prisma.pageBlock.aggregate({
    where: { pageId },
    _max: { order: true },
  });

  return await prisma.pageBlock.create({
    data: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ...(data as any),
      pageId,
      order: data.order ?? (maxOrder._max.order ?? 0) + 1,
    },
  });
}

export async function updateBlock(id: string, data: Partial<BlockInput>) {
  return await prisma.pageBlock.update({
    where: { id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: data as any,
  });
}

export async function deleteBlock(id: string) {
  return await prisma.pageBlock.delete({
    where: { id },
  });
}

export async function reorderBlocks(pageId: string, blockOrders: { id: string; order: number }[]) {
  // SECURITY 2026-05-06 (audit CMS #5): updateMany compuesto `id + pageId`
  // evita reordenar bloques de OTRA página (IDOR).
  return await prisma.$transaction(
    blockOrders.map((item) =>
      prisma.pageBlock.updateMany({
        where: { id: item.id, pageId },
        data: { order: item.order },
      })
    )
  );
}

export async function duplicateBlock(id: string, pageId: string) {
  // SECURITY 2026-05-06 (audit CMS #6): exigir pageId del path para verificar
  // que el block que se duplica realmente pertenece a esa página.
  const block = await prisma.pageBlock.findFirst({
    where: { id, pageId },
  });

  if (!block) {
    throw new Error("Block not found");
  }

  // Get max order
  const maxOrder = await prisma.pageBlock.aggregate({
    where: { pageId: block.pageId },
    _max: { order: true },
  });

  // Create copy
  return await prisma.pageBlock.create({
    data: {
      pageId: block.pageId,
      type: block.type,
      order: (maxOrder._max.order ?? 0) + 1,
      visible: block.visible,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      props: block.props as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      styles: block.styles as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mobileProps: block.mobileProps as any,
    },
  });
}

// ─── Versions ───────────────────────────────────────────

export async function getPageVersions(pageId: string) {
  return await prisma.pageVersion.findMany({
    where: { pageId },
    orderBy: { createdAt: "desc" },
  });
}

export async function restorePageVersion(versionId: string) {
  const version = await prisma.pageVersion.findUnique({
    where: { id: versionId },
  });

  if (!version) {
    throw new Error("Version not found");
  }

  // Delete current blocks
  await prisma.pageBlock.deleteMany({
    where: { pageId: version.pageId },
  });

  // Restore blocks from version
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma JSON field type
  const blocks = version.blocks as any[];
  await prisma.pageBlock.createMany({
    data: blocks.map((block, index) => ({
      pageId: version.pageId,
      type: block.type,
      order: index,
      visible: block.visible ?? true,
      props: block.props,
      styles: block.styles,
      mobileProps: block.mobileProps,
    })),
  });

  // Update page
  return await prisma.page.update({
    where: { id: version.pageId },
    data: {
      title: version.title,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      settings: version.settings as any,
    },
  });
}
