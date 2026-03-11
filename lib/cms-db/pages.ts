// ═══════════════════════════════════════════════════════
// CMS DATABASE HELPERS - Pages CRUD
// ═══════════════════════════════════════════════════════

import { prisma } from "@/lib/prisma";
import type { PageInput, BlockInput } from "../cms/types";

// ─── Pages ──────────────────────────────────────────────

export async function getAllPages() {
  return await prisma.page.findMany({
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

export async function getPageBySlug(slug: string, includeBlocks = true) {
  return await prisma.page.findUnique({
    where: { slug },
    include: {
      blocks: includeBlocks ? { orderBy: { order: "asc" } } : false,
    },
  });
}

export async function getPageById(id: string, includeBlocks = true) {
  return await prisma.page.findUnique({
    where: { id },
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

export async function updatePage(id: string, data: Partial<PageInput>) {
  return await prisma.page.update({
    where: { id },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: data as any,
  });
}

export async function deletePage(id: string) {
  // Cascade delete blocks and versions
  return await prisma.page.delete({
    where: { id },
  });
}

export async function publishPage(id: string) {
  const page = await prisma.page.update({
    where: { id },
    data: {
      status: "PUBLISHED",
      publishedAt: new Date(),
    },
    include: {
      blocks: true,
    },
  });

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

export async function draftPage(id: string) {
  return await prisma.page.update({
    where: { id },
    data: {
      status: "DRAFT",
    },
  });
}

export async function archivePage(id: string) {
  return await prisma.page.update({
    where: { id },
    data: {
      status: "ARCHIVED",
    },
  });
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
      ...data,
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
  // Update all blocks in a transaction
  return await prisma.$transaction(
    blockOrders.map((item) =>
      prisma.pageBlock.update({
        where: { id: item.id },
        data: { order: item.order },
      })
    )
  );
}

export async function duplicateBlock(id: string) {
  const block = await prisma.pageBlock.findUnique({
    where: { id },
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
      props: block.props,
      styles: block.styles,
      mobileProps: block.mobileProps,
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
