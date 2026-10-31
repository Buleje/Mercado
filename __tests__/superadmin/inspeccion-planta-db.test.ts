/**
 * ForestInspeccionPlantaDB (ADR-498): la máquina de estados del acta y la
 * lectura de los JSON guardados. Base simulada: una tabla en memoria con lo
 * justo que usan `findFirst`, `findMany`, `updateMany` y `create`.
 *
 * 1. Cerrada o anulada no se edita (409) y el conteo no entra.
 * 1b. El conteo es de la inspección (security 17-10): va dentro de su fila, sin
 *     las trozas (salen del libro congelado), nunca al patio de la planta.
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
    /* Las listas leen con SQL (recortan el conteo): acá, la misma tabla con la fecha ya en texto. */
    $queryRawUnsafe: vi.fn(async (_sql: string, ...p: unknown[]) =>
      H.filas
        .filter((f) => (Array.isArray(p[0]) ? p[0].includes(f.tenantId) : f.tenantId === p[0]))
        .map((f) => ({ ...f, fecha: (f.fecha as Date).toISOString().slice(0, 10) })),
    ),
  },
}));
vi.mock("@/lib/cache", () => ({
  getOrSet: (_k: string, _t: number, fn: () => Promise<unknown>) => fn(),
  invalidateByPrefix: vi.fn(),
}));
vi.mock("@/lib/activity-logger", () => ({ logActivity: vi.fn(async () => undefined) }));
vi.mock("@/lib/logger", () => ({ logger: { error: H.logError, warn: vi.fn(), info: vi.fn() } }));

import { anotarDesconocido, anotarTroza, nuevoConteo, type TrozaDelConteo } from "@/lib/forestal/conteo-patio";
import {
  ForestInspeccionPlantaDB as DB,
  InspeccionError,
  aResumen,
  faltantesDeTrozas,
  leerHallazgos,
  transicionPermitida,
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

const troza = (id: string, m3: number): TrozaDelConteo => ({
  id,
  codificacion: null,
  codigoPlanta: id.toUpperCase(),
  especieComun: "Cumala",
  gtfNumber: "019-001-0000001",
  volumenM3: m3,
  motivo: null,
});
const PATIO = [troza("t-a", 1.2), troza("t-b", 0.8)];
const LIBRO_PATIO = { ...LIBRO, trozasDelPatio: PATIO };

/** Lo que manda el celular: 1 troza del libro + 1 código desconocido, sin trozas y con su propio inicio. */
function conteoDelEquipo() {
  const ahora = "2026-10-17T15:00:00.000Z";
  let c = nuevoConteo({ fecha: "2020-01-01", quien: "inspector", trozas: PATIO, ahora: "2020-01-01T00:00:00.000Z" });
  c = anotarTroza(c, PATIO[0], ahora);
  c = anotarDesconocido(c, "ZZ-9", ahora);
  return { ...c, trozas: [] };
}

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

beforeEach(() => {
  H.filas = [];
  H.carrera = null;
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

  it("editar una cerrada → 409 y el conteo no entra", async () => {
    const f = fila("cerrada", { libro: LIBRO_PATIO });
    const err = await DB.editar(T, f.id, { conclusion: "x", conteoPatio: conteoDelEquipo() }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InspeccionError);
    expect((err as InspeccionError).status).toBe(409);
    expect((err as InspeccionError).estado).toBe("cerrada");
    expect(f.trozas).toBeNull();
    expect(f.conclusion).toBeNull();
  });

  it("la cierran entre la lectura y el UPDATE con un conteo → 409 y el conteo no entra", async () => {
    const f = fila("abierta", { libro: LIBRO_PATIO });
    H.carrera = "cerrada";
    await expect(DB.editar(T, f.id, { conteoPatio: conteoDelEquipo() })).rejects.toMatchObject({ status: 409 });
    expect(f.trozas).toBeNull();
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
  it("va dentro de la fila de la inspección, sin trozas, clavado al libro congelado", async () => {
    const f = fila("abierta", { libro: LIBRO_PATIO, conteoPatioId: "acta-vieja-del-patio" });
    const r = await DB.editar(T, f.id, { conteoPatio: conteoDelEquipo() }, "inspector@buleje");
    const guardado = f.trozas as Record<string, unknown> & { conteo: Record<string, unknown> };
    /* El resumen (lo lee la lista) y el conteo SIN las trozas: salen del libro al leer. */
    expect(guardado).toMatchObject({ esperadas: 2, contadas: 1, faltantes: 1, sobrantes: 1, m3Esperado: 2, m3Contado: 1.2 });
    expect(guardado.conteo).not.toHaveProperty("trozas");
    expect(guardado.conteo.iniciadoEn).toBe(LIBRO.tomadaEn);
    expect((guardado.conteo.lecturas as unknown[]).length).toBe(2);
    /* Ya no apunta al acta del patio de la planta (la planta podía reescribirla). */
    expect(f.conteoPatioId).toBeNull();
    expect(r?.conteoPatioId).toBeNull();
    expect(r?.trozas).toEqual({ esperadas: 2, contadas: 1, m3Esperado: 2, m3Contado: 1.2, faltantes: 1, sobrantes: 1 });
    expect(r?.faltantesTrozas).toBe(1);
    expect(r?.conteoPatio?.trozas).toEqual(PATIO);
    expect(r?.conteoPatio?.fecha).toBe("2026-10-17");
    expect(r?.conteoPatio?.iniciadoEn).toBe(LIBRO.tomadaEn);
  });

  it("una inspección vieja con acta del patio muestra su resumen y ningún conteo", async () => {
    const f = fila("cerrada", { conteoPatioId: "acta-9", trozas: TROZAS });
    const r = await DB.obtener(T, f.id);
    expect(r?.trozas).toEqual(TROZAS);
    expect(r?.conteoPatio).toBeNull();
  });

  it("faltantesDeTrozas: sin conteo o roto = null (nunca 0)", () => {
    expect(faltantesDeTrozas(null)).toBeNull();
    expect(faltantesDeTrozas({ esperadas: "84" })).toBeNull();
    expect(faltantesDeTrozas(TROZAS)).toBe(4);
    expect(faltantesDeTrozas({ ...TROZAS, faltantes: 0 })).toBe(0);
  });
});

describe("fotos de los hallazgos", () => {
  const foto = (planta: string) => `/api/superadmin/plantas/${planta}/inspecciones/fotos/0b9c3a52-5d8e-4f7a-9a51-2b7f0e6c1d34`;

  it("la de esta planta entra; la de otra planta → 422 sin escribir", async () => {
    const f = fila("abierta");
    const r = await DB.editar(T, f.id, { hallazgos: [{ ...HALLAZGO, fotos: [foto(T)] } as never] });
    expect(r?.hallazgosDetalle[0].fotos).toEqual([foto(T)]);
    await expect(
      DB.editar(T, f.id, { hallazgos: [{ ...HALLAZGO, fotos: [foto("otra-planta")] } as never] }),
    ).rejects.toMatchObject({ status: 422 });
    expect((f.hallazgos as { fotos: string[] }[])[0].fotos).toEqual([foto(T)]);
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
