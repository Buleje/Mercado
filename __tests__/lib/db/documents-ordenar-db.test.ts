import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Métodos de `DocumentsDB` para «Ordenar mi Archivo» (revisión 22-10): recrear
 * carpetas es idempotente, el «Deshacer» compara con lo que el orden dejó y el
 * borrado de carpetas devuelve sólo las que de verdad se borraron.
 */

vi.mock("server-only", () => ({}));
vi.mock("@/lib/prisma", () => {
  const documentFolder = { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), count: vi.fn() };
  const document = { updateMany: vi.fn(), updateManyAndReturn: vi.fn() };
  return {
    prisma: {
      documentFolder,
      document,
      $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({ documentFolder, document })),
    },
  };
});

import { DocumentsDB, type CarpetaParaRecrear } from "@/lib/db/documents.db";
import { prisma } from "@/lib/prisma";

const T = "tenant-1";
type Fn = ReturnType<typeof vi.fn>;
const folder = prisma.documentFolder as unknown as { findMany: Fn; create: Fn; deleteMany: Fn; count: Fn };
const doc = prisma.document as unknown as { updateMany: Fn; updateManyAndReturn: Fn };

/** Un negocio en memoria: findMany ve lo que create fue dejando. */
function negocioEnMemoria(inicial: { id: string; name: string; parentId: string | null }[] = []) {
  const filas = [...inicial];
  let n = 0;
  folder.findMany.mockImplementation(async () => filas.map((f) => ({ ...f })));
  folder.create.mockImplementation(async ({ data }: { data: { name: string; parentId: string | null } }) => {
    const f = { id: `nueva${++n}`, name: data.name, parentId: data.parentId };
    filas.push(f);
    return { id: f.id };
  });
  return filas;
}

const carpeta = (over: Partial<CarpetaParaRecrear> & Pick<CarpetaParaRecrear, "id" | "name">): CarpetaParaRecrear => ({
  parentId: null, color: null, icon: null, emoji: null, tags: [], allowedRoles: [], ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("DocumentsDB.recrearCarpetas", () => {
  it("dos veces seguidas no duplica: la segunda reusa lo que creó la primera", async () => {
    const filas = negocioEnMemoria([{ id: "raiz", name: "Proyectos", parentId: null }]);
    const borradas = [
      carpeta({ id: "m", name: "Madre", parentId: "raiz" }),
      carpeta({ id: "h", name: "Hija", parentId: "m" }),
    ];
    // La hija viene primero: igual espera a su madre.
    const r1 = await DocumentsDB.recrearCarpetas(T, [borradas[1], borradas[0]]);
    expect(r1.creadas).toBe(2);
    expect(filas.find((f) => f.id === r1.ids.h)?.parentId).toBe(r1.ids.m);

    const r2 = await DocumentsDB.recrearCarpetas(T, borradas);
    expect(r2).toEqual({ ids: r1.ids, creadas: 0 });
    expect(filas).toHaveLength(3);
  });

  it("un nombre de más de 80 letras no rompe y una madre que ya no existe la manda a la raíz", async () => {
    negocioEnMemoria();
    const largo = "x".repeat(400);
    const r = await DocumentsDB.recrearCarpetas(T, [carpeta({ id: "a", name: `  ${largo}  `, parentId: "borrada" })]);
    expect(r.creadas).toBe(1);
    const data = folder.create.mock.calls[0][0].data;
    expect(data.name).toHaveLength(255);
    expect(data.parentId).toBeNull();
  });
});

describe("DocumentsDB.revertirSiSigue", () => {
  it("compara con lo que el orden dejó en el mismo UPDATE y no pisa si cambió", async () => {
    doc.updateMany.mockResolvedValue({ count: 0 });
    const ok = await DocumentsDB.revertirSiSigue(T, "p1", { name: { antes: "a.pdf", despues: "A.pdf" } });
    expect(ok).toBe(false);
    expect(doc.updateMany).toHaveBeenCalledWith({
      where: { id: "p1", tenantId: T, deletedAt: null, name: "A.pdf" },
      data: { name: "a.pdf" },
    });
  });

  it("el vencimiento vuelve y reinicia el recordatorio (ADR-119); a una carpeta de otro negocio, no", async () => {
    doc.updateMany.mockResolvedValue({ count: 1 });
    const despues = new Date("2027-01-15T12:00:00Z");
    expect(await DocumentsDB.revertirSiSigue(T, "p1", { expiresAt: { antes: null, despues } })).toBe(true);
    expect(doc.updateMany.mock.calls[0][0]).toEqual({
      where: { id: "p1", tenantId: T, deletedAt: null, expiresAt: despues },
      data: { expiresAt: null, expiryReminderSentAt: null },
    });

    folder.count.mockResolvedValue(0);
    expect(await DocumentsDB.revertirSiSigue(T, "p1", { folderId: { antes: "ajena", despues: "fac" } })).toBe(false);
    expect(doc.updateMany).toHaveBeenCalledTimes(1);
  });
});

describe("DocumentsDB.borrarCarpetasVacias", () => {
  it("devuelve sólo las que el borrado se llevó (a una le subieron algo en el medio)", async () => {
    const fila = (id: string) => ({
      id, name: id, parentId: null, color: null, icon: null, emoji: null, tags: [], allowedRoles: [],
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    folder.findMany
      .mockResolvedValueOnce([fila("v1"), fila("v2")]) // vacías al leer
      .mockResolvedValueOnce([{ id: "v2" }]); // v2 sigue: el deleteMany ya no la vio vacía
    folder.deleteMany.mockResolvedValue({ count: 1 });
    const r = await DocumentsDB.borrarCarpetasVacias(T, ["v1", "v2", "llena"]);
    expect(r.map((c) => c.id)).toEqual(["v1"]);
    expect(r[0].creadaEn).toBe("2026-01-01T00:00:00.000Z");
    expect(folder.deleteMany.mock.calls[0][0].where).toMatchObject({
      tenantId: T, id: { in: ["v1", "v2"] }, documents: { none: {} }, children: { none: {} },
    });
  });
});

describe("DocumentsDB.aLaPapeleraDevolviendoIds", () => {
  it("sólo los que estaban fuera de la papelera, y devuelve cuáles fueron", async () => {
    doc.updateManyAndReturn.mockResolvedValue([{ id: "a" }]);
    expect(await DocumentsDB.aLaPapeleraDevolviendoIds(T, ["a", "b"])).toEqual(["a"]);
    expect(doc.updateManyAndReturn.mock.calls[0][0].where).toEqual({ id: { in: ["a", "b"] }, tenantId: T, deletedAt: null });
  });
});
