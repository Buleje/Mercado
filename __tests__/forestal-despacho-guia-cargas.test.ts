// @vitest-environment node
/**
 * Despacho con guía + cargas medidas en el monte (security 16-10, F3).
 *
 * La misma carga no puede terminar en dos guías: el registro manda `cargas`,
 * el servidor las marca `usada` bajo el candado de su clave ANTES de
 * `despacharConGuia` y, si una ya va en otra guía, 409 sin escribir el libro.
 * Si el libro falla, las que este registro marcó vuelven a `medida`.
 *
 * Corre la ruta real con `ForestMedicionCargaDB` y `medicion-carga-server`
 * reales sobre un KV falso (un Map por clave); el libro (`despacharConGuia`)
 * es un doble que cuenta las escrituras.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const H = vi.hoisted(() => {
  class ClaveOcupadaError extends Error {
    constructor(readonly key: string) {
      super(`La clave ${key} está tomada`);
      this.name = "ClaveOcupadaError";
    }
  }
  class GtfDuplicateError extends Error {}
  class LothInvariantError extends Error {}
  class LothPermisoError extends Error {}
  class GuiaYaEnElCtpError extends Error {}
  return {
    kv: new Map<string, unknown>(),
    ClaveOcupadaError,
    GtfDuplicateError,
    LothInvariantError,
    LothPermisoError,
    GuiaYaEnElCtpError,
    ocupada: { valor: false },
    auth: { tenantId: "t1", username: "oficina", role: "admin" } as { tenantId: string; username: string; role: string } | null,
    /** El libro: cada llamada es una guía escrita. */
    despachar: vi.fn(async (_t: string, input: { gtfNumber: string }) => ({
      gtf: { id: `g-${input.gtfNumber}`, gtfNumber: input.gtfNumber },
      lineas: [],
      volumen: 1,
      codigosAMano: [],
    })),
    docs: new Map<string, { id: string; tags: string[] }>(),
    updateDoc: vi.fn(async () => true),
    audit: vi.fn(),
  };
});

vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("@/lib/rate-limit", () => ({ applyRateLimit: () => null }));
vi.mock("@/lib/specializations", () => ({ isSpecializationEnabled: vi.fn(async () => true) }));
vi.mock("@/lib/require-admin", async () => {
  const { NextResponse } = await import("next/server");
  return {
    requireAdmin: vi.fn(async (_req: unknown, roles: readonly string[]) => {
      if (!H.auth) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
      if (!roles.includes(H.auth.role)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
      return H.auth;
    }),
  };
});
vi.mock("@/lib/db/platform-settings.db", () => ({
  PREFIJO_INTERNO: "interno:",
  ClaveOcupadaError: H.ClaveOcupadaError,
  PlatformSettingsDB: {
    getFresco: async (key: string) => structuredClone(H.kv.get(key) ?? null),
    actualizar: async (key: string, fn: (actual: unknown, tx: unknown) => Promise<{ valor?: unknown; resultado: unknown }> | { valor?: unknown; resultado: unknown }) => {
      if (H.ocupada.valor) throw new H.ClaveOcupadaError(key);
      const r = await fn(structuredClone(H.kv.get(key) ?? null), {});
      if (r.valor !== undefined) H.kv.set(key, structuredClone(r.valor));
      return r.resultado;
    },
  },
}));
vi.mock("@/lib/db/forest-loth.db", () => ({
  LothInvariantError: H.LothInvariantError,
  LothPermisoError: H.LothPermisoError,
  ForestLothDB: {
    despacharConGuia: H.despachar,
    trozasParaGuia: async () => [],
    getActiveCaratula: async () => null,
  },
}));
vi.mock("@/lib/db/forest-loth-arboles-a-mano.db", () => ({ ForestLothArbolesAManoDB: {} }));
vi.mock("@/lib/db/forest-gtf.db", () => ({
  GtfDuplicateError: H.GtfDuplicateError,
  ForestGtfDB: { usadasConDueno: async () => [], numerosDeIngresos: async () => [] },
}));
vi.mock("@/lib/db/forest-plan.db", () => ({ ForestPlanDB: { getPlan: async () => null } }));
vi.mock("@/lib/db/forest-contrato.db", () => ({ ForestContratoDB: {} }));
vi.mock("@/lib/db/guia-th-al-ctp.db", () => ({ GuiaThAlCtpDB: { pasarAlCtp: async () => null } }));
vi.mock("@/lib/db/gtf-numero.db", () => ({ GuiaYaEnElCtpError: H.GuiaYaEnElCtpError }));
vi.mock("@/lib/db/guias-guardadas.db", () => ({ GuiasGuardadasDB: { numerosParaTalonario: async () => [] } }));
vi.mock("@/lib/db/ctp-guia-documentos.db", () => ({
  CtpGuiaDocumentosDB: {
    datosDeGuia: async (_t: string, gtf: string) => ({ gtfNumber: gtf.trim(), titular: "Juan", permiso: "PO-1" }),
    documentosDeGuias: async () => [],
  },
}));
vi.mock("@/lib/db/documents.db", () => ({
  DocumentsDB: {
    getById: async (_t: string, id: string) => H.docs.get(id) ?? null,
    update: H.updateDoc,
    createFolderTree: async () => ({ idPorRuta: {} }),
    log: async () => undefined,
  },
}));
vi.mock("@/lib/documents/storage", () => ({ buildStoragePath: () => "x", uploadToStorage: vi.fn() }));
vi.mock("@/lib/documents/precalcular-miniatura", () => ({ precalcularMiniatura: vi.fn(async () => undefined) }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: H.audit }));
/* La guía de prueba no lleva casilleros llenos ni talonario: eso tiene sus tests. */
vi.mock("@/lib/forestal/loth-guia-despacho", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/forestal/loth-guia-despacho")>()),
  faltantesDespachoLoth: () => [],
  revisarNumeroLoth: () => null,
}));

import { POST } from "@/app/api/admin/forestal/loth/despacho-guia/route";
import { armarCarga, filasParaLaGuia, MAX_CARGAS_POR_GUIA, type CargaMedida } from "@/lib/forestal/medicion-carga";
import { tagCarga } from "@/lib/forestal/medicion-carga-server";

const GUIA_1 = "019-001-0000123";
const GUIA_2 = "019-001-0000124";
const clave = (t: string) => `interno:medicion-carga:${t}`;

function sembrar(tenantId: string, id: string, extra: Partial<CargaMedida> = {}): CargaMedida {
  const fila = (codigo: string) => ({ codigo, d1Cm: 45, d2Cm: 43, largoM: 3.2, especie: "Tornillo" });
  const r = armarCarga({ planId: null, desde: 24, fotosEsperadas: 0, filas: [fila("24"), fila("25")] }, { en: "2026-10-16T14:00:00.000Z", por: "monte" }, id);
  if (!r.ok) throw new Error(r.mensaje);
  const c = { ...r.carga, ...extra };
  const alm = (H.kv.get(clave(tenantId)) as { cargas: CargaMedida[] } | undefined) ?? { cargas: [] };
  H.kv.set(clave(tenantId), { cargas: [...alm.cargas, c] });
  return c;
}
const enKv = (tenantId: string, id: string) => (H.kv.get(clave(tenantId)) as { cargas: CargaMedida[] } | undefined)?.cargas.find((c) => c.id === id);

async function registrar(gtfNumber: string, cargas: readonly CargaMedida[], ids = cargas.map((c) => c.id)) {
  const aMano = cargas.flatMap((c) => filasParaLaGuia(c));
  const res = await POST(
    new NextRequest("http://localhost/api/admin/forestal/loth/despacho-guia", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gtfNumber, gtfDate: "2026-10-16", trozas: [], aMano, planId: null, gtfDatos: {}, cargas: ids }),
    }),
  );
  return { status: res.status, data: (await res.json()) as Record<string, unknown> & { error?: string; message?: string } };
}
const acciones = () => H.audit.mock.calls.map(([a]) => (a as { action: string }).action);

beforeEach(() => {
  H.kv.clear();
  H.docs.clear();
  H.ocupada.valor = false;
  H.auth = { tenantId: "t1", username: "oficina", role: "admin" };
  vi.clearAllMocks();
});

describe("la misma carga no sale en dos guías", () => {
  it("dos registros con la misma carga: el 2.º es 409 y el libro se escribe una sola vez", async () => {
    const c = sembrar("t1", "c1");
    const r1 = await registrar(GUIA_1, [c]);
    expect(r1.status).toBe(201);
    expect(enKv("t1", "c1")).toMatchObject({ estado: "usada", usada: { gtfNumber: GUIA_1, por: "oficina" } });

    const r2 = await registrar(GUIA_2, [c]);
    expect(r2.status).toBe(409);
    expect(r2.data.error).toBe("carga_en_otra_guia");
    expect(r2.data.message).toContain(`ya va en la guía ${GUIA_1}`);
    expect(H.despachar).toHaveBeenCalledTimes(1);
    expect(H.despachar.mock.calls[0]?.[1]).toMatchObject({ gtfNumber: GUIA_1 });
    expect(enKv("t1", "c1")?.usada?.gtfNumber).toBe(GUIA_1);
    expect(acciones()).toEqual(["loth_medicion_carga_usar", "loth_medicion_carga_doble_uso"]);
  });

  it("todas o ninguna: con una carga ya usada, la otra de la misma guía tampoco se marca", async () => {
    const usada = sembrar("t1", "c1", { estado: "usada", usada: { en: "2026-10-16T14:10:00.000Z", por: "otra-pc", gtfNumber: GUIA_1 } });
    const libre = sembrar("t1", "c2");
    const r = await registrar(GUIA_2, [libre, usada]);
    expect(r.status).toBe(409);
    expect(H.despachar).not.toHaveBeenCalled();
    expect(enKv("t1", "c2")?.estado).toBe("medida");
  });

  it("carga descartada → 409 sin escribir el libro", async () => {
    const c = sembrar("t1", "c1", { estado: "descartada", descartada: { en: "2026-10-16T14:10:00.000Z", por: "monte", motivo: "repetida" } });
    const r = await registrar(GUIA_1, [c]);
    expect(r.status).toBe(409);
    expect(r.data.error).toBe("carga_descartada");
    expect(H.despachar).not.toHaveBeenCalled();
    expect(acciones()).toEqual(["loth_medicion_carga_doble_uso"]);
  });

  it("otra PC tiene la clave de las cargas → 409 ocupado sin escribir el libro", async () => {
    const c = sembrar("t1", "c1");
    H.ocupada.valor = true;
    const r = await registrar(GUIA_1, [c]);
    expect(r.status).toBe(409);
    expect(r.data.error).toBe("ocupado");
    expect(H.despachar).not.toHaveBeenCalled();
  });

  it(`más de ${MAX_CARGAS_POR_GUIA} cargas en una guía → 400`, async () => {
    const c = sembrar("t1", "c1");
    const ids = Array.from({ length: MAX_CARGAS_POR_GUIA + 1 }, (_, i) => `x${i}`);
    expect((await registrar(GUIA_1, [c], ids)).status).toBe(400);
    expect(H.despachar).not.toHaveBeenCalled();
  });
});

describe("si el libro falla, la carga vuelve a «medida»", () => {
  it("despacharConGuia tira → la carga queda sin usar y sirve para la guía siguiente", async () => {
    const c = sembrar("t1", "c1");
    H.despachar.mockRejectedValueOnce(new Error("se cayó la base"));
    const r = await registrar(GUIA_1, [c]);
    expect(r.status).toBe(500);
    const vuelta = enKv("t1", "c1");
    expect(vuelta?.estado).toBe("medida");
    expect(vuelta?.usada).toBeUndefined();

    expect((await registrar(GUIA_1, [c])).status).toBe(201);
    expect(enKv("t1", "c1")?.usada?.gtfNumber).toBe(GUIA_1);
  });

  it("N° repetido bajo el candado del libro → 409 duplicate y la carga vuelve a medida", async () => {
    const c = sembrar("t1", "c1");
    H.despachar.mockRejectedValueOnce(new H.GtfDuplicateError("Ya hay una guía con ese N°"));
    const r = await registrar(GUIA_1, [c]);
    expect(r.status).toBe(409);
    expect(r.data.error).toBe("duplicate");
    expect(enKv("t1", "c1")?.estado).toBe("medida");
  });

  it("reintento con el MISMO N° (la carga ya quedó usada con esta guía): pasa; si el libro falla, no la suelta", async () => {
    const c = sembrar("t1", "c1", { estado: "usada", usada: { en: "2026-10-16T14:10:00.000Z", por: "oficina", gtfNumber: GUIA_1 } });
    H.despachar.mockRejectedValueOnce(new Error("corte"));
    expect((await registrar(GUIA_1, [c])).status).toBe(500);
    expect(enKv("t1", "c1")).toMatchObject({ estado: "usada", usada: { gtfNumber: GUIA_1 } });
  });
});

describe("las fotos de la carga pasan a los papeles de la guía", () => {
  it("al registrar, también si la carga ya estaba marcada con esta guía", async () => {
    const fotos = ["d1", "d2"].map((docId) => ({ docId, tipo: "original" as const, subida: { en: "2026-10-16T14:00:00.000Z", por: "monte" } }));
    const c = sembrar("t1", "c1", { fotos, estado: "usada", usada: { en: "2026-10-16T14:10:00.000Z", por: "oficina", gtfNumber: GUIA_1 } });
    for (const f of fotos) H.docs.set(f.docId, { id: f.docId, tags: [tagCarga("c1")] });
    const r = await registrar(GUIA_1, [c]);
    expect(r.status).toBe(201);
    expect(r.data.cargas).toEqual({ usadas: 1, fotos: { pasadas: 2, sinLugar: 0, fallidas: 0 } });
    expect(H.updateDoc).toHaveBeenCalledTimes(2);
    /* No la cambió este registro: no se audita como «usada» otra vez. */
    expect(acciones()).not.toContain("loth_medicion_carga_usar");
  });

  it("sin cargas, la respuesta no trae `cargas` y el KV no se toca", async () => {
    const res = await POST(
      new NextRequest("http://localhost/api/admin/forestal/loth/despacho-guia", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gtfNumber: GUIA_1, gtfDate: "2026-10-16", aMano: [{ d1Cm: 45, d2Cm: 43, largoM: 3.2, cantidad: 1, especie: "Tornillo" }], planId: null, gtfDatos: {} }),
      }),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).cargas).toBeUndefined();
    expect(H.kv.size).toBe(0);
  });
});

describe("tenant ajeno y roles", () => {
  it("la carga de otro negocio → 404 sin escribir el libro ni tocar su KV", async () => {
    const ajena = sembrar("t2", "c-ajena");
    const r = await registrar(GUIA_1, [ajena]);
    expect(r.status).toBe(404);
    expect(r.data.error).toBe("carga_no_existe");
    expect(H.despachar).not.toHaveBeenCalled();
    expect(enKv("t2", "c-ajena")?.estado).toBe("medida");
    expect(H.kv.has(clave("t1"))).toBe(false);
  });

  it("el almacenero no registra guías: 403 y la carga sigue sin usar", async () => {
    const c = sembrar("t1", "c1");
    H.auth = { tenantId: "t1", username: "monte", role: "almacenero" };
    expect((await registrar(GUIA_1, [c])).status).toBe(403);
    expect(enKv("t1", "c1")?.estado).toBe("medida");
    H.auth = null;
    expect((await registrar(GUIA_1, [c])).status).toBe(401);
  });
});
