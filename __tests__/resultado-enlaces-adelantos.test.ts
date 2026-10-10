/**
 * Resultado del negocio → cada fila abre lo suyo (H8, 09-10).
 *
 * Antes la planilla mandaba `?colaborador=` (RRHH lee `?persona=`) y el
 * adelanto / la liquidación mandaban `?adelanto=` / `?liquidacion=` sin nadie
 * que los leyera: el clic caía en la puerta del módulo.
 */
import { StrictMode, createElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  detalleDeCaja,
  detalleDeResultado,
  type EntradaCaja,
  type EntradaResultado,
} from "@/lib/finance/resultado-del-negocio";
import { destinoDelAdelanto, destinoDeLaLiquidacion, esElAdelanto } from "@/lib/adelantos/enlace-adelanto";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import { PARAMS_DE_VISTA } from "@/hooks/use-vista-modulo";
import {
  PARAMS_DE_ADELANTOS,
  urlAlSalirDeAdelantos,
  useLimpiarAlSalirDeAdelantos,
} from "@/components/admin/adelantos/hooks/use-adelanto-en-url";

const utc = (dia: string) => new Date(`${dia}T00:00:00.000Z`);

function vacia(): EntradaResultado {
  return { hoy: "2026-09-29", ventas: [], pedidos: [], cuenta: [], corridas: [], despachos: [], fletes: [], gastos: [], planillas: {}, compras: [], mesesCerrados: [] };
}
function cajaVacia(): EntradaCaja {
  return {
    ventas: [], cuotasFiado: [], pedidos: [], cuenta: [], liquidaciones: [], adelantos: [], codigosAdelanto: [], cajaDeLiquidaciones: [],
    gastos: [], fletes: [], movimientosCaja: [], entregas: [],
  };
}

describe("enlaces del detalle de un renglón", () => {
  it("planilla → la ficha de ESA persona en RRHH (`?persona=`)", () => {
    const e = vacia();
    e.planillas = { "2026-09": { total: 900, personas: [{ id: "c1", nombre: "Pedro", total: 900, diasSinMarcar: 0 }] } };
    const fila = detalleDeResultado("2026-09", "planilla", e).filas[0];
    expect(fila.enlace && hrefDeDestino(fila.enlace)).toBe("/admin?tab=rrhh&vista=personal&persona=c1");
  });

  it("adelanto dado → la lista de Adelantos con SU ficha (código; sin código, el id)", () => {
    const e = cajaVacia();
    e.adelantos = [
      { id: "a1", codigo: "ADL-2026-0007", fechaAdelanto: utc("2026-09-19"), montoAdelantado: 1000, moneda: "PEN", direccion: "DADO", beneficiario: "Juan" },
      { id: "a2", codigo: null, fechaAdelanto: utc("2026-09-20"), montoAdelantado: 50, moneda: "PEN", direccion: "DADO", beneficiario: "Ana" },
    ];
    const filas = detalleDeCaja("2026-09", "adelanto_dado", e).filas;
    const enlace = (id: string) => filas.find((f) => f.id === id)?.enlace;
    expect(enlace("a1")).toEqual({ tab: "plata", params: { vista: "adelantos", sub: "lista", adelanto: "ADL-2026-0007" } });
    expect(enlace("a2")?.params.adelanto).toBe("a2");
  });

  it("devolución en plata → el adelanto de esa devolución", () => {
    const e = cajaVacia();
    e.entregas = [{ id: "en3", fecha: new Date("2026-09-29T01:37:49Z"), valor: 1200, liquidacionId: null, adelantoCodigo: "ADL-2026-0001", direccion: "DADO", beneficiario: "MAMA DE ALEX" }];
    e.codigosAdelanto = ["ADL-2026-0001"];
    e.movimientosCaja = [{ id: "cm7", type: "ingreso", amount: 1200, description: "Liquidación de adelanto ADL-2026-0001 · MAMA DE ALEX", createdAt: new Date("2026-09-29T01:37:00Z") }];
    expect(detalleDeCaja("2026-09", "adelanto_devuelto", e).filas[0].enlace?.params).toMatchObject({ sub: "lista", adelanto: "ADL-2026-0001" });
  });

  it("liquidación → Liquidar de esa persona con la liquidación marcada; sin persona, Resumen", () => {
    const e = cajaVacia();
    const base = { fecha: utc("2026-09-20"), pagoDireccion: "recibido", pagoMonto: 500, montoCompensado: 0, personaNombre: "WASACO", cajaMovimientoId: null };
    e.liquidaciones = [
      { ...base, id: "L1", codigo: "LIQ-2026-0001", beneficiarioId: "b1", parteId: "p1" },
      { ...base, id: "L2", codigo: "LIQ-2026-0002", parteId: "p2" },
      { ...base, id: "L3", codigo: "LIQ-2026-0003" },
    ];
    const filas = detalleDeCaja("2026-09", "liquidacion_recibida", e).filas;
    const enlace = (id: string) => filas.find((f) => f.id === id)?.enlace;
    expect(enlace("L1")).toEqual({ tab: "plata", params: { vista: "adelantos", accion: "liquidar", persona: "b1", liquidacion: "LIQ-2026-0001" } });
    expect(enlace("L2")?.params.persona).toBe("p2");
    // Sin persona no hay pantalla que la muestre: la fila queda como texto.
    expect(enlace("L3")).toBeNull();
  });
});

describe("enlace-adelanto", () => {
  it("sin referencia no hay destino", () => {
    expect(destinoDelAdelanto(null)).toBeNull();
    expect(destinoDelAdelanto("  ")).toBeNull();
    expect(destinoDeLaLiquidacion("LIQ-1", "  ")).toBeNull();
  });

  it("ubica por código sin importar mayúsculas, o por id", () => {
    const a = { id: "cuid1", codigoOperacion: "ADL-2026-0007" };
    expect(esElAdelanto(a, "adl-2026-0007")).toBe(true);
    expect(esElAdelanto(a, "cuid1")).toBe(true);
    expect(esElAdelanto(a, "ADL-2026-00070")).toBe(false);
    expect(esElAdelanto({ id: "x", codigoOperacion: null }, "")).toBe(false);
  });
});

describe("los parámetros de Adelantos no quedan pegados al salir", () => {
  const BASE = "http://localhost/admin";
  it("cada uno lo borra navigateTab (`PARAMS_DE_VISTA`) o la salida de Adelantos", () => {
    for (const p of PARAMS_DE_ADELANTOS) {
      const lejos = urlAlSalirDeAdelantos(`${BASE}?tab=rrhh&${p}=X`);
      const borrado = lejos != null && !new URL(lejos).searchParams.has(p);
      expect((PARAMS_DE_VISTA as readonly string[]).includes(p) || borrado, p).toBe(true);
    }
  });

  it("fuera de Adelantos se van; `accion` sólo si es liquidar; `persona` queda (es de RRHH)", () => {
    const fuera = urlAlSalirDeAdelantos(`${BASE}?tab=rrhh&vista=personal&persona=c1&adelanto=ADL-2026-0007`);
    expect(fuera && new URL(fuera).search).toBe("?tab=rrhh&vista=personal&persona=c1");
    const otraVista = urlAlSalirDeAdelantos(`${BASE}?tab=plata&vista=gastos&accion=liquidar&liquidacion=LIQ-2026-0001`);
    expect(otraVista && new URL(otraVista).search).toBe("?tab=plata&vista=gastos");
    expect(urlAlSalirDeAdelantos(`${BASE}?tab=compras&accion=nuevo`)).toBeNull();
  });

  it("dentro de Adelantos no se toca nada", () => {
    expect(urlAlSalirDeAdelantos(`${BASE}?tab=plata&vista=adelantos&sub=lista&adelanto=ADL-2026-0007`)).toBeNull();
  });

  it("StrictMode no borra al montar; desmontar de verdad sí", () => {
    vi.useFakeTimers();
    try {
      window.history.replaceState(null, "", "/admin?tab=plata&vista=adelantos&sub=lista&adelanto=ADL-2026-0007");
      const strict = ({ children }: { children: ReactNode }) => createElement(StrictMode, null, children);
      const { unmount } = renderHook(() => useLimpiarAlSalirDeAdelantos(), { wrapper: strict });
      vi.runAllTimers();
      expect(new URLSearchParams(window.location.search).get("adelanto")).toBe("ADL-2026-0007");
      // navigateTab ya escribió la URL del otro módulo (sin borrar `adelanto`) y después desmonta.
      window.history.pushState(null, "", "/admin?tab=rrhh&adelanto=ADL-2026-0007");
      unmount();
      vi.runAllTimers();
      expect(window.location.search).toBe("?tab=rrhh");
    } finally {
      vi.useRealTimers();
    }
  });
});
