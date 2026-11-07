import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const h = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findMany: vi.fn(),
  updateMany: vi.fn(),
  create: vi.fn(),
  createFolderTree: vi.fn(),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { documentFolder: { findFirst: h.findFirst, findMany: h.findMany, updateMany: h.updateMany, create: h.create } },
}));
vi.mock("@/lib/db/documents.db", () => ({ DocumentsDB: { createFolderTree: h.createFolderTree } }));

import { CarpetasSistemaDB } from "@/lib/db/carpetas-sistema.db";
import { esTagDeSistema } from "@/lib/documentos/carpetas-del-sistema";
import { carpetaDelExpediente } from "@/lib/forestal/ctp-archivar-documento";

beforeEach(() => {
  Object.values(h).forEach((m) => m.mockReset());
  CarpetasSistemaDB.olvidar("t1");
  CarpetasSistemaDB.olvidar("t2");
});

describe("raizDelSistema", () => {
  it("(a) usa la carpeta etiquetada esté donde esté", async () => {
    h.findFirst.mockResolvedValue({ id: "movida" });
    expect(await CarpetasSistemaDB.raizDelSistema("t1", "guias")).toBe("movida");
    expect(h.findFirst.mock.calls[0][0].where).toEqual({ tenantId: "t1", tags: { has: "sistema:guias" } });
    expect(h.create).not.toHaveBeenCalled();
  });

  it("(b) sin etiqueta adopta la de la raíz con su nombre y la etiqueta", async () => {
    h.findFirst.mockResolvedValue(null);
    h.findMany.mockResolvedValue([{ id: "x", name: "otra", tags: [] }, { id: "raiz", name: " libro th ", tags: ["a"] }]);
    expect(await CarpetasSistemaDB.raizDelSistema("t1", "libro-th")).toBe("raiz");
    expect(h.updateMany).toHaveBeenCalledWith({ where: { id: "raiz", tenantId: "t1" }, data: { tags: ["a", "sistema:libro-th"] } });
  });

  it("(c) si no existe la crea en la raíz con nombre y etiqueta (y roles pedidos)", async () => {
    h.findFirst.mockResolvedValue(null);
    h.findMany.mockResolvedValue([]);
    h.create.mockResolvedValue({ id: "nueva" });
    expect(await CarpetasSistemaDB.raizDelSistema("t1", "camaras", undefined, ["admin"])).toBe("nueva");
    expect(h.create.mock.calls[0][0].data).toEqual({
      tenantId: "t1", parentId: null, name: "Cámaras", tags: ["sistema:camaras"], allowedRoles: ["admin"],
    });
  });

  it("recuerda el id por tenant: la 2.ª llamada no toca la base", async () => {
    h.findFirst.mockResolvedValue({ id: "movida" });
    await CarpetasSistemaDB.raizDelSistema("t1", "guias");
    await CarpetasSistemaDB.raizDelSistema("t1", "guias");
    expect(h.findFirst).toHaveBeenCalledTimes(1);
    h.findFirst.mockResolvedValue({ id: "otra" });
    expect(await CarpetasSistemaDB.raizDelSistema("t2", "guias")).toBe("otra");
  });
});

describe("carpetaDeRuta", () => {
  it("crea lo de abajo DEBAJO de la raíz del sistema", async () => {
    h.findFirst.mockResolvedValue({ id: "movida" });
    h.createFolderTree.mockResolvedValue({ idPorRuta: { "T/P": "hoja" } });
    expect(await CarpetasSistemaDB.carpetaDeRuta("t1", "guias", ["Guías forestales (GTF)", "T", "P"])).toBe("hoja");
    expect(h.createFolderTree).toHaveBeenCalledWith("t1", { parentId: "movida", rutas: ["T/P"] });
  });
});

describe("carpetaDelExpediente (cliente)", () => {
  it("prefiere la etiquetada aunque no esté en la raíz", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          folders: [
            { id: "vieja", name: "Guías forestales (GTF)", parentId: null, tags: [] },
            { id: "movida", name: "Guías forestales (GTF)", parentId: "x", tags: ["sistema:guias"] },
          ],
        }),
      }),
    );
    expect(await carpetaDelExpediente()).toBe("movida");
    vi.unstubAllGlobals();
  });
});

describe("esTagDeSistema", () => {
  it("reconoce sistema:*", () => {
    expect(esTagDeSistema("sistema:guias")).toBe(true);
    expect(esTagDeSistema("guias")).toBe(false);
  });
});

import { idDeRutaDelSistema } from "@/lib/documentos/carpetas-del-sistema";
import { arbolPersonas } from "@/lib/camaras/personas-galeria";
import { vinculosDeCarpetaSistema, rutaDeCarpeta } from "@/lib/documentos/vinculos-sistema";
import { planOrdenar } from "@/lib/documentos/ordenar-archivo";

describe("raíces movidas dentro de otra carpeta", () => {
  const movida = [
    { id: "orden", name: "Forestal", parentId: null, tags: [] },
    { id: "cam", name: "Cámaras", parentId: "orden", tags: ["sistema:camaras"] },
    { id: "per", name: "Personas", parentId: "cam", tags: [] },
    { id: "g", name: "Guías forestales (GTF)", parentId: "orden", tags: ["sistema:guias"] },
    { id: "gt", name: "ACME", parentId: "g", tags: [] },
  ];
  it("idDeRutaDelSistema y arbolPersonas llegan a Personas por la marca", () => {
    expect(idDeRutaDelSistema(movida, "camaras", ["Cámaras", "Personas"])).toBe("per");
    expect(arbolPersonas(movida)?.personasId).toBe("per");
  });
  it("sin marca sigue funcionando por nombre en la raíz", () => {
    const vieja = [{ id: "c", name: "Cámaras", parentId: null }, { id: "p", name: "Personas", parentId: "c" }];
    expect(idDeRutaDelSistema(vieja, "camaras", ["Cámaras", "Personas"])).toBe("p");
  });
  it("el mapa carpeta→módulo reconoce la raíz de guías movida y sus hijas", () => {
    const porId = new Map(movida.map((c) => [c.id, c]));
    expect(vinculosDeCarpetaSistema(movida[3], porId).some((v) => v.tipo === "guias")).toBe(true);
    expect(vinculosDeCarpetaSistema(movida[4], porId).find((v) => v.tipo === "guias")?.heredadoDe).toBe("Guías forestales (GTF)");
    expect(rutaDeCarpeta(movida[4], porId)).toHaveLength(3);
  });
  it("ordenar no propone borrar una raíz del sistema vacía aunque esté movida", () => {
    const base = { documentos: 0, subcarpetas: 0, creadaEn: "2020-01-01T00:00:00Z", visible: true, borrable: true };
    const plan = planOrdenar({
      ahora: new Date("2026-10-31T00:00:00Z"),
      papeles: [],
      carpetas: [
        { id: "orden", name: "Forestal", parentId: null, ...base, subcarpetas: 1 },
        { id: "g", name: "Ccosas", parentId: "orden", tags: ["sistema:guias"], ...base },
      ],
    });
    expect(plan.propuestas.some((p) => p.objetoId === "g")).toBe(false);
  });
});
