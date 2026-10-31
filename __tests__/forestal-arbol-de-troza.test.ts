/**
 * ADR-450 L4 — la troza del Libro CTP recuerda su árbol (reglas puras): la
 * frase de la ficha, el estado de las líneas y dónde va en el mapa.
 */
import { describe, expect, it } from "vitest";
import {
  armarArbolDeTroza,
  diaConNombre,
  fraseDelArbol,
  mapaDelArbol,
  zonaDelCenso,
  type CensoDelArbol,
  type TalaDelArbol,
  type TrozadoDelArbol,
} from "@/lib/forestal/arbol-de-troza";
import { toUtm } from "@/lib/forestal/loth-utm";

const trozado = (o: Partial<TrozadoDelArbol> = {}): TrozadoDelArbol => ({
  id: "tz-113a",
  lineNo: 7,
  entryDate: new Date("2026-09-28T12:00:00.000Z"),
  status: "registrado",
  deletedAt: null,
  treeCode: "113",
  trozaCode: "113-A",
  speciesCommon: "Sapotillo",
  speciesScientific: "Quararibea cordata",
  ...o,
});
const tala = (o: Partial<TalaDelArbol> = {}): TalaDelArbol => ({
  id: "tl-113",
  lineNo: 3,
  entryDate: "2026-09-28",
  status: "registrado",
  deletedAt: null,
  gpsLat: -8.3791,
  gpsLng: -74.5539,
  gpsOrigen: "censo",
  ...o,
});
/* Un punto real de Ucayali, llevado a UTM 18S: el censo lo guarda así. */
const utm = toUtm(-8.38, -74.55, 18);
const censo = (o: Partial<CensoDelArbol> = {}): CensoDelArbol => ({
  utmX: Math.round(utm.easting * 100) / 100,
  utmY: Math.round(utm.northing * 100) / 100,
  utmZona: null,
  parcelaCorta: "PC-2",
  condicion: "Aprovechable",
  ...o,
});

describe("fraseDelArbol", () => {
  it("«Salió del árbol 113 · Sapotillo, talado el lunes 28/09»", () => {
    const a = armarArbolDeTroza(trozado(), tala(), censo());
    expect(a && fraseDelArbol(a)).toBe("Salió del árbol 113 · Sapotillo, talado el lunes 28/09");
  });
  it("una tala o un trozado anulados se cuentan como historia, no como hecho vigente", () => {
    const a = armarArbolDeTroza(trozado({ status: "anulado" }), tala({ status: "anulado" }), null);
    expect(a?.tala?.vigente).toBe(false);
    expect(a?.trozado.vigente).toBe(false);
    expect(a && fraseDelArbol(a)).toBe(
      "Salió del árbol 113 · Sapotillo, talado el lunes 28/09 (esa tala se anuló en el Libro TH) · su trozado se anuló en el Libro TH",
    );
  });
  it("sin tala registrada lo dice; sin código de árbol no hay ficha", () => {
    const a = armarArbolDeTroza(trozado(), null, null);
    expect(a && fraseDelArbol(a)).toBe("Salió del árbol 113 · Sapotillo · sin tala en el Libro TH");
    expect(armarArbolDeTroza(trozado({ treeCode: "  " }), tala(), null)).toBeNull();
  });
  it("el día de la semana no depende del ICU", () => {
    expect(diaConNombre("2026-09-29")).toBe("martes 29/09");
    expect(diaConNombre("2026-09-27")).toBe("domingo 27/09");
  });
});

describe("mapaDelArbol — el GPS de la tala primero, si no la UTM del censo", () => {
  it("la tala con GPS manda, aunque el censo tenga UTM", () => {
    expect(mapaDelArbol(tala(), censo())).toEqual({ lat: -8.3791, lng: -74.5539, fuente: "tala" });
  });
  it("sin GPS en la tala, la UTM del censo con la zona supuesta 18S (y se dice)", () => {
    const m = mapaDelArbol(tala({ gpsLat: null, gpsLng: null }), censo());
    expect(m?.fuente).toBe("censo");
    expect(m?.lat).toBeCloseTo(-8.38, 4);
    expect(m?.lng).toBeCloseTo(-74.55, 4);
    const a = armarArbolDeTroza(trozado(), null, censo());
    expect(a?.censo).toMatchObject({ zona: "18S", zonaSupuesta: true, parcela: "PC-2", condicion: "Aprovechable" });
    expect(zonaDelCenso("18 L")).toMatchObject({ zona: "18S", zonaSupuesta: false });
  });
  it("un GPS 0,0 o fuera de rango no es una coordenada; sin nada, no hay mapa", () => {
    expect(mapaDelArbol(tala({ gpsLat: 0, gpsLng: 0 }), null)).toBeNull();
    expect(mapaDelArbol(tala({ gpsLat: 120, gpsLng: -74 }), null)).toBeNull();
    expect(mapaDelArbol(null, censo({ utmX: null }))).toBeNull();
  });
  it("la tala sin GPS igual se cuenta; la ficha dice de dónde salió el GPS cuando lo hay", () => {
    expect(armarArbolDeTroza(trozado(), tala(), null)?.tala?.gps).toEqual({ lat: -8.3791, lng: -74.5539, origen: "censo" });
    expect(armarArbolDeTroza(trozado(), tala({ gpsLat: null }), null)?.tala?.gps).toBeNull();
  });
});
