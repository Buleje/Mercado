import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), revalidateTag: vi.fn() }));

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    page: { findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    pageBlock: {
      findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(),
      updateMany: vi.fn(), deleteMany: vi.fn(), aggregate: vi.fn(),
    },
    pageVersion: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

import { revalidateTag } from "next/cache";
import { CmsPagesDB } from "@/lib/db/cms-pages.db";

beforeEach(() => vi.clearAllMocks());

describe("CmsPagesDB — todo va acotado al negocio", () => {
  it("publicadaPorSlug pide sólo páginas PUBLICADAS de ese negocio", async () => {
    prismaMock.page.findFirst.mockResolvedValue(null);
    expect(await CmsPagesDB.publicadaPorSlug("neg-a", "ofertas")).toBeNull();
    expect(prismaMock.page.findFirst.mock.calls[0][0].where).toEqual({
      tenantId: "neg-a", slug: "ofertas", status: "PUBLISHED",
    });
  });

  it("listar y porId filtran por tenantId", async () => {
    prismaMock.page.findMany.mockResolvedValue([]);
    prismaMock.page.findFirst.mockResolvedValue(null);
    await CmsPagesDB.listar("neg-a");
    await CmsPagesDB.porId("neg-a", "p1");
    expect(prismaMock.page.findMany.mock.calls[0][0].where).toEqual({ tenantId: "neg-a" });
    expect(prismaMock.page.findFirst.mock.calls[0][0].where).toEqual({ id: "p1", tenantId: "neg-a" });
  });

  it("crearBloque en una página de OTRO negocio no escribe nada", async () => {
    prismaMock.page.findFirst.mockResolvedValue(null);
    const r = await CmsPagesDB.crearBloque("neg-a", "pagina-de-b", {
      type: "hero", order: 0, visible: true, props: {},
    });
    expect(r).toBeNull();
    expect(prismaMock.pageBlock.create).not.toHaveBeenCalled();
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("actualizar y eliminar bloque exigen que la página sea del negocio", async () => {
    prismaMock.pageBlock.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.pageBlock.deleteMany.mockResolvedValue({ count: 0 });
    expect(await CmsPagesDB.actualizarBloque("neg-a", "p1", "b1", { props: { title: "x" } })).toBeNull();
    expect(await CmsPagesDB.eliminarBloque("neg-a", "p1", "b1")).toBeNull();
    expect(prismaMock.pageBlock.updateMany.mock.calls[0][0].where).toEqual({
      id: "b1", pageId: "p1", page: { tenantId: "neg-a" },
    });
    expect(prismaMock.pageBlock.deleteMany.mock.calls[0][0].where).toEqual({
      id: "b1", pageId: "p1", page: { tenantId: "neg-a" },
    });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("reordenar en página ajena devuelve null sin tocar bloques", async () => {
    prismaMock.page.findFirst.mockResolvedValue(null);
    expect(await CmsPagesDB.reordenarBloques("neg-a", "pagina-de-b", [{ id: "x", order: 0 }])).toBeNull();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("duplicarBloque busca el bloque por página Y negocio", async () => {
    prismaMock.pageBlock.findFirst.mockResolvedValue(null);
    expect(await CmsPagesDB.duplicarBloque("neg-a", "p1", "b1")).toBeNull();
    expect(prismaMock.pageBlock.findFirst.mock.calls[0][0].where).toEqual({
      id: "b1", pageId: "p1", page: { tenantId: "neg-a" },
    });
  });

  it("un write que sí aplica invalida la lectura pública de ESE negocio, ya", async () => {
    prismaMock.page.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.page.findFirst.mockResolvedValue({ id: "p1" });
    await CmsPagesDB.despublicar("neg-a", "p1");
    expect(revalidateTag).toHaveBeenCalledWith("tenant:neg-a:cms-pages", { expire: 0 });
  });

  it("un write que no encuentra la página no invalida nada", async () => {
    prismaMock.page.updateMany.mockResolvedValue({ count: 0 });
    expect(await CmsPagesDB.despublicar("neg-a", "ajena")).toBeNull();
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
