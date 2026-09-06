/**
 * Pendientes del Libro: qué se muestra, en qué orden y qué se calla.
 */
import { describe, expect, it } from "vitest";
import { diaDeFechaOnly, diaDeLimiteLocal, diaEnPeriodo, pendientesDelLibro, resumenPendientes, type DatosPendientes } from "@/lib/forestal/ctp-pendientes";

const VACIO: DatosPendientes = {
  ingresosPendientes: 0, fueraDePlazo: 0, guiasSinIngresar: 0,
  despachosSinGtf: 0, despachosSinAnexo: 0, corridasSinOrigen: 0, saldosNegativos: 0,
};

describe("pendientesDelLibro", () => {
  it("libro al día: no inventa tareas", () => {
    expect(pendientesDelLibro(VACIO)).toEqual([]);
    expect(resumenPendientes([])).toMatch(/al día/);
  });

  it("lo que traba el cierre va primero, aunque sean menos casos", () => {
    const l = pendientesDelLibro({ ...VACIO, ingresosPendientes: 50, saldosNegativos: 1 });
    expect(l[0].clave).toBe("saldos-negativos");
    expect(l[0].urgencia).toBe("bloquea");
    expect(l[1].clave).toBe("ingresos-pendientes");
  });

  it("dentro de la misma urgencia manda la cantidad", () => {
    const l = pendientesDelLibro({ ...VACIO, guiasSinIngresar: 2, fueraDePlazo: 9 });
    expect(l.map((p) => p.clave)).toEqual(["fuera-de-plazo", "guias-sin-ingresar"]);
  });

  it("cada pendiente sabe a qué pestaña lleva", () => {
    const l = pendientesDelLibro({ ...VACIO, despachosSinAnexo: 3, corridasSinOrigen: 1 });
    expect(l.find((p) => p.clave === "despachos-sin-anexo")!.vista).toBe("despacho");
    expect(l.find((p) => p.clave === "sin-origen")!.vista).toBe("produccion");
  });

  it("el resumen distingue lo que traba el cierre de lo que no", () => {
    const conBloqueo = pendientesDelLibro({ ...VACIO, saldosNegativos: 2, ingresosPendientes: 3 });
    expect(resumenPendientes(conBloqueo)).toMatch(/5 pendientes · 2 traban el cierre/);
    const sinBloqueo = pendientesDelLibro({ ...VACIO, ingresosPendientes: 3 });
    expect(resumenPendientes(sinBloqueo)).toMatch(/ninguno traba/);
  });
});

describe("acotar por período sin correr el mes", () => {
  it("el último día del mes entra (to es 23:59 local, la fecha es medianoche UTC)", () => {
    const desde = diaDeLimiteLocal(new Date(2026, 5, 1, 0, 0, 0, 0).toISOString());
    const hasta = diaDeLimiteLocal(new Date(2026, 5, 30, 23, 59, 59, 999).toISOString());
    expect(desde).toBe("2026-06-01");
    expect(hasta).toBe("2026-06-30");
    expect(diaEnPeriodo(diaDeFechaOnly("2026-06-30T00:00:00.000Z"), desde, hasta)).toBe(true);
    expect(diaEnPeriodo(diaDeFechaOnly("2026-06-01T00:00:00.000Z"), desde, hasta)).toBe(true);
    expect(diaEnPeriodo(diaDeFechaOnly("2026-07-01T00:00:00.000Z"), desde, hasta)).toBe(false);
    expect(diaEnPeriodo(diaDeFechaOnly("2026-05-31T00:00:00.000Z"), desde, hasta)).toBe(false);
  });

  it("sin límites (todo el histórico) entra todo, y una fecha ilegible nunca", () => {
    expect(diaEnPeriodo(diaDeFechaOnly("2020-01-01T00:00:00.000Z"), "", "")).toBe(true);
    expect(diaEnPeriodo(diaDeFechaOnly("no-es-fecha"), "", "")).toBe(false);
    expect(diaDeLimiteLocal(null)).toBe("");
  });
});

/**
 * El aviso de costos tiene que decir lo que está en juego.
 *
 * Decía «Ingresos sin costo cargado» y el badge un «3». Tres suena a tres
 * papeles y se posterga; los 32.93 m³ que hay detrás son TODO el patio del
 * tenant forestal. El aviso existía y estaba cableado de punta a punta —lo que
 * no hacía era mover a nadie.
 *
 * Y lo que el detalle NO hace: estimar cuánto producto terminado queda sin
 * margen. Haría falta saber qué parte de cada corrida salió de un ingreso sin
 * costo, y eso no se sabe sin recorrer la atribución. Un derivado presentado
 * como dato es exactamente lo que este libro no puede permitirse.
 */
describe("el aviso de ingresos sin costo", () => {
  const soloCostos = (m3?: number) =>
    pendientesDelLibro({
      ingresosPendientes: 0, fueraDePlazo: 0, guiasSinIngresar: 0,
      despachosSinGtf: 0, despachosSinAnexo: 0, corridasSinOrigen: 0, saldosNegativos: 0,
      ingresosSinCosto: 3, ...(m3 != null ? { m3SinCosto: m3 } : {}),
    }).find((p) => p.clave === "ingresos-sin-costo");

  it("lleva los m³ en el título cuando se conocen", () => {
    expect(soloCostos(32.933)?.titulo).toBe("Ingresos sin costo · 32.93 m³ sin valorizar");
  });

  it("sin el volumen vuelve al título de antes — no inventa un cero", () => {
    expect(soloCostos()?.titulo).toBe("Ingresos sin costo cargado");
    expect(soloCostos(0)?.titulo).toBe("Ingresos sin costo cargado");
  });

  it("sigue sin trabar el cierre: es «pendiente», no «bloquea»", () => {
    // A SERFOR no le interesan los precios. Que el margen sea desconocido es un
    // problema del dueño, no una infracción — y el orden del aviso lo refleja.
    expect(soloCostos(32.933)?.urgencia).toBe("pendiente");
  });

  it("lleva a Rentabilidad, que es donde se cargan", () => {
    expect(soloCostos(32.933)?.vista).toBe("rentabilidad");
  });

  it("con todo cargado el aviso desaparece", () => {
    const sin = pendientesDelLibro({
      ingresosPendientes: 0, fueraDePlazo: 0, guiasSinIngresar: 0,
      despachosSinGtf: 0, despachosSinAnexo: 0, corridasSinOrigen: 0, saldosNegativos: 0,
      ingresosSinCosto: 0, m3SinCosto: 0,
    });
    expect(sin.find((p) => p.clave === "ingresos-sin-costo")).toBeUndefined();
  });
});
