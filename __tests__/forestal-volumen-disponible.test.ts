/**
 * «Volumen disponible» (Brandon 2026-10-03): las cuatro pilas sumadas.
 *
 *  · cada m³ en UNA sola pila: la troza en lote (o en mixto) NO es libre, la
 *    sin recepcionar no es del patio y lo marcado usado no está para trabajar;
 *    «Todo» = suma de las cuatro, sin contar dos veces;
 *  · el pt aprovechable es un derivado: troza al 56 %, aserrada a m³ × 424, y
 *    el del total sale de los m³ de cada clase (no de sumar pt redondeados);
 *  · una corrida con madera de dos permisos entra por cualquiera de los dos;
 *  · desde «Todo», un chip cambia a esa pila sola; sin ninguna, vuelve a Todo.
 */
import { describe, expect, it } from "vitest";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import {
  filasDeProductos,
  ptDe as ptAserrada,
  type CorridaDisponible,
} from "@/lib/forestal/productos-disponibles-resumen";
import { ptDe as ptRolliza } from "@/lib/forestal/trozas-disponibles";
import {
  FUENTES_VOLUMEN,
  alternarFuente,
  conLasElegidas,
  entraPorEspecie,
  entraPorPermiso,
  escribirFuentes,
  fuenteDeTroza,
  fuenteDeVistaVieja,
  guiasPorRecepcionar,
  leerFuentes,
  lotesConSobrante,
  opcionesDeEspecie,
  opcionesDePermiso,
  partidasDeLotes,
  partidasDeProductos,
  partidasDeTrozas,
  resumenVolumen,
  volumenPorGrupo,
} from "@/lib/forestal/volumen-disponible";

const AHORA = new Date("2026-10-03T15:00:00Z");
const P1 = "10-HUA-PUE/PER-FMP-2026-007";
const P2 = "CON-25-UCA-0207";

function troza(p: Partial<TrozaConsumible> & { id: string }): TrozaConsumible {
  return {
    woodEntryId: `we-${p.gtfNumber ?? "G1"}`,
    codificacion: p.id,
    especieComun: "Cachimbo",
    volumenM3: 2,
    guiaRecepcionada: true,
    fechaRecepcion: "2026-09-08T05:00:00.000Z",
    fechaIngreso: "2026-09-08T00:00:00.000Z",
    permiso: P1,
    gtfNumber: "G1",
    proveedor: "WASACO",
    ...p,
  };
}

let n = 0;
const corrida = (o: Partial<CorridaDisponible> = {}): CorridaDisponible => ({
  id: `c${++n}`,
  lineNo: n,
  fecha: "2026-09-01T00:00:00.000Z",
  especie: "Tornillo",
  especieCientifica: null,
  producto: "MADERA ASERRADA (COMERCIAL)",
  presentacion: null,
  unidad: "m3",
  lote: null,
  cantidad: 1,
  volumenConsumidoM3: null,
  producido: 1,
  despachado: 0,
  reprocesado: 0,
  disponible: 1,
  paquetes: [],
  observations: null,
  titularOrigen: [P2],
  gtfOrigen: [],
  usadoAt: null,
  usadoMotivo: null,
  apartado: null,
  ...o,
});

const TROZAS: TrozaConsumible[] = [
  troza({ id: "libre-1", volumenM3: 1.5 }),
  troza({ id: "libre-2", volumenM3: 2.5, permiso: P2, especieComun: "Copal" }),
  troza({ id: "lote-1", volumenM3: 3, loteAserrioId: "L1", loteAserrioCode: "L-001" }),
  troza({ id: "lote-2", volumenM3: 1, loteAserrioId: "L1", loteAserrioCode: "L-001" }),
  troza({ id: "mixto-1", volumenM3: 0.5, loteMixtoId: "M1", loteMixtoCode: "LM-01" }),
  troza({ id: "pend-1", volumenM3: 4, guiaRecepcionada: false, fechaRecepcion: null, gtfNumber: "G9", woodEntryId: "we-G9", fechaIngreso: "2026-09-28T00:00:00.000Z" }),
  troza({ id: "pend-2", volumenM3: 1, guiaRecepcionada: false, fechaRecepcion: null, gtfNumber: "G9", woodEntryId: "we-G9", fechaIngreso: "2026-09-28T00:00:00.000Z" }),
  /* Ya entró a la sierra: no está en ninguna pila. */
  troza({ id: "consumida", volumenM3: 9, consumidaEnId: "corrida-x", loteAserrioId: "L1" }),
];
const CORRIDAS = [
  corrida({ disponible: 2 }),
  corrida({ disponible: 0.75, titularOrigen: [P1, P2] }),
  /* Marcada usada: fuera de la suma. */
  corrida({ disponible: 5, usadoAt: "2026-09-20T00:00:00.000Z" }),
];
const partidas = () => [
  ...partidasDeTrozas(TROZAS),
  ...partidasDeProductos(filasDeProductos(CORRIDAS, AHORA)),
];

/* Un lote ya aserrado como QA-SEM-L4 de main (03-10): entraron 6.285 m³, el
   tope es 3.5196 y se declararon 2.9988 → sobran 0.5208 por declarar. */
const LOTE_ASERRADO = {
  id: "L4", code: "QA-SEM-L4", status: "consumido", volumenM3: 6.285, speciesCommon: "Tornillo",
  fechaApertura: "2026-09-25T00:00:00.000Z", trozas: [{ id: "x", volumenM3: 6.285, permiso: P2, consumidaEnId: "c-l4" }],
  produccion: { id: "c-l4", lineNo: 1, entryDate: "2026-10-01", productType: "MADERA ASERRADA", speciesCommon: "Tornillo", volumeInputM3: 6.285, quantity: 2.9988, unit: "m3", status: "registrado", viva: true },
  madera: { estado: "con_madera", m3Disponible: 2.9988, ptDisponible: 1271.49, aserradaEl: null, salioEl: null, guias: [] },
} as unknown as LoteAserrio;
const LOTE_ABIERTO = { id: "L1", code: "L-001", status: "abierto", volumenM3: 8, speciesCommon: "Cachimbo", fechaApertura: "2026-09-30T00:00:00.000Z", trozas: [] } as unknown as LoteAserrio;

describe("las cuatro pilas no se pisan", () => {
  it("cada troza viva cae en una sola pila; la consumida en ninguna", () => {
    const pila = Object.fromEntries(TROZAS.map((t) => [t.id, fuenteDeTroza(t)]));
    expect(pila).toEqual({
      "libre-1": "trozas",
      "libre-2": "trozas",
      "lote-1": "lotes",
      "lote-2": "lotes",
      "mixto-1": "lotes",
      "pend-1": "recepcion",
      "pend-2": "recepcion",
      consumida: null,
    });
  });

  it("«Todo» es la suma exacta de las cuatro, sin lo usado", () => {
    const r = resumenVolumen(partidas());
    expect(r.porFuente.trozas).toMatchObject({ m3: 4, unidades: 2 });
    expect(r.porFuente.lotes).toMatchObject({ m3: 4.5, unidades: 2 }); // L-001 y el mixto
    expect(r.porFuente.recepcion).toMatchObject({ m3: 5, unidades: 1 }); // una guía
    expect(r.porFuente.productos).toMatchObject({ m3: 2.75, unidades: 0 }); // corridas sin paquete: suman m³, no se cuentan
    expect(r.total.m3).toBe(16.25);
    expect(FUENTES_VOLUMEN.reduce((a, f) => a + r.porFuente[f].m3, 0)).toBeCloseTo(r.total.m3, 6);
  });

  it("el lote aserrado suma lo por declarar a Lotes, como m³ de producto (pt × 424)", () => {
    const ps = [...partidas(), ...partidasDeLotes([LOTE_ABIERTO, LOTE_ASERRADO])];
    const r = resumenVolumen(ps);
    expect(partidasDeLotes([LOTE_ABIERTO])).toEqual([]); // el abierto sale del patio
    expect(r.porFuente.lotes).toMatchObject({ m3: 5.0208, unidades: 3 });
    expect(r.porFuente.lotes.pt).toBe(ptRolliza(4.5) + ptAserrada(0.5208));
    expect(r.total.m3).toBe(16.7708);
    // El total en pt es la suma de lo que dicen los chips.
    expect(r.total.pt).toBe(FUENTES_VOLUMEN.reduce((a, f) => a + r.porFuente[f].pt, 0));
  });

  it("el pt aprovechable: troza al 56 %, aserrada × 424; el total suma los pt de cada pila", () => {
    const r = resumenVolumen(partidas());
    expect(r.porFuente.trozas.pt).toBe(ptRolliza(4));
    expect(r.porFuente.productos.pt).toBe(ptAserrada(2.75));
    expect(r.porFuente.productos.pt).toBe(Math.round(2.75 * 424));
    expect(r.total.pt).toBe(ptRolliza(4) + ptRolliza(4.5) + ptRolliza(5) + ptAserrada(2.75));
  });
  it("los paquetes se cuentan uno por uno; su m³ es la parte del libro", () => {
    const paq = (id: string, m3: number) => ({ id, codigo: id, producto: null, presentacion: null, cantidad: 10, volumenM3: m3, espesorCm: null, anchoCm: null, largoM: null, observations: null, apartado: null });
    const c = corrida({ disponible: 3, paquetes: [paq("p1", 1), paq("p2", 2)] });
    const r = resumenVolumen(partidasDeProductos(filasDeProductos([c], AHORA)));
    expect(r.porFuente.productos).toMatchObject({ m3: 3, unidades: 2 });
  });
});

describe("filtro por permiso", () => {
  it("una corrida de dos permisos entra por cualquiera; «» elige lo que no declara", () => {
    const clave = `${P1} · ${P2}`;
    expect(entraPorPermiso(clave, [P2])).toBe(true);
    expect(entraPorPermiso(clave, ["OTRO"])).toBe(false);
    expect(entraPorPermiso("", [""])).toBe(true);
    expect(entraPorPermiso("", [P1])).toBe(false);
    expect(entraPorPermiso(P1, [])).toBe(true);
  });

  it("las opciones separan los permisos de una corrida mixta y pesan en los dos", () => {
    const op = opcionesDePermiso(partidas());
    expect(op.map((o) => o.clave).sort()).toEqual([P1, P2].sort());
    const p2 = op.find((o) => o.clave === P2);
    // libre-2 (2.5) + corrida 2.0 + corrida mixta 0.75
    expect(p2?.m3).toBe(5.25);
  });
});

describe("filtro por especie", () => {
  it("acota por la clave de la especie; las opciones traen su peso", () => {
    expect(entraPorEspecie("copal", ["copal"])).toBe(true);
    expect(entraPorEspecie("cachimbo", ["copal"])).toBe(false);
    expect(entraPorEspecie("", [])).toBe(true);
    const op = opcionesDeEspecie(partidas());
    expect(op.find((o) => o.etiqueta === "Copal")?.m3).toBe(2.5);
  });

  it("lo elegido conserva su chip aunque se quede sin madera", () => {
    const op = conLasElegidas([{ clave: "a", etiqueta: "A", m3: 1 }], ["a", "b", ""], new Map([["b", "B"]]), "Sin especie");
    expect(op.map((o) => [o.etiqueta, o.m3])).toEqual([["A", 1], ["B", 0], ["Sin especie", 0]]);
  });
});

describe("tablas combinadas", () => {
  it("por permiso: las filas suman el total y «Sin permiso» va al final", () => {
    const ps = [...partidas(), ...partidasDeTrozas([troza({ id: "sp", permiso: null, volumenM3: 0.25 })])];
    const filas = volumenPorGrupo(ps, "permiso");
    expect(filas.at(-1)?.etiqueta).toBe("Sin permiso");
    expect(filas.reduce((a, f) => a + f.m3, 0)).toBeCloseTo(resumenVolumen(ps).total.m3, 6);
    const p1 = filas.find((f) => f.clave === P1);
    expect(p1?.porFuente).toEqual({ trozas: 1.5, lotes: 4.5, recepcion: 5, productos: 0 });
    // En pt, cada pila con su clase: troza al 56 %, aserrada × 424.
    expect(p1?.ptPorFuente).toEqual({ trozas: ptRolliza(1.5), lotes: ptRolliza(4.5), recepcion: ptRolliza(5), productos: 0 });
    const p2 = filas.find((f) => f.clave === P2);
    expect(p2?.ptPorFuente.productos).toBe(ptAserrada(2));
  });

  it("por especie usa la especie de la troza y la de la corrida", () => {
    const filas = volumenPorGrupo(partidas(), "especie");
    expect(filas.map((f) => f.etiqueta).sort()).toEqual(["Cachimbo", "Copal", "Tornillo"]);
  });
});

describe("detalle de lotes y de lo por recepcionar", () => {
  it("el sobrante por lote: troza sin aserrar en el abierto, por declarar en el aserrado", () => {
    const filas = lotesConSobrante(TROZAS, [LOTE_ABIERTO, LOTE_ASERRADO], AHORA);
    expect(filas.map((f) => f.codigo)).toEqual(["L-001", "QA-SEM-L4", "LM-01"]);
    expect(filas[0]).toMatchObject({ estado: "Abierto", trozas: 2, m3SinAserrar: 4, m3PorDeclarar: 0, m3: 4, diasAbierto: 3 });
    expect(filas[1]).toMatchObject({ estado: "Aserrado", trozas: 0, m3SinAserrar: 0, m3PorDeclarar: 0.5208, m3: 0.5208, m3Aserrada: 2.9988 });
    expect(filas[1].nivel).toBe("Cupo corto · 14.8%");
    expect(filas[2]).toMatchObject({ esMixto: true, estado: "Mixto", m3: 0.5 });
  });

  it("los filtros de arriba también acotan el detalle de lotes", () => {
    const soloCopal = (_p: string, e: string) => entraPorEspecie(e, ["copal"]);
    expect(lotesConSobrante(TROZAS, [LOTE_ABIERTO, LOTE_ASERRADO], AHORA, soloCopal)).toEqual([]);
  });

  it("guías por recepcionar: una fila por guía con sus trozas", () => {
    const filas = guiasPorRecepcionar(TROZAS, AHORA);
    expect(filas).toEqual([
      expect.objectContaining({ guia: "G9", trozas: 2, m3: 5, pt: ptRolliza(5), diasEsperando: 5 }),
    ]);
  });
});

describe("qué pilas se miran", () => {
  it("desde Todo, un chip cambia a esa pila sola; después suma o saca", () => {
    const todas = [...FUENTES_VOLUMEN];
    expect(alternarFuente(todas, "trozas")).toEqual(["trozas"]);
    expect(alternarFuente(["trozas"], "productos")).toEqual(["trozas", "productos"]);
    expect(alternarFuente(["trozas", "productos"], "trozas")).toEqual(["productos"]);
    expect(alternarFuente(["productos"], "productos")).toEqual(todas);
    expect(alternarFuente(["trozas"], "todo")).toEqual(todas);
  });

  it("la URL: «todo», lista válida, o nada", () => {
    expect(leerFuentes("todo")).toEqual([...FUENTES_VOLUMEN]);
    expect(leerFuentes("productos,trozas,xx")).toEqual(["trozas", "productos"]);
    expect(leerFuentes("xx")).toBeNull();
    expect(leerFuentes(null)).toBeNull();
    expect(escribirFuentes([...FUENTES_VOLUMEN])).toBe("todo");
    expect(escribirFuentes(["productos", "lotes"])).toBe("lotes,productos");
  });

  it("los nombres viejos de pestaña llevan a su pila", () => {
    expect(fuenteDeVistaVieja("trozas-disponibles")).toBe("trozas");
    expect(fuenteDeVistaVieja("productos-disponibles")).toBe("productos");
    expect(fuenteDeVistaVieja("constructor")).toBeNull();
    expect(fuenteDeVistaVieja("disponibles")).toBeNull();
  });
});
