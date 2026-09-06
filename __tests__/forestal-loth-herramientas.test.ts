/**
 * Herramientas del mapa del Libro TH: la cinta métrica (`loth-medicion`) y el
 * archivo histórico satelital (`loth-wayback`), que es la evidencia visual de
 * "deforestación cero posterior al 31-dic-2020" que exige el EUDR.
 */
import { describe, expect, it } from "vitest";
import { formatArea, medir } from "@/lib/forestal/loth-medicion";
import {
  EUDR_CUTOFF,
  esAnteriorAlCorte,
  parseWaybackConfig,
  releaseParaFecha,
  releasesPorAnio,
} from "@/lib/forestal/loth-wayback";
import type { LatLng } from "@/lib/forestal/loth-geo";

describe("medición de distancia", () => {
  it("suma los tramos con su azimut", () => {
    const r = medir(
      [
        [-9, -75],
        [-9, -74.99],
        [-8.99, -74.99],
      ],
      "distancia",
    );
    expect(r.tramos).toHaveLength(2);
    expect(r.tramos[0].largoM).toBeGreaterThan(1_090); // 0,01° de lng en lat −9
    expect(r.tramos[0].azimut).toBeCloseTo(90, 0); // hacia el este
    expect(r.tramos[1].azimut).toBeCloseTo(0, 0); // hacia el norte
    expect(r.totalM).toBeCloseTo(r.tramos[1].acumuladoM, 1);
    expect(r.areaHa).toBeNull();
  });

  it("con un solo punto guía en vez de mostrar cero", () => {
    const r = medir([[-9, -75]], "distancia");
    expect(r.totalM).toBe(0);
    expect(r.resumen).toContain("tocá otro");
  });

  it("sin puntos invita a empezar", () => {
    expect(medir([], "distancia").resumen).toContain("Tocá el mapa");
  });
});

describe("medición de área", () => {
  const cuadra: LatLng[] = [
    [-9, -75],
    [-9, -74.99],
    [-9.01, -74.99],
    [-9.01, -75],
  ];

  it("cierra el anillo solo y da área + perímetro", () => {
    const r = medir(cuadra, "area");
    // ~1,10 km × 1,11 km ≈ 122 ha
    expect(r.areaHa).toBeGreaterThan(110);
    expect(r.areaHa).toBeLessThan(130);
    expect(r.tramos).toHaveLength(4); // incluye el tramo de cierre
    expect(r.totalM).toBeGreaterThan(4_300);
    expect(r.resumen).toContain("perímetro");
  });

  it("avisa cuántos puntos faltan para cerrar", () => {
    const r = medir(cuadra.slice(0, 2), "area");
    expect(r.areaHa).toBeNull();
    expect(r.resumen).toContain("faltan 1");
  });

  it("las superficies chicas se leen en m², no en hectáreas", () => {
    expect(formatArea(0.03)).toContain("m²");
    expect(formatArea(5.5)).toContain("ha");
  });
});

describe("archivo histórico satelital (Wayback)", () => {
  const config = {
    "10": { itemTitle: "World Imagery (Wayback 2014-02-20)", itemURL: "https://x/tile/10/{level}/{row}/{col}" },
    "119": { itemTitle: "World Imagery (Wayback 2020-10-14)", itemURL: "https://x/tile/119/{level}/{row}/{col}" },
    "6543": { itemTitle: "World Imagery (Wayback 2025-03-27)", itemURL: "https://x/tile/6543/{level}/{row}/{col}" },
    roto: { itemTitle: "sin fecha", itemURL: "https://x" },
    sinUrl: { itemTitle: "World Imagery (Wayback 2019-01-01)" },
  };

  it("normaliza el catálogo y traduce la plantilla a la de Leaflet", () => {
    const rs = parseWaybackConfig(config);
    expect(rs).toHaveLength(3); // descarta la rota y la que no tiene URL
    expect(rs[0].fecha).toBe("2025-03-27"); // ordenado de nuevo a viejo
    expect(rs[0].urlTemplate).toContain("{z}/{y}/{x}");
    expect(rs[0].label).toBe("27 mar 2025");
  });

  it("elige la última versión ANTERIOR al corte EUDR", () => {
    const rs = parseWaybackConfig(config);
    const r = releaseParaFecha(rs, EUDR_CUTOFF);
    expect(r?.fecha).toBe("2020-10-14");
    expect(esAnteriorAlCorte(r!)).toBe(true);
  });

  it("si el catálogo arranca después del corte, devuelve la más vieja (nunca una fecha inventada)", () => {
    const rs = parseWaybackConfig({ "1": { itemTitle: "World Imagery (Wayback 2023-01-01)", itemURL: "u/{level}/{row}/{col}" } });
    const r = releaseParaFecha(rs, EUDR_CUTOFF);
    expect(r?.fecha).toBe("2023-01-01");
    expect(esAnteriorAlCorte(r!)).toBe(false); // y se puede avisar que NO sirve de "antes"
  });

  it("una versión por año para el selector", () => {
    const rs = parseWaybackConfig({
      ...config,
      "200": { itemTitle: "World Imagery (Wayback 2020-02-20)", itemURL: "u/{level}/{row}/{col}" },
    });
    const porAnio = releasesPorAnio(rs);
    expect(porAnio.map((r) => r.fecha.slice(0, 4))).toEqual(["2025", "2020"]);
    expect(porAnio[1].fecha).toBe("2020-10-14"); // la más reciente del año
  });

  it("tolera basura sin romperse", () => {
    expect(parseWaybackConfig(null)).toHaveLength(0);
    expect(releaseParaFecha([], EUDR_CUTOFF)).toBeNull();
  });
});
