// @vitest-environment node
/**
 * ADR-526 — «Dónde está el original»: el archivador/separador del papel físico.
 *
 * - El campo (Zod): ausente no toca nada; `""`, espacios o `null` la borran;
 *   se recorta; hasta 120 caracteres (121 → 400, no se corta a escondidas).
 * - Qué se muestra: la del papel, o la de su carpeta marcada como heredada.
 * - `PATCH /api/admin/documents/folders/[id]`: la carpeta la guarda, con el
 *   negocio del JWT.
 * - `PATCH /api/admin/documents/[id]`: el papel la guarda por su propio UPDATE
 *   (no mueve `updatedAt`); un papel que no se ve (u otro negocio) → 404 sin
 *   escribir nada.
 * - `PATCH /api/admin/documents/codigo-fisico`: devuelve con qué ubicación
 *   quedó cada papel recién marcado (la que heredó de su carpeta).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";
import {
  UBICACION_FISICA_MAX,
  ubicacionDelOriginal,
  ubicacionFisicaSchema,
  ubicacionLimpia,
} from "@/lib/documentos/ubicacion-fisica";

vi.mock("server-only", () => ({}));

const H = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getById: vi.fn(),
  update: vi.fn(),
  ponerUbicacionFisica: vi.fn(),
  log: vi.fn(),
  logMany: vi.fn(),
  updateFolder: vi.fn(),
  accesoACarpeta: vi.fn(),
  idsVisibles: vi.fn(),
  marcarCodigoFisico: vi.fn(),
}));

vi.mock("@/lib/require-admin", () => ({ requireAdmin: H.requireAdmin }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
/* `after()` (historial de codigo-fisico) fuera de un pedido real tira: acá corre al toque. */
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  after: (fn: () => unknown) => {
    void fn();
  },
}));
vi.mock("@/lib/auth/csrf", () => ({ assertCsrf: () => null }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/documents/storage", () => ({ getSignedUrl: async () => "", deleteFromStorage: async () => {} }));
vi.mock("@/app/api/admin/documents/vinculo-subida", () => ({ ROLES_VINCULO: ["owner", "admin"] }));
vi.mock("@/lib/db/documents.db", () => ({
  CarpetaAjenaError: class extends Error {},
  CicloDeCarpetasError: class extends Error {},
  DocumentsDB: {
    getById: H.getById,
    update: H.update,
    ponerUbicacionFisica: H.ponerUbicacionFisica,
    log: H.log,
    logMany: H.logMany,
    updateFolder: H.updateFolder,
    accesoACarpeta: H.accesoACarpeta,
    idsVisibles: H.idsVisibles,
    marcarCodigoFisico: H.marcarCodigoFisico,
    tieneRoles: async () => false,
  },
}));

const { PATCH: patchDoc } = await import("@/app/api/admin/documents/[id]/route");
const { PATCH: patchCarpeta } = await import("@/app/api/admin/documents/folders/[id]/route");
const { PATCH: patchCodigo } = await import("@/app/api/admin/documents/codigo-fisico/route");

const AUTH = { tenantId: "t-a", username: "karla", role: "cajero" };
const pedido = (url: string, body: unknown) => new NextRequest(url, { method: "PATCH", body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const DOC = { id: "doc-1", tenantId: "t-a", folderId: "car-1", tags: [], allowedRoles: [], ubicacionFisica: null };

beforeEach(() => {
  vi.clearAllMocks();
  H.requireAdmin.mockResolvedValue(AUTH);
  H.log.mockResolvedValue(undefined);
  H.logMany.mockResolvedValue(undefined);
  H.accesoACarpeta.mockResolvedValue({ ve: true, restringida: false });
  H.ponerUbicacionFisica.mockResolvedValue(true);
});

describe("el campo (Zod)", () => {
  const cuerpo = z.object({ ubicacionFisica: ubicacionFisicaSchema });
  const leer = (v: unknown) => cuerpo.safeParse(v === undefined ? {} : { ubicacionFisica: v });

  it("recorta los bordes y guarda el texto", () => {
    expect(leer("  Archivador Guías 2026 · separador octubre  ")).toEqual({
      success: true,
      data: { ubicacionFisica: "Archivador Guías 2026 · separador octubre" },
    });
  });

  it('"", sólo espacios o null la borran (null)', () => {
    for (const v of ["", "   ", null]) expect(leer(v)).toEqual({ success: true, data: { ubicacionFisica: null } });
  });

  it("ausente no trae la clave: no toca lo guardado", () => {
    const r = leer(undefined);
    expect(r.success).toBe(true);
    expect(r.success && "ubicacionFisica" in r.data).toBe(false);
  });

  it("120 caracteres entran; 121 no (no se recorta a escondidas)", () => {
    expect(leer("x".repeat(UBICACION_FISICA_MAX)).success).toBe(true);
    expect(leer("x".repeat(UBICACION_FISICA_MAX + 1)).success).toBe(false);
    // Los espacios de los bordes no cuentan para el tope.
    expect(leer(`  ${"x".repeat(UBICACION_FISICA_MAX)}  `).success).toBe(true);
  });

  it("un número o un objeto no pasan", () => {
    expect(leer(12).success).toBe(false);
    expect(leer({ a: 1 }).success).toBe(false);
  });
});

describe("qué se muestra", () => {
  it("la del papel manda sobre la de su carpeta", () => {
    expect(ubicacionDelOriginal({ ubicacionFisica: " Caja 3 " }, { ubicacionFisica: "Archivador A" })).toEqual({ texto: "Caja 3", deLaCarpeta: false });
  });
  it("sin la suya, la de la carpeta, dicha como heredada", () => {
    expect(ubicacionDelOriginal({ ubicacionFisica: "  " }, { ubicacionFisica: "Archivador A" })).toEqual({ texto: "Archivador A", deLaCarpeta: true });
  });
  it("sin ninguna (o sin carpeta) no hay línea", () => {
    expect(ubicacionDelOriginal({ ubicacionFisica: null }, { ubicacionFisica: "" })).toBeNull();
    expect(ubicacionDelOriginal({}, null)).toBeNull();
    expect(ubicacionLimpia("   ")).toBeNull();
  });
});

describe("PATCH de la carpeta", () => {
  const url = "http://x/api/admin/documents/folders/car-1";

  it("guarda la ubicación recortada con el negocio del JWT", async () => {
    H.updateFolder.mockResolvedValue({ id: "car-1", ubicacionFisica: "Archivador A" });
    const res = await patchCarpeta(pedido(url, { ubicacionFisica: "  Archivador A " }), ctx("car-1"));
    expect(res.status).toBe(200);
    expect(H.updateFolder).toHaveBeenCalledWith("t-a", "car-1", { ubicacionFisica: "Archivador A" });
  });

  it("vacía la borra (null), no la deja en blanco", async () => {
    H.updateFolder.mockResolvedValue({ id: "car-1", ubicacionFisica: null });
    await patchCarpeta(pedido(url, { ubicacionFisica: "" }), ctx("car-1"));
    expect(H.updateFolder).toHaveBeenCalledWith("t-a", "car-1", { ubicacionFisica: null });
  });

  it("121 caracteres → 400 sin escribir", async () => {
    const res = await patchCarpeta(pedido(url, { ubicacionFisica: "x".repeat(121) }), ctx("car-1"));
    expect(res.status).toBe(400);
    expect(H.updateFolder).not.toHaveBeenCalled();
  });

  it("una carpeta que el rol no ve (u otro negocio) → 404 sin escribir", async () => {
    H.accesoACarpeta.mockResolvedValue({ ve: false, restringida: false });
    const res = await patchCarpeta(pedido(url, { ubicacionFisica: "Archivador A" }), ctx("car-ajena"));
    expect(res.status).toBe(404);
    expect(H.accesoACarpeta).toHaveBeenCalledWith("t-a", "car-ajena", "cajero");
    expect(H.updateFolder).not.toHaveBeenCalled();
  });
});

describe("PATCH del papel", () => {
  const url = "http://x/api/admin/documents/doc-1";

  it("sólo la ubicación: su propio UPDATE (sin tocar updatedAt), sin update() general", async () => {
    H.getById.mockResolvedValueOnce(DOC).mockResolvedValueOnce({ ...DOC, ubicacionFisica: "Caja 3" });
    const res = await patchDoc(pedido(url, { ubicacionFisica: " Caja 3 " }), ctx("doc-1"));
    expect(res.status).toBe(200);
    expect(H.ponerUbicacionFisica).toHaveBeenCalledWith("t-a", "doc-1", "Caja 3");
    expect(H.update).not.toHaveBeenCalled();
    expect((await res.json()).document.ubicacionFisica).toBe("Caja 3");
    // Queda en el historial con quién, de qué a qué.
    expect(H.log).toHaveBeenCalledWith("t-a", expect.objectContaining({
      documentId: "doc-1",
      actorId: "karla",
      metadata: { ubicacionFisica: { de: null, a: "Caja 3" } },
    }));
  });

  it("junto con otro cambio: guarda la ubicación y sigue con el resto", async () => {
    H.getById.mockResolvedValue(DOC);
    H.update.mockResolvedValue({ ...DOC, name: "Factura", ubicacionFisica: "Caja 3" });
    const res = await patchDoc(pedido(url, { name: "Factura", ubicacionFisica: "Caja 3" }), ctx("doc-1"));
    expect(res.status).toBe(200);
    expect(H.ponerUbicacionFisica).toHaveBeenCalledWith("t-a", "doc-1", "Caja 3");
    expect(H.update).toHaveBeenCalledTimes(1);
    expect(H.update.mock.calls[0][2]).not.toHaveProperty("ubicacionFisica");
  });

  it("un papel que no se ve (u otro negocio) → 404 sin escribir", async () => {
    H.getById.mockResolvedValue(null);
    const res = await patchDoc(pedido("http://x/api/admin/documents/ajeno", { ubicacionFisica: "Caja 3" }), ctx("ajeno"));
    expect(res.status).toBe(404);
    expect(H.getById).toHaveBeenCalledWith("t-a", "ajeno", "cajero");
    expect(H.ponerUbicacionFisica).not.toHaveBeenCalled();
  });

  it("121 caracteres → 400 sin leer ni escribir", async () => {
    const res = await patchDoc(pedido(url, { ubicacionFisica: "x".repeat(121) }), ctx("doc-1"));
    expect(res.status).toBe(400);
    expect(H.ponerUbicacionFisica).not.toHaveBeenCalled();
  });
});

describe("PATCH codigo-fisico", () => {
  it("devuelve dónde quedó cada papel marcado (lo que heredó de su carpeta)", async () => {
    H.idsVisibles.mockImplementation(async (_t: string, ids: string[]) => ids);
    H.marcarCodigoFisico.mockResolvedValue([
      { id: "d1", codigo: 7, ubicacionFisica: "Archivador A" },
      { id: "d2", codigo: 8, ubicacionFisica: null },
    ]);
    const res = await patchCodigo(pedido("http://x/api/admin/documents/codigo-fisico", { ids: ["d1", "d2"], puesto: true }));
    expect(res.status).toBe(200);
    expect((await res.json()).ubicaciones).toEqual({ d1: "Archivador A", d2: null });
    expect(H.marcarCodigoFisico.mock.calls[0][0]).toBe("t-a");
  });
});
