import { describe, expect, it } from "vitest";
import {
  CASILLAS_VACIAS,
  casillasGuardadas,
  consultaPrecioTroza,
  fmtDifPt,
  fmtDifSoles,
  leerCasilla,
  ordenarOrigen,
  soloSinOrigen,
  textoCorridasFuera,
  textoCostosNoIngresados,
  tonoDe,
} from "@/components/admin/forestal/precio-troza/precio-troza-formato";
import type { FilaRendimientoOrigen } from "@/lib/forestal/precio-troza-tipos";

const fila = (o: Partial<FilaRendimientoOrigen>): FilaRendimientoOrigen => ({
  clave: "s:1", nombre: "Juan", detalle: null, sinOrigen: false, m3Rollo: 1, ptProducidos: 240, rendimientoPct: 56,
  corridas: 1, lotes: 0, prorrateado: false, especies: ["Tornillo"], difPtVsPromedio: 0, difSolesVsPromedio: 0, difSolesFalta: null, ...o,
});

describe("leerCasilla", () => {
  it("vacío no es cero ni error", () => expect(leerCasilla("aserrio", "  ")).toEqual({ valor: null, error: null }));
  it("acepta coma decimal y punto de miles", () => {
    expect(leerCasilla("precio", "3,5").valor).toBe(3.5);
    expect(leerCasilla("aserrio", "1.250,50").valor).toBe(1250.5);
    expect(leerCasilla("flete", "80").valor).toBe(80);
  });
  it("rechaza letras, negativos y lo que el servidor no acepta", () => {
    expect(leerCasilla("flete", "abc").error).toBe("Solo números");
    expect(leerCasilla("flete", "-5").error).toBe("Solo números");
    expect(leerCasilla("margen", "96")).toEqual({ valor: null, error: "Hasta 95 %" });
    expect(leerCasilla("precio", "1001").valor).toBeNull();
  });
});

describe("consultaPrecioTroza", () => {
  it("manda solo lo escrito y válido, más el agrupado", () => {
    const q = new URLSearchParams(consultaPrecioTroza({ aserrio: "150", flete: "", margen: "10", precio: "x" }, "permiso"));
    expect(Object.fromEntries(q)).toEqual({ aserrio: "150", margen: "10", agrupar: "permiso" });
  });
  it("todo vacío = solo el agrupado (el servidor usa sus ventas)", () => {
    expect(consultaPrecioTroza(CASILLAS_VACIAS, "guia")).toBe("agrupar=guia");
  });
});

describe("casillasGuardadas", () => {
  it("lo que no tiene forma vuelve a vacío", () => {
    expect(casillasGuardadas(null)).toEqual(CASILLAS_VACIAS);
    expect(casillasGuardadas({ aserrio: 150, flete: "80" })).toEqual({ ...CASILLAS_VACIAS, flete: "80" });
  });
});

describe("textos y tonos", () => {
  it("signo siempre visible en las diferencias", () => {
    expect(fmtDifSoles(120)).toMatch(/^\+S\/ 120/);
    expect(fmtDifSoles(-45.5)).toMatch(/^−S\/ 45/);
    expect(fmtDifSoles(0.001)).not.toMatch(/^[+−]/);
    expect(fmtDifSoles(null)).toBe("—");
    expect(fmtDifPt(-12.4)).toBe("−12 PT");
    expect(fmtDifPt(0.3)).toBe("0 PT");
  });
  it("tono verde/rojo con umbral", () => {
    expect(tonoDe(10)).toBe("bien");
    expect(tonoDe(-10)).toBe("mal");
    expect(tonoDe(0.2)).toBe("neutro");
    expect(tonoDe(null)).toBe("neutro");
  });
  it("costos que faltan en palabras", () => {
    expect(textoCostosNoIngresados([])).toBeNull();
    expect(textoCostosNoIngresados(["flete"])).toBe("No pusiste: flete");
    expect(textoCostosNoIngresados(["aserrio", "flete", "margen"])).toBe("No pusiste: aserrío, flete y margen");
  });
  it("corridas fuera en una frase", () => {
    expect(textoCorridasFuera({ enProceso: 0, enPt: 0, sinEntrada: 0 })).toBeNull();
    expect(textoCorridasFuera({ enProceso: 2, enPt: 1, sinEntrada: 0 })).toBe("2 en proceso y 1 declarada en pies quedaron fuera");
  });
});

describe("origen", () => {
  it("solo «Sin origen» se detecta; lista vacía no", () => {
    expect(soloSinOrigen([fila({ clave: "sin-origen", sinOrigen: true })])).toBe(true);
    expect(soloSinOrigen([])).toBe(false);
    expect(soloSinOrigen([fila({}), fila({ clave: "sin-origen", sinOrigen: true })])).toBe(false);
  });
  it("mejor rendimiento arriba y «Sin origen» al final", () => {
    const orden = ordenarOrigen([
      fila({ clave: "sin-origen", sinOrigen: true, rendimientoPct: 70 }),
      fila({ clave: "a", rendimientoPct: 50 }),
      fila({ clave: "b", rendimientoPct: 62 }),
    ]).map((f) => f.clave);
    expect(orden).toEqual(["b", "a", "sin-origen"]);
  });
});
