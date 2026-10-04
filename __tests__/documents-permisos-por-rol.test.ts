// @vitest-environment node
/**
 * Permisos por rol del Drive en TODOS los caminos (revisión de seguridad
 * 2026-10-04, veto del rescate de ADR-467).
 *
 * Antes el rol se miraba sólo contra la carpeta DIRECTA y sólo al listar o
 * abrir: el cajero publicaba un papel restringido, le cambiaba los roles a una
 * carpeta, lo borraba/movía en lote, leía su OCR en «Por vencer», bajaba sus
 * versiones viejas y veía lo que estaba en una subcarpeta sin roles adentro de
 * una carpeta «solo admin». Cada `describe` es un punto del informe; cajero vs
 * admin sobre la misma base en memoria. «No lo puede ver» = 404 con el mismo
 * cuerpo que «no existe».
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

type Fila = Record<string, unknown>;

const H = vi.hoisted(() => {
  const ahora = new Date("2026-10-04T12:00:00Z");
  const pronto = new Date(Date.now() + 5 * 86_400_000);
  const futuro = new Date(Date.now() + 30 * 86_400_000);
  const carpeta = (id: string, parentId: string | null, allowedRoles: string[], tenantId = "t-a") => ({
    id, tenantId, parentId, name: id, color: null, icon: null, emoji: null, tags: [] as string[],
    allowedRoles, createdAt: ahora, updatedAt: ahora,
  });
  const doc = (id: string, folderId: string | null, allowedRoles: string[], extra: Fila = {}) => ({
    id, tenantId: "t-a", folderId, allowedRoles, name: `${id}.pdf`, originalName: `${id}.pdf`,
    mimeType: "application/pdf", size: 2048, storagePath: `t-a/${id}.pdf`, category: "otros",
    tags: [`tag-${id}`], favorite: false, status: "pendiente", ocrText: `texto de ${id}`, ocrMetadata: null,
    expiresAt: pronto, deletedAt: null as Date | null, uploadedAt: ahora, updatedAt: ahora, uploadedById: "qaadmin",
    customerId: null, orderId: null, supplierId: null, aiCategory: null, aiTags: [], ...extra,
  });
  const share = (id: string, documentId: string, createdById: string) => ({
    id, documentId, tenantId: "t-a", token: `tok-${id}`, expiresAt: futuro, password: null, createdById,
    accessCount: 0, lastAccessAt: null, revokedAt: null as Date | null, createdAt: ahora,
  });
  const folderShare = (id: string, folderId: string, createdById: string) => ({
    id, folderId, tenantId: "t-a", token: `ftok-${id}`, expiresAt: futuro, password: null, createdById,
    accessCount: 0, lastAccessAt: null, revokedAt: null as Date | null, createdAt: ahora,
  });
  const semilla = () => ({
    carpetas: [
      carpeta("f-sec", null, ["admin"]), // «solo admin»
      carpeta("f-sec-hija", "f-sec", []), // el hueco: hija SIN roles adentro de «solo admin»
      carpeta("f-libre", null, []),
      carpeta("f-caja", null, ["cajero"]), // restringida, pero el cajero la ve
      carpeta("f-ajena", null, [], "t-b"),
    ],
    docs: [
      doc("d-sec", "f-sec", [], { ocrText: "SECRETO sueldo del gerente", tags: ["sueldos"] }),
      doc("d-hija", "f-sec-hija", [], { ocrText: "SECRETO de la subcarpeta" }),
      doc("d-propio", null, ["admin"], { ocrText: "SECRETO con roles propios" }),
      doc("d-libre", "f-libre", []),
      doc("d-caja", "f-caja", []),
      doc("d-borrado", "f-sec", [], { deletedAt: ahora }),
    ],
    versiones: [{ id: "v1", documentId: "d-sec", versionNumber: 1, storagePath: "t-a/d-sec-v1.pdf", size: 10, mimeType: "application/pdf", uploadedAt: ahora, uploadedById: "qaadmin", changeNote: null }],
    shares: [share("s-cajero", "d-sec", "qacajero"), share("s-admin", "d-sec", "qaadmin"), share("s-libre", "d-libre", "qacajero")],
    folderShares: [folderShare("c-cajero", "f-sec", "qacajero"), folderShare("c-admin", "f-sec", "qaadmin"), folderShare("c-libre", "f-libre", "qacajero")],
    usuarios: [
      { tenantId: "t-a", username: "qaadmin", role: "admin", active: true },
      { tenantId: "t-a", username: "qacajero", role: "cajero", active: true },
    ],
    auditoria: [] as Fila[],
  });
  return { semilla, db: semilla(), payload: { username: "qacajero", role: "cajero", tenantId: "t-a" }, subidas: [] as string[] };
});

/** Matcher mínimo de un `where` de Prisma: igualdad, in, not null, lte/gte, has/hasSome. */
function cumple(fila: Fila, where: Fila = {}): boolean {
  return Object.entries(where).every(([k, cond]) => {
    if (k === "OR" || k === "AND") return true;
    const v = fila[k];
    if (cond === null) return v === null || v === undefined;
    if (typeof cond !== "object" || cond instanceof Date) return v === cond;
    const c = cond as Fila;
    if ("in" in c && !(c.in as unknown[]).includes(v)) return false;
    if ("not" in c && c.not === null && (v === null || v === undefined)) return false;
    if ("lte" in c && !(v instanceof Date && v <= (c.lte as Date))) return false;
    if ("gte" in c && !((v as number) >= (c.gte as number))) return false;
    if ("has" in c && !((v as unknown[]) ?? []).includes(c.has)) return false;
    if ("hasSome" in c && !(c.hasSome as unknown[]).some((x) => ((v as unknown[]) ?? []).includes(x))) return false;
    return true;
  });
}

vi.mock("@/lib/prisma", () => {
  const conCarpeta = (d: Fila) => {
    const f = H.db.carpetas.find((c) => c.id === d.folderId);
    return { ...d, folder: f ? { allowedRoles: f.allowedRoles, parentId: f.parentId } : null, _count: { versions: 0, shares: 0 } };
  };
  const document = {
    findFirst: async ({ where }: { where: Fila }) => {
      const d = H.db.docs.find((x) => cumple(x, where));
      return d ? conCarpeta(d) : null;
    },
    findMany: async ({ where }: { where: Fila }) => H.db.docs.filter((x) => cumple(x, where)).map(conCarpeta),
    count: async ({ where }: { where: Fila }) => H.db.docs.filter((x) => cumple(x, where)).length,
    create: async ({ data }: { data: Fila }) => {
      const nuevo = { ...H.db.docs[0], ...data, id: `d-nuevo-${H.db.docs.length}`, allowedRoles: [], deletedAt: null };
      H.db.docs.push(nuevo as (typeof H.db.docs)[number]);
      return conCarpeta(nuevo);
    },
    update: async ({ where, data }: { where: Fila; data: Fila }) => {
      const d = H.db.docs.find((x) => x.id === where.id)!;
      // Como Prisma: `undefined` = no tocar el campo.
      Object.assign(d, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)));
      return conCarpeta(d);
    },
    updateMany: async ({ where, data }: { where: Fila; data: Fila }) => {
      const filas = H.db.docs.filter((x) => cumple(x, where));
      for (const f of filas) Object.assign(f, data);
      return { count: filas.length };
    },
  };
  const documentFolder = {
    findMany: async ({ where }: { where: Fila }) =>
      H.db.carpetas.filter((c) => cumple(c, where)).map((c) => ({ ...c, _count: { documents: 0 } })),
    findFirst: async ({ where }: { where: Fila }) => H.db.carpetas.find((c) => cumple(c, where)) ?? null,
    count: async ({ where }: { where: Fila }) => H.db.carpetas.filter((c) => cumple(c, where)).length,
    create: async ({ data }: { data: Fila }) => {
      const c = { ...H.db.carpetas[2], tags: [], ...data, id: `f-nueva-${H.db.carpetas.length}` };
      H.db.carpetas.push(c as (typeof H.db.carpetas)[number]);
      return { ...c, _count: { documents: 0 } };
    },
    update: async ({ where, data }: { where: Fila; data: Fila }) => {
      const c = H.db.carpetas.find((x) => x.id === where.id)!;
      Object.assign(c, data);
      return { ...c, _count: { documents: 0 } };
    },
    deleteMany: async ({ where }: { where: Fila }) => {
      const antes = H.db.carpetas.length;
      H.db.carpetas = H.db.carpetas.filter((c) => !cumple(c, where));
      return { count: antes - H.db.carpetas.length };
    },
  };
  const documentShare = {
    create: async ({ data }: { data: Fila }) => {
      const s = { ...H.db.shares[0], ...data, id: `s-nuevo-${H.db.shares.length}`, revokedAt: null };
      H.db.shares.push(s as (typeof H.db.shares)[number]);
      return s;
    },
    findMany: async ({ where }: { where: Fila }) => H.db.shares.filter((s) => cumple(s, where)),
    findFirst: async ({ where }: { where: Fila }) => H.db.shares.find((s) => cumple(s, where)) ?? null,
    findUnique: async ({ where, select }: { where: Fila; select?: Fila }) => {
      const s = H.db.shares.find((x) => x.token === where.token);
      if (!s) return null;
      if (select) return s;
      return { ...s, document: { ...H.db.docs.find((d) => d.id === s.documentId)!, _count: { versions: 0, shares: 0 } } };
    },
    update: async () => ({}),
    updateMany: async ({ where, data }: { where: Fila; data: Fila }) => {
      const filas = H.db.shares.filter((s) => cumple(s, where));
      for (const f of filas) Object.assign(f, data);
      return { count: filas.length };
    },
  };
  const documentFolderShare = {
    create: async ({ data }: { data: Fila }) => ({ ...H.db.folderShares[0], ...data, id: "c-nuevo" }),
    findUnique: async ({ where }: { where: Fila }) => {
      const s = H.db.folderShares.find((x) => x.token === where.token);
      if (!s) return null;
      return { ...s, folder: { id: s.folderId, name: s.folderId } };
    },
    update: async () => ({}),
  };
  const prisma = {
    document,
    documentFolder,
    documentShare,
    documentFolderShare,
    documentVersion: {
      findMany: async ({ where }: { where: Fila }) => H.db.versiones.filter((v) => cumple(v, where)),
      findFirst: async ({ where }: { where: Fila }) => H.db.versiones.find((v) => cumple(v, where)) ?? null,
    },
    adminUser: { findFirst: async ({ where }: { where: Fila }) => H.db.usuarios.find((u) => cumple(u, where)) ?? null },
    documentAuditLog: {
      create: async ({ data }: { data: Fila }) => (H.db.auditoria.push(data), data),
      createMany: async ({ data }: { data: Fila[] }) => (H.db.auditoria.push(...data), { count: data.length }),
      findMany: async () =>
        H.db.auditoria.map((a, i) => ({
          id: `a${i}`, createdAt: new Date(), ...a,
          document: H.db.docs.find((d) => d.id === a.documentId) ?? null,
        })),
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ ...prisma, $executeRaw: async () => 1, $queryRaw: async () => [] }),
  };
  return { prisma };
});
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
  uploadToStorage: async (p: string) => (H.subidas.push(p), { ok: true }),
  downloadFromStorage: async () => Buffer.from("%PDF"),
  deleteFromStorage: async () => undefined,
  getSignedUrl: async () => "https://firmada",
}));
vi.mock("@/lib/documents/ai-categorize", () => ({ aiCategorize: async () => ({ category: "otros", tags: [], source: "heuristic" }) }));
vi.mock("@/lib/documents/analyze-document", () => ({ analyzeDocumentContent: async () => {}, isAnalyzableMime: () => false }));
vi.mock("@/lib/documents/cola-analisis", () => ({ enColaDeAnalisis: async () => {} }));
vi.mock("@/lib/documents/precalcular-miniatura", () => ({ precalcularMiniatura: async () => {} }));

import { DocumentsDB } from "@/lib/db/documents.db";
import { canRoleSeeEnCadena, enlaceSigueSirviendo, rolesDeLaCadena } from "@/lib/documents/doc-access";
import { GET as LISTAR, POST as SUBIR } from "@/app/api/admin/documents/route";
import { GET as LISTAR_ENLACES, POST as COMPARTIR } from "@/app/api/admin/documents/[id]/share/route";
import { POST as COMPARTIR_CARPETA } from "@/app/api/admin/documents/folders/[id]/share/route";
import { DELETE as BORRAR_CARPETA, PATCH as EDITAR_CARPETA } from "@/app/api/admin/documents/folders/[id]/route";
import { GET as CARPETAS, POST as CREAR_CARPETA } from "@/app/api/admin/documents/folders/route";
import { POST as LOTE } from "@/app/api/admin/documents/bulk/route";
import { POST as PAPELERA } from "@/app/api/admin/documents/trash/route";
import { DELETE as BORRAR_DOC, PATCH as EDITAR_DOC } from "@/app/api/admin/documents/[id]/route";
import { GET as VERSIONES } from "@/app/api/admin/documents/[id]/versions/route";
import { GET as VERSION_RAW } from "@/app/api/admin/documents/[id]/versions/[versionId]/raw/route";
import { GET as PAGINAS } from "@/app/api/admin/documents/[id]/pages/route";
import { DELETE as REVOCAR } from "@/app/api/admin/documents/share/[shareId]/route";
import { GET as PUBLICO } from "@/app/api/public/documents/[token]/route";

const URL_BASE = "http://localhost/api/admin/documents";
const pedir = (ruta: string, init: { method?: string; body?: unknown } = {}) =>
  new NextRequest(`${URL_BASE}${ruta}`, {
    method: init.method ?? "GET",
    headers: { cookie: "buleje-admin-sess=token-falso", "content-type": "application/json" },
    ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });
const comoCajero = () => Object.assign(H.payload, { username: "qacajero", role: "cajero" });
const comoAdmin = () => Object.assign(H.payload, { username: "qaadmin", role: "admin" });
const docDe = (id: string) => H.db.docs.find((d) => d.id === id)!;
const carpetaDe = (id: string) => H.db.carpetas.find((c) => c.id === id);

beforeEach(() => {
  H.db = H.semilla();
  H.subidas.length = 0;
  comoCajero();
});

describe("la cadena entera de carpetas (el hueco de la subcarpeta)", () => {
  it("una hija sin roles adentro de «solo admin» hereda la puerta de la madre", () => {
    const mapa = new Map(H.db.carpetas.map((c) => [c.id, { parentId: c.parentId, allowedRoles: c.allowedRoles }]));
    expect(rolesDeLaCadena("f-sec-hija", mapa)).toEqual([["admin"]]);
    expect(canRoleSeeEnCadena("cajero", [], rolesDeLaCadena("f-sec-hija", mapa))).toBe(false);
    expect(canRoleSeeEnCadena("admin", [], rolesDeLaCadena("f-sec-hija", mapa))).toBe(true);
  });

  it("un ciclo en la base no cuelga la subida", () => {
    const ciclo = new Map([["a", { parentId: "b", allowedRoles: [] }], ["b", { parentId: "a", allowedRoles: ["admin"] }]]);
    expect(rolesDeLaCadena("a", ciclo)).toEqual([["admin"]]);
  });

  it("getById y list del cajero ya no traen lo de la subcarpeta", async () => {
    expect(await DocumentsDB.getById("t-a", "d-hija", "cajero")).toBeNull();
    expect(await DocumentsDB.getById("t-a", "d-hija", "admin")).not.toBeNull();
    const ids = (await DocumentsDB.list("t-a", {}, "cajero")).map((d) => d.id).sort();
    expect(ids).toEqual(["d-caja", "d-libre"]);
  });
});

describe("1 · compartir (CRÍTICO)", () => {
  it("cajero comparte un doc restringido → 404 con el MISMO cuerpo que uno que no existe, sin crear enlace", async () => {
    const antes = H.db.shares.length;
    const restringido = await COMPARTIR(pedir("/d-sec/share", { method: "POST", body: {} }), ctx({ id: "d-sec" }));
    const inexistente = await COMPARTIR(pedir("/nope/share", { method: "POST", body: {} }), ctx({ id: "nope" }));
    expect(restringido.status).toBe(404);
    expect(await restringido.json()).toEqual(await inexistente.json());
    const deLaHija = await COMPARTIR(pedir("/d-hija/share", { method: "POST", body: {} }), ctx({ id: "d-hija" }));
    expect(deLaHija.status).toBe(404);
    expect(H.db.shares).toHaveLength(antes);
  });

  it("cajero comparte lo que ve; admin comparte lo restringido", async () => {
    expect((await COMPARTIR(pedir("/d-libre/share", { method: "POST", body: {} }), ctx({ id: "d-libre" }))).status).toBe(200);
    comoAdmin();
    expect((await COMPARTIR(pedir("/d-sec/share", { method: "POST", body: {} }), ctx({ id: "d-sec" }))).status).toBe(200);
  });

  it("listar los enlaces de un doc que no ve → 404", async () => {
    expect((await LISTAR_ENLACES(pedir("/d-sec/share"), ctx({ id: "d-sec" }))).status).toBe(404);
    comoAdmin();
    const r = await LISTAR_ENLACES(pedir("/d-sec/share"), ctx({ id: "d-sec" }));
    expect((await r.json()).shares).toHaveLength(2);
  });

  it("revocar el enlace de un doc que no ve → 404 y el enlace sigue vivo", async () => {
    const r = await REVOCAR(pedir("/share/s-admin", { method: "DELETE" }), ctx({ shareId: "s-admin" }));
    expect(r.status).toBe(404);
    expect(H.db.shares.find((s) => s.id === "s-admin")!.revokedAt).toBeNull();
    expect((await REVOCAR(pedir("/share/s-libre", { method: "DELETE" }), ctx({ shareId: "s-libre" }))).status).toBe(200);
  });

  it("carpeta: el cajero no la publica (404 si no la ve, 403 si la ve); el admin sí", async () => {
    expect((await COMPARTIR_CARPETA(pedir("/folders/f-sec/share", { method: "POST", body: {} }), ctx({ id: "f-sec" }))).status).toBe(404);
    expect((await COMPARTIR_CARPETA(pedir("/folders/f-libre/share", { method: "POST", body: {} }), ctx({ id: "f-libre" }))).status).toBe(403);
    comoAdmin();
    expect((await COMPARTIR_CARPETA(pedir("/folders/f-sec/share", { method: "POST", body: {} }), ctx({ id: "f-sec" }))).status).toBe(200);
  });

  it("enlace YA creado por el cajero a un doc restringido deja de servir; el del admin y el de un doc libre siguen", async () => {
    const publico = (token: string) => PUBLICO(new NextRequest(`http://localhost/api/public/documents/${token}`), ctx({ token }));
    expect((await publico("tok-s-cajero")).status).toBe(404);
    expect((await publico("tok-s-admin")).status).toBe(200);
    expect((await publico("tok-s-libre")).status).toBe(200);
  });

  it("enlace de carpeta creado por el cajero: la carpeta restringida ya no se sirve, ni sus archivos", async () => {
    expect(await DocumentsDB.findByFolderShareToken("ftok-c-cajero")).toBeNull();
    expect(await DocumentsDB.getFolderShareDocPath("ftok-c-cajero", "d-sec")).toBeNull();
    const delAdmin = await DocumentsDB.findByFolderShareToken("ftok-c-admin");
    expect(delAdmin?.docs.map((d) => d.id)).toEqual(["d-sec"]);
    expect(await DocumentsDB.getFolderShareDocPath("ftok-c-libre", "d-libre")).not.toBeNull();
  });

  it("creador borrado/inactivo: lo restringido no se sirve, lo libre sí", () => {
    expect(enlaceSigueSirviendo(null, ["admin"], [])).toBe(false);
    expect(enlaceSigueSirviendo(null, [], [])).toBe(true);
    expect(enlaceSigueSirviendo("owner", ["admin"], [["admin"]])).toBe(true);
  });
});

describe("2 · carpetas: permisos, renombrar, mover, borrar (CRÍTICO)", () => {
  it("cajero amplía los roles de una carpeta que NO ve → 404 y no cambia nada", async () => {
    const r = await EDITAR_CARPETA(pedir("/folders/f-sec", { method: "PATCH", body: { allowedRoles: [] } }), ctx({ id: "f-sec" }));
    expect(r.status).toBe(404);
    expect(carpetaDe("f-sec")!.allowedRoles).toEqual(["admin"]);
  });

  it("cajero cambia roles, renombra o mueve una carpeta restringida que SÍ ve → 403", async () => {
    for (const body of [{ allowedRoles: [] }, { name: "otra" }, { parentId: null }]) {
      const r = await EDITAR_CARPETA(pedir("/folders/f-caja", { method: "PATCH", body }), ctx({ id: "f-caja" }));
      expect(r.status).toBe(403);
    }
    expect(carpetaDe("f-caja")).toMatchObject({ name: "f-caja", allowedRoles: ["cajero"], parentId: null });
  });

  it("cajero renombra una carpeta libre, pero no la mete en una que no ve", async () => {
    expect((await EDITAR_CARPETA(pedir("/folders/f-libre", { method: "PATCH", body: { name: "Libre 2" } }), ctx({ id: "f-libre" }))).status).toBe(200);
    const r = await EDITAR_CARPETA(pedir("/folders/f-libre", { method: "PATCH", body: { parentId: "f-sec" } }), ctx({ id: "f-libre" }));
    expect(r.status).toBe(404);
    expect(carpetaDe("f-libre")!.parentId).toBeNull();
  });

  it("admin sí cambia los roles", async () => {
    comoAdmin();
    const r = await EDITAR_CARPETA(pedir("/folders/f-sec", { method: "PATCH", body: { allowedRoles: ["admin", "cajero"] } }), ctx({ id: "f-sec" }));
    expect(r.status).toBe(200);
    expect(carpetaDe("f-sec")!.allowedRoles).toEqual(["admin", "cajero"]);
  });

  it("borrar: 404 la que no ve, 403 la restringida que ve; el admin borra", async () => {
    expect((await BORRAR_CARPETA(pedir("/folders/f-sec", { method: "DELETE" }), ctx({ id: "f-sec" }))).status).toBe(404);
    expect((await BORRAR_CARPETA(pedir("/folders/f-caja", { method: "DELETE" }), ctx({ id: "f-caja" }))).status).toBe(403);
    comoAdmin();
    expect((await BORRAR_CARPETA(pedir("/folders/f-caja", { method: "DELETE" }), ctx({ id: "f-caja" }))).status).toBe(200);
  });

  it("el árbol del cajero no muestra la carpeta restringida ni su hija", async () => {
    const ids = ((await (await CARPETAS(pedir("/folders"))).json()).folders as { id: string }[]).map((f) => f.id).sort();
    expect(ids).toEqual(["f-caja", "f-libre"]);
    comoAdmin();
    expect(((await (await CARPETAS(pedir("/folders"))).json()).folders as unknown[]).length).toBe(4);
  });
});

describe("2b · borrar una carpeta restringida no destapa lo que cae a la raíz (MEDIO, re-prueba 04-10)", () => {
  it("lo de adentro y lo de las subcarpetas conserva la restricción de su cadena", async () => {
    comoAdmin();
    const r = await BORRAR_CARPETA(pedir("/folders/f-sec", { method: "DELETE" }), ctx({ id: "f-sec" }));
    expect(r.status).toBe(200);
    // d-sec estaba en «solo admin»; d-hija en una subcarpeta sin roles dentro de ella.
    expect(docDe("d-sec").allowedRoles).toEqual(["admin"]);
    expect(docDe("d-hija").allowedRoles).toEqual(["admin"]);
    // Lo que tenía roles propios y estaba fuera, intacto; lo libre, libre.
    expect(docDe("d-libre").allowedRoles).toEqual([]);
  });

  it("intersección: roles propios del doc y los de la carpeta", async () => {
    comoAdmin();
    docDe("d-caja").allowedRoles = ["cajero", "almacenero"];
    const r = await BORRAR_CARPETA(pedir("/folders/f-caja", { method: "DELETE" }), ctx({ id: "f-caja" }));
    expect(r.status).toBe(200);
    expect(docDe("d-caja").allowedRoles).toEqual(["cajero"]);
  });
});

describe("3 · acciones en lote (ALTO)", () => {
  const lote = (body: unknown) => LOTE(pedir("/bulk", { method: "POST", body }));

  it("borrar en lote sólo toca lo que el cajero ve", async () => {
    const r = await lote({ action: "delete", ids: ["d-sec", "d-hija", "d-propio", "d-libre"] });
    expect((await r.json()).affected).toBe(1);
    expect(docDe("d-sec").deletedAt).toBeNull();
    expect(docDe("d-hija").deletedAt).toBeNull();
    expect(docDe("d-libre").deletedAt).not.toBeNull();
  });

  it("mover en lote: nada restringido (aunque lo vea) y nunca a una carpeta que no ve", async () => {
    const r = await lote({ action: "move", ids: ["d-caja", "d-libre", "d-sec"], folderId: null });
    expect((await r.json()).affected).toBe(1);
    expect(docDe("d-caja").folderId).toBe("f-caja");
    expect(docDe("d-libre").folderId).toBeNull();
    const oculto = await lote({ action: "move", ids: ["d-libre"], folderId: "f-sec" });
    expect((await oculto.json()).affected).toBe(0);
    expect(docDe("d-libre").folderId).toBeNull();
  });

  it("etiquetar en lote no escribe en lo restringido; el admin sí", async () => {
    await lote({ action: "tag", ids: ["d-sec", "d-libre"], tag: "revisar" });
    expect(docDe("d-sec").tags).not.toContain("revisar");
    expect(docDe("d-libre").tags).toContain("revisar");
    comoAdmin();
    await lote({ action: "tag", ids: ["d-sec"], tag: "revisar" });
    expect(docDe("d-sec").tags).toContain("revisar");
  });

  it("restaurar de la papelera en lote: lo restringido no", async () => {
    const r = await PAPELERA(pedir("/trash", { method: "POST", body: { action: "restore", ids: ["d-borrado"] } }));
    expect((await r.json()).restored).toBe(0);
    expect(docDe("d-borrado").deletedAt).not.toBeNull();
  });
});

describe("4 · listados que devolvían docs sin filtrar (ALTO)", () => {
  it("«Por vencer» del cajero no trae el doc restringido ni su OCR; el del admin sí", async () => {
    const cajero = await (await LISTAR(pedir("?expiring=30"))).text();
    expect(cajero).not.toContain("SECRETO");
    expect((JSON.parse(cajero).documents as { id: string }[]).map((d) => d.id).sort()).toEqual(["d-caja", "d-libre"]);
    comoAdmin();
    expect(await (await LISTAR(pedir("?expiring=30"))).text()).toContain("SECRETO sueldo del gerente");
  });

  it("etiquetas, duplicados, nombres por carpeta y actividad tampoco dejan ver lo restringido", async () => {
    expect((await DocumentsDB.listTags("t-a", "cajero")).map((t) => t.tag)).not.toContain("sueldos");
    expect((await DocumentsDB.listTags("t-a", "admin")).map((t) => t.tag)).toContain("sueldos");
    const grupos = await DocumentsDB.gruposDuplicados("t-a", { viewerRole: "cajero" });
    expect(grupos.flatMap((g) => g.docs.map((d) => d.id))).not.toContain("d-sec");
    const nombres = await DocumentsDB.listNamesInFolders("t-a", ["f-sec", "f-sec-hija", "f-libre"], "cajero");
    expect(Object.keys(nombres)).toEqual(["f-libre"]);
    H.db.auditoria.push({ documentId: "d-sec", tenantId: "t-a", actorId: "qaadmin", action: "upload" });
    H.db.auditoria.push({ documentId: "d-libre", tenantId: "t-a", actorId: "qaadmin", action: "upload" });
    expect((await DocumentsDB.recentActivity("t-a", 40, "cajero")).map((a) => a.documentId)).toEqual(["d-libre"]);
    expect(await DocumentsDB.listAudit("t-a", "d-sec", 100, "cajero")).toEqual([]);
  });

  it("documento suelto: cajero no borra, no restaura, no le cambia roles ni lo saca de su carpeta", async () => {
    expect((await BORRAR_DOC(pedir("/d-sec", { method: "DELETE" }), ctx({ id: "d-sec" }))).status).toBe(404);
    expect((await BORRAR_DOC(pedir("/d-libre?purge=1", { method: "DELETE" }), ctx({ id: "d-libre" }))).status).toBe(403);
    expect(await DocumentsDB.restore("t-a", "d-borrado", "cajero")).toBe(false);
    // Mandar los MISMOS roles (la UI manda el objeto entero) no es cambiarlos.
    const iguales = await EDITAR_DOC(pedir("/d-caja", { method: "PATCH", body: { allowedRoles: [], name: "caja.pdf" } }), ctx({ id: "d-caja" }));
    expect(iguales.status).toBe(200);
    const roles = await EDITAR_DOC(pedir("/d-caja", { method: "PATCH", body: { allowedRoles: ["almacenero"] } }), ctx({ id: "d-caja" }));
    expect(roles.status).toBe(403);
    const sacar = await EDITAR_DOC(pedir("/d-caja", { method: "PATCH", body: { folderId: null } }), ctx({ id: "d-caja" }));
    expect(sacar.status).toBe(403);
    const meter = await EDITAR_DOC(pedir("/d-libre", { method: "PATCH", body: { folderId: "f-sec" } }), ctx({ id: "d-libre" }));
    expect(meter.status).toBe(404);
    expect(docDe("d-caja")).toMatchObject({ folderId: "f-caja", allowedRoles: [] });
    expect(docDe("d-libre").folderId).toBe("f-libre");
  });
});

describe("5 · versiones y páginas (MEDIO)", () => {
  it("cajero: lista de versiones, versión vieja y páginas de un doc restringido → 404", async () => {
    expect((await VERSIONES(pedir("/d-sec/versions"), ctx({ id: "d-sec" }))).status).toBe(404);
    expect((await VERSION_RAW(pedir("/d-sec/versions/v1/raw"), ctx({ id: "d-sec", versionId: "v1" }))).status).toBe(404);
    expect((await PAGINAS(pedir("/d-sec/pages"), ctx({ id: "d-sec" }))).status).toBe(404);
  });

  it("admin sí lista y baja la versión vieja", async () => {
    comoAdmin();
    expect((await (await VERSIONES(pedir("/d-sec/versions"), ctx({ id: "d-sec" }))).json()).versions).toHaveLength(1);
    expect((await VERSION_RAW(pedir("/d-sec/versions/v1/raw"), ctx({ id: "d-sec", versionId: "v1" }))).status).toBe(200);
  });
});

describe("6 · herencia de roles al crear carpetas (MEDIO)", () => {
  it("una subcarpeta nueva de «solo admin» nace «solo admin»; con roles explícitos, los suyos", async () => {
    const hija = await DocumentsDB.createFolder("t-a", { name: "Nueva", parentId: "f-sec" }, "admin");
    expect(hija.allowedRoles).toEqual(["admin"]);
    const propia = await DocumentsDB.createFolder("t-a", { name: "Otra", parentId: "f-sec", allowedRoles: ["admin", "owner"] }, "admin");
    expect(propia.allowedRoles).toEqual(["admin", "owner"]);
    const raiz = await DocumentsDB.createFolder("t-a", { name: "Raíz" }, "admin");
    expect(raiz.allowedRoles).toEqual([]);
  });

  it("el árbol de un import también hereda", async () => {
    const { idPorRuta } = await DocumentsDB.createFolderTree("t-a", { parentId: "f-sec", rutas: ["A/B"] }, "admin");
    expect(carpetaDe(idPorRuta["A"])!.allowedRoles).toEqual(["admin"]);
    expect(carpetaDe(idPorRuta["A/B"])!.allowedRoles).toEqual(["admin"]);
  });

  it("Documentos del plan: al ADOPTAR una carpeta existente le pone los roles del plan sin abrir nunca más", async () => {
    const { rolesDeCarpetaAdoptada } = await import("@/lib/db/forest-plan-documentos.db");
    expect(rolesDeCarpetaAdoptada([]).sort()).toEqual(["admin", "almacenero", "owner"]);
    // El dueño la había abierto al cajero: el cajero sale (los papeles del plan no los lee).
    expect(rolesDeCarpetaAdoptada(["admin", "cajero"])).toEqual(["admin"]);
    // Sólo cajero: no puede quedar vacía (vacía = la ven todos) → los privilegiados del plan.
    expect(rolesDeCarpetaAdoptada(["cajero"]).sort()).toEqual(["admin", "owner"]);
    // El dueño la había cerrado a «admin»: sigue «admin».
    expect(rolesDeCarpetaAdoptada(["admin"])).toEqual(["admin"]);
  });

  it("el cajero no crea carpetas adentro de una que no ve (404, como si no existiera)", async () => {
    const r = await CREAR_CARPETA(pedir("/folders", { method: "POST", body: { name: "x", parentId: "f-sec" } }));
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "folder_not_found" });
  });
});

describe("7 · subir a una carpeta que no ve (BAJO)", () => {
  const subir = (folderId: string) => {
    const form = new FormData();
    form.append("file", new File([new Uint8Array([37, 80, 68, 70])], "dni.pdf", { type: "application/pdf" }));
    form.append("folderId", folderId);
    return SUBIR(new NextRequest(URL_BASE, { method: "POST", headers: { cookie: "buleje-admin-sess=token-falso" }, body: form }));
  };

  it("cajero → 404 folder_not_found (igual que una carpeta de otro negocio) y no sube nada", async () => {
    for (const destino of ["f-sec", "f-sec-hija", "f-ajena"]) {
      const r = await subir(destino);
      expect(r.status).toBe(404);
      expect(await r.json()).toEqual({ error: "folder_not_found" });
    }
    expect(H.subidas).toHaveLength(0);
  });

  it("cajero a una que ve, y admin a la restringida → 200", async () => {
    expect((await subir("f-caja")).status).toBe(200);
    comoAdmin();
    expect((await subir("f-sec")).status).toBe(200);
  });
});
