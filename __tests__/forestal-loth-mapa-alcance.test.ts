/**
 * ADR-462 (02-10-2026): el área y los puntos del mapa del Libro TH, por permiso.
 * Lo puro del lado de la pantalla (`loth-mapa-alcance`) y la regla con la que
 * la DDS EUDR mide cada operación contra el área de SU plan.
 */
import { describe, expect, it } from "vitest";
import {
  alcanceDelPermiso,
  areasDeTodos,
  areaVsDeclarada,
  cartografiaDeTodos,
  claveAlcance,
  featuresDeAreas,
  leerRespuestaCartografia,
  leerRespuestaParcela,
  nombrarAreas,
  planIdDelPut,
  queryCartografia,
  queryParcela,
} from "@/components/admin/forestal/loth-mapa-alcance";
import { areaDeSuPlan, readinessPorPermiso, type AreaEudr } from "@/lib/forestal/loth-eudr-print";
import { PERMISO_SIN_PLAN } from "@/lib/forestal/loth-filtro-permiso";
import type { LatLng, LothParcela } from "@/lib/forestal/loth-geo";
import { fueraDeTodasLasAreas, medirContraSuArea } from "@/components/admin/forestal/hooks/use-loth-mapa-derivados";
import type { GeoEntry } from "@/components/admin/forestal/loth-mapa-shared";

const cuadrado = (lat: number, lng: number, lado = 0.01): LatLng[] => [
  [lat, lng],
  [lat, lng + lado],
  [lat + lado, lng + lado],
  [lat + lado, lng],
];
const parcela = (vertices: LatLng[], deforestacionCero = true): LothParcela => ({ vertices, nota: "", deforestacionCero, updatedAt: null });

describe("alcance del mapa según el permiso de la banda", () => {
  it("fuera del libro es el del negocio; «Todos» es todos; sin permiso, el negocio; un id, ese permiso", () => {
    expect(alcanceDelPermiso(false, "p1")).toEqual({ tipo: "negocio" });
    expect(alcanceDelPermiso(true, null)).toEqual({ tipo: "todos" });
    expect(alcanceDelPermiso(true, PERMISO_SIN_PLAN)).toEqual({ tipo: "negocio" });
    expect(alcanceDelPermiso(true, "p1")).toEqual({ tipo: "plan", planId: "p1" });
  });

  it("cada alcance tiene su clave (el borrador de uno no cae en otro)", () => {
    const claves = [alcanceDelPermiso(true, null), alcanceDelPermiso(true, PERMISO_SIN_PLAN), alcanceDelPermiso(true, "a"), alcanceDelPermiso(true, "b")].map(claveAlcance);
    expect(new Set(claves).size).toBe(4);
  });

  it("el área de un permiso hereda la del negocio; su cartografía NO (el PUT la copiaría entera)", () => {
    const plan = { tipo: "plan" as const, planId: "p 1" };
    expect(queryParcela(plan)).toBe("?planId=p%201");
    expect(queryCartografia(plan)).toBe("?planId=p%201&solo=1");
    expect(queryParcela({ tipo: "todos" })).toBe("?todos=1");
    expect(queryCartografia({ tipo: "negocio" })).toBe("");
    expect(planIdDelPut(plan)).toBe("p 1");
    expect(planIdDelPut({ tipo: "negocio" })).toBeUndefined();
  });
});

describe("respuestas del servidor con «Todos»", () => {
  it("la del negocio va aparte y sólo salen los permisos con área", () => {
    const r = leerRespuestaParcela({
      parcela: parcela(cuadrado(-8, -74)),
      porPermiso: [
        { planId: null, parcela: parcela(cuadrado(-8, -74)) },
        { planId: "p1", parcela: parcela(cuadrado(-9, -75)) },
        { planId: "p2", parcela: parcela([]) },
      ],
    });
    const t = areasDeTodos(r);
    expect(t.negocio.vertices).toHaveLength(4);
    expect(t.otras.map((a) => a.planId)).toEqual(["p1"]);
  });

  it("una respuesta rota no rompe: área vacía y sin permisos", () => {
    const r = leerRespuestaParcela("nada");
    expect(r.parcela.vertices).toEqual([]);
    expect(r.heredada).toBe(false);
    expect(r.porPermiso).toEqual([]);
  });

  it("junta referencias y vías de cada permiso sin duplicar, aunque los ids se repitan entre permisos", () => {
    const ref = (id: string, lat: number) => ({ id, nombre: `R ${lat}`, tipo: "campamento", lat, lng: -74, nota: "" });
    const negocio = { referencias: [ref("ref-1-0", -8)], vias: [], accesos: [], nota: "" };
    const r = leerRespuestaCartografia({
      cartografia: negocio,
      porPermiso: [
        { planId: null, cartografia: negocio },
        { planId: "p1", cartografia: { referencias: [ref("ref-1-0", -9)], vias: [], accesos: [], nota: "" } },
      ],
    });
    const c = cartografiaDeTodos(r);
    expect(c.referencias.map((x) => x.lat)).toEqual([-8, -9]);
  });

  it("la forma real del servidor (principal ya mezclada con `planId` por ítem + porPermiso sin el negocio) no duplica", () => {
    const ref = (id: string, lat: number) => ({ id, nombre: `R ${lat}`, tipo: "campamento", lat, lng: -74, nota: "" });
    const delPlan = { referencias: [ref("ref-1-0", -9)], vias: [], accesos: [], nota: "" };
    const r = leerRespuestaCartografia({
      cartografia: { referencias: [{ ...ref("ref-1-0", -8), planId: null }, { ...ref("ref-1-0", -9), planId: "p1" }], vias: [], accesos: [], nota: "" },
      porPermiso: [{ planId: "p1", cartografia: delPlan }],
    });
    expect(cartografiaDeTodos(r).referencias.map((x) => x.lat)).toEqual([-8, -9]);
  });
});

describe("área dibujada contra la declarada del plan", () => {
  it("dice la diferencia con signo (el ejemplo del ADR)", () => {
    expect(areaVsDeclarada(812, 850).texto).toBe("Dibujada 812 ha · declarada 850 ha · −38 ha");
    expect(areaVsDeclarada(12.5, 12).diferencia).toBe("+0.5 ha");
    expect(areaVsDeclarada(850, 850).diferencia).toBe("igual");
  });

  it("sin área declarada sólo dice la dibujada", () => {
    const r = areaVsDeclarada(812, null);
    expect(r.texto).toBe("Dibujada 812 ha");
    expect(r.delta).toBeNull();
  });
});

describe("nombres y GeoJSON de las áreas", () => {
  it("rotula cada permiso y cierra el anillo del polígono", () => {
    const nombradas = nombrarAreas([{ planId: "p1", parcela: parcela(cuadrado(-9, -75)) }, { planId: "baja", parcela: parcela(cuadrado(-8, -74)) }], { p1: "PLANTACION 096" });
    expect(nombradas.map((a) => a.nombre)).toEqual(["PLANTACION 096", "Permiso dado de baja"]);
    const [f] = featuresDeAreas(nombradas);
    const anillo = (f.geometry as { coordinates: number[][][] }).coordinates[0];
    expect(anillo[0]).toEqual(anillo[anillo.length - 1]);
    expect(f.properties.permiso).toBe("PLANTACION 096");
  });
});

describe("DDS con «Todos»: cada operación contra el área de SU plan", () => {
  const negocio: AreaEudr = { planId: null, nombre: "Negocio", parcela: parcela(cuadrado(-8, -74)) };
  const p1: AreaEudr = { planId: "p1", nombre: "P1", parcela: parcela(cuadrado(-9, -75)) };
  const tala = (planId: string | null, lat: number, lng: number) => ({ planId, section: "tala", lat, lng, cites: false, status: null });

  it("el permiso con área usa la suya; sin área (o sin permiso), la del negocio", () => {
    expect(areaDeSuPlan("p1", [negocio, p1])?.nombre).toBe("P1");
    expect(areaDeSuPlan("p2", [negocio, p1])?.nombre).toBe("Negocio");
    expect(areaDeSuPlan(null, [negocio, p1])?.nombre).toBe("Negocio");
    expect(areaDeSuPlan("p2", [p1])).toBeNull();
  });

  it("una tala de P1 dentro del área del negocio pero fuera de la suya es FUERA", () => {
    const r = readinessPorPermiso(
      [tala("p1", -8.995, -74.995), tala("p1", -7.995, -73.995), tala(null, -7.995, -73.995), tala("p2", -7.995, -73.995)],
      [negocio, p1],
    );
    expect(r.dentro).toBe(3);
    expect(r.fuera).toBe(1);
    expect(r.sinArea).toBe(0);
    expect(r.checks.find((c) => c.key === "dentro")?.ok).toBe(false);
  });

  it("sin área del negocio, la tala de un permiso sin área no se puede verificar", () => {
    const r = readinessPorPermiso([tala("p2", -7.995, -73.995), tala("p1", -8.995, -74.995)], [p1]);
    expect(r.sinArea).toBe(1);
    expect(r.dentro).toBe(1);
    expect(r.checks.find((c) => c.key === "dentro")?.ok).toBe(false);
  });

  it("deforestación cero se pide en TODAS las áreas", () => {
    const sinDeclarar: AreaEudr = { ...p1, parcela: parcela(cuadrado(-9, -75), false) };
    const r = readinessPorPermiso([tala("p1", -8.995, -74.995)], [negocio, sinDeclarar]);
    expect(r.deforestacionCero).toBe(false);
    expect(r.checks.find((c) => c.key === "deforestacion")?.detail).toBe("Falta la declaración en 1 área(s)");
  });
});

describe("el mapa con «Todos» mide como la DDS (ADR-462)", () => {
  const negocio: AreaEudr = { planId: null, nombre: "Negocio", parcela: parcela(cuadrado(-8, -74)) };
  const p1: AreaEudr = { planId: "p1", nombre: "P1", parcela: parcela(cuadrado(-9, -75)) };
  const punto = (planId: string | null, lat: number, lng: number): GeoEntry => ({
    lat, lng, section: "tala", code: "x", species: null, cites: false, volumeM3: null, quantity: null, unit: null, photoUrl: null, date: "2026-10-01", planId,
  });

  it("cada punto contra el área de SU permiso: la misma respuesta que `readinessPorPermiso`", () => {
    const geo = [punto("p1", -8.995, -74.995), punto("p1", -7.995, -73.995), punto(null, -7.995, -73.995), punto("p2", -7.995, -73.995)];
    const medidos = medirContraSuArea(geo, [negocio, p1]).map((g) => g.dentro);
    expect(medidos).toEqual([true, false, true, true]);
    const r = readinessPorPermiso(geo.map((g) => ({ planId: g.planId, section: g.section, lat: g.lat, lng: g.lng, cites: false, status: null })), [negocio, p1]);
    expect(medidos.filter((d) => d === false).length).toBe(r.fuera);
    expect(medidos.filter((d) => d === true).length).toBe(r.dentro);
  });

  it("sin área del negocio, el permiso con área se mide y el que no la tiene queda sin medir (null)", () => {
    const sinNegocio: AreaEudr = { planId: null, nombre: "Negocio", parcela: parcela([]) };
    const medidos = medirContraSuArea([punto("p1", -8.995, -74.995), punto("p2", -7.995, -73.995)], [sinNegocio, p1]).map((g) => g.dentro);
    expect(medidos).toEqual([true, null]);
  });

  it("un árbol (sin permiso conocido) sólo es «fuera» si no cae en NINGUNA área", () => {
    expect(fueraDeTodasLasAreas([-8.995, -74.995], [negocio, p1])).toBe(false);
    expect(fueraDeTodasLasAreas([-20, -60], [negocio, p1])).toBe(true);
    expect(fueraDeTodasLasAreas([-20, -60], [{ ...negocio, parcela: parcela([]) }])).toBe(false);
  });
});
