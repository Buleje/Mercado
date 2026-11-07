// @vitest-environment node
/**
 * Pedir un papel por Telegram (Brandon 2026-10-31): «DNI del jefe de
 * Shinshiguani» → el bot le manda el PDF.
 *
 * Lo que se prueba es lo que, mal hecho, NO da error:
 *  - las órdenes del registro («adelanto 200 a Alex», «hecho…», «pendientes»)
 *    NO se vuelven búsquedas de papel;
 *  - un papel con clave de verdad no sale, pero la clave PÚBLICA del validador
 *    de SERFOR (4 de los 5 «Clave:» de Blas, medido 31-10) sí;
 *  - el archivo no se baja del storage si el papel tiene claves;
 *  - el historial se anota una sola vez por envío (el buzón reintenta);
 *  - el encargado (management tier) no pide papeles por el bot.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

vi.mock("server-only", () => ({}));

const H = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  carpetas: [] as Array<{ id: string; name: string; parentId: string | null }>,
  auditoria: [] as Array<{ documentId: string; action: string; actorId: string; metadata: Record<string, unknown> }>,
  bajadas: 0,
  sesion: null as null | { tenantId: string; username: string; role: string },
}));

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: vi.fn(() => null) }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: vi.fn(() => null) }));
vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async (_req: unknown, roles?: readonly string[]) => {
    const s = H.sesion;
    if (!s) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    if (["admin", "owner", "manager"].includes(s.role) || !roles || roles.includes(s.role)) return s;
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }),
}));
vi.mock("@/lib/documents/storage", () => ({
  downloadFromStorage: vi.fn(async () => {
    H.bajadas++;
    return Buffer.from("%PDF-1.4 prueba");
  }),
}));
vi.mock("@/lib/whatsapp/responder-archivo", () => ({
  buscarPapeles: vi.fn(async () => ({
    interp: { texto: "dni jefe", entendi: [{ tipo: "texto", texto: "texto: dni jefe" }], vence: undefined, grupos: [] },
    docs: [...H.docs.values()],
    carpetas: H.carpetas,
  })),
}));
vi.mock("@/lib/db/documents.db", () => ({
  DocumentsDB: {
    getById: vi.fn(async (_t: string, id: string) => H.docs.get(id) ?? null),
    list: vi.fn(async () => [...H.docs.values()]),
    carpetasParaBuscar: vi.fn(async () => H.carpetas),
    puedeVer: vi.fn(async (_t: string, id: string) => H.docs.has(id)),
    listAudit: vi.fn(async (_t: string, id: string) => H.auditoria.filter((a) => a.documentId === id)),
    logMany: vi.fn(async (_t: string, ids: string[], input: { action: string; actorId: string; metadata: Record<string, unknown> }) => {
      for (const documentId of ids) H.auditoria.push({ documentId, ...input });
    }),
  },
}));

import { cadenaDeCarpetas, carpetaCorta, leerPedidoDePapel, nombreDeArchivo, papelConClave } from "@/app/api/admin/documents/pedido-por-telegram/pedido";
import { GET, POST } from "@/app/api/admin/documents/pedido-por-telegram/route";

const URL_BASE = "http://localhost:3000/api/admin/documents/pedido-por-telegram";
const pedirGet = (qs: string) => GET(new NextRequest(`${URL_BASE}?${qs}`));
const pedirPost = (cuerpo: unknown) =>
  POST(new NextRequest(URL_BASE, { method: "POST", body: JSON.stringify(cuerpo), headers: { "content-type": "application/json" } }));

function doc(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    name: "DNI JEFE SHINSHIGUANI D.pdf",
    originalName: "DNI JEFE SHINSHIGUANI D.pdf",
    mimeType: "application/pdf",
    size: 186_045,
    folderId: "f2",
    codigo: 442,
    expiresAt: "2030-01-31T00:00:00.000Z",
    ocrText: "REPÚBLICA DEL PERÚ DOCUMENTO NACIONAL DE IDENTIDAD",
    ocrMetadata: null,
    storagePath: "t/doc.pdf",
    ubicacionFisica: null,
    ...extra,
  };
}

beforeEach(() => {
  H.docs.clear();
  H.auditoria.length = 0;
  H.bajadas = 0;
  H.carpetas = [
    { id: "f1", name: "CCNN San Luis de Chinchihuani", parentId: null },
    { id: "f2", name: "Datos de la persona", parentId: "f1" },
  ];
  H.sesion = { tenantId: "t-blas", username: "claude", role: "admin" };
});

describe("leerPedidoDePapel", () => {
  it.each([
    ["DNI del jefe de Shinshiguani", "DNI"],
    ["mándame la partida del local", "partida"],
    ["pásame el contrato de alquiler", "contrato"],
    ["necesito la partida del local de la bodega", "partida"],
    ["mándame la credencial de chinchiguani", "credencial"],
  ])("«%s» es un pedido", (t, palabra) => {
    const p = leerPedidoDePapel(t);
    expect(p).not.toBeNull();
    expect(p?.frase).toContain(palabra);
    expect(p?.frase.toLowerCase()).not.toContain("bodega");
  });

  it("un código va tal cual", () => {
    expect(leerPedidoDePapel("mándame DOC-000367")).toEqual({ frase: "DOC-000367", codigo: 367 });
    expect(leerPedidoDePapel("doc 442")).toEqual({ frase: "doc 442", codigo: 442 });
  });

  it.each([
    "adelanto 200 a Hermano Alex",
    "pago 350 a Fernando por la semana",
    "40 trozas de capirona de Ronal",
    "hecho municipio Agrobanco",
    "resuelto Volvo",
    "pendientes",
    "hola",
    "gracias",
    "dame 200",
    "necesito anotar un pago de 300",
    "necesito 500 soles para el flete",
    // para OTRA persona: va al asistente, que pregunta antes de mandar
    "manda la partida a Drucila",
  ])("«%s» NO es un pedido de papel", (t) => {
    expect(leerPedidoDePapel(t)).toBeNull();
  });
});

describe("papelConClave", () => {
  it("la credencial con usuario y contraseña no sale", () => {
    const ocr = "EMPRESA: COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI USUARIO: 75750463THSLCH CONTRASEÑA: RUD8812";
    expect(papelConClave({ name: "credencial chinchiguani.jpg", ocrText: ocr })).toBe(true);
  });

  it("la clave pública del validador documental de SERFOR sí sale", () => {
    const ocr =
      "cuya autenticidad e integridad pueden ser contrastadas a través de la siguiente dirección web: " +
      "https://sgd.serfor.gob.pe/validadorDocumental/ Clave: 0S2XK7Q";
    expect(papelConClave({ name: "Carta D000195-2026.pdf", ocrText: ocr })).toBe(false);
  });

  it("nombre, carpeta, descripción o clave de BitLocker también cuentan", () => {
    expect(papelConClave({ name: "Claves de rescate de la PC (BitLocker).txt" })).toBe(true);
    expect(papelConClave({ name: "lista.pdf" }, ["Personal", "Contraseñas"])).toBe(true);
    expect(papelConClave({ name: "nota.jpg", ocrMetadata: { description: "Foto con la clave SOL: ABCD1234" } })).toBe(true);
    expect(papelConClave({ name: "x.txt", ocrText: "123456-234567-345678-456789-567890-678901-789012-890123" })).toBe(true);
    expect(papelConClave({ name: "DNI JEFE.pdf", ocrText: "DOCUMENTO NACIONAL DE IDENTIDAD" }, ["CCNN", "Jefe"])).toBe(false);
  });
});

describe("carpetas y nombre", () => {
  it("la cadena va de afuera hacia adentro y la corta muestra las dos últimas", () => {
    const c = [
      { id: "a", name: "Comunidades", parentId: null },
      { id: "b", name: "Shinshiguani", parentId: "a" },
      { id: "c", name: "Jefe", parentId: "b" },
    ];
    expect(cadenaDeCarpetas("c", c)).toEqual(["Comunidades", "Shinshiguani", "Jefe"]);
    expect(carpetaCorta(cadenaDeCarpetas("c", c))).toBe("Shinshiguani › Jefe");
    expect(cadenaDeCarpetas(null, c)).toEqual([]);
  });

  it("el archivo lleva la extensión del original y nada que rompa el nombre", () => {
    expect(nombreDeArchivo("Partida del local", "scan001.PDF")).toBe("Partida del local.PDF");
    expect(nombreDeArchivo("Guía 0123.pdf", "x.pdf")).toBe("Guía 0123.pdf");
    expect(nombreDeArchivo('a/b:"c"', null)).toBe("a b c");
  });
});

describe("GET ?frase=", () => {
  it("una frase del registro contesta esPedido:false sin buscar", async () => {
    const r = await pedirGet(`frase=${encodeURIComponent("adelanto 200 a Hermano Alex")}`);
    expect(await r.json()).toEqual({ esPedido: false });
  });

  it("el mismo archivo en dos carpetas es uno solo y va directo", async () => {
    H.docs.set("d1", doc("d1"));
    H.docs.set("d2", doc("d2", { folderId: "f1", codigo: 324 }));
    const r = await pedirGet(`frase=${encodeURIComponent("DNI del jefe de Shinshiguani")}`);
    const j = await r.json();
    expect(j).toMatchObject({ esPedido: true, total: 2, elegido: "d1" });
    expect(j.papeles).toHaveLength(1);
    expect(j.papeles[0]).toMatchObject({ codigo: "DOC-000442", carpeta: "CCNN San Luis de Chinchihuani › Datos de la persona", vence: "vence 31/01/2030" });
  });

  it("el encargado no pide papeles por el bot", async () => {
    H.sesion = { tenantId: "t-blas", username: "jefa", role: "manager" };
    const r = await pedirGet("frase=DNI");
    expect(r.status).toBe(403);
  });
});

describe("GET ?id=", () => {
  it("datos: dice si tiene clave; el archivo con clave NO se baja del storage", async () => {
    H.docs.set("c1", doc("c1", { name: "credencial chinchiguani.jpg", originalName: "IMG_2041.jpg", mimeType: "image/jpeg", ocrText: "USUARIO: 7575 CONTRASEÑA: RUD8812" }));
    const datos = await (await pedirGet("id=c1&que=datos")).json();
    expect(datos).toMatchObject({ clave: true, grande: false, archivo: "credencial chinchiguani.jpg" });
    const r = await pedirGet("id=c1");
    expect(r.status).toBe(422);
    expect(H.bajadas).toBe(0);
  });

  it("sin clave: los bytes, sin caché", async () => {
    H.docs.set("d1", doc("d1"));
    const r = await pedirGet("id=d1");
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(Buffer.from(await r.arrayBuffer()).toString()).toBe("%PDF-1.4 prueba");
  });

  it("más de 49 MB no se baja", async () => {
    H.docs.set("g1", doc("g1", { size: 60 * 1024 * 1024 }));
    expect((await pedirGet("id=g1")).status).toBe(413);
    expect(H.bajadas).toBe(0);
  });

  it("un papel que el rol no ve es 404", async () => {
    expect((await pedirGet("id=nada")).status).toBe(404);
  });
});

describe("POST (ya salió)", () => {
  it("queda UNA vez en el historial, como «Compartido» por Telegram", async () => {
    H.docs.set("d1", doc("d1"));
    const cuerpo = { id: "d1", mensajeId: "8123456:77", enviadoId: 78 };
    const r1 = await pedirPost(cuerpo);
    expect(r1.status).toBe(201);
    const r2 = await pedirPost(cuerpo);
    expect(await r2.json()).toEqual({ ok: true, duplicado: true });
    expect(H.auditoria).toHaveLength(1);
    expect(H.auditoria[0]).toMatchObject({
      documentId: "d1",
      action: "share",
      actorId: "telegram:8123456",
      metadata: { canal: "telegram", mensaje: "8123456:77", enviado: 78, pedidoPor: "claude" },
    });
  });

  it("datos raros → 400 y nada en el historial", async () => {
    H.docs.set("d1", doc("d1"));
    expect((await pedirPost({ id: "d1", mensajeId: "../x", enviadoId: 1 })).status).toBe(400);
    expect((await pedirPost({ id: "d1", mensajeId: "1:2", enviadoId: -1 })).status).toBe(400);
    expect(H.auditoria).toHaveLength(0);
  });
});
