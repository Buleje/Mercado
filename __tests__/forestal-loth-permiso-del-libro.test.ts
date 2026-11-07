/**
 * El permiso del libro (02-10-2026): el chip de la banda necesita saber si el
 * plan está atado a un permiso del Directorio para que el CTP lo siga.
 */
import { describe, expect, it } from "vitest";
import { cumplePermiso, filtroDeSeleccion, PERMISO_SIN_PLAN } from "@/lib/forestal/loth-filtro-permiso";
import { planDesdeJson } from "@/lib/forestal/loth-tablero-permiso";

describe("planDesdeJson · contratoId", () => {
  it("lee el permiso del Directorio al que está atado el plan", () => {
    expect(planDesdeJson({ id: "p1", contratoId: "c9" })?.contratoId).toBe("c9");
  });
  it("sin permiso atado (o vacío) es null, no cadena vacía", () => {
    expect(planDesdeJson({ id: "p1" })?.contratoId).toBeNull();
    expect(planDesdeJson({ id: "p1", contratoId: "  " })?.contratoId).toBeNull();
  });
});

describe("filtro del libro en la trazabilidad y el mapa (cliente)", () => {
  const lineas = [{ planId: "PO12" }, { planId: "PO13" }, { planId: null }];
  it("un plan elegido deja sólo sus líneas (sin las sin plan)", () => {
    const f = filtroDeSeleccion("PO12");
    expect(lineas.filter((l) => cumplePermiso(l.planId, f))).toEqual([{ planId: "PO12" }]);
  });
  it("«Líneas sin permiso» deja sólo las que no citan plan; «Todos», todas", () => {
    expect(lineas.filter((l) => cumplePermiso(l.planId, filtroDeSeleccion(PERMISO_SIN_PLAN)))).toEqual([{ planId: null }]);
    expect(lineas.filter((l) => cumplePermiso(l.planId, filtroDeSeleccion(null)))).toHaveLength(3);
  });
});
