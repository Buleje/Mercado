/**
 * arbol-de-troza.ts — la troza del Libro CTP recuerda su árbol (ADR-450 L4).
 *
 * En el bosque ya se sabe de qué árbol salió cada troza (Trozado del LO-TH:
 * `treeCode` + `trozaCode`), pero el CTP sólo guardaba el código. Desde
 * ADR-450 la troza guarda el id de su línea de Trozado (`lothTrozadoId`) y una
 * COPIA del código del árbol (`arbolCodigo`, para el acta y para buscar). Lo
 * demás —fecha de tala, GPS, censo— se LEE del Libro TH cada vez, con el
 * estado de su línea: si la tala se anuló, se cuenta como historia, no como
 * hecho vigente (la regla del id pelado, ADR-326 §6).
 *
 * Coordenadas: primero el GPS de la tala (las 4 de Blas lo tienen); si sólo
 * hay UTM del censo, se convierte con la zona del censo o, si el regente no la
 * escribió (Blas: vacía en los 4 árboles), con la 18S — y se dice que es
 * supuesta.
 *
 * PURO y client-safe.
 */

import { fromUtm, parseUtmZone, zoneLabel } from "./loth-utm";

/** La zona que se supone cuando el censo no la dice: Ucayali y Pasco caen en la 18 Sur. */
export const ZONA_UTM_SUPUESTA = "18S";

/** Una línea del Libro TH (Trozado o Tala), tal como la lee la DB class. */
export interface LineaThDelArbol {
  id: string;
  lineNo: number;
  entryDate: Date | string;
  status: string;
  deletedAt: Date | string | null;
}

export interface TrozadoDelArbol extends LineaThDelArbol {
  treeCode: string | null;
  trozaCode: string | null;
  speciesCommon: string | null;
  speciesScientific: string | null;
}

export interface TalaDelArbol extends LineaThDelArbol {
  gpsLat: number | null;
  gpsLng: number | null;
  /** telefono | censo | utm (de dónde salió el GPS de la tala). */
  gpsOrigen: string | null;
}

export interface CensoDelArbol {
  utmX: number | null;
  utmY: number | null;
  utmZona: string | null;
  parcelaCorta: string | null;
  condicion: string | null;
  speciesCommon?: string | null;
  speciesScientific?: string | null;
}

/** Lo que la ficha y la tarjeta de la troza muestran en «Del bosque». */
export interface ArbolDeTroza {
  arbolCodigo: string;
  especie: string | null;
  cientifico: string | null;
  trozado: { id: string; lineNo: number; fecha: string; vigente: boolean };
  tala: {
    id: string;
    lineNo: number;
    fecha: string;
    vigente: boolean;
    gps: { lat: number; lng: number; origen: string | null } | null;
  } | null;
  censo: {
    utmX: number | null;
    utmY: number | null;
    /** La zona con que se lee la UTM («18S»). */
    zona: string;
    /** El censo no traía zona: se usó la 18S. */
    zonaSupuesta: boolean;
    parcela: string | null;
    condicion: string | null;
  } | null;
  /** Dónde pintarlo en el mapa del bosque; `null` = no hay coordenada. */
  mapa: { lat: number; lng: number; fuente: "tala" | "censo" } | null;
}

/** `AAAA-MM-DD` de una fecha del libro (se guarda sin hora: se lee en UTC). */
const dia = (d: Date | string): string => (d instanceof Date ? d.toISOString() : String(d)).slice(0, 10);

/** Una línea VIGENTE: registrada y no borrada. El id pelado no alcanza. */
export const lineaVigente = (l: Pick<LineaThDelArbol, "status" | "deletedAt">): boolean =>
  l.status === "registrado" && !l.deletedAt;

const coordenadaValida = (lat: number | null, lng: number | null): lat is number =>
  lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

/** La UTM del censo con su zona, o la supuesta si no la dice. */
export function zonaDelCenso(utmZona: string | null | undefined): { zona: string; zonaSupuesta: boolean; zone: number; south: boolean } {
  const escrita = (utmZona ?? "").trim();
  const { zone, south } = parseUtmZone(escrita || ZONA_UTM_SUPUESTA);
  return { zona: zoneLabel(zone, south), zonaSupuesta: !escrita, zone, south };
}

/** Dónde va el árbol en el mapa: el GPS de la tala primero, si no la UTM del censo. */
export function mapaDelArbol(
  tala: Pick<TalaDelArbol, "gpsLat" | "gpsLng"> | null,
  censo: Pick<CensoDelArbol, "utmX" | "utmY" | "utmZona"> | null,
): ArbolDeTroza["mapa"] {
  if (tala && coordenadaValida(tala.gpsLat, tala.gpsLng)) {
    return { lat: tala.gpsLat, lng: tala.gpsLng as number, fuente: "tala" };
  }
  if (censo && censo.utmX != null && censo.utmY != null && censo.utmX > 0 && censo.utmY > 0) {
    const z = zonaDelCenso(censo.utmZona);
    const [lat, lng] = fromUtm(censo.utmX, censo.utmY, z.zone, z.south);
    if (coordenadaValida(lat, lng)) return { lat: Math.round(lat * 1e7) / 1e7, lng: Math.round(lng * 1e7) / 1e7, fuente: "censo" };
  }
  return null;
}

/**
 * La ficha del árbol de una troza, a partir de su línea de Trozado, la Tala
 * de ese árbol y su fila del censo (las tres ya elegidas por la DB class).
 * `null` si la línea de Trozado no dice de qué árbol es.
 */
export function armarArbolDeTroza(
  trozado: TrozadoDelArbol,
  tala: TalaDelArbol | null,
  censo: CensoDelArbol | null,
): ArbolDeTroza | null {
  const arbolCodigo = trozado.treeCode?.trim();
  if (!arbolCodigo) return null;
  const zona = censo ? zonaDelCenso(censo.utmZona) : null;
  return {
    arbolCodigo,
    especie: trozado.speciesCommon?.trim() || censo?.speciesCommon?.trim() || null,
    cientifico: trozado.speciesScientific?.trim() || censo?.speciesScientific?.trim() || null,
    trozado: { id: trozado.id, lineNo: trozado.lineNo, fecha: dia(trozado.entryDate), vigente: lineaVigente(trozado) },
    tala: tala
      ? {
          id: tala.id,
          lineNo: tala.lineNo,
          fecha: dia(tala.entryDate),
          vigente: lineaVigente(tala),
          gps: coordenadaValida(tala.gpsLat, tala.gpsLng)
            ? { lat: tala.gpsLat, lng: tala.gpsLng as number, origen: tala.gpsOrigen?.trim() || null }
            : null,
        }
      : null,
    censo:
      censo && zona
        ? {
            utmX: censo.utmX,
            utmY: censo.utmY,
            zona: zona.zona,
            zonaSupuesta: zona.zonaSupuesta,
            parcela: censo.parcelaCorta?.trim() || null,
            condicion: censo.condicion?.trim() || null,
          }
        : null,
    mapa: mapaDelArbol(tala, censo),
  };
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;

/** «lunes 28/09»: el día de la semana sin depender del ICU del navegador. */
export function diaConNombre(fecha: string): string {
  const d = new Date(`${fecha.slice(0, 10)}T12:00:00.000Z`);
  if (!Number.isFinite(d.getTime())) return fecha;
  return `${DIAS[d.getUTCDay()]} ${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`;
}

/** «Salió del árbol 113 · Sapotillo, talado el lunes 28/09». Una línea anulada se dice. */
export function fraseDelArbol(a: ArbolDeTroza): string {
  let s = `Salió del árbol ${a.arbolCodigo}${a.especie ? ` · ${a.especie}` : ""}`;
  if (a.tala) {
    s += `, talado el ${diaConNombre(a.tala.fecha)}`;
    if (!a.tala.vigente) s += " (esa tala se anuló en el Libro TH)";
  } else {
    s += " · sin tala en el Libro TH";
  }
  if (!a.trozado.vigente) s += " · su trozado se anuló en el Libro TH";
  return s;
}
