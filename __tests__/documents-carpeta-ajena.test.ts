// @vitest-environment node
/**
 * IDOR del Drive: un `folderId` de OTRO negocio (hallazgo del architect en
 * ADR-467, ya existía).
 *
 * Hasta el 2026-09-29 `POST /api/admin/documents` guardaba el `folderId` del
 * formulario sin mirar de quién era: un documento del negocio A quedaba colgado
 * de una carpeta del negocio B (contaba en su «N archivos», heredaba sus
 * permisos). Lo mismo al moverlo (PATCH) y al moverlo en lote. El chequeo vive
 * en la DB class, con `tenantId` en el WHERE; la ruta lo traduce a 404 ANTES de
 * subir el archivo al storage.
 *
 * Mismo hueco en las CARPETAS: `createFolder`/`updateFolder` aceptaban un
 * `parentId` de otro negocio (el guard de ciclos de la ruta leía sólo el árbol
 * de este tenant, así que un id ajeno pasaba). Ahora 404 `folder_not_found`, y
 * el ciclo (mover una carpeta adentro de su nieta) se decide en la base.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => {
  const carpetas: { id: string; tenantId: string; parentId: string | null; name: string }[] = [
    { id: "f-propia", tenantId: "t-a", parentId: null, name: "Propia" },
    { id: "f-hija", tenantId: "t-a", parentId: "f-propia", name: "Hija" },
    { id: "f-nieta", tenantId: "t-a", parentId: "f-hija", name: "Nieta" },
    { id: "f-otra", tenantId: "t-a", parentId: null, name: "Otra" },
    { id: "f-ajena", tenantId: "t-b", parentId: null, name: "Ajena" },
  ];
  const carpetaDb = (c: (typeof carpetas)[number]) => ({
    ...c,
    color: null,
    icon: null,
    emoji: null,
    tags: [],
    allowedRoles: [],
    createdAt: new Date(),
    updatedAt: new Date(),
    _count: { documents: 0 },
  });
  const countCarpeta = async ({ where }: { where: { id: string; tenantId: string } }) =>
    carpetas.filter((c) => c.id === where.id && c.tenantId === where.tenantId).length;
  const carpetasCreadas: Record<string, unknown>[] = [];
  const carpetasMovidas: Record<string, unknown>[] = [];
  const tx = {
    $executeRaw: async () => 1,
    /* Como el CTE: sube por los padres desde el primer valor (el padre nuevo),
       sin salir del tenant (segundo valor). */
    $queryRaw: async (_s: TemplateStringsArray, desde: string, tenantId: string) => {
      const out: { id: string }[] = [];
      let cur = carpetas.find((c) => c.id === desde && c.tenantId === tenantId);
      while (cur && out.length < 200) {
        out.push({ id: cur.id });
        const padre = cur.parentId;
        cur = carpetas.find((c) => c.id === padre && c.tenantId === tenantId);
      }
      return out;
    },
    documentFolder: {
      count: countCarpeta,
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        carpetasMovidas.push(args);
        const c = carpetas.find((x) => x.id === args.where.id);
        return carpetaDb({ ...(c ?? carpetas[0]), ...(args.data as object) });
      },
    },
  };
  return {
    carpetas,
    carpetaDb,
    countCarpeta,
    carpetasCreadas,
    carpetasMovidas,
    tx,
    creados: [] as Record<string, unknown>[],
    updates: [] as Record<string, unknown>[],
    updateManys: [] as Record<string, unknown>[],
    subidas: [] as string[],
    doc: { id: "d1", tenantId: "t-a", folderId: "f-propia", deletedAt: null, expiresAt: null, tags: [] as string[] },
    payload: { username: "qa-admin", role: "admin", tenantId: "t-a" },
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: async (fn: (tx: typeof H.tx) => Promise<unknown>) => fn(H.tx),
    documentFolder: {
      count: H.countCarpeta,
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
        H.carpetas.find((c) => c.id === where.id && c.tenantId === where.tenantId) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        H.carpetasCreadas.push(data);
        return H.carpetaDb({ id: `f-${H.carpetasCreadas.length}`, tenantId: "t-a", parentId: null, name: "x", ...(data as object) });
      },
      update: H.tx.documentFolder.update,
    },
    document: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        H.creados.push(data);
        return { ...H.doc, ...data, id: `d-${H.creados.length}`, uploadedAt: new Date(), updatedAt: new Date() };
      },
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
        where.id === H.doc.id && where.tenantId === H.doc.tenantId ? H.doc : null,
      update: async (args: Record<string, unknown>) => {
        H.updates.push(args);
        return { ...H.doc, uploadedAt: new Date(), updatedAt: new Date() };
      },
      updateMany: async (args: Record<string, unknown>) => {
        H.updateManys.push(args);
        return { count: 1 };
      },
    },
  },
}));
vi.mock("@/lib/session", async (real) => ({
  ...(await real<typeof import("@/lib/session")>()),
  getSessionPayload: async () => H.payload,
}));
vi.mock("@/lib/auth/session-revocation", () => ({ isSessionRevoked: () => false }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/documents/storage", () => ({
  buildStoragePath: () => "t-a/d/v1/x.pdf",
  isMimeAllowed: () => true,
  uploadToStorage: async (p: string) => {
    H.subidas.push(p);
    return { ok: true };
  },
}));
vi.mock("@/lib/documents/ai-categorize", () => ({ aiCategorize: async () => ({ category: "otros", tags: [], source: "heuristic" }) }));
vi.mock("@/lib/documents/analyze-document", () => ({ analyzeDocumentContent: async () => {}, isAnalyzableMime: () => false }));
vi.mock("@/lib/documents/cola-analisis", () => ({ enColaDeAnalisis: async () => {} }));
vi.mock("@/lib/documents/precalcular-miniatura", () => ({ precalcularMiniatura: async () => {} }));

import { CarpetaAjenaError, CicloDeCarpetasError, DocumentsDB } from "@/lib/db/documents.db";
import { POST } from "@/app/api/admin/documents/route";
import { POST as CREAR_CARPETA } from "@/app/api/admin/documents/folders/route";
import { PATCH as EDITAR_CARPETA } from "@/app/api/admin/documents/folders/[id]/route";

const entrada = (folderId: string | null) => ({
  folderId,
  name: "dni.pdf",
  originalName: "dni.pdf",
  mimeType: "application/pdf",
  size: 10,
  storagePath: "pending",
  uploadedById: "qa",
});

beforeEach(() => {
  H.creados.length = 0;
  H.updates.length = 0;
  H.updateManys.length = 0;
  H.subidas.length = 0;
  H.carpetasCreadas.length = 0;
  H.carpetasMovidas.length = 0;
});

describe("DocumentsDB: la carpeta de destino tiene que ser de este negocio", () => {
  it("create con la carpeta de OTRO negocio tira CarpetaAjenaError y no crea nada", async () => {
    await expect(DocumentsDB.create("t-a", entrada("f-ajena"))).rejects.toBeInstanceOf(CarpetaAjenaError);
    expect(H.creados).toHaveLength(0);
  });

  it("create con carpeta propia o sin carpeta sí crea", async () => {
    await DocumentsDB.create("t-a", entrada("f-propia"));
    await DocumentsDB.create("t-a", entrada(null));
    expect(H.creados.map((c) => c.folderId)).toEqual(["f-propia", null]);
  });

  it("update que mueve a la carpeta ajena → null (la ruta ya lo responde 404) y no escribe", async () => {
    expect(await DocumentsDB.update("t-a", "d1", { folderId: "f-ajena" })).toBeNull();
    expect(H.updates).toHaveLength(0);
    // Otros cambios sin mover siguen andando.
    expect(await DocumentsDB.update("t-a", "d1", { name: "nuevo.pdf" })).not.toBeNull();
    expect(H.updates).toHaveLength(1);
  });

  it("bulkMove a la carpeta ajena no mueve nada", async () => {
    expect(await DocumentsDB.bulkMove("t-a", ["d1"], "f-ajena")).toBe(0);
    expect(H.updateManys).toHaveLength(0);
    expect(await DocumentsDB.bulkMove("t-a", ["d1"], null)).toBe(1);
  });
});

describe("POST /api/admin/documents", () => {
  const subir = (folderId: string) => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array([37, 80, 68, 70])], "dni.pdf", { type: "application/pdf" }));
    form.append("folderId", folderId);
    return new NextRequest("http://localhost/api/admin/documents", {
      method: "POST",
      headers: { cookie: "buleje-admin-sess=token-falso" },
      body: form,
    });
  };

  it("folderId de otro negocio → 404 folder_not_found, y el archivo NO se sube", async () => {
    const res = await POST(subir("f-ajena"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "folder_not_found" });
    expect(H.creados).toHaveLength(0);
    expect(H.subidas).toHaveLength(0);
  });

  it("folderId propio → 200 y se sube", async () => {
    const res = await POST(subir("f-propia"));
    expect(res.status).toBe(200);
    expect(H.subidas).toHaveLength(1);
  });
});

describe("carpetas: el padre tiene que ser de este negocio, y sin ciclos", () => {
  const conCookie = (url: string, method: string, body: unknown) =>
    new NextRequest(url, {
      method,
      headers: { cookie: "buleje-admin-sess=token-falso", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const mover = (id: string, parentId: string | null) =>
    EDITAR_CARPETA(conCookie(`http://localhost/api/admin/documents/folders/${id}`, "PATCH", { parentId }), {
      params: Promise.resolve({ id }),
    });

  it("createFolder bajo una carpeta de OTRO negocio → CarpetaAjenaError, no crea", async () => {
    await expect(DocumentsDB.createFolder("t-a", { name: "Colada", parentId: "f-ajena" })).rejects.toBeInstanceOf(
      CarpetaAjenaError,
    );
    expect(H.carpetasCreadas).toHaveLength(0);
    await DocumentsDB.createFolder("t-a", { name: "Bien", parentId: "f-propia" });
    await DocumentsDB.createFolder("t-a", { name: "En la raíz" });
    expect(H.carpetasCreadas.map((c) => c.parentId)).toEqual(["f-propia", null]);
  });

  it("POST /documents/folders con parentId ajeno → 404 folder_not_found", async () => {
    const res = await CREAR_CARPETA(
      conCookie("http://localhost/api/admin/documents/folders", "POST", { name: "Colada", parentId: "f-ajena" }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "folder_not_found" });
    expect(H.carpetasCreadas).toHaveLength(0);
  });

  it("updateFolder / PATCH que la cuelga de una carpeta ajena → 404 y no la mueve", async () => {
    await expect(DocumentsDB.updateFolder("t-a", "f-otra", { parentId: "f-ajena" })).rejects.toBeInstanceOf(
      CarpetaAjenaError,
    );
    const res = await mover("f-otra", "f-ajena");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "folder_not_found" });
    expect(H.carpetasMovidas).toHaveLength(0);
  });

  it("moverla adentro de su nieta es un ciclo → 400 y no se mueve", async () => {
    await expect(DocumentsDB.updateFolder("t-a", "f-propia", { parentId: "f-nieta" })).rejects.toBeInstanceOf(
      CicloDeCarpetasError,
    );
    const res = await mover("f-propia", "f-nieta");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "folder_cannot_be_moved_into_descendant" });
    expect((await mover("f-propia", "f-propia")).status).toBe(400);
    expect(H.carpetasMovidas).toHaveLength(0);
  });

  it("moverla a una carpeta propia que no es su descendiente, o a la raíz, sí", async () => {
    expect((await mover("f-otra", "f-nieta")).status).toBe(200);
    expect((await mover("f-hija", null)).status).toBe(200);
    // Cambiar sólo el nombre no pasa por el candado ni por los chequeos.
    expect(await DocumentsDB.updateFolder("t-a", "f-otra", { name: "Renombrada" })).not.toBeNull();
    expect(H.carpetasMovidas.map((m) => (m as { where: { tenantId: string } }).where.tenantId)).toEqual(["t-a", "t-a", "t-a"]);
  });
});
