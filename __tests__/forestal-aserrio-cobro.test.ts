/**
 * Cómo se asienta el aserrío de una corrida en la cuenta del dueño (ADR-412 §4).
 *
 * Lo que se prueba es lo que, si falla, cuesta plata o un acta: que una corrida
 * tenga UN cargo y no dos, que sin precio no quede un cargo vivo, y que un mes
 * cerrado no se reescriba por cobrar.
 */

import { describe, expect, it } from "vitest";
import {
  MOTIVO_SIN_DUENO,
  MOTIVO_SIN_PT,
  accionSobreMovimiento,
  cargoSeCorrigeDesdeLaCorrida,
  debeDejarDeCobrar,
  lineNoDeReferencia,
  mensajeCargoDeCorrida,
  duenoDelPedido,
  motivoParteNoAceptable,
  detalleAuditTanda,
  resumirTanda,
  MOTIVO_TITULAR_COBRADO,
  precioManualAUsar,
  titularBloqueadoPorCobro,
  detalleAuditCobro,
  motivoSinCobro,
  notasDelCobro,
  planDeCobro,
  precioManualDelDetalle,
  referenciaDeCorrida,
} from "@/lib/forestal/aserrio-cobro";
import { cotizarAserrio, type BloqueACobrar, type VersionTarifa } from "@/lib/forestal/tarifa-aserrio";
import { titularQueQueda } from "@/lib/forestal/dueno-de-la-madera";

const version = (o: Partial<VersionTarifa> = {}): VersionTarifa => ({
  id: "v1",
  vigenteDesde: "2026-09-01",
  basePt: 0.3,
  especies: [],
  tipos: [],
  largos: [],
  nota: null,
  creadoPor: null,
  creadoEn: null,
  ...o,
});

const bloques: BloqueACobrar[] = [{ etiqueta: "P-1", especie: "Tornillo", volumenM3: 1 }];

const corrida = (o: Partial<Parameters<typeof planDeCobro>[0]["corrida"]> = {}) => ({
  lineNo: 7,
  speciesCommon: "Tornillo",
  titularNombre: null,
  duenoParteId: null,
  declarada: true,
  ...o,
});

const parte = { id: "p-1", nombre: "CC.NN. San Luis" };
const AHORA = "2026-09-13T15:00:00.000Z";

const plan = (o: Partial<Parameters<typeof planDeCobro>[0]> = {}) =>
  planDeCobro({
    corrida: corrida(),
    parte,
    cotizacion: cotizarAserrio(version(), bloques),
    precioManualPt: null,
    hayMovimientoVivo: false,
    periodoCerrado: false,
    ahora: AHORA,
    ...o,
  });

describe("accionSobreMovimiento — una corrida, un cargo", () => {
  it("cobrable: crea si no hay cargo y actualiza el que ya está", () => {
    expect(accionSobreMovimiento(true, false)).toBe("crear");
    expect(accionSobreMovimiento(true, true)).toBe("actualizar");
  });

  it("sin precio: da de baja el cargo vivo y, si no había, no escribe nada", () => {
    expect(accionSobreMovimiento(false, true)).toBe("baja");
    expect(accionSobreMovimiento(false, false)).toBe("nada");
  });
});

describe("planDeCobro", () => {
  it("cobra con la tarifa: importe congelado, cargo que cita la corrida y acta del dueño", () => {
    const cot = cotizarAserrio(version(), bloques);
    const p = plan({ cotizacion: cot });

    expect(p.accion).toBe("crear");
    expect(p.motivo).toBeNull();
    expect(p.corrida.aserrioImporte).toBe(cot.importe);
    expect(p.corrida.aserrioImporte).toBeGreaterThan(0);
    expect(p.corrida.aserrioDetalle.cotizadoEn).toBe(AHORA);
    expect(p.corrida.aserrioDetalle.precioManualPt).toBeNull();
    expect(p.corrida.duenoMadera).toBe("tercero");
    expect(p.corrida.titularNombre).toBe("CC.NN. San Luis");
    expect(p.movimiento).toMatchObject({
      parteId: "p-1",
      parteNombre: "CC.NN. San Luis",
      monto: cot.importe,
      referencia: "Corrida N° 7",
    });
    expect(p.movimiento?.notas).toContain(`${cot.pt.toFixed(2)} PT de Tornillo`);
    expect(p.movimiento?.notas).toContain("tarifa del 2026-09-01");
  });

  it("con un cargo vivo lo actualiza en vez de crear otro", () => {
    expect(plan({ hayMovimientoVivo: true }).accion).toBe("actualizar");
  });

  it("en un período cerrado cobra igual pero no reescribe el dueño del libro", () => {
    const p = plan({ periodoCerrado: true });
    expect(p.accion).toBe("crear");
    expect(p.corrida).not.toHaveProperty("duenoMadera");
    expect(p.corrida).not.toHaveProperty("titularNombre");
  });

  it("el titular es acta: con el mismo dueño no se pisa, con otro dueño sí", () => {
    const mismo = plan({ corrida: corrida({ duenoParteId: "p-1", titularNombre: "Comunidad San Luis" }) });
    expect(mismo.corrida).not.toHaveProperty("titularNombre");
    expect(mismo.corrida.duenoMadera).toBe("tercero");

    const otro = plan({ corrida: corrida({ duenoParteId: "p-9", titularNombre: "Juan Pérez" }) });
    expect(otro.corrida.titularNombre).toBe("CC.NN. San Luis");
  });

  it("sin tarifa y sin precio a mano: nada cobrable, el cargo vivo se da de baja y se dice por qué", () => {
    const p = plan({ cotizacion: cotizarAserrio(null, bloques), hayMovimientoVivo: true });
    expect(p.accion).toBe("baja");
    expect(p.corrida.aserrioImporte).toBeNull();
    expect(p.movimiento).toBeNull();
    expect(p.motivo).toMatch(/No hay una tarifa/);
    /* El dueño se anota igual: al ampliar o al cargar la tarifa ya se sabe a quién. */
    expect(p.corrida.duenoParteId).toBe("p-1");
  });

  it("una corrida que todavía no declaró no se cobra, y lo dice así", () => {
    const p = plan({ cotizacion: cotizarAserrio(version(), []), corrida: corrida({ declarada: false }) });
    expect(p.accion).toBe("nada");
    expect(p.motivo).toBe("La corrida todavía no declaró producción: se cobra al declararla.");
  });

  it("con precio a mano guarda el trato para volver a cobrar igual al ampliar", () => {
    const cot = cotizarAserrio(version(), bloques, { precioManualPt: 0.35 });
    const p = plan({ cotizacion: cot, precioManualPt: 0.35 });
    expect(p.corrida.aserrioDetalle.precioManualPt).toBe(0.35);
    expect(p.movimiento?.notas).toContain("precio a mano S/ 0.35 por PT");
    expect(p.movimiento?.notas).not.toContain("tarifa del");
    expect(precioManualDelDetalle(p.corrida.aserrioDetalle)).toBe(0.35);
  });
});

describe("precioManualDelDetalle", () => {
  it("con tarifa, o con un detalle que no se entiende, no inventa un trato", () => {
    expect(precioManualDelDetalle(plan().corrida.aserrioDetalle)).toBeNull();
    expect(precioManualDelDetalle(null)).toBeNull();
    expect(precioManualDelDetalle("0.35")).toBeNull();
    expect(precioManualDelDetalle({ manual: true, lineas: [] })).toBeNull();
  });

  it("un detalle manual viejo sin el campo se lee de la primera línea", () => {
    expect(precioManualDelDetalle({ manual: true, lineas: [{ basePt: 0.4 }] })).toBe(0.4);
  });

  it("un precio a mano sin líneas (corrida sin volumen) no se pierde", () => {
    const cot = cotizarAserrio(version(), [], { precioManualPt: 0.5 });
    const p = plan({ cotizacion: cot, precioManualPt: 0.5, corrida: corrida({ declarada: false }) });
    expect(precioManualDelDetalle(p.corrida.aserrioDetalle)).toBe(0.5);
  });
});

describe("cómo se lee", () => {
  it("referencia de la corrida", () => {
    expect(referenciaDeCorrida(12)).toBe("Corrida N° 12");
    expect(referenciaDeCorrida(null)).toBe("Corrida sin número");
  });

  it("el precio no arrastra ceros de relleno ni pierde decimales", () => {
    const notas = (precio: number) =>
      notasDelCobro(cotizarAserrio(null, bloques, { precioManualPt: precio }), "Tornillo");
    expect(notas(0.35)).toContain("S/ 0.35 por PT");
    expect(notas(0.375)).toContain("S/ 0.375 por PT");
    expect(notas(0.3)).toContain("S/ 0.30 por PT");
    expect(notas(1.2345)).toContain("S/ 1.2345 por PT");
  });

  it("los avisos de la cotización viajan en la nota, con el tope del schema", () => {
    const cot = cotizarAserrio(version({ largos: [{ desdePies: 0, hastaPies: null, ajustePt: 0.01 }] }), bloques);
    expect(notasDelCobro(cot, "Tornillo")).toContain("sin largo");
    expect(notasDelCobro({ ...cot, avisos: ["x".repeat(900)] }, "Tornillo").length).toBeLessThanOrEqual(500);
  });

  it("motivo cuando declaró pero no hay volumen", () => {
    expect(motivoSinCobro(cotizarAserrio(version(), []), true)).toBe("La corrida no tiene volumen: no hay qué cobrar.");
  });

  it("la auditoría dice cuánto, a quién y por qué corrida", () => {
    const creado = detalleAuditCobro(plan(), "CC.NN. San Luis", 7);
    expect(creado).toMatch(/^Cargó S\/ \d+\.\d{2} de aserrío a CC\.NN\. San Luis por la Corrida N° 7/);

    const baja = detalleAuditCobro(
      plan({ cotizacion: cotizarAserrio(null, bloques), hayMovimientoVivo: true }),
      "CC.NN. San Luis",
      7,
    );
    expect(baja).toContain("Dio de baja el cargo de aserrío de la Corrida N° 7");
    expect(baja).toContain("No hay una tarifa");
  });

  it("el motivo de quitar el dueño está escrito para el patio", () => {
    expect(MOTIVO_SIN_DUENO).toBe("La madera no tiene a quién cobrarle.");
  });
});

describe("la corrida y la cuenta cuentan la misma historia", () => {
  it("corregir el dueño a «propia» (o dejarlo sin declarar) deja de cobrar", () => {
    expect(debeDejarDeCobrar({ escribioDueno: true, duenoMadera: "propia", duenoParteId: "p-1" })).toBe(true);
    expect(debeDejarDeCobrar({ escribioDueno: true, duenoMadera: null, duenoParteId: "p-1" })).toBe(true);
  });

  it("sigue de tercero, no se cobraba, o no se tocó el dueño: nada nuevo", () => {
    expect(debeDejarDeCobrar({ escribioDueno: true, duenoMadera: "tercero", duenoParteId: "p-1" })).toBe(false);
    expect(debeDejarDeCobrar({ escribioDueno: true, duenoMadera: "propia", duenoParteId: null })).toBe(false);
    expect(debeDejarDeCobrar({ escribioDueno: false, duenoMadera: "propia", duenoParteId: "p-1" })).toBe(false);
  });

  it("el cargo de una corrida viva se corrige desde la corrida", () => {
    const viva = { status: "registrado", deletedAt: null };
    expect(cargoSeCorrigeDesdeLaCorrida({ ctpEntryId: "c-1" }, viva)).toBe(true);
    expect(cargoSeCorrigeDesdeLaCorrida({ ctpEntryId: null }, viva)).toBe(false);
  });

  it("si la corrida ya no está, su cargo huérfano se puede corregir desde la cuenta", () => {
    expect(cargoSeCorrigeDesdeLaCorrida({ ctpEntryId: "c-1" }, { status: "anulado", deletedAt: null })).toBe(false);
    expect(cargoSeCorrigeDesdeLaCorrida({ ctpEntryId: "c-1" }, { status: "registrado", deletedAt: new Date() })).toBe(false);
    expect(cargoSeCorrigeDesdeLaCorrida({ ctpEntryId: "c-1" }, null)).toBe(false);
  });

  it("el mensaje nombra la corrida, sacada del libro o de la referencia", () => {
    expect(mensajeCargoDeCorrida(7)).toBe("Este cargo sale de la corrida N° 7: se corrige desde la corrida, con “Cobrar aserrío”.");
    expect(mensajeCargoDeCorrida(null)).toContain("sale de una corrida");
    expect(lineNoDeReferencia("Corrida N° 12")).toBe(12);
    expect(lineNoDeReferencia("Guía 001-0000120")).toBeNull();
    expect(lineNoDeReferencia(null)).toBeNull();
  });
});

describe("precioManualAUsar — ausente mantiene el trato", () => {
  const manual = { duenoParteId: "p-1", aserrioDetalle: { manual: true, precioManualPt: 0.35, lineas: [] } };
  const conTarifa = { duenoParteId: "p-1", aserrioDetalle: { manual: false, precioManualPt: null, lineas: [] } };

  it("sin precio en el pedido, una corrida cobrada a mano sigue a mano", () => {
    expect(precioManualAUsar(undefined, manual)).toBe(0.35);
  });

  it("sin precio en el pedido, la cobrada con tarifa sigue con tarifa, y la que no se cobraba arranca con tarifa", () => {
    expect(precioManualAUsar(undefined, conTarifa)).toBeNull();
    expect(precioManualAUsar(undefined, { duenoParteId: null, aserrioDetalle: manual.aserrioDetalle })).toBeNull();
  });

  it("`null` es la tarifa aunque hubiera un trato, y un número es ese precio", () => {
    expect(precioManualAUsar(null, manual)).toBeNull();
    expect(precioManualAUsar(0.4, conTarifa)).toBe(0.4);
    expect(precioManualAUsar(0, manual)).toBeNull();
  });
});

describe("titularBloqueadoPorCobro — el libro no nombra a uno mientras la cuenta cobra a otro", () => {
  it("corrida cobrada que sigue de tercero (o sin tocar el dueño): el titular no se toca a mano", () => {
    expect(titularBloqueadoPorCobro({ escribioDueno: false, duenoMadera: "tercero", duenoParteId: "p-1" })).toBe(true);
    expect(titularBloqueadoPorCobro({ escribioDueno: true, duenoMadera: "tercero", duenoParteId: "p-1" })).toBe(true);
    expect(titularBloqueadoPorCobro({ escribioDueno: false, duenoMadera: null, duenoParteId: "p-1" })).toBe(true);
  });

  it("si la misma corrección la pasa a «propia», el cobro se suelta y el titular queda libre", () => {
    expect(titularBloqueadoPorCobro({ escribioDueno: true, duenoMadera: "propia", duenoParteId: "p-1" })).toBe(false);
  });

  it("una corrida que no se cobra no ata nada", () => {
    expect(titularBloqueadoPorCobro({ escribioDueno: false, duenoMadera: "tercero", duenoParteId: null })).toBe(false);
    expect(MOTIVO_TITULAR_COBRADO).toContain("Cobrar aserrío");
  });
});

describe("duenoDelPedido — ausente mantiene el dueño", () => {
  it("sin dueño en el pedido sigue cobrándole al que la corrida ya tiene", () => {
    expect(duenoDelPedido(undefined, "p-1")).toEqual({ accion: "cobrar", parteId: "p-1" });
  });

  it("sin dueño en el pedido ni en la corrida no hay a quién cobrarle", () => {
    expect(duenoDelPedido(undefined, null)).toEqual({ accion: "nada" });
  });

  it("`null` deja de cobrar aunque hubiera dueño, y un id cobra a ese", () => {
    expect(duenoDelPedido(null, "p-1")).toEqual({ accion: "quitar" });
    expect(duenoDelPedido("p-9", "p-1")).toEqual({ accion: "cobrar", parteId: "p-9" });
  });
});

describe("motivoParteNoAceptable — un inactivo no es dueño nuevo", () => {
  const activa = { activo: true, deletedAt: null };
  const inactiva = { activo: false, deletedAt: null };
  const borrada = { activo: false, deletedAt: new Date() };

  it("un dueño nuevo tiene que estar activo y vivo", () => {
    expect(motivoParteNoAceptable(activa, false)).toBeNull();
    expect(motivoParteNoAceptable(inactiva, false)).toMatch(/dada de baja/);
    expect(motivoParteNoAceptable(borrada, false)).toMatch(/dada de baja/);
    expect(motivoParteNoAceptable(null, false)).toMatch(/no está/);
  });

  it("el mismo dueño se recotiza aunque se haya dado de baja", () => {
    expect(motivoParteNoAceptable(inactiva, true)).toBeNull();
    expect(motivoParteNoAceptable(borrada, true)).toBeNull();
  });
});

describe("titularQueQueda — «propia» limpia el titular", () => {
  it("madera del centro no guarda titular aunque venga uno", () => {
    expect(titularQueQueda("propia", "CC.NN. San Luis")).toBeNull();
  });

  it("de tercero o sin elegir guarda el nombre limpio, y vacío es null", () => {
    expect(titularQueQueda("tercero", "  CC.NN. San Luis ")).toBe("CC.NN. San Luis");
    expect(titularQueQueda(null, "Juan")).toBe("Juan");
    expect(titularQueQueda("tercero", "   ")).toBeNull();
  });
});

describe("cobrar en tanda — el resumen sale de los resultados", () => {
  const resultados = [
    { id: "a", lineNo: 7, cobrado: true, importe: 10.5, parteNombre: "CC.NN. San Luis", motivo: null },
    { id: "b", lineNo: 8, cobrado: true, importe: 2.25, parteNombre: "CC.NN. San Luis", motivo: null },
    { id: "c", lineNo: 9, cobrado: false, importe: null, parteNombre: null, motivo: "No hay una tarifa…" },
  ];

  it("cuenta las cobradas, suma sólo lo cobrado y cuenta las que quedaron sin cobrar", () => {
    expect(resumirTanda(resultados)).toEqual({
      cobradas: 2,
      importeTotal: 12.75,
      sinCobrar: 1,
      dadasDeBaja: 0,
      importeDadoDeBaja: 0,
    });
    expect(resumirTanda([])).toEqual({ cobradas: 0, importeTotal: 0, sinCobrar: 0, dadasDeBaja: 0, importeDadoDeBaja: 0 });
  });

  it("el renglón de auditoría dice cuánto, a quién y cuáles quedaron sin cobrar", () => {
    const txt = detalleAuditTanda(resultados, resumirTanda(resultados));
    expect(txt).toContain("3 corrida(s)");
    expect(txt).toContain("2 cobrada(s) por S/ 12.75 a CC.NN. San Luis");
    expect(txt).toContain("1 sin cobrar (N° 9)");
    expect(txt).not.toContain("dado(s) de baja");
  });

  it("una deuda borrada no se lee como «sin cobrar» a secas: se cuenta y se suma aparte", () => {
    const conBajas = [
      ...resultados,
      { id: "d", lineNo: 10, cobrado: false, importe: null, parteNombre: null, motivo: MOTIVO_SIN_DUENO, accion: "baja" as const, importeDadoDeBaja: 63.6 },
      { id: "e", lineNo: 11, cobrado: false, importe: null, parteNombre: null, motivo: "No hay una tarifa…", accion: "baja" as const, importeDadoDeBaja: 20.01 },
      { id: "f", lineNo: 12, cobrado: false, importe: null, parteNombre: null, motivo: MOTIVO_SIN_DUENO, accion: "nada" as const, importeDadoDeBaja: null },
    ];
    const resumen = resumirTanda(conBajas);
    expect(resumen).toEqual({ cobradas: 2, importeTotal: 12.75, sinCobrar: 4, dadasDeBaja: 2, importeDadoDeBaja: 83.61 });

    const txt = detalleAuditTanda(conBajas, resumen);
    expect(txt).toContain("4 sin cobrar (N° 9, N° 10, N° 11, N° 12)");
    expect(txt).toContain("2 cargo(s) dado(s) de baja por S/ 83.61 (N° 10, N° 11)");
  });
});

describe("auditoría con el cargo de antes — cambiar de dueño nombra a los dos", () => {
  it("al actualizar dice de cuánto y de quién era, y a cuánto y a quién pasa", () => {
    const p = plan({ hayMovimientoVivo: true });
    const txt = detalleAuditCobro(p, "CC.NN. San Luis", 7, { parteNombre: "Juan Pérez", monto: 100 });
    expect(txt).toContain(`de S/ 100.00 a Juan Pérez → S/ ${p.movimiento?.monto.toFixed(2)} a CC.NN. San Luis`);
  });

  it("al dar de baja nombra el cargo que se borró, no a la parte pedida", () => {
    const p = plan({ cotizacion: cotizarAserrio(null, bloques), hayMovimientoVivo: true });
    const txt = detalleAuditCobro(p, "CC.NN. San Luis", 7, { parteNombre: "Juan Pérez", monto: 63.6 });
    expect(txt).toContain("Dio de baja el cargo de aserrío de la Corrida N° 7 (S/ 63.60 a Juan Pérez)");
    expect(txt).not.toContain("CC.NN. San Luis");
  });

  it("sin cargo anterior se lee como antes", () => {
    expect(detalleAuditCobro(plan({ hayMovimientoVivo: true }), "CC.NN. San Luis", 7)).toMatch(
      /^Recalculó el cargo de aserrío de la Corrida N° 7: S\/ \d+\.\d{2} a CC\.NN\. San Luis/,
    );
  });
});

describe("corrida en kg o unidades — no se cobra como si fueran m³", () => {
  it("el plan no carga nada, da de baja lo que hubiera y dice por qué", () => {
    const p = plan({ cotizacion: cotizarAserrio(version(), []), corrida: corrida({ sinPt: true }), hayMovimientoVivo: true });
    expect(p.accion).toBe("baja");
    expect(p.movimiento).toBeNull();
    expect(p.motivo).toBe(MOTIVO_SIN_PT);
    expect(MOTIVO_SIN_PT).toBe("Esta corrida no está en m³: el aserrío se cobra por pie tablar y no se puede calcular.");
  });

  it("lo que todavía no declaró va antes que la unidad", () => {
    expect(motivoSinCobro(cotizarAserrio(version(), []), false, true)).toMatch(/todavía no declaró/);
  });
});
