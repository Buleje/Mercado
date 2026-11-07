// @vitest-environment node
/**
 * ADR-491 — el registro de firmas es SOLO DE AGREGAR.
 *
 * - `registrar` es idempotente por clave (un reintento no anota dos veces).
 * - La clase no expone update/delete/upsert del registro, y NADIE en el repo
 *   llama `adelantoFirma.update|delete|upsert` (el trigger de la base lo
 *   rechazaría igual, con un 500 feo).
 * - El sha256 de la fila es el del binario que QUEDÓ en el bucket.
 * - La puerta de la imagen recalcula el hash: `X-Integridad: ok | alterada`.
 * - Rutas del registro: sólo la carpeta de ESTE adelanto de ESTE negocio.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";

const H = vi.hoisted(() => ({
  findFirst: vi.fn(),
  create: vi.fn(),
  upload: vi.fn(),
  auth: { tenantId: "t1", username: "dueno", role: "admin" } as { tenantId: string; username: string; role: string },
  rutaDe: vi.fn(),
  bajar: vi.fn(),
  logError: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: { adelantoFirma: { findFirst: (...a: unknown[]) => H.findFirst(...a), create: (...a: unknown[]) => H.create(...a) } },
}));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => ({ storage: { from: () => ({ upload: (...a: unknown[]) => H.upload(...a) }) } }),
}));
vi.mock("@/lib/forestal/fotos-carga-storage", () => ({ BUCKET_FOTOS_CARGA: "forestal-privado", asegurarBucketFotosCarga: vi.fn(async () => {}) }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: (...a: unknown[]) => H.logError(...a) } }));

import { AdelantoFirmasDB } from "@/lib/db/adelanto-firmas.db";
import { subirImagenRegistro } from "@/lib/adelantos/firma-storage";
import { esRutaRegistroDelAdelanto, rutaRegistroPrivada, sha256Hex } from "@/lib/adelantos/registro-firmas";

const FILA = {
  id: "f1", adelantoId: "a1", tipo: "FIRMA", canal: "PANTALLA", firmanteNombre: "Juan", firmanteDocumento: "45678901",
  montoFirmado: 120, monedaFirmada: "PEN", codigoOperacion: "ADL-2026-0001", pedidoPor: "caja1", sha256: "a".repeat(64), createdAt: new Date("2026-10-10T15:00:00Z"),
};
const INPUT = {
  adelantoId: "a1", tipo: "FIRMA" as const, canal: "PANTALLA" as const, firmanteNombre: "Juan", firmanteDocumento: "DNI 4567-8901",
  ruta: "t1/adelantos/a1/registro/1760000000000-firma-0123456789abcdef.webp", sha256: "a".repeat(64), bytes: 10,
  montoFirmado: 120, monedaFirmada: "PEN", idempotencyKey: "clave-0001:FIRMA",
};

describe("AdelantoFirmasDB.registrar", () => {
  beforeEach(() => {
    H.findFirst.mockReset();
    H.create.mockReset().mockResolvedValue(FILA);
  });

  it("primera vez: INSERT con tenant, documento limpio y la clave; vigente", async () => {
    H.findFirst.mockResolvedValueOnce(null);
    const r = await AdelantoFirmasDB.registrar("t1", INPUT);
    expect(r.repetida).toBe(false);
    expect(r.fila).toMatchObject({ id: "f1", vigente: true, src: "/api/adelantos/a1/firmas/f1/imagen" });
    const data = H.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ tenantId: "t1", adelantoId: "a1", firmanteDocumento: "45678901", idempotencyKey: "clave-0001:FIRMA" });
  });

  it("la misma clave: devuelve la que quedó, sin INSERT", async () => {
    H.findFirst.mockResolvedValueOnce(FILA).mockResolvedValueOnce({ id: "f1" });
    const r = await AdelantoFirmasDB.registrar("t1", INPUT);
    expect(r).toMatchObject({ repetida: true, fila: { id: "f1", vigente: true } });
    expect(H.create).not.toHaveBeenCalled();
  });

  it("una clave que es de OTRO adelanto no se devuelve", async () => {
    H.findFirst.mockResolvedValueOnce({ ...FILA, adelantoId: "a-otro" });
    await expect(AdelantoFirmasDB.registrar("t1", INPUT)).rejects.toThrow(/otro adelanto/);
    expect(H.create).not.toHaveBeenCalled();
  });
});

describe("solo de agregar", () => {
  it("la clase no expone update / delete / upsert; lo único destructivo es suprimir una HUELLA (Ley 29733)", () => {
    expect(Object.keys(AdelantoFirmasDB).filter((k) => /update|delete|upsert|borrar|editar|reemplazar|suprimir/i.test(k))).toEqual(["suprimirHuella"]);
  });

  it("nadie en el repo llama adelantoFirma.update|delete|upsert", () => {
    const RAIZ = join(__dirname, "..");
    const hallados: string[] = [];
    const recorrer = (dir: string) => {
      for (const n of readdirSync(dir)) {
        if (n === "node_modules" || n === "generated" || n.startsWith(".")) continue;
        const p = join(dir, n);
        if (statSync(p).isDirectory()) recorrer(p);
        else if (/\.(ts|tsx|mjs|js)$/.test(n) && /adelantoFirma\.(update|updateMany|delete|deleteMany|upsert)\b/.test(readFileSync(p, "utf8"))) {
          hallados.push(p.slice(RAIZ.length + 1));
        }
      }
    };
    for (const d of ["app", "lib", "scripts", "components"]) recorrer(join(RAIZ, d));
    /* La única: `suprimirHuella`, tipo HUELLA, con el permiso LOCAL antes. */
    expect(hallados).toEqual(["lib/db/adelanto-firmas.db.ts"]);
    const src = readFileSync(join(RAIZ, "lib/db/adelanto-firmas.db.ts"), "utf8");
    expect(src.match(/adelantoFirma\.(update|updateMany|delete|deleteMany|upsert)\b/g)).toEqual(["adelantoFirma.deleteMany"]);
    const cuerpo = src.slice(src.indexOf("async suprimirHuella("), src.indexOf("adelantoFirma.deleteMany") + 200);
    expect(cuerpo).toMatch(/await permitirBorrarFirmasEnTx\(tx\);\s*const r = await tx\.adelantoFirma\.deleteMany\(\{ where: \{ tenantId, adelantoId, id: firmaId, tipo: "HUELLA" \} \}\)/);
  });
});

describe("sha256 = el del binario subido", () => {
  it("subirImagenRegistro devuelve el hash y los bytes de lo que subió", async () => {
    H.upload.mockResolvedValueOnce({ error: null });
    const webp = Buffer.from("RIFF....WEBPVP8 contenido");
    const r = await subirImagenRegistro("t1/adelantos/a1/registro/1760000000000-firma-0123456789abcdef.webp", webp);
    expect(r).toEqual({ ok: true, sha256: sha256Hex(webp), bytes: webp.length });
    expect(H.upload.mock.calls[0][1]).toBe(webp);
    expect(H.upload.mock.calls[0][2]).toMatchObject({ upsert: false, contentType: "image/webp" });
  });

  it("si el bucket falla, no hay hash (no se anota la fila)", async () => {
    H.upload.mockResolvedValueOnce({ error: { message: "boom" } });
    expect(await subirImagenRegistro("t1/adelantos/a1/registro/1760000000000-firma-0123456789abcdef.webp", Buffer.from("x"))).toEqual({ ok: false, error: "boom" });
  });
});

describe("rutas del registro", () => {
  it("forma y carpeta", () => {
    const r = rutaRegistroPrivada("t1", "a1", "HUELLA", 1760000000000, "0123456789ABCDEF");
    expect(r).toBe("t1/adelantos/a1/registro/1760000000000-huella-0123456789abcdef.webp");
    expect(esRutaRegistroDelAdelanto(r, "t1", "a1")).toBe(true);
    expect(esRutaRegistroDelAdelanto(r, "t2", "a1")).toBe(false);
    expect(esRutaRegistroDelAdelanto(r, "t1", "a2")).toBe(false);
    expect(esRutaRegistroDelAdelanto("t1/adelantos/a1/registro/../../a2/registro/1760000000000-firma-0123456789abcdef.webp", "t1", "a1")).toBe(false);
    expect(() => rutaRegistroPrivada("t1/..", "a1", "FIRMA", 1, "0123456789abcdef")).toThrow();
  });
});

describe("GET …/firmas/[firmaId]/imagen — X-Integridad", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/require-admin", () => ({ requireAdmin: vi.fn(async () => H.auth) }));
    vi.doMock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
    vi.doMock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => {}) }));
    vi.doMock("@/lib/cache", () => ({ cacheStore: { get: () => null, set: () => {} } }));
    vi.doMock("@/lib/db/adelanto-firmas.db", () => ({ AdelantoFirmasDB: { rutaDe: (...a: unknown[]) => H.rutaDe(...a) } }));
    vi.doMock("@/lib/adelantos/firma-storage", () => ({ bajarFirmaPrivada: (...a: unknown[]) => H.bajar(...a) }));
    H.logError.mockClear();
    H.bajar.mockReset();
    H.rutaDe.mockReset();
  });
  const RUTA = "t1/adelantos/a1/registro/1760000000000-firma-0123456789abcdef.webp";
  const pedir = async () => {
    const { GET } = await import("@/app/api/adelantos/[id]/firmas/[firmaId]/imagen/route");
    return (await GET(new NextRequest("http://localhost/api/adelantos/a1/firmas/f1/imagen"), { params: Promise.resolve({ id: "a1", firmaId: "f1" }) })) as NextResponse;
  };

  it("ok: el archivo es el que se firmó; no-store y CORP", async () => {
    const bin = Buffer.from("imagen firmada");
    H.rutaDe.mockResolvedValueOnce({ ruta: RUTA, sha256: sha256Hex(bin) });
    H.bajar.mockResolvedValueOnce(bin);
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(r.headers.get("X-Integridad")).toBe("ok");
    expect(r.headers.get("Cache-Control")).toBe("private, no-store");
    expect(r.headers.get("Cross-Origin-Resource-Policy")).toBe("same-origin");
  });

  it("alterada: el archivo del bucket cambió → header + error en el log", async () => {
    H.rutaDe.mockResolvedValueOnce({ ruta: RUTA, sha256: sha256Hex(Buffer.from("original")) });
    H.bajar.mockResolvedValueOnce(Buffer.from("cambiado"));
    const r = await pedir();
    expect(r.headers.get("X-Integridad")).toBe("alterada");
    expect(H.logError).toHaveBeenCalled();
  });

  it("firma de otro negocio o adelanto (rutaDe null) o ruta fuera de la carpeta → 404 sin bajar nada", async () => {
    H.rutaDe.mockResolvedValueOnce(null);
    expect((await pedir()).status).toBe(404);
    H.rutaDe.mockResolvedValueOnce({ ruta: "t1/adelantos/a2/registro/1760000000000-firma-0123456789abcdef.webp", sha256: "a".repeat(64) });
    expect((await pedir()).status).toBe(404);
    expect(H.bajar).not.toHaveBeenCalled();
    expect(H.rutaDe.mock.calls[0]).toEqual(["t1", "a1", "f1"]);
  });

  it("el cajero (sin `adelantos:read`) no ve imágenes", async () => {
    H.auth = { tenantId: "t1", username: "caja1", role: "cajero" };
    expect((await pedir()).status).toBe(403);
    H.auth = { tenantId: "t1", username: "dueno", role: "admin" };
  });
});

describe("borrar un negocio con firmas: permiso LOCAL en la misma transacción", () => {
  /* El trigger rechaza el DELETE en cascada del registro salvo con
     `app.permitir_borrar_firmas = 'on'` LOCAL (medido 10-10 contra la base:
     sin el ajuste 23001; con `set_config(…, true)` borra; tras el ROLLBACK la
     conexión queda en ""). Estas tres puertas borran tenants enteros. */
  const leer = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
  it.each([
    ["app/api/superadmin/tenants/[slug]/delete/route.ts", /prisma\.\$transaction\(\[permitirBorrarFirmas\(\), prisma\.tenant\.delete\(/],
    ["app/api/cron/cleanup-demos/route.ts", /prisma\.\$transaction\(\[\s*permitirBorrarFirmas\(\),\s*prisma\.tenant\.deleteMany\(/],
    ["scripts/cleanup-test-tenant.ts", /prisma\.\$transaction\(\[\s*prisma\.\$queryRaw`SELECT set_config\('app\.permitir_borrar_firmas', 'on', true\)`,\s*prisma\.tenant\.delete\(/],
  ])("%s", (archivo, patron) => {
    const src = leer(archivo);
    expect(src).toMatch(patron);
    expect(src).not.toMatch(/SET SESSION|set_config\('app\.permitir_borrar_firmas', 'on', false\)/);
  });

  it("el permiso es LOCAL (set_config con true), nunca de sesión", () => {
    const src = leer("lib/db/adelanto-firmas.db.ts");
    expect(src.match(/set_config\('app\.permitir_borrar_firmas', 'on', true\)/g)?.length).toBe(2);
    expect(src).not.toMatch(/SET SESSION|SET app\./);
  });
});

describe("suprimir una huella (Ley 29733)", () => {
  const S = { suprimir: vi.fn(), borrar: vi.fn(async () => true), log: vi.fn(async () => {}) };
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("@/lib/require-admin", () => ({ requireAdmin: vi.fn(async () => H.auth) }));
    vi.doMock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
    vi.doMock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
    vi.doMock("@/lib/activity-logger", () => ({ logActivity: (...a: unknown[]) => S.log(...(a as [])) }));
    vi.doMock("@/lib/db/adelanto-firmas.db", () => ({ AdelantoFirmasDB: { suprimirHuella: (...a: unknown[]) => S.suprimir(...a) } }));
    vi.doMock("@/lib/adelantos/firma-storage", () => ({ borrarFirmaPrivada: (...a: unknown[]) => S.borrar(...(a as [])) }));
    S.suprimir.mockReset();
    S.borrar.mockClear();
    S.log.mockClear();
    H.auth = { tenantId: "t1", username: "dueno", role: "admin" };
  });
  const pedir = async () => {
    const { DELETE } = await import("@/app/api/adelantos/[id]/firmas/[firmaId]/route");
    return (await DELETE(new NextRequest("http://localhost/api/adelantos/a1/firmas/h1", { method: "DELETE" }), { params: Promise.resolve({ id: "a1", firmaId: "h1" }) })) as NextResponse;
  };

  it("admin: borra la fila y el archivo; la actividad no lleva DNI ni ruta", async () => {
    S.suprimir.mockResolvedValueOnce({ ruta: "t1/adelantos/a1/registro/1760000000000-huella-0123456789abcdef.webp" });
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true, archivoBorrado: true });
    expect(S.suprimir).toHaveBeenCalledWith("t1", "a1", "h1");
    expect(S.borrar).toHaveBeenCalledWith("t1/adelantos/a1/registro/1760000000000-huella-0123456789abcdef.webp");
    const detalle = String((S.log.mock.calls[0] as unknown[])[2]);
    expect(detalle).toMatch(/huella suprimida/);
    expect(detalle).not.toMatch(/registro\/|\d{8}/);
  });

  it("una FIRMA no se suprime (409); de otro negocio o inexistente, 404", async () => {
    S.suprimir.mockResolvedValueOnce("no-es-huella");
    expect((await pedir()).status).toBe(409);
    S.suprimir.mockResolvedValueOnce("no-existe");
    expect((await pedir()).status).toBe(404);
    expect(S.borrar).not.toHaveBeenCalled();
  });

  it("encargado (manager), cajero y analista: 403 sin tocar la base", async () => {
    for (const role of ["manager", "cajero", "analista"]) {
      H.auth = { tenantId: "t1", username: "x", role };
      expect((await pedir()).status).toBe(403);
    }
    expect(S.suprimir).not.toHaveBeenCalled();
  });
});

describe("AdelantoFirmasDB.suprimirHuella", () => {
  it("permiso LOCAL y después el DELETE de esa huella, en la misma transacción", async () => {
    vi.resetModules();
    const orden: string[] = [];
    const tx = {
      adelantoFirma: {
        findFirst: vi.fn(async () => ({ tipo: "HUELLA", ruta: "t1/adelantos/a1/registro/1-huella-0123456789abcdef.webp" })),
        deleteMany: vi.fn(async () => (orden.push("delete"), { count: 1 })),
      },
      $queryRaw: vi.fn(async () => (orden.push("set_config"), [])),
    };
    vi.doUnmock("@/lib/db/adelanto-firmas.db");
    vi.doMock("@/lib/prisma", () => ({ prisma: { $transaction: (fn: (t: typeof tx) => unknown) => fn(tx) } }));
    const { AdelantoFirmasDB: DB } = await import("@/lib/db/adelanto-firmas.db");
    expect(await DB.suprimirHuella("t1", "a1", "h1")).toEqual({ ruta: "t1/adelantos/a1/registro/1-huella-0123456789abcdef.webp" });
    expect(orden).toEqual(["set_config", "delete"]);
    expect(tx.adelantoFirma.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "t1", adelantoId: "a1", id: "h1" } }));
    expect(tx.adelantoFirma.deleteMany).toHaveBeenCalledWith({ where: { tenantId: "t1", adelantoId: "a1", id: "h1", tipo: "HUELLA" } });
    tx.adelantoFirma.findFirst.mockResolvedValueOnce({ tipo: "FIRMA", ruta: "x" });
    expect(await DB.suprimirHuella("t1", "a1", "f1")).toBe("no-es-huella");
    vi.doUnmock("@/lib/prisma");
  });
});
