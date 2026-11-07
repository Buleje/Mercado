// @vitest-environment node
/**
 * Papeles por Telegram → Archivo (Brandon 2026-10-31).
 *
 * Brandon le manda la foto a su bot; el buzón de la PC la guarda local y la sube
 * a `POST /api/admin/documents/llego-por-telegram`, que la deja en
 * «Llegó por Telegram / <día de Lima>» con el mismo núcleo de WhatsApp.
 *
 * Lo que se prueba es lo que, mal hecho, NO da error:
 *  - el mismo mensaje dos veces = UN documento (Telegram re-entrega si el buzón
 *    se cayó después de subir), y la segunda vez dice dónde quedó;
 *  - el tipo se mira en los bytes (un HTML con nombre .jpg no entra);
 *  - la carpeta y el papel nacen con candado de dueño;
 *  - el negocio sale del JWT, nunca del pedido;
 *  - cajero 403 y encargado 403 (el management tier de requireAdmin lo dejaba pasar).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const H = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  carpetas: [] as Array<{ id: string; name: string; parentId: string | null; allowedRoles: string[] }>,
  subir: vi.fn(),
  analizar: vi.fn(),
  updateFolder: vi.fn(),
  despues: [] as Array<() => unknown>,
  sesion: null as null | { tenantId: string; username: string; role: string },
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: vi.fn(() => null) }));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (fn: () => unknown) => {
    H.despues.push(fn);
  },
}));
/** Como el de verdad: sin sesión 401; admin/owner/manager pasan siempre (management tier); el resto, por la lista. */
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async (_req: unknown, roles?: readonly string[]) => {
    const s = H.sesion;
    if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (["admin", "owner", "manager"].includes(s.role) || !roles || roles.includes(s.role)) return s;
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }),
}));

vi.mock("@/lib/db/documents.db", () => {
  let n = 0;
  return {
    DocumentsDB: {
      getByIdIncludingDeleted: vi.fn(async (_t: string, id: string) => H.docs.get(id) ?? null),
      getById: vi.fn(async (_t: string, id: string) => H.docs.get(id) ?? null),
      listFolders: vi.fn(async () => H.carpetas.map((c) => ({ ...c }))),
      createFolderTree: vi.fn(async (_t: string, input: { parentId: string | null; rutas: string[] }) => {
        const idPorRuta: Record<string, string> = {};
        for (const ruta of input.rutas) {
          let f = H.carpetas.find((c) => c.parentId === input.parentId && c.name === ruta);
          if (!f) {
            f = { id: `f${++n}`, name: ruta, parentId: input.parentId, allowedRoles: [] };
            H.carpetas.push(f);
          }
          idPorRuta[ruta] = f.id;
        }
        return { idPorRuta, creadas: 0 };
      }),
      updateFolder: H.updateFolder,
      create: vi.fn(async (tenantId: string, input: Record<string, unknown>) => {
        const id = String(input.id);
        if (H.docs.has(id)) throw Object.assign(new Error("unique"), { code: "P2002" });
        const doc = { ...input, tenantId, aiTags: [], ocrMetadata: null, deletedAt: null, uploadedAt: new Date().toISOString() };
        H.docs.set(id, doc);
        return doc;
      }),
      update: vi.fn(async (_t: string, id: string, patch: Record<string, unknown>) => {
        const d = H.docs.get(id);
        if (!d) return null;
        Object.assign(d, patch);
        return d;
      }),
      hardDelete: vi.fn(async (_t: string, id: string) => H.docs.delete(id)),
      log: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock("@/lib/documents/storage", async () => {
  const limites = await vi.importActual<typeof import("@/lib/documents/upload-limits")>("@/lib/documents/upload-limits");
  return {
    buildStoragePath: ({ documentId, originalName }: { documentId: string; originalName: string }) =>
      `tenants/t/${documentId}/v1__${originalName}`,
    uploadToStorage: H.subir,
    deleteFromStorage: vi.fn(),
    isMimeAllowed: limites.isMimeAllowed,
  };
});
vi.mock("@/lib/documents/precalcular-miniatura", () => ({ precalcularMiniatura: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/documents/cola-analisis", () => ({
  enColaDeAnalisis: (_e: string, tarea: () => Promise<unknown>) => tarea(),
}));
vi.mock("@/lib/documents/analyze-document", () => ({ analyzeDocumentContent: H.analizar }));

const N = await import("@/lib/documentos/papel-entrante");
const { DocumentsDB } = await import("@/lib/db/documents.db");
const { canRoleSeeDoc } = await import("@/lib/documents/doc-access");
const { POST } = await import("@/app/api/admin/documents/llego-por-telegram/route");

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1)]);
const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(40, 1)]);
const HTML = Buffer.from("<html><script>alert(1)</script></html>");
const CHAT = "1234567";
const JWT = { tenantId: "tenant-del-jwt", username: "claude", role: "admin" };

function pedido(
  campos: { archivo?: Blob; mensajeId?: string; pie?: string; tenantId?: string },
  cabeceras: Record<string, string> = {},
) {
  const form = new FormData();
  if (campos.archivo) form.append("archivo", campos.archivo, campos.archivo instanceof File ? campos.archivo.name : "x");
  for (const k of ["mensajeId", "pie", "tenantId"] as const) if (campos[k] !== undefined) form.append(k, String(campos[k]));
  return POST(
    new NextRequest("https://host/api/admin/documents/llego-por-telegram", { method: "POST", body: form, headers: cabeceras }),
  );
}
const foto = (bytes: Buffer = JPEG, nombre = "a1b2c3.jpg", tipo = "") => new File([new Uint8Array(bytes)], nombre, { type: tipo });

beforeEach(() => {
  vi.clearAllMocks();
  H.docs.clear();
  H.carpetas.length = 0;
  H.despues.length = 0;
  H.sesion = { ...JWT };
  H.subir.mockResolvedValue({ ok: true });
  H.updateFolder.mockResolvedValue({ id: "x" });
  H.analizar.mockResolvedValue({ ok: false });
  N._olvidarTodasLasCarpetas();
});

describe("el núcleo con canal Telegram", () => {
  const traer = (bytes: Buffer, mime = "image/jpeg") => vi.fn(async () => ({ ok: true as const, bytes, mime }));
  const papel = (extra: Partial<Parameters<typeof N.guardarPapelEntrante>[2]> = {}) => ({
    idMensaje: `${CHAT}:42`,
    tipo: "imagen" as const,
    pie: "Guía 0123 - Comunidad X",
    autor: N.autorDeTelegram(CHAT),
    cuando: new Date("2026-10-31T15:00:00Z"),
    ...extra,
  });

  it("queda en «Llegó por Telegram / 2026-10-31», con tag, autor, candado y el id del mensaje", async () => {
    const r = await N.guardarPapelEntrante("t-blas", "telegram", papel(), traer(JPEG));
    expect(r).toMatchObject({ ok: true, nombre: "Guía 0123 - Comunidad X.jpg", carpetaNombre: "2026-10-31" });
    const raiz = H.carpetas.find((c) => c.parentId === null);
    expect(raiz?.name).toBe("Llegó por Telegram");
    expect(H.carpetas.find((c) => c.parentId === raiz?.id)?.name).toBe("2026-10-31");
    // Las dos carpetas se cierran (raíz y día).
    expect(H.updateFolder).toHaveBeenCalledTimes(2);
    expect(H.updateFolder).toHaveBeenCalledWith("t-blas", raiz?.id, { allowedRoles: [...N.ROLES_PAPEL_ENTRANTE] });
    const doc = H.docs.get(N.idDelPapelDeCanal("t-blas", "telegram", `${CHAT}:42`)) as Record<string, unknown>;
    expect(doc).toMatchObject({ tags: ["telegram"], uploadedById: `telegram:${CHAT}` });
    expect(doc.ocrMetadata).toMatchObject({ origen: "telegram", telegramMessageId: `${CHAT}:42` });
    for (const rol of ["cajero", "almacenero", "manager"]) expect(canRoleSeeDoc(rol, doc.allowedRoles as string[], []), rol).toBe(false);
    expect(canRoleSeeDoc("owner", doc.allowedRoles as string[], [])).toBe(true);
  });

  it("el id depende del negocio, del canal y del mensaje (y WhatsApp conserva el suyo)", () => {
    const tg = N.idDelPapelDeCanal("t-blas", "telegram", `${CHAT}:42`);
    expect(tg).toMatch(/^tg[0-9a-f]{23}$/);
    expect(N.idDelPapelDeCanal("t-main", "telegram", `${CHAT}:42`)).not.toBe(tg);
    expect(N.idDelPapelDeCanal("t-blas", "telegram", `${CHAT}:43`)).not.toBe(tg);
    expect(N.idDelPapelDeCanal("t-blas", "whatsapp", `${CHAT}:42`)).toBe(N.idDelPapel("t-blas", `${CHAT}:42`));
  });

  it("el mismo mensaje dos veces = un documento, y la segunda ni pide los bytes", async () => {
    expect((await N.guardarPapelEntrante("t-blas", "telegram", papel(), traer(JPEG))).ok).toBe(true);
    const segunda = traer(JPEG);
    expect(await N.guardarPapelEntrante("t-blas", "telegram", papel(), segunda)).toEqual({ ok: false, motivo: "duplicado" });
    expect(segunda).not.toHaveBeenCalled();
    expect(H.docs.size).toBe(1);
  });

  it("dice ser JPEG pero es HTML: no entra", async () => {
    const r = await N.guardarPapelEntrante("t-blas", "telegram", papel({ mimeDeclarado: "image/jpeg" }), traer(HTML, "image/jpeg"));
    expect(r).toEqual({ ok: false, motivo: "tipo" });
    expect(H.docs.size).toBe(0);
  });

  it("WhatsApp y Telegram no comparten carpeta raíz", async () => {
    await N.guardarPapelEntrante("t-blas", "telegram", papel(), traer(JPEG));
    await N.guardarPapelEntrante("t-blas", "whatsapp", papel({ idMensaje: "wamid.X", autor: "whatsapp:51" }), traer(JPEG));
    expect(H.carpetas.filter((c) => c.parentId === null).map((c) => c.name).sort()).toEqual([
      "Llegó por Telegram",
      "Llegó por WhatsApp",
    ]);
  });

  it("la sugerencia del análisis no lo manda a otra carpeta de canal", async () => {
    const r = await N.guardarPapelEntrante("t-blas", "telegram", papel(), traer(JPEG));
    if (!r.ok) throw new Error("no guardó");
    (H.docs.get(r.documentId) as Record<string, unknown>).ocrMetadata = { sugerencias: { folderId: "f-wa", folderName: "Llegó por WhatsApp" } };
    expect(await N.moverPapelASugerida("t-blas", "telegram", r.documentId, r.carpetaId, "x")).toBeNull();
    (H.docs.get(r.documentId) as Record<string, unknown>).ocrMetadata = { sugerencias: { folderId: "f-guias", folderName: "Guías" } };
    expect(await N.moverPapelASugerida("t-blas", "telegram", r.documentId, r.carpetaId, "x")).toEqual({ folderId: "f-guias", folderName: "Guías" });
  });
});

describe("POST /api/admin/documents/llego-por-telegram", () => {
  it("201: guarda en el negocio del JWT (no del header ni de un campo) y dice dónde", async () => {
    const res = await pedido(
      { archivo: foto(), mensajeId: `${CHAT}:7`, pie: "Recibo adelanto Alex", tenantId: "main" },
      { "x-tenant-id": "main" },
    );
    expect(res.status).toBe(201);
    const j = await res.json();
    expect(j).toMatchObject({ nombre: "Recibo adelanto Alex.jpg", carpetaRaiz: "Llegó por Telegram" });
    expect(j.carpetaNombre).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(j.enlace).toContain(`carpeta=${j.carpetaId}`);
    expect(vi.mocked(DocumentsDB.create)).toHaveBeenCalledWith(
      "tenant-del-jwt",
      expect.objectContaining({ uploadedById: `telegram:${CHAT}`, mimeType: "image/jpeg" }),
    );
    expect(vi.mocked(DocumentsDB.create).mock.calls.every(([t]) => t === "tenant-del-jwt")).toBe(true);
    // El audit dice por qué usuario del panel entró.
    expect(vi.mocked(DocumentsDB.log)).toHaveBeenCalledWith(
      "tenant-del-jwt",
      expect.objectContaining({ actorId: `telegram:${CHAT}`, metadata: expect.objectContaining({ origen: "telegram", pedidoPor: "claude" }) }),
    );
  });

  it("el mismo mensaje dos veces = 1 documento; la segunda responde duplicado con la misma carpeta", async () => {
    const primera = await (await pedido({ archivo: foto(), mensajeId: `${CHAT}:8`, pie: "DNI Juan" })).json();
    const res = await pedido({ archivo: foto(), mensajeId: `${CHAT}:8`, pie: "DNI Juan" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      duplicado: true,
      nombre: "DNI Juan.jpg",
      carpetaId: primera.carpetaId,
      carpetaNombre: primera.carpetaNombre,
    });
    expect(H.docs.size).toBe(1);
    expect(H.subir).toHaveBeenCalledTimes(1);
  });

  it("PDF por su extensión (el CLI manda el Blob sin tipo) entra como documento", async () => {
    const res = await pedido({ archivo: foto(PDF, "9f8e.pdf"), mensajeId: `${CHAT}:9` });
    expect(res.status).toBe(201);
    expect((await res.json()).nombre).toMatch(/\.pdf$/);
  });

  it("415: un HTML con nombre .jpg no entra", async () => {
    const res = await pedido({ archivo: foto(HTML, "foto.jpg", "image/jpeg"), mensajeId: `${CHAT}:10` });
    expect(res.status).toBe(415);
    expect(H.docs.size).toBe(0);
  });

  it("413: más de 15 MB ni se lee", async () => {
    const res = await pedido({ archivo: foto(Buffer.alloc(N.MAX_BYTES_PAPEL + 1, 1)), mensajeId: `${CHAT}:11` });
    expect(res.status).toBe(413);
    expect(vi.mocked(DocumentsDB.getByIdIncludingDeleted)).not.toHaveBeenCalled();
  });

  it("400: sin archivo o con un mensajeId que no es <chat>:<mensaje>", async () => {
    expect((await pedido({ mensajeId: `${CHAT}:12` })).status).toBe(400);
    expect((await pedido({ archivo: foto(), mensajeId: "../../x" })).status).toBe(400);
    expect((await pedido({ archivo: foto() })).status).toBe(400);
    expect(H.docs.size).toBe(0);
  });

  it("401 sin sesión; 403 cajero y 403 encargado (requireAdmin lo deja pasar)", async () => {
    H.sesion = null;
    expect((await pedido({ archivo: foto(), mensajeId: `${CHAT}:13` })).status).toBe(401);
    H.sesion = { ...JWT, role: "cajero" };
    expect((await pedido({ archivo: foto(), mensajeId: `${CHAT}:13` })).status).toBe(403);
    H.sesion = { ...JWT, role: "manager" };
    expect((await pedido({ archivo: foto(), mensajeId: `${CHAT}:13` })).status).toBe(403);
    H.sesion = { ...JWT, role: "owner" };
    expect((await pedido({ archivo: foto(), mensajeId: `${CHAT}:13` })).status).toBe(201);
    expect(H.docs.size).toBe(1);
  });

  it("después de responder, lo analiza con el autor de Telegram", async () => {
    const j = await (await pedido({ archivo: foto(PDF, "x.pdf"), mensajeId: `${CHAT}:14` })).json();
    expect(H.despues).toHaveLength(1);
    await H.despues[0]();
    expect(H.analizar).toHaveBeenCalledWith("tenant-del-jwt", expect.stringMatching(/^tg/), `telegram:${CHAT}`, "admin");
    expect(j.carpetaRaiz).toBe("Llegó por Telegram");
  });
});
