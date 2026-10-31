// @vitest-environment node
/**
 * (10-10, Ley 29733) Nada de Adelantos sube ya al bucket público:
 *  - `POST /api/adelantos/[id]/adjunto`: el comprobante de una entrega o abono,
 *    foto o PDF, decidido por el CONTENIDO, a la carpeta privada del adelanto;
 *  - `POST …/entregas` acepta ese `priv:` sólo si es de la carpeta de ESE adelanto;
 *  - `GET …/comprobante?entrega=<id>` lo sirve tras sesión + permiso + negocio;
 *  - `POST …/voucher` acepta también el PDF de «Adjuntar archivo» del alta.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";

const H = vi.hoisted(() => ({
  auth: { tenantId: "t1", username: "brandon", role: "admin" } as { tenantId: string; username: string; role: string } | null,
  comprobanteDe: vi.fn(),
  getById: vi.fn(),
  adjuntar: vi.fn(),
  registrarEntrega: vi.fn(),
  subirArchivo: vi.fn(),
  bajar: vi.fn(),
  borrar: vi.fn(),
  logActivity: vi.fn(async () => {}),
}));

vi.mock("@/lib/require-admin", () => ({
  requireAdmin: vi.fn(async () => (H.auth ? H.auth : NextResponse.json({ error: "No autorizado" }, { status: 401 }))),
}));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: (...a: unknown[]) => H.logActivity(...(a as [])) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/cache", () => ({ cacheStore: { get: () => null, set: () => {} } }));
vi.mock("@/lib/adelantos/firma-storage", () => ({
  subirArchivoPrivado: (...a: unknown[]) => H.subirArchivo(...a),
  bajarFirmaPrivada: (...a: unknown[]) => H.bajar(...a),
  borrarFirmaPrivada: (...a: unknown[]) => H.borrar(...a),
}));
vi.mock("@/lib/db/adelantos.db", () => ({
  AdelantosDB: {
    comprobanteDe: (...a: unknown[]) => H.comprobanteDe(...a),
    getById: (...a: unknown[]) => H.getById(...a),
    adjuntarComprobante: (...a: unknown[]) => H.adjuntar(...a),
    registrarEntrega: (...a: unknown[]) => H.registrarEntrega(...a),
  },
  IdempotenciaDistintaError: class extends Error {},
  ReglaDeRecibidoError: class extends Error {},
}));

import { POST as POST_ADJUNTO } from "@/app/api/adelantos/[id]/adjunto/route";
import { POST as POST_VOUCHER } from "@/app/api/adelantos/[id]/voucher/route";
import { POST as POST_ENTREGA } from "@/app/api/adelantos/[id]/entregas/route";
import { GET as GET_COMPROBANTE } from "@/app/api/adelantos/[id]/comprobante/route";
import { rechazoDePdf } from "@/lib/adelantos/adjunto-privado.server";
import { leerMultipartFirma } from "@/lib/adelantos/imagen-firma.server";
import { deflateSync } from "node:zlib";

let PNG: Buffer;
const PDF = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n", "latin1");
const RUTA_ADJ = (ext: string) => new RegExp(`^t1/adelantos/a1/\\d{13}-adjunto-[a-f0-9]{16}\\.${ext}$`);

function subir(ruta: "adjunto" | "voucher", archivo: Blob, nombre = "x", id = "a1") {
  const fd = new FormData();
  fd.append("file", archivo, nombre);
  const req = new NextRequest(`http://localhost/api/adelantos/${id}/${ruta}`, { method: "POST", body: fd });
  return (ruta === "adjunto" ? POST_ADJUNTO : POST_VOUCHER)(req, { params: Promise.resolve({ id }) });
}
const blob = (b: Buffer, type: string) => new Blob([new Uint8Array(b)], { type });

beforeEach(async () => {
  vi.clearAllMocks();
  H.auth = { tenantId: "t1", username: "brandon", role: "admin" };
  PNG ??= await sharp({ create: { width: 40, height: 20, channels: 3, background: "white" } }).png().toBuffer();
  H.comprobanteDe.mockImplementation(async (tenantId: string, id: string) =>
    tenantId === "t1" && id === "a1" ? { status: "ACTIVO", comprobanteUrl: null } : null,
  );
  H.subirArchivo.mockResolvedValue({ ok: true });
  H.adjuntar.mockResolvedValue("ok");
  H.registrarEntrega.mockResolvedValue({ id: "a1", saldoPendiente: 50 });
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
});

describe("POST /api/adelantos/[id]/adjunto — comprobante de una entrega, privado", () => {
  it("una foto: la rehace en WebP y la guarda en la carpeta privada del adelanto", async () => {
    const r = await subir("adjunto", blob(PNG, "image/png"), "voucher.png");
    expect(r.status).toBe(201);
    const j = await r.json();
    expect(j.comprobanteUrl).toMatch(/^priv:/);
    expect(j.comprobanteUrl.slice(5)).toMatch(RUTA_ADJ("webp"));
    const [ruta, cuerpo] = H.subirArchivo.mock.calls[0] as [string, Buffer];
    expect(ruta).toMatch(RUTA_ADJ("webp"));
    expect((await sharp(cuerpo).metadata()).format).toBe("webp");
  });

  it("un PDF: va tal cual, con ruta `.pdf`", async () => {
    const r = await subir("adjunto", blob(PDF, "application/pdf"), "estado.pdf");
    expect(r.status).toBe(201);
    expect((await r.json()).comprobanteUrl.slice(5)).toMatch(RUTA_ADJ("pdf"));
    expect(Buffer.compare(H.subirArchivo.mock.calls[0][1] as Buffer, PDF)).toBe(0);
  });

  it("decide el CONTENIDO, no lo que declara el navegador: un PDF que dice image/png es PDF", async () => {
    const r = await subir("adjunto", blob(PDF, "image/png"), "foto.png");
    expect(r.status).toBe(201);
    expect((await r.json()).comprobanteUrl).toMatch(/\.pdf$/);
  });

  it.each([
    ["texto que dice ser PNG", Buffer.from("MZ esto no es una imagen"), "image/png", 422],
    ["texto que dice ser PDF", Buffer.from("hola, no soy un PDF"), "application/pdf", 422],
    ["PDF con JavaScript", Buffer.from("%PDF-1.7\n<< /OpenAction << /S /JavaScript /JS (app.alert(1)) >> >>\n%%EOF", "latin1"), "application/pdf", 422],
    ["PDF cortado (sin %%EOF)", Buffer.from("%PDF-1.4\n1 0 obj << >> endobj\n", "latin1"), "application/pdf", 422],
    ["más de 4 MB", Buffer.concat([PDF, Buffer.alloc(4 * 1024 * 1024)]), "application/pdf", 413],
  ])("%s → su código y no sube nada", async (_n, cuerpo, tipo, status) => {
    const r = await subir("adjunto", blob(cuerpo as Buffer, tipo as string));
    expect(r.status).toBe(status);
    expect(H.subirArchivo).not.toHaveBeenCalled();
  });

  it("404 con el adelanto de otro negocio: se busca con el tenant del JWT y no sube", async () => {
    H.auth = { tenantId: "t2", username: "intruso", role: "admin" };
    const r = await subir("adjunto", blob(PNG, "image/png"));
    expect(r.status).toBe(404);
    expect(H.comprobanteDe).toHaveBeenCalledWith("t2", "a1");
    expect(H.subirArchivo).not.toHaveBeenCalled();
  });

  it("409 con el adelanto anulado", async () => {
    H.comprobanteDe.mockResolvedValue({ status: "CANCELADO", comprobanteUrl: null });
    expect((await subir("adjunto", blob(PNG, "image/png"))).status).toBe(409);
    expect(H.subirArchivo).not.toHaveBeenCalled();
  });

  it("403 con un rol de sólo lectura (analista); 401 sin sesión", async () => {
    H.auth = { tenantId: "t1", username: "ana", role: "analista" };
    expect((await subir("adjunto", blob(PNG, "image/png"))).status).toBe(403);
    H.auth = null;
    expect((await subir("adjunto", blob(PNG, "image/png"))).status).toBe(401);
    expect(H.subirArchivo).not.toHaveBeenCalled();
  });
});

describe("POST …/voucher — el alta acepta también el PDF de «Adjuntar archivo»", () => {
  it("PDF → `priv:<…>-voucher-<azar>.pdf`", async () => {
    const r = await subir("voucher", blob(PDF, "application/pdf"), "voucher.pdf");
    expect(r.status).toBe(201);
    expect((await r.json()).comprobanteUrl).toMatch(/^priv:t1\/adelantos\/a1\/\d{13}-voucher-[a-f0-9]{16}\.pdf$/);
    expect(H.adjuntar).toHaveBeenCalledWith("t1", "a1", expect.stringMatching(/\.pdf$/), null);
  });
});

describe("POST …/entregas — sólo el adjunto privado de ESTE adelanto", () => {
  const entrega = (comprobanteUrl: string, id = "a1") =>
    POST_ENTREGA(
      new NextRequest(`http://localhost/api/adelantos/${id}/entregas`, { method: "POST", body: JSON.stringify({ tipo: "LIBRE", valorManual: 50, comprobanteUrl }) }),
      { params: Promise.resolve({ id }) },
    );

  it("201 con el adjunto de su carpeta", async () => {
    expect((await entrega("priv:t1/adelantos/a1/1728000000000-adjunto-abcdef1234567890.webp")).status).toBe(201);
    expect(H.registrarEntrega).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["de otro adelanto", "priv:t1/adelantos/a2/1728000000000-adjunto-abcdef1234567890.webp"],
    ["de otro negocio", "priv:t2/adelantos/a1/1728000000000-adjunto-abcdef1234567890.pdf"],
    ["una hoja firmada (no es un adjunto)", "priv:t1/adelantos/a1/1728000000000-firma-recibo-abcdef12.webp"],
    ["con ../", "priv:t1/adelantos/a1/../a2/1728000000000-adjunto-abcdef1234567890.webp"],
  ])("422 `foto_ajena` con un priv: %s", async (_n, url) => {
    const r = await entrega(url);
    expect(r.status).toBe(422);
    expect((await r.json()).code).toBe("foto_ajena");
    expect(H.registrarEntrega).not.toHaveBeenCalled();
  });
});

describe("GET …/comprobante?entrega= — la puerta del comprobante de una entrega", () => {
  const PDF_RUTA = "t1/adelantos/a1/1728000000000-adjunto-abcdef1234567890.pdf";
  const ver = (entregaId: string, id = "a1") =>
    GET_COMPROBANTE(new NextRequest(`http://localhost/api/adelantos/${id}/comprobante?entrega=${entregaId}`), { params: Promise.resolve({ id }) });

  beforeEach(() => {
    H.getById.mockImplementation(async (tenantId: string, id: string) =>
      tenantId === "t1" && id === "a1" ? { id: "a1", entregas: [{ id: "e1", adelantoId: "a1", comprobanteUrl: `priv:${PDF_RUTA}` }] } : null,
    );
    H.bajar.mockResolvedValue(PDF);
  });

  it("200 con el PDF, privado y sin guardarse en disco", async () => {
    const r = await ver("e1");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(r.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(H.bajar).toHaveBeenCalledWith(PDF_RUTA);
    expect(H.getById).toHaveBeenCalledWith("t1", "a1");
  });

  it("404 con otro negocio (getById con el tenant del JWT) o una entrega que no es de este adelanto", async () => {
    expect((await ver("e9")).status).toBe(404);
    H.auth = { tenantId: "t2", username: "intruso", role: "admin" };
    expect((await ver("e1")).status).toBe(404);
    expect(H.getById).toHaveBeenLastCalledWith("t2", "a1");
    expect(H.bajar).not.toHaveBeenCalled();
  });

  it("404 si la entrega guarda una ruta que no es un adjunto de su carpeta (una hoja firmada)", async () => {
    H.getById.mockResolvedValue({ id: "a1", entregas: [{ id: "e1", adelantoId: "a1", comprobanteUrl: "priv:t1/adelantos/a1/1728000000000-firma-recibo-abcdef12.webp" }] });
    expect((await ver("e1")).status).toBe(404);
    expect(H.bajar).not.toHaveBeenCalled();
  });

  it("403 sin permiso de leer adelantos (cajero)", async () => {
    H.auth = { tenantId: "t1", username: "caja", role: "cashier" };
    expect((await ver("e1")).status).toBe(403);
    expect(H.getById).not.toHaveBeenCalled();
  });
});

describe("rechazoDePdf", () => {
  it("ve el JavaScript escondido con escapes `#xx` (/J#61vaScript)", () => {
    const sucio = Buffer.from("%PDF-1.7\n<< /S /J#61vaScript >>\n%%EOF", "latin1");
    expect(rechazoDePdf(sucio)?.status).toBe(422);
    expect(rechazoDePdf(PDF)).toBeNull();
  });
});

/* ── Revisión de `security` 10-10: lo que se esconde comprimido y el tamaño del pedido ── */
const L = (t: string) => Buffer.from(t, "latin1");
const objStream = (n: number, dic: string, data: Buffer) =>
  Buffer.concat([L(`${n} 0 obj\n<< ${dic} /Length ${data.length} >>\nstream\n`), data, L("\nendstream\nendobj\n")]);
const pdfCon = (...partes: Buffer[]) =>
  Buffer.concat([L("%PDF-1.7\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"), ...partes, L("trailer << /Root 1 0 R >>\n%%EOF\n")]);

describe("rechazoDePdf — lo que va dentro de los streams", () => {
  it("rechaza el JavaScript escondido en un ObjStm comprimido (en los bytes crudos no se ve)", () => {
    const js = deflateSync(L("5 0 << /S /JavaScript /JS (app.alert(1)) >>"));
    const pdf = pdfCon(objStream(4, "/Type /ObjStm /N 1 /First 4 /Filter /FlateDecode", js));
    expect(pdf.toString("latin1")).not.toContain("JavaScript");
    expect(rechazoDePdf(pdf)?.error).toMatch(/contenido activo/);
  });

  it("un PDF limpio con su página comprimida y `/OpenAction [3 0 R /Fit]` sigue pasando", () => {
    const pagina = deflateSync(L("BT /F1 12 Tf 10 50 Td (Yape S/ 50.00 a Juan) Tj ET"));
    const pdf = pdfCon(L("3 0 obj << /Type /Page >> endobj\n7 0 obj << /OpenAction [3 0 R /Fit] >> endobj\n"), objStream(4, "/Filter /FlateDecode", pagina));
    expect(rechazoDePdf(pdf)).toBeNull();
  });

  it.each([
    ["ASCIIHex", objStream(4, "/Filter /ASCIIHexDecode", L("2F4A53>"))],
    ["ASCII85", objStream(4, "/Filter [/ASCII85Decode /FlateDecode]", L("abc~>"))],
    ["LZW", objStream(4, "/Filter /LZWDecode", L("x"))],
    ["un filtro desconocido", objStream(4, "/Filter /Crypt", L("x"))],
    ["Flate que no se puede abrir", objStream(4, "/Filter /FlateDecode", L("esto no es zlib"))],
  ])("rechaza un stream con %s (no se puede revisar)", (_n, parte) => {
    expect(rechazoDePdf(pdfCon(parte as Buffer))?.status).toBe(422);
  });

  it("una JPEG (/DCTDecode) se deja: son datos de imagen", () => {
    expect(rechazoDePdf(pdfCon(objStream(4, "/Subtype /Image /Filter /DCTDecode", Buffer.from([0xff, 0xd8, 0xff, 0xd9]))))).toBeNull();
  });

  it.each([
    ["/OpenAction con /URI", "7 0 obj << /OpenAction << /S /URI /URI (https://evil.example) >> >> endobj\n"],
    ["/OpenAction por referencia", "7 0 obj << /OpenAction 8 0 R >> endobj\n"],
    ["/AA", "7 0 obj << /AA << /O 8 0 R >> >> endobj\n"],
    ["/GoToR", "7 0 obj << /S /GoToR /F (x.pdf) >> endobj\n"],
    ["/Launch escapado", "7 0 obj << /S /L#61unch >> endobj\n"],
    ["cifrado", "7 0 obj << /Encrypt 9 0 R >> endobj\n"],
  ])("rechaza %s", (_n, obj) => {
    expect(rechazoDePdf(pdfCon(L(obj as string)))?.status).toBe(422);
  });

  it("una bomba zip (40 MB de ceros en unos KB) se corta en el tope y se rechaza", () => {
    const bomba = deflateSync(Buffer.alloc(40 * 1024 * 1024));
    expect(bomba.length).toBeLessThan(200_000);
    expect(rechazoDePdf(pdfCon(objStream(4, "/Filter /FlateDecode", bomba)))?.error).toMatch(/demasiado grande/);
  });
});

describe("leerMultipartFirma con `maxBytes` — 413 antes de leer", () => {
  const TOPE = 4.5 * 1024 * 1024;

  it("content-length mayor al tope → 413 sin tocar el cuerpo", async () => {
    const req = new Request("http://x/api", {
      method: "POST",
      headers: { "content-length": String(5 * 1024 * 1024), "content-type": "multipart/form-data; boundary=b" },
      body: "--b--",
    });
    const r = await leerMultipartFirma(req, { archivos: ["file"], textos: [], maxBytes: TOPE });
    expect(r).toMatchObject({ ok: false, status: 413 });
    expect(req.bodyUsed).toBe(false);
  });

  it("sin content-length: cuenta los bytes al leer y corta en el tope", async () => {
    let enviados = 0;
    const cuerpo = new ReadableStream<Uint8Array>({
      pull(c) {
        enviados += 1024 * 1024;
        c.enqueue(new Uint8Array(1024 * 1024));
        if (enviados >= 20 * 1024 * 1024) c.close();
      },
    });
    const req = new Request("http://x/api", { method: "POST", headers: { "content-type": "multipart/form-data; boundary=b" }, body: cuerpo, duplex: "half" } as RequestInit);
    const r = await leerMultipartFirma(req, { archivos: ["file"], textos: [], maxBytes: TOPE });
    expect(r).toMatchObject({ ok: false, status: 413 });
    expect(enviados).toBeLessThan(10 * 1024 * 1024);
  });

  it("debajo del tope lee el archivo como siempre", async () => {
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array(PDF)], { type: "application/pdf" }), "v.pdf");
    const r = await leerMultipartFirma(new Request("http://x/api", { method: "POST", body: fd }), { archivos: ["file"], textos: [], maxBytes: TOPE });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.archivos.file.size).toBe(PDF.length);
  });

  it("la ruta del adjunto responde 413 con un content-length grande, antes de buscar el adelanto", async () => {
    const req = new NextRequest("http://localhost/api/adelantos/a1/adjunto", {
      method: "POST",
      headers: { "content-length": String(6 * 1024 * 1024), "content-type": "multipart/form-data; boundary=b" },
      body: "--b--",
    });
    const r = await POST_ADJUNTO(req, { params: Promise.resolve({ id: "a1" }) });
    expect(r.status).toBe(413);
    expect(H.comprobanteDe).not.toHaveBeenCalled();
    expect(H.subirArchivo).not.toHaveBeenCalled();
  });
});
