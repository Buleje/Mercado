/**
 * Cruces contra la base (ADR-456) y el post-proceso de la foto, con las DB
 * classes simuladas: qué se le pide a cada una (siempre con el tenant de la
 * cámara), qué entra en la ventana de ±1 día, y que lectura + cruces + pila
 * se guardan en UNA escritura aunque un paso falle.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Camara, Captura } from "@/lib/camaras/camaras";

const H = vi.hoisted(() => ({
  tenants: [] as string[],
  guias: [] as Record<string, unknown>[],
  fletes: [] as Record<string, unknown>[],
  vehiculos: [] as Record<string, unknown>[],
  chalecos: {} as Record<string, string>,
  colaboradores: [] as { id: string; nombre: string }[],
  marcas: [] as Record<string, unknown>[],
  fletesPedidos: [] as { desde: Date; hasta: Date }[],
  lectura: null as Record<string, unknown> | null,
  lecturaFalla: false,
  pila: null as unknown,
  pilaFalla: false,
  guardados: [] as unknown[],
  avisos: 0,
}));

const anota = (t: string) => H.tenants.push(t);

vi.mock("@/lib/logger", () => ({ logger: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} } }));
vi.mock("@/lib/db/forest-gtf.db", () => ({
  ForestGtfDB: { list: async (t: string) => (anota(t), H.guias) },
}));
vi.mock("@/lib/db/forest-flete.db", () => ({
  ForestFleteDB: {
    listar: async (t: string, o: { desde: Date; hasta: Date }) => (anota(t), H.fletesPedidos.push(o), H.fletes),
  },
}));
vi.mock("@/lib/db/forest-directorio.db", () => ({
  ForestDirectorioDB: { listarVehiculos: async (t: string) => (anota(t), H.vehiculos) },
}));
vi.mock("@/lib/db/rrhh-colaboradores.db", () => ({
  ColaboradoresDB: { listar: async (t: string) => (anota(t), H.colaboradores) },
}));
vi.mock("@/lib/db/rrhh-asistencia.db", () => ({
  AsistenciaDB: { delPeriodo: async (t: string) => (anota(t), H.marcas) },
}));
vi.mock("@/lib/db/camaras.db", () => ({
  CamarasDB: {
    chalecos: async (t: string) => (anota(t), H.chalecos),
    guardarAnalisis: async (t: string, id: string, a: unknown) => {
      anota(t);
      H.guardados.push({ id, ...(a as object) });
      return true;
    },
  },
}));
vi.mock("@/lib/ai/camara-vision", () => ({
  leerFotoDeCamara: async () => {
    if (H.lecturaFalla) throw new Error("ia caída");
    return H.lectura;
  },
}));
vi.mock("@/lib/camaras/pila", () => ({
  vigilarPila: async () => {
    if (H.pilaFalla) throw new Error("pila caída");
    return H.pila;
  },
}));
vi.mock("@/lib/camaras/avisar", () => ({
  avisarSiCorresponde: async () => {
    H.avisos += 1;
  },
}));

import { calcularCruces, procesarCapturaNueva } from "@/lib/camaras/cruces.server";

/* La foto es del 01/10 a las 10:00 de Lima. */
const AT = "2026-10-01T15:00:00.000Z";

beforeEach(() => {
  H.tenants = [];
  H.guias = [
    { id: "g-hoy", gtfNumber: "019-001-000123", gtfDate: new Date("2026-10-01T00:00:00.000Z"), createdAt: new Date(), status: "emitida", placaVehiculo: "ABC-123" },
    { id: "g-ayer", gtfNumber: "019-001-000122", gtfDate: new Date("2026-09-30T00:00:00.000Z"), createdAt: new Date(), status: "emitida", placaVehiculo: "ABC-1Z3" },
    { id: "g-anulada", gtfNumber: "019-001-000121", gtfDate: new Date("2026-10-01T00:00:00.000Z"), createdAt: new Date(), status: "anulada", placaVehiculo: "ABC-123" },
    { id: "g-vieja", gtfNumber: "019-001-000100", gtfDate: new Date("2026-09-20T00:00:00.000Z"), createdAt: new Date(), status: "emitida", placaVehiculo: "ABC-123" },
  ];
  H.fletes = [{ id: "f1", fecha: "2026-10-02T00:00:00.000Z", tipo: "ingreso", placa: "ABC123", gtfNumber: null, transportistaNombre: "Transportes Ucayali", conductorNombre: null }];
  H.vehiculos = [{ id: "v1", placa: "XYZ999", placaRemolque: "ABC123", marca: "Volvo", tipo: "camión", transportistaNombre: null, activo: true }];
  H.chalecos = { "3": "c-juan", "7": "c-ana" };
  H.colaboradores = [{ id: "c-juan", nombre: "Juan Pérez" }, { id: "c-ana", nombre: "Ana Ríos" }];
  H.marcas = [{ colaboradorId: "c-juan", estado: "TARDANZA", entradaMin: 478, salidaMin: null, createdAt: new Date() }];
  H.fletesPedidos = [];
  H.lectura = { descripcion: "Camión", hayPersona: true, hayVehiculo: true, personas: 1, placa: "ABC-123", confianza: "alta", motivo: null, chalecos: ["3"], actividad: "descarga" };
  H.lecturaFalla = false;
  H.pila = { comparadaCon: "cap-0", cambio: "igual", confianza: "alta" };
  H.pilaFalla = false;
  H.guardados = [];
  H.avisos = 0;
});

describe("calcularCruces", () => {
  it("placa contra guías ±1 día (sin anuladas ni viejas), flete y remolque del directorio; máx 3", async () => {
    const r = await calcularCruces("t-blas", { placa: "ABC-123", chalecos: [] }, AT);
    expect(r?.placas.map((p) => [p.tipo, p.refId, p.coincidencia])).toEqual([
      ["gtf", "g-hoy", "exacta"],
      ["flete", "f1", "exacta"],
      ["vehiculo", "v1", "exacta"],
    ]);
    expect(r?.placas[0].etiqueta).toBe("Guía 019-001-000123 · 01 oct.");
    expect(H.tenants.every((t) => t === "t-blas")).toBe(true);
    /* Los fletes se piden con la ventana del día ±1. */
    expect(H.fletesPedidos[0].desde.toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });

  it("la guía de ayer con un carácter confundible entra como parecida cuando hay lugar", async () => {
    H.fletes = [];
    H.vehiculos = [];
    const r = await calcularCruces("t-blas", { placa: "ABC-123" }, AT);
    expect(r?.placas.map((p) => [p.refId, p.coincidencia])).toEqual([
      ["g-hoy", "exacta"],
      ["g-ayer", "parecida"],
    ]);
  });

  it("chaleco → persona → asistencia de ese día con la hora «07:58»", async () => {
    const r = await calcularCruces("t-blas", { placa: null, chalecos: ["03", "9"] }, AT);
    expect(r?.chalecos).toEqual([
      { numero: "3", colaboradorId: "c-juan", nombre: "Juan Pérez", asistencia: { estado: "TARDANZA", entrada: "07:58", salida: null } },
      { numero: "9", colaboradorId: null, nombre: null },
    ]);
  });

  it("sin placa ni chalecos no consulta nada y no guarda una caja vacía", async () => {
    expect(await calcularCruces("t-blas", { placa: null, chalecos: [] }, AT)).toBeNull();
    expect(H.tenants).toEqual([]);
  });
});

describe("procesarCapturaNueva", () => {
  const camara = { id: "cam", vigilaPila: true } as Camara;
  const captura = { id: "cap-1", camaraId: "cam", url: "https://x/1.webp", evento: "movimiento", at: AT } as Captura;

  it("lectura + cruces + pila en UNA escritura, y después el aviso", async () => {
    await procesarCapturaNueva("t-blas", camara, captura);
    expect(H.guardados).toHaveLength(1);
    expect(H.guardados[0]).toMatchObject({
      id: "cap-1",
      lectura: { placa: "ABC-123", actividad: "descarga" },
      cruces: { placas: expect.any(Array), chalecos: expect.any(Array) },
      pila: { cambio: "igual" },
    });
    expect(H.avisos).toBe(1);
  });

  it("si la pila falla, igual se guarda la lectura (una sola escritura)", async () => {
    H.pilaFalla = true;
    await procesarCapturaNueva("t-blas", camara, captura);
    expect(H.guardados).toHaveLength(1);
    expect(H.guardados[0]).toMatchObject({ pila: null, lectura: { placa: "ABC-123" } });
  });

  it("si la IA falla, se guarda la pila y no se avisa por persona", async () => {
    H.lecturaFalla = true;
    await procesarCapturaNueva("t-blas", camara, captura);
    expect(H.guardados[0]).toMatchObject({ lectura: null, cruces: null, pila: { cambio: "igual" } });
    expect(H.avisos).toBe(0);
  });
});
