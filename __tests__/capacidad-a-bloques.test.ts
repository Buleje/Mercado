/**
 * De la capacidad filtrada a los bloques del cubicador.
 *
 * Lo que se protege acá es lo que un refactor rompe sin que nada falle:
 *  · viaja SÓLO lo filtrado —el puente no puede ser una puerta de atrás al
 *    total de la planta—;
 *  · la rolliza viaja como rolliza y el producto como aserrada directa, porque
 *    mandar producto como rolliza le aplicaría el rendimiento dos veces;
 *  · el % del bloque es el mismo que muestra la tarjeta, o el ampara de allá no
 *    coincide con el número que se acaba de leer acá.
 */

import { describe, expect, it } from "vitest";
import {
  bloquesDesdeCapacidad,
  totalesDeCandidatos,
} from "@/lib/forestal/capacidad-a-bloques";
import type {
  CorridaDisponible,
  EntradaCapacidad,
  LoteDeCapacidad,
} from "@/lib/forestal/capacidad-de-planta";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";

const troza = (o: Partial<TrozaConsumible> & { id: string }): TrozaConsumible =>
  ({
    woodEntryId: "w1",
    codificacion: o.id,
    especieComun: "TORNILLO",
    volumenM3: 1,
    guiaRecepcionada: true,
    ...o,
  }) as TrozaConsumible;

const lote = (o: Partial<LoteDeCapacidad> & { code: string }): LoteDeCapacidad => ({
  id: o.code,
  trozas: [],
  permisos: [],
  especie: "TORNILLO",
  status: "abierto",
  consumidoM3: 0,
  esperado56M3: 0,
  producidoM3: 0,
  restaM3: 0,
  apartadoM3: 0,
  piezas: 0,
  ...o,
});

const corrida = (o: Partial<CorridaDisponible> & { id: string }): CorridaDisponible => ({
  fecha: "2026-08-01",
  lote: "L-1",
  producto: "MADERA ASERRADA",
  especie: "TORNILLO",
  unidad: "m3",
  disponible: 0,
  titularOrigen: [],
  gtfOrigen: [],
  paquetes: [],
  ...o,
});

const PATIO: TrozaConsumible[] = [
  troza({ id: "A", permiso: "P-1", especieComun: "TORNILLO", gtfNumber: "G-1", volumenM3: 10 }),
  troza({ id: "B", permiso: "P-1", especieComun: "CAPIRONA", gtfNumber: "G-2", volumenM3: 4 }),
  troza({ id: "C", permiso: "P-2", especieComun: "TORNILLO", gtfNumber: "G-3", volumenM3: 6 }),
  troza({ id: "D", permiso: "P-1", especieComun: "TORNILLO", gtfNumber: "G-4", volumenM3: 5, guiaRecepcionada: false }),
];

const ENTRADA: EntradaCapacidad = {
  patio: PATIO,
  lotes: [
    lote({ code: "L-1", permisos: ["P-1"], especie: "TORNILLO", restaM3: 2, apartadoM3: 3, piezas: 4 }),
  ],
  corridas: [
    corrida({ id: "c1", disponible: 10, titularOrigen: ["P-1"], especie: "TORNILLO", lote: "15-2026" }),
    corrida({ id: "c2", disponible: 3, titularOrigen: ["P-1", "P-2"], especie: "CAPIRONA" }),
  ],
  stockLibroM3: 20,
  pendienteSinPiezasM3: 0,
};

describe("bloquesDesdeCapacidad", () => {
  it("viaja SÓLO lo filtrado", () => {
    const soloTornillo = bloquesDesdeCapacidad(ENTRADA, { especie: ["TORNILLO"] });
    expect(soloTornillo.some((c) => c.especie.toUpperCase() === "CAPIRONA")).toBe(false);
    // El patio de tornillo: la troza A (10 m³). La C es de P-2 y la D no llegó.
    const patio = soloTornillo.find((c) => c.fuente === "patio");
    expect(patio).toMatchObject({ m3: 16, tipo: "rolliza" }); // A(10) + C(6)
  });

  it("el patio agrupa por especie y trae el permiso sólo si es único", () => {
    const todo = bloquesDesdeCapacidad(ENTRADA, {});
    /* La especie ya viaja con la grafía del catálogo del cubicador. */
    const tornillo = todo.find((c) => c.fuente === "patio" && c.especie === "Tornillo")!;
    const capirona = todo.find((c) => c.fuente === "patio" && c.especie === "Capirona")!;
    // Tornillo libre viene de P-1 y P-2: no se inventa un permiso.
    expect(tornillo.permiso).toBeNull();
    expect(capirona).toMatchObject({ permiso: "P-1", m3: 4, piezas: 1 });
  });

  it("la rolliza lleva el % de la tarjeta y la aserrada no lleva ninguno", () => {
    const todo = bloquesDesdeCapacidad(ENTRADA, {});
    for (const c of todo) {
      if (c.tipo === "rolliza") expect(c.aprovechablePct).toBe(56);
      else expect(c.aprovechablePct).toBeNull();
    }
  });

  it("lo apartado es rolliza y el margen del lote es aserrada directa", () => {
    const todo = bloquesDesdeCapacidad(ENTRADA, {});
    expect(todo.find((c) => c.fuente === "apartado")).toMatchObject({
      tipo: "rolliza",
      m3: 3,
      permiso: "P-1",
    });
    expect(todo.find((c) => c.fuente === "lotes")).toMatchObject({ tipo: "aserrada", m3: 2 });
  });

  it("cada corrida viaja como aserrada con su ref, para no sembrarla dos veces", () => {
    const todo = bloquesDesdeCapacidad(ENTRADA, {});
    const c1 = todo.find((c) => c.clave === "productos:c1")!;
    expect(c1).toMatchObject({ tipo: "aserrada", m3: 10, paqueteId: "corrida:c1", permiso: null });
    expect(c1.etiqueta).toContain("15-2026");
  });

  it("una corrida con dos permisos adentro no entra bajo un permiso filtrado", () => {
    const conP1 = bloquesDesdeCapacidad(ENTRADA, { permiso: ["P-1"] });
    expect(conP1.some((c) => c.clave === "productos:c2")).toBe(false);
    expect(conP1.some((c) => c.clave === "productos:c1")).toBe(true);
  });

  it("la especie viaja con la grafía del cubicador: «TORNILLO» → «Tornillo»", () => {
    /* El desplegable de la tabla compara texto exacto: con la grafía del libro
       mostraba «Sin especie» sobre un bloque que sí la tenía. */
    const enMayusculas: EntradaCapacidad = {
      ...ENTRADA,
      patio: [troza({ id: "M", permiso: "P-1", especieComun: "TORNILLO", volumenM3: 2 })],
    };
    const patio = bloquesDesdeCapacidad(enMayusculas, {}).find((c) => c.fuente === "patio");
    expect(patio?.especie).toBe("Tornillo");
  });

  it("una especie que el catálogo no tiene se respeta tal cual", () => {
    const rara: EntradaCapacidad = {
      ...ENTRADA,
      patio: [troza({ id: "R", especieComun: "QA-ESPECIE", volumenM3: 2 })],
    };
    const patio = bloquesDesdeCapacidad(rara, {}).find((c) => c.fuente === "patio");
    expect(patio?.especie).toBe("QA-ESPECIE");
  });

  it("sin madera bajo el recorte no hay candidatos que mandar", () => {
    expect(bloquesDesdeCapacidad(ENTRADA, { especie: ["LUPUNA"] })).toEqual([]);
  });
});

describe("totalesDeCandidatos", () => {
  it("no suma troza con tabla, y el ampara pasa sólo la rolliza por el 56 %", () => {
    const t = totalesDeCandidatos(bloquesDesdeCapacidad(ENTRADA, { especie: ["TORNILLO"] }));
    // Rolliza: patio 16 + por recepcionar 5 + apartado 3 = 24. Aserrada: lote 2 + corrida 10 = 12.
    expect(t.rolliza).toBe(24);
    expect(t.aserrada).toBe(12);
    expect(t.amparaM3).toBeCloseTo(24 * 0.56 + 12, 4);
  });
});
