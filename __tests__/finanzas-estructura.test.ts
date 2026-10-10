import { describe, expect, it } from "vitest";
import {
  DONDE_VIVE, SECCIONES, TABS, VISTAS, ubicar,
} from "@/components/admin/unified/finanzas/estructura";

/**
 * La unificación de Mi Plata (6 pestañas + 14 secciones → 5 pestañas) sólo es
 * válida si NADA se pierde: las quince vistas de antes siguen teniendo
 * dirección, y los atajos del menú del panel siguen aterrizando donde prometen.
 *
 * Este test es la red: si mañana alguien mueve una vista de pestaña y se olvida
 * del mapa, un enlace guardado caería en «Resumen» sin avisar.
 */

/** Las quince vistas que existían antes del rediseño, con su nombre de entonces. */
const VISTAS_VIEJAS = [
  "resumen", "pl", "rentabilidad", "comparador", "gastos", "presupuesto",
  "flujo-caja", "tesoreria", "activos", "por-cobrar", "fiados", "prestamos",
  "adelantos", "scoring", "reportes",
] as const;

/** Las que se sumaron DESPUÉS del rediseño, cada una con su motivo. */
const VISTAS_NUEVAS = [
  /* F10 (2026-09-29): «Lo que debo», el otro lado de Por cobrar. */
  "por-pagar",
] as const;

/** Los nombres por los que el menú del panel entra al módulo (`?tab=…`). */
const ATAJOS_DEL_MENU = ["plata", "fiados", "por-cobrar", "prestamos", "adelantos", "activos", "scoring"] as const;

/** Pestañas que ya no existen y que un `localStorage` viejo puede traer. */
const PESTANAS_VIEJAS = ["dashboard", "resultado", "caja"] as const;

describe("estructura de Mi Plata", () => {
  it("tiene cinco pestañas", () => {
    expect(TABS.map((t) => t.id)).toEqual(["resumen", "resultado", "movimientos", "por-cobrar", "reportes"]);
  });

  it("conserva las quince vistas, con dirección propia (y sólo suma las nuevas declaradas)", () => {
    expect([...VISTAS].sort()).toEqual([...VISTAS_VIEJAS, ...VISTAS_NUEVAS].sort());
    // `VISTAS` es lo que `useVistaModulo` valida: lo que no está acá, no se puede linkear.
    for (const vieja of VISTAS_VIEJAS) expect(VISTAS).toContain(vieja);
  });

  it("cada vista vieja aterriza en contenido, no en el default", () => {
    for (const vieja of VISTAS_VIEJAS) {
      const donde = ubicar(vieja);
      expect(donde.vista, `${vieja} perdió su vista`).toBe(vieja);
      expect(TABS.map((t) => t.id)).toContain(donde.tab);
    }
  });

  it("los atajos del menú siguen entrando donde prometen", () => {
    expect(ubicar("fiados")).toMatchObject({ tab: "por-cobrar", vista: "fiados" });
    expect(ubicar("prestamos")).toMatchObject({ tab: "por-cobrar", vista: "prestamos" });
    expect(ubicar("adelantos")).toMatchObject({ tab: "por-cobrar", vista: "adelantos" });
    expect(ubicar("scoring")).toMatchObject({ tab: "por-cobrar", vista: "scoring" });
    expect(ubicar("por-cobrar")).toMatchObject({ tab: "por-cobrar", vista: "por-cobrar" });
    // Activos se mudó de Reportes a Movimientos: el atajo tiene que seguirlo.
    expect(ubicar("activos")).toMatchObject({ tab: "movimientos", vista: "activos" });
    for (const atajo of ATAJOS_DEL_MENU) expect(DONDE_VIVE[atajo]).toBeDefined();
  });

  it("las pestañas que ya no existen caen en su contenido, no en Resumen", () => {
    expect(ubicar("resultado")).toMatchObject({ tab: "resultado", vista: "pl" });
    expect(ubicar("caja")).toMatchObject({ tab: "movimientos", vista: "flujo-caja" });
    expect(ubicar("gastos")).toMatchObject({ tab: "movimientos", vista: "gastos" });
    for (const vieja of PESTANAS_VIEJAS) expect(DONDE_VIVE[vieja]).toBeDefined();
  });

  it("el presupuesto vive dentro de Gastos, pero conserva su dirección", () => {
    const donde = ubicar("presupuesto");
    expect(donde).toMatchObject({ tab: "movimientos", vista: "presupuesto", seccion: "gastos" });
  });

  it("«Lo que debo» vive en Por cobrar, pegada a «Todo lo que me deben», y se pliega sin acreedores", () => {
    expect(ubicar("por-pagar")).toMatchObject({ tab: "por-cobrar", vista: "por-pagar", seccion: "por-pagar" });
    const ids = (SECCIONES["por-cobrar"] ?? []).map((s) => s.id);
    expect(ids.indexOf("por-pagar")).toBe(ids.indexOf("por-cobrar") + 1);
    expect(SECCIONES["por-cobrar"]?.find((s) => s.id === "por-pagar")?.dato).toBe("porPagar");
  });

  it("un nombre desconocido cae en Resumen y no rompe", () => {
    expect(ubicar("no-existe")).toMatchObject({ tab: "resumen", vista: "resumen" });
    expect(ubicar(undefined)).toMatchObject({ tab: "resumen", vista: "resumen" });
  });

  it("toda sección declara un dato medible o se muestra siempre", () => {
    const claves = new Set(["tesoreria", "assets", "fiados", "prestamos", "adelantos", "presupuesto", "porPagar"]);
    for (const secciones of Object.values(SECCIONES)) {
      for (const s of secciones ?? []) {
        if (s.dato) expect(claves, `${s.id} pide un dato que nadie mide`).toContain(s.dato);
      }
    }
  });
});
