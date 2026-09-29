/**
 * loth-imagenes — la parte pura de las imágenes recientes del mapa del Libro
 * TH: leer el catálogo de Sentinel-2 (respuesta REAL guardada del 29-09 sobre
 * Blas), medir nubes con la capa SCL, elegir la escena, armar las URLs de las
 * teselas y el «hoy» de Lima con respaldo a ayer.
 */

import { describe, expect, it } from "vitest";
import fixture from "./fixtures/loth-imagenes-blas-2026-09-29.json";
import {
  agruparPorFecha,
  cuerpoBusquedaStac,
  diasLima,
  elegirColorReal,
  elegirEscena,
  etiquetaEscena,
  fechaCorta,
  itemQueMasCubre,
  normalizarImagenes,
  nubesDesdeScl,
  parseMetadatosEsri,
  parseRespuestaStac,
  teselaDe,
  urlColorReal,
  urlTeselasS2,
  VERSION_IMAGENES,
  type EscenaS2,
  type ImagenesDelArea,
} from "@/lib/forestal/loth-imagenes";

const escena = (fecha: string, nubesCuadroPct: number, nubesAreaPct: number | null = null, coberturaPct: number | null = null): EscenaS2 => ({
  fecha,
  items: [{ id: `S2_${fecha}`, bbox: [-75, -10.04, -74, -9.04] }],
  nubesCuadroPct,
  nubesAreaPct,
  coberturaPct,
});

describe("catálogo de Sentinel-2 (respuesta real de Planetary Computer)", () => {
  it("lee las 6 escenas guardadas, de la más nueva a la más vieja", () => {
    const items = parseRespuestaStac(fixture.stac);
    expect(items).not.toBeNull();
    expect(items!.map((i) => i.datetime.slice(0, 10))).toEqual(["2026-09-26", "2026-09-23", "2026-09-21", "2026-09-16", "2026-09-13", "2026-09-11"]);
    expect(items![1]).toMatchObject({ id: "S2A_MSIL2A_20260923T151931_R125_T18LWQ_20260923T231509", bbox: [-75.0001825, -10.0393213, -73.9996141, -9.0448399] });
    expect(items![1].nubesPct).toBeCloseTo(16.03, 1);
  });

  it("una respuesta que no es un catálogo da null (aviso), y un cuadro roto se salta sin tirar a los demás", () => {
    expect(parseRespuestaStac({ error: "boom" })).toBeNull();
    expect(parseRespuestaStac("<html>502</html>")).toBeNull();
    const conRoto = { features: [{ id: "x" }, ...fixture.stac.features.slice(0, 1)] };
    expect(parseRespuestaStac(conRoto)).toHaveLength(1);
  });

  it("dos cuadros del mismo día son UNA pasada, con las nubes del peor", () => {
    const e = agruparPorFecha([
      { id: "A", datetime: "2026-09-23T15:19:31Z", nubesPct: 16, bbox: [-75, -10, -74, -9] },
      { id: "B", datetime: "2026-09-23T15:19:35Z", nubesPct: 40, bbox: [-76, -10, -75, -9] },
      { id: "C", datetime: "2026-09-26T15:17:19Z", nubesPct: 88, bbox: [-75, -10, -74, -9] },
    ]);
    expect(e.map((x) => x.fecha)).toEqual(["2026-09-26", "2026-09-23"]);
    expect(e[1].items.map((i) => i.id)).toEqual(["A", "B"]);
    expect(e[1].nubesCuadroPct).toBe(40);
  });

  it("el pedido va con el recuadro del servidor y los últimos 90 días", () => {
    const c = cuerpoBusquedaStac({ sur: -9.81, oeste: -74.82, norte: -9.77, este: -74.78 }, "2026-09-29T19:00:00.000Z");
    expect(c.bbox).toEqual([-74.82, -9.81, -74.78, -9.77]);
    expect(c.datetime).toBe("2026-07-01T19:00:00.000Z/2026-09-29T19:00:00.000Z");
    expect(c.sortby[0]).toEqual({ field: "datetime", direction: "desc" });
  });
});

describe("nubes sobre el área (capa SCL)", () => {
  it("la escena del 23-09 en un recuadro de 4×4 km sobre Blas: el cuadro dice 16 %, el recuadro está tapado un 33 %", () => {
    const r = nubesDesdeScl(fixture.scl);
    expect(r).not.toBeNull();
    // (5 798 sombra de nube + 6 772 nube media + 3 529 nube alta) / 49 062 píxeles
    expect(r!.nubesPct).toBeCloseTo(32.8, 1);
    expect(r!.coberturaPct).toBe(100);
    expect(r!.pixeles).toBe(49062);
  });

  it("la sombra de la nube cuenta como tapado: no se ve el monte debajo", () => {
    const soloSombra = nubesDesdeScl({ properties: { statistics: { SCL_b1: { histogram: [[90, 10], [4, 3]], valid_percent: 100 } } } });
    expect(soloSombra!.nubesPct).toBeCloseTo(10, 5);
    // La zona oscura por relieve (clase 2) NO es nube.
    const relieve = nubesDesdeScl({ properties: { statistics: { SCL_b1: { histogram: [[90, 10], [4, 2]], valid_percent: 100 } } } });
    expect(relieve!.nubesPct).toBe(0);
  });

  it("los píxeles sin dato (clase 0) no cuentan como vistos y achican la cobertura", () => {
    const r = nubesDesdeScl({ properties: { statistics: { SCL_b1: { histogram: [[50, 40, 10], [0, 4, 9]], valid_percent: 100 } } } });
    expect(r!.nubesPct).toBeCloseTo(20, 5);
    expect(r!.coberturaPct).toBeCloseTo(50, 5);
  });

  it("una respuesta rota da null", () => {
    expect(nubesDesdeScl({ detail: "Not Found" })).toBeNull();
  });
});

describe("qué escena se muestra de entrada", () => {
  it("la más nueva con hasta 30 % de nubes (Blas: el 26-09 tiene 88 %, va el 23-09)", () => {
    const escenas = agruparPorFecha(parseRespuestaStac(fixture.stac)!);
    expect(elegirEscena(escenas)?.fecha).toBe("2026-09-23");
  });

  it("las nubes medidas sobre el área mandan sobre las del cuadro", () => {
    const e = [escena("2026-09-26", 10, 70), escena("2026-09-23", 45, 12)];
    expect(elegirEscena(e)?.fecha).toBe("2026-09-23");
  });

  it("una pasada que corta el área (cubre < 60 %) no es la sugerida", () => {
    const e = [escena("2026-09-26", 5, 2, 30), escena("2026-09-21", 20, 20, 100)];
    expect(elegirEscena(e)?.fecha).toBe("2026-09-21");
  });

  it("si ninguna llega a 30 %, la de menos nubes; sin escenas, null", () => {
    const e = [escena("2026-09-26", 88), escena("2026-09-23", 55), escena("2026-09-21", 41)];
    expect(elegirEscena(e)?.fecha).toBe("2026-09-21");
    expect(elegirEscena([])).toBeNull();
  });

  it("la etiqueta del selector dice fecha y nubes, y avisa cuando es el % del cuadro", () => {
    expect(etiquetaEscena(escena("2026-09-23", 16.03))).toBe("23 set · 16 % nubes (cuadro)");
    expect(etiquetaEscena(escena("2026-09-23", 16, 21.4, 100))).toBe("23 set · 21 % nubes");
    expect(etiquetaEscena(escena("2026-09-23", 16, 5, 40))).toBe("23 set · 5 % nubes · cubre 40 %");
    expect(fechaCorta("2026-09-23")).toBe("23 set 2026");
  });
});

describe("URLs de las teselas", () => {
  it("Sentinel-2: la plantilla probada (200, PNG 256, 10 m)", () => {
    expect(urlTeselasS2("S2A_MSIL2A_20260923T151931_R125_T18LWQ_20260923T231509")).toBe(
      "https://planetarycomputer.microsoft.com/api/data/v1/item/tiles/WebMercatorQuad/{z}/{x}/{y}@1x.png?collection=sentinel-2-l2a&item=S2A_MSIL2A_20260923T151931_R125_T18LWQ_20260923T231509&assets=visual&asset_bidx=visual%7C1%2C2%2C3&nodata=0",
    );
  });

  it("GIBS color real: fecha en la ruta y {z}/{y}/{x} (fila antes que columna)", () => {
    expect(urlColorReal("VIIRS_NOAA20_CorrectedReflectance_TrueColor", "2026-09-28")).toBe(
      "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/VIIRS_NOAA20_CorrectedReflectance_TrueColor/default/2026-09-28/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg",
    );
  });

  it("la tesela de la sonda sobre Blas a zoom 7 es la 37/67 (la probada)", () => {
    expect(teselaDe(-9.79, -74.8, 7)).toEqual({ x: 37, y: 67 });
  });
});

describe("hoy en Lima, con respaldo a ayer", () => {
  it("a las 21:00 de Pucallpa el UTC ya es mañana, pero hoy sigue siendo hoy", () => {
    expect(diasLima("2026-09-30T02:00:00Z")).toEqual({ hoy: "2026-09-29", ayer: "2026-09-28" });
    expect(diasLima("2026-09-29T12:00:00Z")).toEqual({ hoy: "2026-09-29", ayer: "2026-09-28" });
  });

  it("hoy sin imagen de ningún satélite → la de ayer; con imagen → la de hoy", () => {
    const dias = { hoy: "2026-09-29", ayer: "2026-09-28" };
    const ayer = { "2026-09-28": { VIIRS_NOAA20_CorrectedReflectance_TrueColor: true } };
    expect(elegirColorReal(dias, ayer)).toEqual({ capa: "VIIRS_NOAA20_CorrectedReflectance_TrueColor", satelite: "NOAA-20", fecha: "2026-09-28" });
    const hoy = { ...ayer, "2026-09-29": { VIIRS_SNPP_CorrectedReflectance_TrueColor: true } };
    expect(elegirColorReal(dias, hoy)?.fecha).toBe("2026-09-29");
    expect(elegirColorReal(dias, {})).toBeNull();
  });
});

describe("de cuándo es la foto de Esri (respuesta real)", () => {
  it("sobre Blas: 18 jun 2022, WorldView-2 a 0,5 m", () => {
    expect(parseMetadatosEsri(fixture.esri)).toEqual({ fecha: "2022-06-18", resolucionM: 0.5, sensor: "WV02", proveedor: "Vantor" });
  });

  it("sin foto en el punto o respuesta de error: null", () => {
    expect(parseMetadatosEsri({ features: [] })).toBeNull();
    expect(parseMetadatosEsri({ error: { code: 400 } })).toBeNull();
  });
});

describe("caché", () => {
  it("lo guardado vuelve igual; lo roto da null", () => {
    const img: ImagenesDelArea = {
      version: VERSION_IMAGENES,
      bbox: { sur: -9.81, oeste: -74.82, norte: -9.77, este: -74.78 },
      consultadoAt: "2026-09-29T19:00:00.000Z",
      escenas: [escena("2026-09-23", 16, 21, 100)],
      sugerida: "2026-09-23",
      esri: { fecha: "2022-06-18", resolucionM: 0.5, sensor: "WV02", proveedor: "Vantor" },
      vivas: { colorReal: null, focos: { fechas: ["2026-09-28", "2026-09-29"] }, miradoAt: "2026-09-29T19:00:00.000Z" },
    };
    expect(normalizarImagenes(JSON.parse(JSON.stringify(img)))).toEqual(img);
    expect(normalizarImagenes({ bbox: 1 })).toBeNull();
    // Medida con otra fórmula (sin versión = la del 29-09 temprano, sin la sombra): se descarta.
    const { version: _v, ...vieja } = img;
    void _v;
    expect(normalizarImagenes(JSON.parse(JSON.stringify(vieja)))).toBeNull();
  });
});

describe("recorte PNG de una pasada con dos cuadros", () => {
  const izq = { id: "T18LWR", bbox: [-75, -9, -74.05, -8] as [number, number, number, number] };
  const der = { id: "T18LXR", bbox: [-74.1, -9, -73, -8] as [number, number, number, number] };
  const vista = (lngMin: number, lngMax: number) => ({ latMin: -8.6, latMax: -8.4, lngMin, lngMax });

  it("pide el cuadro que más cubre la vista, no el primero de la lista", () => {
    expect(itemQueMasCubre([izq, der], vista(-74.0, -73.9)).id).toBe("T18LXR");
    expect(itemQueMasCubre([izq, der], vista(-74.9, -74.8)).id).toBe("T18LWR");
  });
  it("si ninguno toca la vista, el primero", () => {
    expect(itemQueMasCubre([izq, der], vista(-60, -59)).id).toBe("T18LWR");
  });
});
