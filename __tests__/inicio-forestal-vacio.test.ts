/**
 * Inicio · Forestal (09-10): cuándo la pestaña es sólo el paiche, cuándo el
 * paiche reemplaza a las cifras del período y cuándo un permiso es una fila.
 */
import { describe, expect, it } from "vitest";
import {
  estadoInicioForestal,
  guiasVigentes,
  permisoConDato,
} from "@/components/admin/inicio/use-forestal-inicio";
import type { InicioForestal, InicioForestalCtp, PermisoInicio } from "@/lib/forestal/inicio-forestal";

function ctp(over: Partial<InicioForestalCtp> = {}): InicioForestalCtp {
  return {
    ingresoM3: 0,
    consumoM3: 0,
    producido: 0,
    despachado: 0,
    rendimiento: 0,
    corridasOtraUnidad: 0,
    unidadProducido: "m3",
    unidadDespachado: "m3",
    serie: { paso: "semana", puntos: [] },
    serieTruncada: false,
    guias: { total: 0, anuladas: 0, truncado: false },
    patio: { trozas: 0, m3: 0, pt: 0, truncado: false },
    ...over,
  };
}

function permiso(over: Partial<PermisoInicio> = {}): PermisoInicio {
  return {
    id: "p1",
    numero: "PO 12",
    tipo: "PO",
    baseM3: 0,
    taladoM3: 0,
    despachadoM3: 0,
    enPieM3: 0,
    pctTalado: null,
    excedido: false,
    taladoSinRegistrarM3: 0,
    ...over,
  };
}

function inicio(over: Partial<InicioForestal> = {}): InicioForestal {
  return { desde: "2026-10-09", hasta: "2026-10-09", ctp: ctp(), loth: null, adelantos: null, ...over };
}

describe("estadoInicioForestal", () => {
  it("todo en cero y patio vacío: ni movimiento ni foto (sólo el paiche)", () => {
    expect(estadoInicioForestal(inicio())).toEqual({ movimiento: false, foto: false });
  });

  it("sin movimiento pero con trozas en el patio: el paiche va arriba y la foto de hoy debajo", () => {
    const e = estadoInicioForestal(inicio({ ctp: ctp({ patio: { trozas: 13, m3: 20.99, pt: 4985, truncado: false } }) }));
    expect(e).toEqual({ movimiento: false, foto: true });
  });

  it("el patio que no se pudo leer (null) no cuenta como dato", () => {
    expect(estadoInicioForestal(inicio({ ctp: ctp({ patio: null }) })).foto).toBe(false);
  });

  it("un ingreso, una corrida o un despacho del período es movimiento", () => {
    expect(estadoInicioForestal(inicio({ ctp: ctp({ ingresoM3: 14.11 }) })).movimiento).toBe(true);
    expect(estadoInicioForestal(inicio({ ctp: ctp({ consumoM3: 6.29 }) })).movimiento).toBe(true);
    expect(estadoInicioForestal(inicio({ ctp: ctp({ despachado: 1.49 }) })).movimiento).toBe(true);
  });

  it("las guías anuladas solas no son movimiento; una vigente del LO-TH sí", () => {
    const soloAnuladas = inicio({ ctp: ctp({ guias: { total: 2, anuladas: 2, truncado: false } }) });
    expect(estadoInicioForestal(soloAnuladas).movimiento).toBe(false);
    const conTh = inicio({ ctp: null, loth: { guias: { emitidas: 1, anuladas: 0, truncado: false }, permisos: [] } });
    expect(estadoInicioForestal(conTh).movimiento).toBe(true);
  });

  it("permisos sin volumen ni tala y adelantos en cero no son foto; con saldo sí", () => {
    const vacio = inicio({
      loth: { guias: { emitidas: 0, anuladas: 0, truncado: false }, permisos: [permiso()] },
      adelantos: [{ moneda: "PEN", saldoPendiente: 0, abiertos: 0 }],
    });
    expect(estadoInicioForestal(vacio).foto).toBe(false);
    const conSaldo = inicio({ adelantos: [{ moneda: "PEN", saldoPendiente: 350, abiertos: 2 }] });
    expect(estadoInicioForestal(conSaldo).foto).toBe(true);
  });
});

describe("permisoConDato", () => {
  it("recién creado (sin volumen ni tala) → no es una fila de barras", () => {
    expect(permisoConDato(permiso())).toBe(false);
  });
  it("con volumen autorizado, o con tala aunque no tenga volumen → sí", () => {
    expect(permisoConDato(permiso({ baseM3: 185 }))).toBe(true);
    expect(permisoConDato(permiso({ taladoSinRegistrarM3: 3.2 }))).toBe(true);
  });
});

describe("guiasVigentes", () => {
  it("CTP = total menos anuladas; TH = emitidas; las anuladas se suman aparte", () => {
    const d = inicio({
      ctp: ctp({ guias: { total: 10, anuladas: 9, truncado: false } }),
      loth: { guias: { emitidas: 3, anuladas: 0, truncado: false }, permisos: [] },
    });
    expect(guiasVigentes(d)).toEqual({ ctp: 1, th: 3, anuladas: 9 });
  });
});
