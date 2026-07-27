import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    documentFolder: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    document: { findMany: vi.fn() },
  },
}));

import { DocumentsDB } from "@/lib/db/documents.db";
import { prisma } from "@/lib/prisma";

const T = "tenant-1";
const folder = prisma.documentFolder as unknown as {
  findFirst: ReturnType<typeof vi.fn>;
  findMany: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
};

/** Cada create devuelve un id nuevo y predecible: c1, c2, c3… */
function creaIdsEnOrden() {
  let n = 0;
  folder.create.mockImplementation(async () => ({ id: `c${++n}` }));
}

beforeEach(() => {
  vi.clearAllMocks();
  folder.findMany.mockResolvedValue([]);
  creaIdsEnOrden();
});

describe("DocumentsDB.createFolderTree", () => {
  it("crea cada nivel una sola vez y devuelve el id de las rutas intermedias", async () => {
    const r = await DocumentsDB.createFolderTree(T, {
      parentId: null,
      rutas: ["Contratos/2026", "Contratos/2025"],
    });

    expect(r.creadas).toBe(3); // Contratos + 2026 + 2025
    expect(Object.keys(r.idPorRuta).sort()).toEqual(["Contratos", "Contratos/2025", "Contratos/2026"]);
    // El hijo se cuelga del padre recién creado, no de la raíz.
    const hijas = folder.create.mock.calls.slice(1).map((c) => c[0].data.parentId);
    expect(hijas).toEqual([r.idPorRuta["Contratos"], r.idPorRuta["Contratos"]]);
  });

  it("reusa la carpeta que ya existe en vez de duplicarla", async () => {
    folder.findMany.mockResolvedValue([
      { id: "vieja", name: "Contratos", parentId: null },
      { id: "vieja26", name: "2026", parentId: "vieja" },
    ]);

    const r = await DocumentsDB.createFolderTree(T, { parentId: null, rutas: ["Contratos/2026/Enero"] });

    expect(r.idPorRuta["Contratos"]).toBe("vieja");
    expect(r.idPorRuta["Contratos/2026"]).toBe("vieja26");
    expect(r.creadas).toBe(1); // sólo Enero
    expect(folder.create).toHaveBeenCalledTimes(1);
  });

  it("compara nombres sin distinguir mayúsculas ni espacios de sobra", async () => {
    folder.findMany.mockResolvedValue([{ id: "vieja", name: "  CONTRATOS ", parentId: null }]);
    const r = await DocumentsDB.createFolderTree(T, { parentId: null, rutas: ["Contratos"] });
    expect(r.idPorRuta["Contratos"]).toBe("vieja");
    expect(folder.create).not.toHaveBeenCalled();
  });

  it("una carpeta con el mismo nombre bajo OTRO padre no se reusa", async () => {
    folder.findMany.mockResolvedValue([{ id: "otra26", name: "2026", parentId: "otro-padre" }]);
    const r = await DocumentsDB.createFolderTree(T, { parentId: null, rutas: ["Contratos/2026"] });
    expect(r.idPorRuta["Contratos/2026"]).not.toBe("otra26");
    expect(r.creadas).toBe(2);
  });

  it("cuelga todo del destino cuando se importa dentro de una carpeta", async () => {
    folder.findFirst.mockResolvedValue({ id: "destino" });
    const r = await DocumentsDB.createFolderTree(T, { parentId: "destino", rutas: ["Boletas"] });
    expect(folder.create.mock.calls[0][0].data.parentId).toBe("destino");
    expect(r.creadas).toBe(1);
  });

  it("no escribe nada si el destino no es del tenant", async () => {
    folder.findFirst.mockResolvedValue(null);
    await expect(
      DocumentsDB.createFolderTree(T, { parentId: "de-otro-tenant", rutas: ["Boletas"] }),
    ).rejects.toThrow("parent_not_found");
    expect(folder.create).not.toHaveBeenCalled();
  });

  it("aguanta rutas repetidas sin crear la misma carpeta dos veces", async () => {
    const r = await DocumentsDB.createFolderTree(T, {
      parentId: null,
      rutas: ["Boletas/enero", "Boletas/enero", "Boletas"],
    });
    expect(r.creadas).toBe(2);
    expect(folder.create).toHaveBeenCalledTimes(2);
  });

  it("recorta los nombres kilométricos al máximo de la columna", async () => {
    await DocumentsDB.createFolderTree(T, { parentId: null, rutas: ["x".repeat(200)] });
    expect(folder.create.mock.calls[0][0].data.name).toHaveLength(80);
  });
});

const doc = prisma.document as unknown as { findMany: ReturnType<typeof vi.fn> };

describe("DocumentsDB.listNamesInFolders", () => {
  beforeEach(() => doc.findMany.mockResolvedValue([]));

  it("devuelve el ID: sin él, 'reemplazar' no sabe a qué documento versionar", async () => {
    doc.findMany.mockResolvedValue([{ id: "d7", folderId: "f1", name: "a.pdf", originalName: "a.pdf", size: 10 }]);
    const r = await DocumentsDB.listNamesInFolders(T, ["f1"]);
    expect(r["f1"][0]).toEqual({ id: "d7", name: "a.pdf", size: 10 });
    expect(doc.findMany.mock.calls[0][0].select.id).toBe(true);
  });

  it("agrupa por carpeta y usa la raíz como clave vacía", async () => {
    doc.findMany.mockResolvedValue([
      { id: "d1", folderId: "f1", name: "a.pdf", originalName: "a.pdf", size: 10 },
      { id: "d2", folderId: "f1", name: "b.pdf", originalName: "b.pdf", size: 20 },
      { id: "d3", folderId: null, name: "suelto.pdf", originalName: "suelto.pdf", size: 30 },
    ]);
    const r = await DocumentsDB.listNamesInFolders(T, ["f1", null]);
    expect(r["f1"]).toHaveLength(2);
    expect(r[""]).toEqual([{ id: "d3", name: "suelto.pdf", size: 30 }]);
  });

  it("devuelve el nombre ORIGINAL: es con el que compara el importador", async () => {
    doc.findMany.mockResolvedValue([
      { id: "d4", folderId: "f1", name: "Contrato renombrado", originalName: "alquiler-local.pdf", size: 10 },
    ]);
    const r = await DocumentsDB.listNamesInFolders(T, ["f1"]);
    expect(r["f1"][0].name).toBe("alquiler-local.pdf");
  });

  it("no consulta nada si no le pasan carpetas", async () => {
    expect(await DocumentsDB.listNamesInFolders(T, [])).toEqual({});
    expect(doc.findMany).not.toHaveBeenCalled();
  });

  it("pide sólo la raíz cuando es la única carpeta", async () => {
    await DocumentsDB.listNamesInFolders(T, [null]);
    expect(doc.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: T, deletedAt: null, folderId: null });
  });

  it("nunca cuenta los documentos borrados", async () => {
    await DocumentsDB.listNamesInFolders(T, ["f1"]);
    expect(doc.findMany.mock.calls[0][0].where.deletedAt).toBeNull();
  });
});
