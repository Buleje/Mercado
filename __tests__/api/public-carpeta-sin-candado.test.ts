// @vitest-environment node
/**
 * «QR sin papeles con candado» (Brandon 24-10, hallazgo M2 de la revisión de
 * seguridad): los enlaces de varias carpetas (`folders/share-lote`: hoja «Para
 * inspección» y «Compartir» de Esenciales) llevan la marca «sin candado» en el
 * token y NUNCA sirven un papel restringido — por sí o por su cadena —, aunque
 * los haya armado el dueño, que sí lo ve. Ni en el listado, ni en el pedido de
 * varias con clave, ni en el archivo por id directo (ver, bajar, ZIP). Sin la
 * marca («Compartir carpeta» de a una) sigue la regla de siempre.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "crypto";
import { NextRequest } from "next/server";

type Fila = Record<string, unknown>;

const H = vi.hoisted(() => {
  const futuro = new Date(Date.now() + 5 * 86_400_000);
  const ahora = new Date("2026-10-24T12:00:00Z");
  const carpeta = (id: string, parentId: string | null, allowedRoles: string[]) => ({ id, tenantId: "t-a", parentId, name: id, allowedRoles });
  const doc = (id: string, folderId: string, allowedRoles: string[]) => ({
    id, tenantId: "t-a", folderId, allowedRoles, name: `${id}.pdf`, mimeType: "application/pdf", size: 10,
    storagePath: `t-a/${id}.pdf`, uploadedAt: ahora, deletedAt: null as Date | null,
  });
  const semilla = () => ({
    carpetas: [
      carpeta("f-mix", null, []), // libre, con un papel con candado y otro con roles adentro
      carpeta("f-candado", null, ["candado:solo-duenos"]),
      carpeta("f-candado-hija", "f-candado", []), // sin roles propios: hereda el candado de la madre
    ],
    docs: [
      doc("d-libre", "f-mix", []),
      doc("d-candado", "f-mix", ["candado:solo-duenos"]),
      doc("d-cajero", "f-mix", ["cajero"]),
      doc("d-en-candado", "f-candado", []),
      doc("d-en-hija", "f-candado-hija", []),
    ],
    folderShares: [] as Fila[],
    usuarios: [{ tenantId: "t-a", username: "dueno", role: "owner", active: true }],
  });
  return { semilla, db: semilla(), futuro, auth: { tenantId: "t-a", username: "dueno", role: "owner" } };
});

function cumple(fila: Fila, where: Fila = {}): boolean {
  return Object.entries(where).every(([k, cond]) => {
    const v = fila[k];
    if (cond === null) return v === null || v === undefined;
    if (typeof cond !== "object" || cond instanceof Date) return v === cond;
    const c = cond as Fila;
    return !("in" in c) || (c.in as unknown[]).includes(v);
  });
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findMany: async ({ where }: { where: Fila }) => H.db.docs.filter((d) => cumple(d, where)),
      findFirst: async ({ where }: { where: Fila }) => H.db.docs.find((d) => cumple(d, where)) ?? null,
    },
    documentFolder: {
      findMany: async ({ where }: { where: Fila }) => H.db.carpetas.filter((c) => cumple(c, where)),
      findFirst: async ({ where }: { where: Fila }) => H.db.carpetas.find((c) => cumple(c, where)) ?? null,
    },
    documentFolderShare: {
      create: async ({ data }: { data: Fila }) => {
        const s = { id: `c${H.db.folderShares.length}`, revokedAt: null, accessCount: 0, ...data };
        H.db.folderShares.push(s);
        return s;
      },
      findUnique: async ({ where }: { where: Fila }) => {
        const s = H.db.folderShares.find((x) => x.token === where.token);
        return s ? { ...s, folder: { id: s.folderId, name: `Carpeta ${String(s.folderId)}` } } : null;
      },
      update: async () => ({}),
      updateMany: async () => ({ count: 1 }),
    },
    adminUser: { findFirst: async ({ where }: { where: Fila }) => H.db.usuarios.find((u) => cumple(u, where)) ?? null },
  },
}));
vi.mock("@/lib/require-admin", () => ({ requireAdmin: async () => H.auth }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/documents/storage", () => ({
  downloadFromStorage: async () => Buffer.from("%PDF"),
  esInlineSeguro: () => true,
}));

import { DocumentsDB } from "@/lib/db/documents.db";
import { TOKEN_ENLACE_CARPETA, esEnlaceSinCandado, leerTokensMas } from "@/lib/documentos/enlace-varias-carpetas";
import { POST as SHARE_LOTE } from "@/app/api/admin/documents/folders/share-lote/route";
import { GET as LISTA } from "@/app/api/public/folders/[token]/route";
import { GET as RAW } from "@/app/api/public/folders/[token]/docs/[docId]/raw/route";
import { POST as VARIAS } from "@/app/api/public/folders/varias/route";

const BASE = "http://localhost";
const ctx = <T extends Record<string, string>>(p: T) => ({ params: Promise.resolve(p) });

async function lote(folderIds: string[], password?: string): Promise<string[]> {
  const res = await SHARE_LOTE(
    new NextRequest(`${BASE}/api/admin/documents/folders/share-lote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ folderIds, expiresInDays: 1, ...(password ? { password } : {}) }),
    }),
  );
  expect(res.status).toBe(200);
  const d = (await res.json()) as { enlaces: { folderId: string; token: string }[] };
  return folderIds.map((id) => d.enlaces.find((e) => e.folderId === id)?.token ?? "");
}

const lista = async (token: string) => {
  const res = await LISTA(new NextRequest(`${BASE}/api/public/folders/${token}`), ctx({ token }));
  return { status: res.status, ids: res.ok ? ((await res.json()) as { docs: { id: string }[] }).docs.map((d) => d.id) : [] };
};
const raw = async (token: string, docId: string, bajar = false) =>
  (await RAW(new NextRequest(`${BASE}/api/public/folders/${token}/docs/${docId}/raw${bajar ? "?download=1" : ""}`), ctx({ token, docId }))).status;

/** Enlace de carpeta «de siempre» (como «Compartir carpeta» de a una), creado por el dueño. */
async function deSiempre(folderId: string): Promise<string> {
  const s = await DocumentsDB.createFolderShare("t-a", folderId, { createdById: "dueno" });
  return s?.token ?? "";
}

beforeEach(() => {
  H.db = H.semilla();
});

describe("la marca «sin candado» va en el token", () => {
  it("share-lote la pone siempre; «Compartir carpeta» de a una, no", async () => {
    const [t] = await lote(["f-mix"]);
    expect(esEnlaceSinCandado(t)).toBe(true);
    expect(t).toMatch(TOKEN_ENLACE_CARPETA);
    const viejo = await deSiempre("f-mix");
    expect(esEnlaceSinCandado(viejo)).toBe(false);
    expect(viejo).toMatch(TOKEN_ENLACE_CARPETA);
    // `?mas=` acepta los dos formatos (la hoja junta varias carpetas en un QR).
    expect(leerTokensMas(`${viejo},sc${"0".repeat(48)},sc${"z".repeat(48)}`, t)).toEqual([viejo, `sc${"0".repeat(48)}`]);
  });
});

describe("con la marca: lo que tiene candado no sale, aunque el enlace lo arme el dueño", () => {
  it("listado: sólo el papel libre (ni candado de dueño ni roles)", async () => {
    const [t] = await lote(["f-mix"]);
    expect(await lista(t)).toEqual({ status: 200, ids: ["d-libre"] });
  });

  it("por id directo (ver, bajar, ZIP): 404 al restringido; el libre abre", async () => {
    const [t] = await lote(["f-mix"]);
    expect(await raw(t, "d-candado")).toBe(404);
    expect(await raw(t, "d-candado", true)).toBe(404);
    expect(await raw(t, "d-cajero")).toBe(404);
    expect(await raw(t, "d-libre")).toBe(200);
  });

  it("carpeta con candado (o hija de una): no se sirve ni su nombre ni sus papeles", async () => {
    const [madre, hija] = await lote(["f-candado", "f-candado-hija"]);
    expect((await lista(madre)).status).toBe(404);
    expect((await lista(hija)).status).toBe(404);
    expect(await raw(madre, "d-en-candado")).toBe(404);
    expect(await raw(hija, "d-en-hija")).toBe(404);
  });

  it("con clave (varias carpetas en un pedido): la lista tampoco trae lo restringido", async () => {
    const [t] = await lote(["f-mix"], "clave-1234");
    expect(H.db.folderShares[0].password).toBe(createHash("sha256").update("clave-1234").digest("hex"));
    const res = await VARIAS(
      new NextRequest(`${BASE}/api/public/folders/varias`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tokens: [t], password: "clave-1234" }),
      }),
    );
    expect(res.status).toBe(200);
    const d = (await res.json()) as { carpetas: { estado: string; docs?: { id: string }[] }[] };
    expect(d.carpetas[0].estado).toBe("abierta");
    expect(d.carpetas[0].docs?.map((x) => x.id)).toEqual(["d-libre"]);
  });
});

describe("sin la marca: el comportamiento de siempre", () => {
  it("el enlace del dueño sirve lo que él ve hoy, también lo que tiene candado", async () => {
    const t = await deSiempre("f-mix");
    expect((await lista(t)).ids.sort()).toEqual(["d-cajero", "d-candado", "d-libre"]);
    expect(await raw(t, "d-candado")).toBe(200);
    const madre = await deSiempre("f-candado");
    expect(await lista(madre)).toEqual({ status: 200, ids: ["d-en-candado"] });
  });
});
