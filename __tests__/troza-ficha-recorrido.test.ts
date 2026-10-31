import { describe, expect, it } from "vitest";
import {
  consultaSerforDe,
  controlHuber,
  diasDeLaPieza,
  diasEntre,
  estadoDeFicha,
  eventosDelProducto,
  fechaDelLibro,
  hoyDelLibro,
  medidasDeFicha,
  recorridoDeFicha,
  textoTramo,
  type FichaTroza,
} from "@/lib/forestal/troza-ficha-recorrido";
import type { EventoTroza } from "@/lib/forestal/planta-zona-types";

const HOY = "2026-10-05";

function ficha(over: Partial<FichaTroza> = {}, troza: Partial<FichaTroza["troza"]> = {}, ingreso: Partial<FichaTroza["ingreso"]> = {}): FichaTroza {
  return {
    troza: {
      id: "t1", codificacion: "QA-SEM-001/7", codigoPlanta: null, parcela: null, especieComun: "Tornillo",
      especieCientifica: null, dimensiones: null, d1Cm: null, d2Cm: null, diametroCm: null, largoM: 6.4,
      volumenM3: 2.463, noRecepcionada: false, fechaRecepcion: "2026-09-20T00:00:00.000Z", recepcionObs: null,
      descarte: false, observaciones: null, fechaRetrozo: null, fechaConsumo: null, fechaDespacho: null,
      ...troza,
    },
    ingreso: {
      id: "g1", libroNro: 12, gtfNumber: "001-0012345", proveedor: "Prov", entryDate: "2026-09-18T00:00:00.000Z",
      fechaRecepcion: null, status: "pendiente", permiso: "TH-1", resolucion: null, volumenM3: 10,
      ...ingreso,
    },
    madre: null, retrozos: [], lote: null, corrida: null, despacho: null,
    ...over,
  };
}

const corrida = (vigente: boolean): NonNullable<FichaTroza["corrida"]> => ({
  id: "c1", lineNo: 7, entryDate: "2026-09-30T00:00:00.000Z", vigente, producto: "Tabla", presentacion: null,
  cantidad: null, unidad: null, rendimientoPct: null, linea: null, volumenEntradaM3: null,
});

describe("estadoDeFicha — el mismo estado que la tabla del patio", () => {
  it("con fecha propia de recepción está libre aunque la guía siga pendiente", () => {
    expect(estadoDeFicha(ficha())).toBe("libre");
  });
  it("sin ninguna señal de recepción, la guía sigue en la bandeja", () => {
    expect(estadoDeFicha(ficha({}, { fechaRecepcion: null }))).toBe("por_recepcionar");
  });
  it("una guía «procesado» cuenta como recibida (guiaRecibida), no sólo «validado»", () => {
    expect(estadoDeFicha(ficha({}, { fechaRecepcion: null }, { status: "procesado" }))).toBe("libre");
  });
  it("una corrida anulada devolvió la madera: vuelve a estar libre", () => {
    expect(estadoDeFicha(ficha({ corrida: corrida(false) }))).toBe("libre");
    expect(estadoDeFicha(ficha({ corrida: corrida(true) }))).toBe("consumida");
  });
  it("con lote de aserrío está apartada", () => {
    expect(estadoDeFicha(ficha({ lote: { id: "l", code: "L-3", status: "abierto", speciesCommon: null } }))).toBe("apartada");
  });
});

describe("diasDeLaPieza", () => {
  const hoy = hoyDelLibro(HOY);
  it("en patio cuenta desde que bajó", () => {
    expect(diasDeLaPieza(ficha(), "libre", hoy)).toEqual({ dias: 15, texto: "15 días en el patio", desdeElAsiento: false });
  });
  it("sin recepción propia dice que cuenta desde el asiento", () => {
    const d = diasDeLaPieza(ficha({}, { fechaRecepcion: null }, { status: "validado" }), "libre", hoy);
    expect(d?.dias).toBe(17);
    expect(d?.texto).toBe("17 días desde el asiento de su guía");
  });
  it("aserrada: cuánto estuvo hasta la sierra", () => {
    const f = ficha({ corrida: corrida(true) }, { fechaConsumo: "2026-09-25T00:00:00.000Z" });
    expect(diasDeLaPieza(f, "consumida", hoy)?.texto).toBe("Estuvo 5 días en el patio");
  });
});

describe("controlHuber", () => {
  it("cuadra dentro del 10 %", () => {
    const c = controlHuber(70, 70, 6.4, 2.463);
    expect(c?.huberM3).toBeCloseTo(2.463, 3);
    expect(c?.revisar).toBe(false);
  });
  it("un D1 mal tipeado se marca para revisar", () => {
    expect(controlHuber(90, 70, 6.4, 2.463)?.revisar).toBe(true);
  });
  it("sin las dos puntas no hay control", () => {
    expect(controlHuber(70, null, 6.4, 2.463)).toBeNull();
  });
});

describe("medidasDeFicha", () => {
  it("toma lo recibido distinto cuando la guía no trae puntas", () => {
    const m = medidasDeFicha(ficha({}, { recibida: { d1Cm: 60, d2Cm: 58, largoM: null, volumenM3: null } }).troza);
    expect(m).toEqual({ d1: 60, d2: 58, fuente: "recibida" });
  });
});

describe("consultaSerforDe", () => {
  it("arma la URL con guiones tal cual", () => {
    expect(consultaSerforDe(" 2-17-0002328 ")).toContain("nuRegistroGuia=2-17-0002328");
  });
  it("sin número válido no hay enlace", () => {
    expect(consultaSerforDe("s/n")).toBeNull();
    expect(consultaSerforDe(null)).toBeNull();
  });
});

describe("recorridoDeFicha", () => {
  const ev = (tipo: EventoTroza["tipo"], fecha: string, detalle: string): EventoTroza => ({ tipo, fecha, ref: "L-3", detalle });

  it("libre: guía → recepción → sin lote → hoy, con los tramos", () => {
    const pasos = recorridoDeFicha(ficha(), [], "libre", HOY);
    expect(pasos.map((p) => p.clave)).toEqual(["guia", "recepcion", "lote", "hoy"]);
    expect(pasos[0].tramo).toEqual({ dias: 2, hasta: "recepcion" });
    expect(pasos[1].tramo).toEqual({ dias: 15, hasta: "hoy" });
    expect(pasos[2].fecha).toBeNull();
  });

  it("la fecha de apertura del lote se rotula como de su documento", () => {
    const f = ficha({ lote: { id: "l", code: "L-3", status: "abierto", speciesCommon: null } });
    const pasos = recorridoDeFicha(f, [ev("lote", "2026-09-22T00:00:00.000Z", "En el lote de aserrío (fecha de apertura del lote)")], "apartada", HOY);
    const lote = pasos.find((p) => p.clave === "lote");
    expect(lote?.fecha).toBe("2026-09-22T00:00:00.000Z");
    expect(lote?.fechaDe).toBe("apertura del lote");
    expect(lote?.tramo).toEqual({ dias: 13, hasta: "hoy" });
  });

  it("sin fecha propia de recepción usa la de su guía y lo dice", () => {
    const f = ficha({}, { fechaRecepcion: null }, { fechaRecepcion: "2026-09-19T00:00:00.000Z" });
    const rec = recorridoDeFicha(f, [], "libre", HOY).find((p) => p.clave === "recepcion");
    expect(rec?.fechaDe).toBe("recepción de su guía");
  });

  it("aserrada: termina en la corrida, sin paso «hoy»", () => {
    const f = ficha({ corrida: corrida(true) }, { fechaConsumo: "2026-09-25T00:00:00.000Z" });
    const pasos = recorridoDeFicha(f, [], "consumida", HOY);
    expect(pasos.map((p) => p.clave)).toEqual(["guia", "recepcion", "corrida"]);
    expect(pasos[1].tramo).toEqual({ dias: 5, hasta: "corrida" });
    expect(pasos[2].tramo).toBeNull();
  });

  it("los eventos del producto sólo con la corrida vigente", () => {
    const evs = [ev("apartado", "2026-10-01T00:00:00.000Z", "Se apartó el producto"), ev("lote", "2026-09-22T00:00:00.000Z", "x")];
    expect(eventosDelProducto(ficha({ corrida: corrida(true) }), evs)).toHaveLength(1);
    expect(eventosDelProducto(ficha({ corrida: corrida(false) }), evs)).toHaveLength(0);
  });
});

describe("fechas", () => {
  it("diasEntre no devuelve negativos", () => {
    expect(diasEntre("2026-09-20", "2026-09-18")).toBeNull();
    expect(diasEntre("2026-09-20T00:00:00Z", "2026-09-20T23:00:00Z")).toBe(0);
  });
  it("«jueves 10/09», con año sólo si no es el de hoy", () => {
    expect(fechaDelLibro("2026-09-10T00:00:00.000Z", HOY)).toBe("jueves 10/09");
    expect(fechaDelLibro("2025-12-15T00:00:00.000Z", HOY)).toBe("lunes 15/12/2025");
  });
  it("textoTramo", () => {
    expect(textoTramo({ dias: 0, hasta: "lote" })).toBe("El mismo día");
    expect(textoTramo({ dias: 1, hasta: "corrida" })).toBe("1 día hasta la sierra");
  });
});
