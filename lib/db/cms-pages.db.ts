import "server-only";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { PageInput, BlockInput } from "@/lib/cms/types";

// ═══════════════════════════════════════════════════════
// PÁGINAS POR BLOQUES (CMS) — única vía a `Page`, `PageBlock`, `PageVersion`
// `tenantId` va PRIMERO en todo. La lectura pública (`publicadaPorSlug`) es la
// única cacheada; todo write la invalida con `invalidar`.
// ═══════════════════════════════════════════════════════

const tagPaginas = (tenantId: string) => `tenant:${tenantId}:cms-pages`;

/** Vence ya (no «sirve lo viejo mientras revalida»): publicar y mirar no puede dar 404. */
function invalidar(tenantId: string): void {
  revalidateTag(tagPaginas(tenantId), { expire: 0 });
}

const aJson = (v: unknown) => v as Prisma.InputJsonValue;

export interface BloquePublico {
  id: string;
  type: string;
  order: number;
  visible: boolean;
  props: Record<string, unknown>;
  styles: Record<string, unknown> | null;
}

export interface PaginaPublica {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  ogImage: string | null;
  createdAt: string;
  updatedAt: string;
  blocks: BloquePublico[];
}

/** Datos de un bloque a guardar: lo que el Zod deja pasar, con los Json tipados. */
type BloqueEscritura = Partial<BlockInput>;

function datosBloque(d: BloqueEscritura): Prisma.PageBlockUncheckedUpdateManyInput {
  return {
    ...(d.type !== undefined && { type: d.type }),
    ...(d.order !== undefined && { order: d.order }),
    ...(d.visible !== undefined && { visible: d.visible }),
    ...(d.props !== undefined && { props: aJson(d.props) }),
    ...(d.styles !== undefined && { styles: aJson(d.styles) }),
    ...(d.mobileProps !== undefined && { mobileProps: aJson(d.mobileProps) }),
  };
}

function datosPagina(d: Partial<PageInput>): Prisma.PageUncheckedUpdateManyInput {
  const { settings, ...resto } = d;
  return { ...resto, ...(settings !== undefined && { settings: aJson(settings) }) };
}

export const CmsPagesDB = {
  // ─── Lectura pública (cacheada) ───────────────────────
  /** La página PUBLICADA de ese negocio, con sus bloques visibles en orden. */
  async publicadaPorSlug(tenantId: string, slug: string): Promise<PaginaPublica | null> {
    "use cache";
    cacheLife({ revalidate: 300, stale: 60, expire: 1800 });
    cacheTag(tagPaginas(tenantId));

    const p = await prisma.page.findFirst({
      where: { tenantId, slug, status: "PUBLISHED" },
      include: { blocks: { where: { visible: true }, orderBy: [{ order: "asc" }, { createdAt: "asc" }] } },
    });
    if (!p) return null;
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      description: p.description,
      metaTitle: p.metaTitle,
      metaDescription: p.metaDescription,
      ogImage: p.ogImage,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
      blocks: p.blocks.map((b) => ({
        id: b.id,
        type: b.type,
        order: b.order,
        visible: b.visible,
        props: (b.props ?? {}) as Record<string, unknown>,
        styles: (b.styles ?? null) as Record<string, unknown> | null,
      })),
    };
  },

  // ─── Panel ────────────────────────────────────────────
  async listar(tenantId: string) {
    return prisma.page.findMany({
      where: { tenantId },
      include: { _count: { select: { blocks: true, versions: true } } },
      orderBy: { updatedAt: "desc" },
    });
  },

  async porId(tenantId: string, id: string) {
    return prisma.page.findFirst({
      where: { id, tenantId },
      include: { blocks: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } },
    });
  },

  /** Lanza con `code: "P2002"` si el enlace ya existe en ese negocio. */
  async crear(tenantId: string, data: PageInput) {
    const page = await prisma.page.create({
      data: { ...datosPagina(data), tenantId } as Prisma.PageUncheckedCreateInput,
    });
    invalidar(tenantId);
    return page;
  },

  async actualizar(tenantId: string, id: string, data: Partial<PageInput>) {
    const r = await prisma.page.updateMany({ where: { id, tenantId }, data: datosPagina(data) });
    if (r.count === 0) return null;
    invalidar(tenantId);
    return prisma.page.findFirst({ where: { id, tenantId } });
  },

  async eliminar(tenantId: string, id: string) {
    const r = await prisma.page.deleteMany({ where: { id, tenantId } });
    if (r.count === 0) return null;
    invalidar(tenantId);
    return { deleted: true };
  },

  /** Publica y deja una foto de cómo quedó (PageVersion). */
  async publicar(tenantId: string, id: string) {
    const page = await prisma.$transaction(async (tx) => {
      const r = await tx.page.updateMany({
        where: { id, tenantId },
        data: { status: "PUBLISHED", publishedAt: new Date() },
      });
      if (r.count === 0) return null;
      const p = await tx.page.findFirst({
        where: { id, tenantId },
        include: { blocks: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] } },
      });
      if (!p) return null;
      await tx.pageVersion.create({
        data: {
          pageId: id,
          title: p.title,
          blocks: aJson(p.blocks),
          settings: p.settings === null ? undefined : aJson(p.settings),
          comment: "Publicación",
        },
      });
      return p;
    });
    if (page) invalidar(tenantId);
    return page;
  },

  async despublicar(tenantId: string, id: string) {
    const r = await prisma.page.updateMany({ where: { id, tenantId }, data: { status: "DRAFT" } });
    if (r.count === 0) return null;
    invalidar(tenantId);
    return prisma.page.findFirst({ where: { id, tenantId } });
  },

  // ─── Bloques: la propiedad se verifica contra la página del negocio ───
  async listarBloques(tenantId: string, pageId: string) {
    return prisma.pageBlock.findMany({
      where: { pageId, page: { tenantId } },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    });
  },

  async crearBloque(tenantId: string, pageId: string, data: BlockInput) {
    const paginaDelNegocio = await prisma.page.findFirst({ where: { id: pageId, tenantId }, select: { id: true } });
    if (!paginaDelNegocio) return null;
    // Siempre al final: el orden lo decide el servidor, no la cuenta que trae el navegador.
    const max = await prisma.pageBlock.aggregate({ where: { pageId }, _max: { order: true } });
    const bloque = await prisma.pageBlock.create({
      data: {
        pageId,
        type: data.type,
        order: (max._max.order ?? -1) + 1,
        visible: data.visible,
        props: aJson(data.props),
        ...(data.styles !== undefined && { styles: aJson(data.styles) }),
        ...(data.mobileProps !== undefined && { mobileProps: aJson(data.mobileProps) }),
      },
    });
    invalidar(tenantId);
    return bloque;
  },

  async actualizarBloque(tenantId: string, pageId: string, blockId: string, data: BloqueEscritura) {
    /* eslint-disable no-restricted-syntax -- pageBlock indirecto (ADR-101): tenantId via FK page. */
    const r = await prisma.pageBlock.updateMany({
      where: { id: blockId, pageId, page: { tenantId } },
      data: datosBloque(data),
    });
    /* eslint-enable no-restricted-syntax */
    if (r.count === 0) return null;
    invalidar(tenantId);
    return prisma.pageBlock.findUnique({ where: { id: blockId } });
  },

  async eliminarBloque(tenantId: string, pageId: string, blockId: string) {
    /* eslint-disable no-restricted-syntax -- pageBlock indirecto (ADR-101): tenantId via FK page. */
    const r = await prisma.pageBlock.deleteMany({
      where: { id: blockId, pageId, page: { tenantId } },
    });
    /* eslint-enable no-restricted-syntax */
    if (r.count === 0) return null;
    invalidar(tenantId);
    return { deleted: true };
  },

  async reordenarBloques(tenantId: string, pageId: string, orden: { id: string; order: number }[]) {
    const paginaDelNegocio = await prisma.page.findFirst({ where: { id: pageId, tenantId }, select: { id: true } });
    if (!paginaDelNegocio) return null;
    /* eslint-disable no-restricted-syntax -- pageBlock indirecto (ADR-101): pageId ya validado contra el negocio arriba. */
    const r = await prisma.$transaction(
      orden.map((o) =>
        prisma.pageBlock.updateMany({ where: { id: o.id, pageId }, data: { order: o.order } }),
      ),
    );
    /* eslint-enable no-restricted-syntax */
    invalidar(tenantId);
    return r;
  },

  async duplicarBloque(tenantId: string, pageId: string, blockId: string) {
    const origen = await prisma.pageBlock.findFirst({
      where: { id: blockId, pageId, page: { tenantId } },
    });
    if (!origen) return null;
    const max = await prisma.pageBlock.aggregate({ where: { pageId }, _max: { order: true } });
    const copia = await prisma.pageBlock.create({
      data: {
        pageId,
        type: origen.type,
        order: (max._max.order ?? 0) + 1,
        visible: origen.visible,
        props: aJson(origen.props),
        ...(origen.styles !== null && { styles: aJson(origen.styles) }),
        ...(origen.mobileProps !== null && { mobileProps: aJson(origen.mobileProps) }),
      },
    });
    invalidar(tenantId);
    return copia;
  },
};
