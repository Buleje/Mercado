/**
 * __tests__/forestal-produccion-sin-lote.test.ts
 *
 * Lo que decide el SERVIDOR al declarar producción sin lote (ADR-429): el plan
 * de una corrida por especie, el PT contra la escuadría (con su tolerancia
 * derivada, no inventada), el posible duplicado y el valor de lo producido con
 * lo guardado. Los paquetes salen del MISMO camino que la pantalla
 * (`cubicarPieza` → `paquetesDeLoCubicado` → `armarPedido`), no de fixtures a mano.
 */
import { describe, expect, it } from "vitest";
import { cubicarPieza, ptDesdeM3, type PiezaCubicada, type Unidad } from "@/lib/forestal/cubicacion";
import {
  armarPedido,
  paquetesDeLoCubicado,
  produccionSinLoteSchema,
  type PaqueteDeclarable,
} from "@/lib/forestal/declarar-produccion";
import {
  ProduccionSinLoteError,
  armarRespuesta,
  motivoPtNoCuadra,
  planDeProduccionSinLote,
  posiblesDuplicados,
  ptDeEscuadria,
  toleranciaPt,
  TECHO_RELATIVO_PT,
  valorVentaDe,
  type CodigoProduccionSinLote,
} from "@/lib/forestal/produccion-sin-lote";
import { bloquesDeCorrida, cotizarAserrio } from "@/lib/forestal/tarifa-aserrio";

let seq = 0;
function pieza(
  especie: string,
  cantidad: number,
  e: number,
  a: number,
  l: number,
  u: [Unidad, Unidad, Unidad] = ["pulg", "pulg", "pies"],
): PiezaCubicada {
  const base = { id: `p${seq++}`, cantidad, espesor: e, ancho: a, largo: l, uEspesor: u[0], uAncho: u[1], uLargo: u[2], especie };
  return { ...base, ...cubicarPieza(base) };
}

const HOY = new Date("2026-09-22T15:00:00Z");
const paquetes = (piezas: PiezaCubicada[]) => paquetesDeLoCubicado(piezas, { codigosEnPlanta: [], hoy: HOY });

/** Un lote mezclado, como el que motivó el ADR: panguana y tornillo. */
const loteMezclado = () =>
  paquetes([
    pieza("Panguana", 40, 1, 4, 8),
    pieza("Tornillo", 100, 2, 8, 10),
    pieza("PANGUANA", 12, 2, 6, 10),
    pieza("Tornillo", 7, 3, 12, 13),
  ]);

function codigoDe(fn: () => unknown): CodigoProduccionSinLote | null {
  try {
    fn();
    return null;
  } catch (e) {
    if (e instanceof ProduccionSinLoteError) return e.code;
    throw e;
  }
}

const pedido = (p: PaqueteDeclarable[], servicio: Parameters<typeof armarPedido>[0]["servicio"]) => {
  const r = produccionSinLoteSchema.safeParse(armarPedido({ paquetes: p, fecha: "2026-09-22", servicio }));
  if (!r.success) throw new Error(r.error.message);
  return r.data;
};

describe("el plan: una corrida por especie", () => {
  it("parte el lote mezclado en dos corridas, cada una con SUS paquetes y su precio de venta", () => {
    const plan = planDeProduccionSinLote(
      pedido(loteMezclado(), { tipo: "propia", precios: { panguana: 3.5, tornillo: 4.2 } }),
    );
    expect(plan.corridas.map((c) => c.especie)).toEqual(["Panguana", "Tornillo"]);
    const [pang, torn] = plan.corridas;
    expect(pang.paquetes).toHaveLength(2);
    expect(torn.paquetes).toHaveLength(2);
    expect(pang.paquetes.every((p) => p.precioVentaPt === 3.5)).toBe(true);
    expect(torn.paquetes.every((p) => p.precioVentaPt === 4.2)).toBe(true);
    /* El total de la corrida ES la suma de sus paquetes (no otra cantidad). */
    expect(torn.quantity).toBeCloseTo(torn.paquetes.reduce((a, p) => a + p.volumenM3, 0), 4);
    expect(torn.pieces).toBe(107);
    expect(torn.pt).toBeCloseTo(1606.33, 2);
    expect(plan.lineaProduccion).toBe("LP");
    expect(plan.fecha.toISOString()).toBe("2026-09-22T00:00:00.000Z");
  });

  it("servicio a tercero: el trato va en la corrida y el paquete NO lleva precio de venta", () => {
    const plan = planDeProduccionSinLote(
      pedido(loteMezclado(), { tipo: "tercero", parteId: "parte-1", precios: { tornillo: 0.35 } }),
    );
    expect(plan.corridas.map((c) => c.precioManualPt)).toEqual([null, 0.35]);
    expect(plan.corridas.flatMap((c) => c.paquetes).every((p) => p.precioVentaPt === null)).toBe(true);
  });

  it("sin producto del catálogo el paquete queda como MADERA ASERRADA, no vacío", () => {
    const [p] = paquetes([pieza("Tornillo", 3, 2, 8, 10)]);
    const plan = planDeProduccionSinLote(pedido([{ ...p, productType: null }], { tipo: "propia", precios: {} }));
    expect(plan.corridas[0].paquetes[0].productType).toBe("MADERA ASERRADA");
  });

  it.each([
    ["una especie que no nombra madera", { especie: "—" }, "SIN_ESPECIE"],
    ["la misma especie dos veces con otra grafía", { repetir: "TORNILLO" }, "ESPECIE_REPETIDA"],
    ["una fecha que no existe", { fecha: "2026-02-31" }, "FECHA_INVALIDA"],
    ["una línea fuera del LO-CTP", { linea: "XX" }, "LINEA_INVALIDA"],
  ] as const)("rechaza %s", (_t, cambio, codigo) => {
    const base = pedido(paquetes([pieza("Tornillo", 3, 2, 8, 10)]), { tipo: "propia", precios: {} });
    const input = structuredClone(base);
    if ("especie" in cambio) input.corridas[0].especie = cambio.especie;
    if ("fecha" in cambio) input.fecha = cambio.fecha;
    if ("linea" in cambio) input.lineaProduccion = cambio.linea;
    if ("repetir" in cambio) {
      input.corridas.push({ especie: cambio.repetir, paquetes: [{ ...base.corridas[0].paquetes[0], codigo: "OTRO-1" }] });
    }
    expect(codigoDe(() => planDeProduccionSinLote(input))).toBe(codigo);
  });

  it("un código de paquete no se repite ni entre dos especies del mismo pedido", () => {
    const input = pedido(loteMezclado(), { tipo: "propia", precios: {} });
    input.corridas[1].paquetes[0].codigo = input.corridas[0].paquetes[0].codigo.toLowerCase();
    expect(codigoDe(() => planDeProduccionSinLote(input))).toBe("PAQUETE_YA_DECLARADO");
  });
});

describe("el PT sale de la escuadría", () => {
  const espesores = [0.5, 0.75, 1, 1.5, 2, 3, 4, 8];
  const anchos = [2, 3, 4, 6, 8, 12];
  const largos = [3, 6, 8, 8.5, 10, 13, 16, 20];

  it("lo que cubica la pantalla pasa SIEMPRE, aunque la medida venga en muchas filas", () => {
    let revisados = 0;
    for (const e of espesores)
      for (const a of anchos)
        for (const l of largos) {
          /* Una medida dictada de a tandas: cada fila redondea su PT al centésimo. */
          const filas = [1, 1, 3, 7, 1, 12, 25].map((c) => pieza("Tornillo", c, e, a, l));
          for (const p of paquetes(filas)) {
            expect(motivoPtNoCuadra(p), `${e}×${a}×${l}`).toBeNull();
            revisados++;
          }
        }
    expect(revisados).toBe(espesores.length * anchos.length * largos.length);
  });

  it("100 piezas de 2×8×10: la tolerancia es 0,33 % (derivada), y un PT inflado un 1 % no pasa", () => {
    const [p] = paquetes([pieza("Tornillo", 100, 2, 8, 10)]);
    expect(p.pieTablar).toBe(1333.33);
    expect(ptDeEscuadria(p)).toBeCloseTo(1334.21, 2);
    expect(toleranciaPt(p)).toBeCloseTo(4.34, 2);
    const inflado = Math.round(p.pieTablar * 101) / 100;
    expect(motivoPtNoCuadra({ ...p, pieTablar: inflado, volumenM3: Math.round((inflado / 424) * 1e4) / 1e4 })).toMatch(
      /1334\.21 PT/,
    );
  });

  it("el margen relativo tiene techo: una escuadría minúscula no agranda la tolerancia", () => {
    /* Auditoría de seguridad 22-09: con 0,001 cm el margen aceptaba un PT
       5,5 veces mayor. Ahora el relativo topea en 2 %. */
    const escuadria = { cantidad: 10, espesorCm: 0.001, anchoCm: 20.32, largoM: 3.05 };
    const pt = ptDeEscuadria(escuadria);
    expect(toleranciaPt(escuadria)).toBeLessThanOrEqual(pt * TECHO_RELATIVO_PT + 0.005 * 10 + 0.01 + 1e-9);
  });

  it("el m³ tiene que salir del PT (424 PT = 1 m³): un m³ tipeado aparte no pasa", () => {
    const [p] = paquetes([pieza("Tornillo", 100, 2, 8, 10)]);
    expect(motivoPtNoCuadra({ ...p, volumenM3: p.volumenM3 + 0.01 })).toMatch(/424 PT = 1 m³/);
  });

  it("una pieza cubicada en cm guarda su escuadría real y el PT cuadra", () => {
    /* Antes `paquetesDeLoCubicado` multiplicaba por 2,54 sin mirar
       `uEspesor` (5 cm quedaban como 12,7 cm) y este chequeo la frenaba.
       Arreglado en el contrato el 22-09: convierte por la unidad. */
    const [p] = paquetes([pieza("Tornillo", 10, 5, 20, 3, ["cm", "cm", "m"])]);
    expect(p.espesorCm).toBe(5);
    expect(motivoPtNoCuadra(p)).toBeNull();
  });

  it("el chequeo sigue frenando una escuadría que no corresponde a su PT", () => {
    const [p] = paquetes([pieza("Tornillo", 10, 5, 20, 3, ["cm", "cm", "m"])]);
    expect(motivoPtNoCuadra({ ...p, espesorCm: 12.7 })).toMatch(/Vuelve a cubicarlo/);
  });
});

describe("posible duplicado", () => {
  const pedidas = [{ clave: "tornillo", quantity: 3.1447 }];
  it("misma especie (otra grafía) y el mismo m³ ±1 litro ese día → duplicado; con o sin lote", () => {
    const dups = posiblesDuplicados(pedidas, [
      { id: "a", lineNo: 12, speciesCommon: "TORNILLO", quantity: 3.1455, sinLote: false },
      { id: "b", lineNo: 13, speciesCommon: "Tornillo", quantity: 3.1458, sinLote: true },
      { id: "c", lineNo: 14, speciesCommon: "Panguana", quantity: 3.1447, sinLote: true },
      { id: "d", lineNo: 15, speciesCommon: "Tornillo", quantity: null, sinLote: true },
    ]);
    expect(dups.map((d) => d.lineNo)).toEqual([12]);
    expect(dups[0]).toMatchObject({ sinLote: false, m3: 3.1455 });
  });
});

describe("lo que se responde sale de lo guardado", () => {
  it("valorVenta = Σ PT × precio; sin precio en ningún paquete es null, no 0", () => {
    expect(
      valorVentaDe([
        { volumenM3: 3.1447, pieTablar: 1333.33, precioVentaPt: 4.2 },
        { volumenM3: 0.6439, pieTablar: 273, precioVentaPt: 4.2 },
      ]),
    ).toBe(6746.59);
    expect(valorVentaDe([{ volumenM3: 1, pieTablar: 424, precioVentaPt: null }])).toBeNull();
  });

  it("el total suma sólo lo valorizado y dice null cuando nada lo está; el PT viejo sale del m³", () => {
    const r = armarRespuesta([
      { id: "1", lineNo: 1, especie: "Tornillo", aserrio: null, paquetes: [{ volumenM3: 1, pieTablar: 424, precioVentaPt: 4 }] },
      { id: "2", lineNo: 2, especie: "Panguana", aserrio: null, paquetes: [{ volumenM3: 0.5, pieTablar: null, precioVentaPt: null }] },
    ]);
    expect(r.corridas.map((c) => [c.pt, c.valorVenta])).toEqual([
      [424, 1696],
      [ptDesdeM3(0.5), null],
    ]);
    expect(r.total).toEqual({ pt: 424 + 212, m3: 1.5, valorVenta: 1696 });
    expect(
      armarRespuesta([
        { id: "2", lineNo: 2, especie: "P", aserrio: null, paquetes: [{ volumenM3: 1, pieTablar: 424, precioVentaPt: null }] },
      ]).total.valorVenta,
    ).toBeNull();
  });
});

describe("el cobro usa el PT guardado del paquete", () => {
  it("PT × precio del cargo = el PT medido, no el que se recalcula del m³", () => {
    const [p] = paquetes([pieza("Tornillo", 7, 3, 12, 13)]);
    const corrida = { speciesCommon: "Tornillo", productType: null, quantity: p.volumenM3 };
    const conPt = cotizarAserrio(null, bloquesDeCorrida(corrida, [{ ...p, pieTablar: p.pieTablar }]), { precioManualPt: 0.35 });
    const sinPt = cotizarAserrio(null, bloquesDeCorrida(corrida, [{ ...p, pieTablar: undefined }]), { precioManualPt: 0.35 });
    expect(p.pieTablar).toBe(273);
    expect(conPt.pt).toBe(273);
    expect(conPt.importe).toBe(95.55);
    /* El camino viejo: 0,6439 m³ → 0,644 × 424 = 273,06 PT. */
    expect(sinPt.pt).toBe(273.06);
  });
});
