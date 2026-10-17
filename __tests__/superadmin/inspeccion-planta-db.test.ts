/**
 * ForestInspeccionPlantaDB (ADR-498): la máquina de estados del acta y la
 * lectura de los JSON guardados. Base simulada: una tabla en memoria con lo
 * justo que usan `findFirst`, `findMany`, `updateMany` y `create`.
 *
 * 1. Cerrada o anulada no se edita (409) y el conteo NO se guarda en el patio.
 * 2. Si la cierran entre la lectura y el UPDATE (otra pestaña), también 409.
 * 3. Anular vale desde abierta o cerrada, nunca dos veces.
 * 4. `faltantesTrozas` y `hallazgos` del resumen salen de los JSON guardados;
 *    lo roto se omite y se reporta, la lista no se cae.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fila = Record<string, unknown> & { id: string; tenantId: string; estado: string };

const H = vi.hoisted(() => ({
  filas: [] as Fila[],
  /** Estado que la "otra pestaña" pone justo antes del UPDATE. */
  carrera: null as string | null,
  guardar: vi.fn(),
  logError: vi.fn(),
}));

const coincide = (f: Fila, w: Record<string, unknown>) =>
  Object.entries(w).every(([k, v]) =>
    v && typeof v === "object" && "in" in (v as object) ? (v as { in: unknown[] }).in.includes(f[k]) : f[k] === v,
  );

vi.mock("@/lib/prisma", () => ({
  prisma: {
    forestInspeccionPlanta: {
      findFirst: vi.fn(async (q: { where: Record<string, unknown> }) => H.filas.find((f) => coincide(f, q.where)) ?? null),
      findMany: vi.fn(async (q: { where: Record<string, unknown> }) => H.filas.filter((f) => coincide(f, q.where))),
      create: vi.fn(async (q: { data: Record<string, unknown> }) => {
        const f = {
          id: `insp-${H.filas.length + 1}`,
          estado: "abierta",
          conteoPatioId: null,
          trozas: null,
          aserrada: [],
          hallazgos: [],
          conclusion: null,
          responsablePlanta: null,
          motivoAnulacion: null,
          cerradaAt: null,
          anuladaAt: null,
          ...q.data,
        } as unknown as Fila;
        H.filas.push(f);
        return f;
      }),
      updateMany: vi.fn(async (q: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (H.carrera) {
          for (const f of H.filas) if (f.id === q.where.id) f.estado = H.carrera;
          H.carrera = null;
        }
        const tocadas = H.filas.filter((f) => coincide(f, q.where));
        for (const f of tocadas) Object.assign(f, q.data);
        return { count: tocadas.length };
      }),
    },
    $queryRawUnsafe: vi.fn(async () => []),
  },
}));
vi.mock("@/lib/cache", () => ({
  getOrSet: (_k: string, _t: number, fn: () => Promise<unknown>) => fn(),
  invalidateByPrefix: vi.fn(),
}));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { error: H.logError, warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/db/forest-patio-conteo.db", () => ({ ForestPatioConteoDB: { guardar: H.guardar } }));

import {
  ForestInspeccionPlantaDB as DB,
  InspeccionError,
  aResumen,
  faltantesDeTrozas,
  leerHallazgos,
  transicionPermitida,
  trozasDeActa,
} from "@/lib/db/forest-inspeccion-planta.db";

const T = "planta-1";
const LIBRO = {
  tomadaEn: "2026-10-17T14:00:00.000Z",
  trozas: { enPatio: { piezas: 84, m3: 120.5, ptAserrable: 28_600 } },
  aserrada: null,
  movimiento: null,
  incoherencias: { error: 2, warning: 1, info: 0, m3EnJuego: 21.755 },
};
const HALLAZGO = {
  id: "h1",
  gravedad: "error",
  categoria: "volumen",
  texto: "Faltan trozas de la guía 123",
  m3: 3.2,
  fotos: [],
  referencia: { tipo: "guia", valor: "123" },
};
const TROZAS = { esperadas: 84, contadas: 80, m3Esperado: 120.5, m3Contado: 115, faltantes: 4, sobrantes: 0 };

function fila(estado: string, extra: Partial<Fila> = {}): Fila {
  const f: Fila = {
    id: `f-${H.filas.length + 1}`,
    tenantId: T,
    fecha: new Date("2026-10-17T00:00:00.000Z"),
    inspector: "Brandon",
    estado,
    libro: LIBRO,
    conteoPatioId: null,
    trozas: null,
    aserrada: [],
    hallazgos: [],
    conclusion: null,
    responsablePlanta: null,
    notas: null,
    motivoAnulacion: null,
    cerradaAt: null,
    anuladaAt: null,
    ...extra,
  };
  H.filas.push(f);
  return f;
}

const ACTA = { id: "acta-9", esperadas: 84, contadas: 81, faltan: 3, sobrantes: 1, m3Esperado: 120.5, m3Contado: 116.1 };

beforeEach(() => {
  H.filas = [];
  H.carrera = null;
  H.guardar.mockReset().mockResolvedValue({ acta: ACTA, creada: true, obsoleta: false });
  H.logError.mockReset();
});

describe("estados", () => {
  it("sólo abierta se edita o se cierra; anular desde abierta o cerrada", () => {
    expect(transicionPermitida("editar", "abierta")).toBe(true);
    expect(transicionPermitida("editar", "cerrada")).toBe(false);
    expect(transicionPermitida("cerrar", "anulada")).toBe(false);
    expect(transicionPermitida("anular", "cerrada")).toBe(true);
    expect(transicionPermitida("anular", "anulada")).toBe(false);
  });

  it("editar una cerrada → 409 y el conteo NO se guarda en el patio", async () => {
    const f = fila("cerrada");
    const err = await DB.editar(T, f.id, { conclusion: "x", conteoPatio: {} as never }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InspeccionError);
    expect((err as InspeccionError).status).toBe(409);
    expect((err as InspeccionError).estado).toBe("cerrada");
    expect(H.guardar).not.toHaveBeenCalled();
    expect(f.conclusion).toBeNull();
  });

  it("editar una anulada → 409", async () => {
    const f = fila("anulada", { motivoAnulacion: "abierta por error" });
    await expect(DB.editar(T, f.id, { conclusion: "x" })).rejects.toMatchObject({ status: 409, estado: "anulada" });
  });

  it("la cierran entre la lectura y el UPDATE → 409, no se pisa", async () => {
    const f = fila("abierta");
    H.carrera = "cerrada";
    await expect(DB.editar(T, f.id, { conclusion: "tarde" })).rejects.toMatchObject({ status: 409, estado: "cerrada" });
    expect(f.conclusion).toBeNull();
  });

  it("otra planta no ve la inspección: null, no 409", async () => {
    const f = fila("abierta");
    expect(await DB.editar("otra-planta", f.id, { conclusion: "x" })).toBeNull();
    expect(await DB.cerrar("otra-planta", f.id)).toBeNull();
    expect(await DB.obtener("otra-planta", f.id)).toBeNull();
  });

  it("cerrar dos veces → la 2.ª es 409", async () => {
    const f = fila("abierta");
    const cerrada = await DB.cerrar(T, f.id);
    expect(cerrada?.estado).toBe("cerrada");
    expect(cerrada?.cerradaAt).not.toBeNull();
    await expect(DB.cerrar(T, f.id)).rejects.toMatchObject({ status: 409 });
  });

  it("anular una cerrada guarda el motivo; anularla otra vez → 409", async () => {
    const f = fila("cerrada");
    const anulada = await DB.anular(T, f.id, "  la planta era otra  ");
    expect(anulada?.estado).toBe("anulada");
    expect(anulada?.motivoAnulacion).toBe("la planta era otra");
    await expect(DB.anular(T, f.id, "otra vez más")).rejects.toMatchObject({ status: 409 });
  });

  it("anular sin motivo → 422", async () => {
    const f = fila("abierta");
    await expect(DB.anular(T, f.id, "   ")).rejects.toMatchObject({ status: 422 });
    expect(f.estado).toBe("abierta");
  });
});

describe("conteo de trozas", () => {
  it("se guarda como acta del patio y la inspección copia su id y su resumen", async () => {
    const f = fila("abierta");
    const r = await DB.editar(T, f.id, { conteoPatio: { v: 1 } as never }, "inspector@buleje");
    /* La nota dice en el historial de conteos de la planta de dónde salió esta acta. */
    expect(H.guardar).toHaveBeenCalledWith(
      T,
      { conteo: { v: 1 }, notas: `Conteo de la inspección de planta ${f.id}` },
      "inspector@buleje",
    );
    expect(f.conteoPatioId).toBe("acta-9");
    expect(r?.trozas).toEqual({ esperadas: 84, contadas: 81, m3Esperado: 120.5, m3Contado: 116.1, faltantes: 3, sobrantes: 1 });
    expect(r?.faltantesTrozas).toBe(3);
  });

  it("trozasDeActa: faltantes = `faltan` del acta (esperadas no escaneadas)", () => {
    expect(trozasDeActa(ACTA).faltantes).toBe(3);
  });

  it("faltantesDeTrozas: sin conteo o roto = null (nunca 0)", () => {
    expect(faltantesDeTrozas(null)).toBeNull();
    expect(faltantesDeTrozas({ esperadas: "84" })).toBeNull();
    expect(faltantesDeTrozas(TROZAS)).toBe(4);
    expect(faltantesDeTrozas({ ...TROZAS, faltantes: 0 })).toBe(0);
  });
});

describe("lectura de los JSON guardados", () => {
  it("hallazgos: lo válido se cuenta, lo roto se omite", () => {
    const r = leerHallazgos([HALLAZGO, { id: "h2", texto: 7 }, { ...HALLAZGO, id: "h3" }]);
    expect(r.validos.map((h) => h.id)).toEqual(["h1", "h3"]);
    expect(r.rotos).toBe(1);
    expect(leerHallazgos("no es lista")).toEqual({ validos: [], rotos: 1 });
  });

  it("resumen: hallazgos y faltantes salen de los JSON", () => {
    const f = fila("abierta", { hallazgos: [HALLAZGO, HALLAZGO], trozas: TROZAS });
    expect(aResumen(f as never)).toEqual({
      id: f.id,
      fecha: "2026-10-17",
      inspector: "Brandon",
      estado: "abierta",
      hallazgos: 2,
      faltantesTrozas: 4,
    });
  });

  it("listar: una fila con estado ilegible se reporta y la lista sigue", async () => {
    fila("abierta");
    fila("borrador");
    fila("cerrada", { hallazgos: "{roto" });
    const lista = await DB.listar(T);
    expect(lista.map((i) => i.estado)).toEqual(["abierta", "cerrada"]);
    expect(lista[1].hallazgos).toBe(0);
    expect(H.logError).toHaveBeenCalledTimes(1);
  });

  it("obtener con el libro congelado roto → InspeccionError corrupta (500)", async () => {
    const f = fila("abierta", { libro: { tomadaEn: "" } });
    await expect(DB.obtener(T, f.id)).rejects.toMatchObject({ codigo: "corrupta", status: 500 });
  });
});

describe("crear", () => {
  it("guarda el libro congelado y nace abierta", async () => {
    const r = await DB.crear(T, { fecha: "2026-10-17", inspector: " Brandon ", libro: LIBRO as never, notas: "  " });
    expect(r.estado).toBe("abierta");
    expect(r.inspector).toBe("Brandon");
    expect(r.libro.incoherencias.m3EnJuego).toBe(21.755);
    expect(r.notas).toBeNull();
    expect(r.fecha).toBe("2026-10-17");
  });

  it("libro sin la forma esperada → 422 sin escribir", async () => {
    await expect(
      DB.crear(T, { fecha: "2026-10-17", inspector: "B", libro: { tomadaEn: "x" } as never }),
    ).rejects.toMatchObject({ status: 422 });
    expect(H.filas).toHaveLength(0);
  });

  it("ultimaPorPlanta sin plantas no consulta", async () => {
    expect(await DB.ultimaPorPlanta([])).toEqual({});
  });
});
