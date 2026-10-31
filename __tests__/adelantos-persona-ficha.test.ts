// @vitest-environment node
/**
 * ADR-525 — los campos nuevos de la persona de Adelantos y la foto del DNI.
 *
 * 1. Zod de POST/PATCH: Yape mal formado → 400; `""` → null; fecha fuera de
 *    1900..hoy o inexistente → 400; relación fuera de la lista → 400.
 * 2. Un PATCH que no manda los campos nuevos no los pisa (ni el de RRHH).
 * 3. GET devuelve `tieneFotoDocumento` y NUNCA la clave del archivo.
 * 4. Otro negocio → 404 en el detalle, el PATCH y las tres puertas de la foto.
 * 5. La foto: sharp la rehace en WebP, va a la carpeta privada de ESA persona,
 *    compara-y-cambia la columna, borra la vieja; un no-imagen → 422.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

type Fila = Record<string, unknown> & { id: string; tenantId: string };

const H = vi.hoisted(() => ({
  auth: { tenantId: "t1", username: "dueno", role: "admin" } as { tenantId: string; username: string; role: string },
  filas: [] as Array<Record<string, unknown> & { id: string; tenantId: string }>,
  create: vi.fn(),
  updateMany: vi.fn(),
  subir: vi.fn(async (..._a: unknown[]) => ({ ok: true as const })),
  bajar: vi.fn(async (..._a: unknown[]) => Buffer.from("webp-falso") as Buffer | null),
  borrar: vi.fn(async (..._a: unknown[]) => true),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: vi.fn(async () => H.auth) }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => {}) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/cache", () => ({ invalidateByPrefix: vi.fn(), cacheStore: { get: () => null, set: () => {} } }));
vi.mock("@/lib/db/forest-directorio.db", () => ({ ForestDirectorioDB: { getParte: vi.fn(async () => null) } }));
vi.mock("@/lib/adelantos/firma-storage", () => ({
  subirFirmaPrivada: (...a: unknown[]) => H.subir(...a),
  bajarFirmaPrivada: (...a: unknown[]) => H.bajar(...a),
  borrarFirmaPrivada: (...a: unknown[]) => H.borrar(...a),
}));
vi.mock("@/lib/prisma", () => {
  /* El WHERE de verdad: cada clave tiene que coincidir (null = IS NULL), así
     el tenant ajeno no aparece por el mismo camino que en Postgres. */
  const coincide = (f: Record<string, unknown>, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => (f[k] ?? null) === (v ?? null));
  const elegir = (f: Record<string, unknown>, select?: Record<string, boolean>) =>
    select ? Object.fromEntries(Object.keys(select).map((k) => [k, f[k] ?? null])) : f;
  return {
    prisma: {
      adelantoBeneficiario: {
        findFirst: async ({ where, select }: { where: Record<string, unknown>; select?: Record<string, boolean> }) => {
          const f = H.filas.find((x) => coincide(x, where));
          return f ? elegir(f, select) : null;
        },
        findMany: async ({ where }: { where: Record<string, unknown> }) =>
          H.filas.filter((x) => coincide(x, where)).map((x) => ({ ...x, adelantos: [] })),
        create: async ({ data }: { data: Record<string, unknown> }) => {
          H.create(data);
          const fila = { id: "nuevo", createdAt: new Date("2026-10-30T12:00:00Z"), activo: true, ...data } as unknown as Fila;
          H.filas.push(fila);
          return fila;
        },
        updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          H.updateMany(where, data);
          const tocadas = H.filas.filter((x) => coincide(x, where));
          for (const f of tocadas) Object.assign(f, data);
          return { count: tocadas.length };
        },
        deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
          const antes = H.filas.length;
          H.filas = H.filas.filter((x) => !coincide(x, where));
          return { count: antes - H.filas.length };
        },
      },
      adelanto: { count: async () => 0 },
    },
  };
});

import { GET as listar, POST as crear } from "@/app/api/adelantos/beneficiarios/route";
import { DELETE as borrarPersona, GET as detalle, PATCH as editar } from "@/app/api/adelantos/beneficiarios/[id]/route";
import { DELETE as borrarFoto, GET as verFoto, POST as subirFoto } from "@/app/api/adelantos/beneficiarios/[id]/foto-documento/route";

const URL_BASE = "http://localhost/api/adelantos/beneficiarios";
const json = (url: string, method: string, body: unknown) =>
  new NextRequest(url, { method, body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const conId = (id: string) => ({ params: Promise.resolve({ id }) });
const RUTA_T1 = "t1/adelantos-personas/b1/1761825600000-dni-0123456789abcdef01234567.webp";

function multipart(id: string, archivo: Blob, nombre = "dni.jpg") {
  const fd = new FormData();
  fd.append("archivo", archivo, nombre);
  return new NextRequest(`${URL_BASE}/${id}/foto-documento`, { method: "POST", body: fd });
}

beforeEach(() => {
  vi.clearAllMocks();
  H.auth = { tenantId: "t1", username: "dueno", role: "admin" };
  H.filas = [
    { id: "b1", tenantId: "t1", nombre: "Juan", documento: null, telefono: null, notas: null, createdAt: new Date("2026-10-01T12:00:00Z"), activo: true, yape: "912345678", fotoDocumentoKey: null },
  ];
});

describe("Zod de POST: los campos de la persona", () => {
  it("Yape mal formado → 400 sin tocar la base", async () => {
    for (const yape of ["12345", "812345678", "9123456789", "98765432a"]) {
      const r = await crear(json(URL_BASE, "POST", { nombre: "Ana", yape }));
      expect(r.status, yape).toBe(400);
    }
    const r = await crear(json(URL_BASE, "POST", { nombre: "Ana", referenciaTelefono: "123" }));
    expect(r.status).toBe(400);
    expect(H.create).not.toHaveBeenCalled();
  });

  it('"" se guarda como null y «987 654 321» sin espacios', async () => {
    const r = await crear(
      json(URL_BASE, "POST", { nombre: "Ana", yape: "987 654 321", tipoRelacion: "", referenciaNombre: "  ", referenciaTelefono: "", fechaNacimiento: "" }),
    );
    expect(r.status).toBe(201);
    const data = H.create.mock.calls[0][0] as Record<string, unknown>;
    expect(data).toMatchObject({ yape: "987654321", tipoRelacion: null, referenciaNombre: null, referenciaTelefono: null, fechaNacimiento: null });
    const body = (await r.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ yape: "987654321", tieneFotoDocumento: false, fechaNacimiento: null });
  });

  it("fecha de nacimiento: AAAA-MM-DD entre 1900 y hoy; se guarda como DATE y vuelve igual", async () => {
    for (const fechaNacimiento of ["2999-01-01", "1899-12-31", "2026-02-30", "15/08/1990"]) {
      const r = await crear(json(URL_BASE, "POST", { nombre: "Ana", fechaNacimiento }));
      expect(r.status, fechaNacimiento).toBe(400);
    }
    const r = await crear(json(URL_BASE, "POST", { nombre: "Ana", fechaNacimiento: "1990-08-15", tipoRelacion: "chofer" }));
    expect(r.status).toBe(201);
    expect((H.create.mock.calls[0][0] as { fechaNacimiento: Date }).fechaNacimiento.toISOString()).toBe("1990-08-15T00:00:00.000Z");
    expect(await r.json()).toMatchObject({ fechaNacimiento: "1990-08-15", tipoRelacion: "chofer" });
  });

  it("relación fuera de la lista → 400", async () => {
    const r = await crear(json(URL_BASE, "POST", { nombre: "Ana", tipoRelacion: "jefe" }));
    expect(r.status).toBe(400);
  });
});

describe("PATCH y GET", () => {
  it("un PATCH sin los campos nuevos no los pisa", async () => {
    const r = await editar(json(`${URL_BASE}/b1`, "PATCH", { nombre: "Juan Pérez" }), conId("b1"));
    expect(r.status).toBe(200);
    const data = H.updateMany.mock.calls[0][1] as Record<string, unknown>;
    expect(data).not.toHaveProperty("yape");
    expect(data).not.toHaveProperty("fechaNacimiento");
    expect(await r.json()).toMatchObject({ nombre: "Juan Pérez", yape: "912345678" });
  });

  it('PATCH con "" borra lo guardado (no lo deja como estaba)', async () => {
    const r = await editar(json(`${URL_BASE}/b1`, "PATCH", { nombre: "Juan", yape: "" }), conId("b1"));
    expect(r.status).toBe(200);
    expect(H.updateMany.mock.calls[0][1]).toMatchObject({ yape: null });
    expect(await r.json()).toMatchObject({ yape: null });
  });

  it("PATCH con Yape mal formado → 400", async () => {
    const r = await editar(json(`${URL_BASE}/b1`, "PATCH", { nombre: "Juan", yape: "123" }), conId("b1"));
    expect(r.status).toBe(400);
    expect(H.updateMany).not.toHaveBeenCalled();
  });

  it("otro negocio → 404 en el detalle y el PATCH, sin escribir", async () => {
    H.auth = { tenantId: "t2", username: "otro", role: "admin" };
    expect((await detalle(new NextRequest(`${URL_BASE}/b1`), conId("b1"))).status).toBe(404);
    const r = await editar(json(`${URL_BASE}/b1`, "PATCH", { nombre: "Robado", yape: "999999999" }), conId("b1"));
    expect(r.status).toBe(404);
    expect(H.updateMany).not.toHaveBeenCalled();
    expect(H.filas[0].nombre).toBe("Juan");
  });

  it("GET (lista y detalle) dice si hay foto y nunca la clave", async () => {
    H.filas[0].fotoDocumentoKey = RUTA_T1;
    const lista = (await (await listar(new NextRequest(URL_BASE))).json()) as Record<string, unknown>[];
    expect(lista[0]).toMatchObject({ id: "b1", tieneFotoDocumento: true, yape: "912345678" });
    const uno = (await (await detalle(new NextRequest(`${URL_BASE}/b1`), conId("b1"))).json()) as Record<string, unknown>;
    expect(uno.tieneFotoDocumento).toBe(true);
    for (const cuerpo of [JSON.stringify(lista), JSON.stringify(uno)]) {
      expect(cuerpo).not.toContain("fotoDocumentoKey");
      expect(cuerpo).not.toContain("adelantos-personas");
    }
  });
});

describe("foto del DNI", () => {
  const png = async () =>
    new Blob([new Uint8Array(await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 128, g: 128, b: 128 } } }).png().toBuffer())], { type: "image/png" });

  it("POST: WebP a la carpeta privada de ESA persona y la columna por compara-y-cambia", async () => {
    const r = await subirFoto(multipart("b1", await png(), "dni.png"), conId("b1"));
    expect(r.status).toBe(201);
    const [ruta, cuerpo] = H.subir.mock.calls[0] as [string, Buffer];
    expect(ruta).toMatch(/^t1\/adelantos-personas\/b1\/\d{13}-dni-[a-f0-9]{24}\.webp$/);
    expect((await sharp(cuerpo).metadata()).format).toBe("webp");
    expect(H.updateMany).toHaveBeenCalledWith({ id: "b1", tenantId: "t1", fotoDocumentoKey: null }, { fotoDocumentoKey: ruta });
    expect(await r.json()).toEqual({ tieneFotoDocumento: true });
  });

  it("POST: reemplazar borra la foto vieja", async () => {
    H.filas[0].fotoDocumentoKey = RUTA_T1;
    const r = await subirFoto(multipart("b1", await png(), "dni.png"), conId("b1"));
    expect(r.status).toBe(201);
    expect(H.borrar).toHaveBeenCalledWith(RUTA_T1);
  });

  it("POST: un archivo que no es imagen → 422 y no sube nada", async () => {
    const r = await subirFoto(multipart("b1", new Blob(["MZ esto no es un jpg"], { type: "image/jpeg" })), conId("b1"));
    expect(r.status).toBe(422);
    expect(H.subir).not.toHaveBeenCalled();
  });

  it("otro negocio → 404 al subir, ver y borrar, sin tocar el bucket", async () => {
    H.filas[0].fotoDocumentoKey = RUTA_T1;
    H.auth = { tenantId: "t2", username: "otro", role: "admin" };
    expect((await subirFoto(multipart("b1", await png(), "dni.png"), conId("b1"))).status).toBe(404);
    expect((await verFoto(new NextRequest(`${URL_BASE}/b1/foto-documento`), conId("b1"))).status).toBe(404);
    expect((await borrarFoto(new NextRequest(`${URL_BASE}/b1/foto-documento`, { method: "DELETE" }), conId("b1"))).status).toBe(404);
    expect(H.subir).not.toHaveBeenCalled();
    expect(H.bajar).not.toHaveBeenCalled();
    expect(H.borrar).not.toHaveBeenCalled();
    expect(H.filas[0].fotoDocumentoKey).toBe(RUTA_T1);
  });

  it("GET: la imagen sin caché; una clave que no es de su carpeta → 404", async () => {
    H.filas[0].fotoDocumentoKey = RUTA_T1;
    const r = await verFoto(new NextRequest(`${URL_BASE}/b1/foto-documento`), conId("b1"));
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/webp");
    expect(r.headers.get("cache-control")).toBe("private, no-store");
    expect(H.bajar).toHaveBeenCalledWith(RUTA_T1);

    H.filas[0].fotoDocumentoKey = "t2/adelantos-personas/b9/1761825600000-dni-0123456789abcdef01234567.webp";
    H.bajar.mockClear();
    expect((await verFoto(new NextRequest(`${URL_BASE}/b1/foto-documento`), conId("b1"))).status).toBe(404);
    expect(H.bajar).not.toHaveBeenCalled();
  });

  it("el analista (solo lectura) no ve la imagen: 403 sin bajar el archivo (Brandon 30-10)", async () => {
    H.filas[0].fotoDocumentoKey = RUTA_T1;
    H.auth = { tenantId: "t1", username: "analista", role: "analista" };
    H.bajar.mockClear();
    expect((await verFoto(new NextRequest(`${URL_BASE}/b1/foto-documento`), conId("b1"))).status).toBe(403);
    expect(H.bajar).not.toHaveBeenCalled();
  });

  it("borrar la persona también borra su foto del bucket", async () => {
    H.filas[0].fotoDocumentoKey = RUTA_T1;
    const r = await borrarPersona(new NextRequest(`${URL_BASE}/b1`, { method: "DELETE" }), conId("b1"));
    expect(r.status).toBe(200);
    expect(H.borrar).toHaveBeenCalledWith(RUTA_T1);
  });

  it("DELETE: limpia la columna y borra el archivo", async () => {
    H.filas[0].fotoDocumentoKey = RUTA_T1;
    const r = await borrarFoto(new NextRequest(`${URL_BASE}/b1/foto-documento`, { method: "DELETE" }), conId("b1"));
    expect(r.status).toBe(200);
    expect(H.filas[0].fotoDocumentoKey).toBeNull();
    expect(H.borrar).toHaveBeenCalledWith(RUTA_T1);
  });
});
