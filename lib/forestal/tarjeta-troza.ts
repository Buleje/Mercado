/**
 * tarjeta-troza.ts — lo que dice la tarjeta de una troza al escanear su QR
 * chico (`/admin/q/<id>`), en piezas que la pantalla sólo pinta.
 *
 * Brandon (2026-09-26): «quiero que el texto sea tipo formato imagen, bien
 * presentado». La tarjeta es la troza de un vistazo: código, especie, medidas
 * grandes, dónde está y de qué papeles viene. La historia completa (corrida,
 * despacho, pedazos) sigue siendo la ficha del libro, a un toque.
 *
 * Todo sale de `/api/admin/forestal/trozas/ficha` (la misma lectura que la
 * ficha del libro y el escáner), así que la tarjeta y el libro no pueden
 * contar dos historias distintas de la misma pieza.
 *
 * PURO y client-safe.
 */

import { formatNumber } from "@/lib/format";
import { fmtM3, fmtPt } from "./cubicacion-formato";
import { pieTablarAserrableDe } from "./cubicacion";
import { RENDIMIENTO_META } from "./loctp-catalogos";
import { guiaRecibida, type TrozaConsumible } from "./consumo-trozas";
import { consumibleDeFicha, type FichaTrozaJson } from "./leer-escaneo-troza";
import { motivoFueraDeLaPila } from "./lote-por-escaneo";
import { normalizarFotos, type FotoCarga } from "./fotos-carga";
import { diaConNombre, type ArbolDeTroza } from "./arbol-de-troza";

/** La ficha como la devuelve el endpoint, con lo que la tarjeta lee de más. */
export interface FichaTrozaTarjeta extends FichaTrozaJson {
  troza: FichaTrozaJson["troza"] & {
    dimensiones?: string | null;
    /** Cubicación Oxapampa (2026-09-26): pt congelado al guardar y sus medidas. */
    oxPt?: number | null;
    oxD1Pulg?: number | null;
    oxD2Pulg?: number | null;
    oxLargoPies?: number | null;
    /** D1/D2 los tomó la planta porque la guía no los traía. */
    d1d2MedidoEnPlanta?: boolean | null;
    /** ADR-450: lo medido en planta al recibirla contando; `null` = llegó como dice la guía. */
    recibida?: MedidaEnPlanta | null;
  };
  ingreso: FichaTrozaJson["ingreso"] & {
    status?: string | null;
    /** Crudo del endpoint; se lee con `fotosDeTarjeta`. */
    fotos?: unknown;
  };
  lote?: { id: string; code: string; status?: string | null } | null;
  corrida?: { id: string; vigente: boolean; lineNo?: number | null; entryDate?: string | null } | null;
  despacho?: {
    id: string;
    vigente: boolean;
    lineNo?: number | null;
    entryDate?: string | null;
    gtfNumber?: string | null;
  } | null;
  /** ADR-450 L4: «Del bosque», leído del Libro TH con el estado de sus líneas. */
  arbol?: ArbolDeTroza | null;
}

/** Lo que midió la planta al recibir una troza que llegó distinta (ADR-450). */
export interface MedidaEnPlanta {
  d1Cm: number | null;
  d2Cm: number | null;
  largoM: number | null;
  volumenM3: number | null;
}

/** ¿La pieza está en el patio según el libro? El MISMO criterio del patio (ADR-339). */
export function trozaRecibida(f: FichaTrozaTarjeta): boolean {
  return guiaRecibida({
    estado: f.ingreso.status ?? null,
    fechaRecepcionGuia: f.ingreso.fechaRecepcion ?? null,
    fechaRecepcionTroza: f.troza.fechaRecepcion ?? null,
  });
}

/** La ficha en la forma que leen las reglas del patio, con la recepción resuelta. */
export function consumibleDeTarjeta(f: FichaTrozaTarjeta): TrozaConsumible {
  return { ...consumibleDeFicha(f), guiaRecepcionada: trozaRecibida(f) };
}

/**
 * Por qué NO se puede armar un lote con esta pieza, o `null` si se puede. La
 * MISMA regla que la pila del escáner: ofrecer el botón para una pieza que la
 * pila rechaza sería un botón que miente.
 */
export function motivoSinLote(f: FichaTrozaTarjeta): string | null {
  return motivoFueraDeLaPila(consumibleDeTarjeta(f));
}

export type TonoEstado = "ok" | "info" | "warn" | "neutral";

export interface EstadoTroza {
  clave:
    | "despachada"
    | "aserrada"
    | "cortada"
    | "descarte"
    | "no_llego"
    | "en_lote"
    | "sin_recibir"
    | "en_patio";
  /** Lo que dice la pastilla: corto, se lee de lejos. */
  texto: string;
  tono: TonoEstado;
}

/**
 * Dónde está la pieza HOY. El orden importa: lo que la sacó del patio manda
 * sobre lo que la apartó (una troza de un lote que ya se aserró está aserrada,
 * no «en el lote»). Una corrida o despacho ANULADO no cuenta: la madera volvió.
 */
export function estadoDeTroza(f: FichaTrozaTarjeta): EstadoTroza {
  if (f.despacho?.vigente) return { clave: "despachada", texto: "Despachada entera", tono: "neutral" };
  if (f.corrida?.vigente) return { clave: "aserrada", texto: "Aserrada", tono: "neutral" };
  const pedazos = f.retrozos?.length ?? 0;
  if (pedazos > 0) {
    return { clave: "cortada", texto: `Cortada en ${pedazos} ${pedazos === 1 ? "pedazo" : "pedazos"}`, tono: "info" };
  }
  if (f.troza.descarte) return { clave: "descarte", texto: "Descarte", tono: "warn" };
  if (f.troza.noRecepcionada) return { clave: "no_llego", texto: "No bajó del camión", tono: "warn" };
  if (f.lote) return { clave: "en_lote", texto: `En el lote ${f.lote.code}`, tono: "info" };
  if (!trozaRecibida(f)) return { clave: "sin_recibir", texto: "Guía sin recibir", tono: "warn" };
  return { clave: "en_patio", texto: "En el patio", tono: "ok" };
}

/** Una medida grande de la tarjeta: rótulo, número y unidad. `valor` «—» = no se midió. */
export interface MedidaTarjeta {
  clave: "d1" | "d2" | "largo";
  rotulo: string;
  valor: string;
  unidad: string;
  medida: boolean;
}

const finito = (v: number | null | undefined): v is number => v != null && Number.isFinite(Number(v));

/**
 * D1, D2 y largo SIEMPRE, cada uno en su casillero (Brandon, 2026-09-26). Con el
 * mismo redondeo que la etiqueta (`partesDeMedidas` de `ficha-texto-troza.ts`:
 * cm a 1 decimal como máximo, metros a 2), para que el papel pegado en la madera
 * y la pantalla digan el mismo número. Un test los compara.
 */
export function medidasDeTarjeta(
  t: Pick<TrozaConsumible, "d1Cm" | "d2Cm" | "largoM">,
): [MedidaTarjeta, MedidaTarjeta, MedidaTarjeta] {
  const cm = (v: number | null | undefined) => (finito(v) ? formatNumber(Number(v), { max: 1 }) : null);
  const d1 = cm(t.d1Cm);
  const d2 = cm(t.d2Cm);
  const largo = finito(t.largoM) ? formatNumber(Number(t.largoM), 2) : null;
  return [
    { clave: "d1", rotulo: "D1", valor: d1 ?? "—", unidad: "cm", medida: d1 != null },
    { clave: "d2", rotulo: "D2", valor: d2 ?? "—", unidad: "cm", medida: d2 != null },
    { clave: "largo", rotulo: "Largo", valor: largo ?? "—", unidad: "m", medida: largo != null },
  ];
}

/**
 * El pie tablar de la tarjeta. Primero el que se paga: el PT Oxapampa medido en
 * el patio y congelado por el servidor. Si la pieza no se cubicó así, el pt
 * aserrable ESTIMADO (m³ × 56 % × 424), rotulado como tal: `pieTablarDe` (× 424
 * a secas) es para madera ya aserrada y daba casi el doble.
 */
export type PtDeTarjeta =
  | { tipo: "oxapampa"; valor: string; medidas: string | null }
  | { tipo: "aserrable"; valor: string }
  | null;

export function ptDeTarjeta(t: FichaTrozaTarjeta["troza"]): PtDeTarjeta {
  if (finito(t.oxPt) && Number(t.oxPt) > 0) {
    const pulg = (v: number | null | undefined) => (finito(v) ? `${formatNumber(Number(v), { max: 1 })}″` : "—");
    const hay = finito(t.oxD1Pulg) || finito(t.oxD2Pulg) || finito(t.oxLargoPies);
    const medidas = hay
      ? `${pulg(t.oxD1Pulg)} · ${pulg(t.oxD2Pulg)} · ${finito(t.oxLargoPies) ? `${formatNumber(Number(t.oxLargoPies), { max: 1 })}′` : "—"}`
      : null;
    return { tipo: "oxapampa", valor: fmtPt(Number(t.oxPt)), medidas };
  }
  if (finito(t.volumenM3) && Number(t.volumenM3) > 0) {
    return { tipo: "aserrable", valor: fmtPt(pieTablarAserrableDe(Number(t.volumenM3), RENDIMIENTO_META)) };
  }
  return null;
}

/** «1,606» (tres decimales siempre, como el acta) o «—». */
export function m3DeTarjeta(t: Pick<TrozaConsumible, "volumenM3">): string {
  return finito(t.volumenM3) ? fmtM3(Number(t.volumenM3)) : "—";
}

/** Las fotos de la carga de su guía, limpias. */
export function fotosDeTarjeta(f: FichaTrozaTarjeta): FotoCarga[] {
  return normalizarFotos(f.ingreso.fotos);
}

// ── Del bosque (ADR-450 L4) ─────────────────────────────────────────────────

/** El módulo del Libro TH y su mapa (mismo id que `loth-mapa-tala-url`). */
const LOTH_TAB = "loth-libro-operaciones";
/** El parámetro con que el Libro TH abre el mapa centrado en un árbol. */
export const PARAM_ARBOL = "arbol";

/** «Ver en el mapa del bosque»: el mapa del Libro TH, parado en ESE árbol. */
export function urlDelArbolEnElMapa(codigo: string, pathname = "/admin"): string {
  const q = new URLSearchParams({ tab: LOTH_TAB, vista: "mapa", [PARAM_ARBOL]: codigo });
  return `${pathname}?${q.toString()}`;
}

/** Un renglón del bloque «Del bosque». `aviso` = se cuenta como historia (algo se anuló o se supuso). */
export interface RenglonDelBosque {
  rotulo: string;
  valor: string;
  aviso?: boolean;
}

/** De dónde salió el punto del mapa, en palabras del monte. */
function ubicacion(a: ArbolDeTroza): RenglonDelBosque {
  if (a.mapa?.fuente === "tala") {
    const origen = a.tala?.gps?.origen;
    const valor =
      origen === "telefono" ? "GPS del teléfono al talar"
      : origen === "censo" ? "GPS copiado del censo al talar"
      : origen === "utm" ? "UTM anotada al talar"
      : "GPS de la tala";
    return { rotulo: "Ubicación", valor };
  }
  if (a.mapa?.fuente === "censo" && a.censo) {
    return a.censo.zonaSupuesta
      ? { rotulo: "Ubicación", valor: `UTM del censo; el censo no dice la zona y se supuso la ${a.censo.zona}`, aviso: true }
      : { rotulo: "Ubicación", valor: `UTM del censo, zona ${a.censo.zona}` };
  }
  return { rotulo: "Ubicación", valor: "Sin coordenadas: no se puede ubicar en el mapa", aviso: true };
}

/**
 * Lo que dice el bloque «Del bosque», renglón por renglón. Una línea anulada
 * en el Libro TH se cuenta como historia («se anuló»), no se esconde: la troza
 * existió y salió de ese árbol.
 */
export function renglonesDelBosque(a: ArbolDeTroza): RenglonDelBosque[] {
  const out: RenglonDelBosque[] = [];
  if (a.especie || a.cientifico) {
    out.push({ rotulo: "Especie", valor: [a.especie, a.cientifico].filter(Boolean).join(" · ") });
  }
  if (a.tala) {
    out.push({
      rotulo: "Tala",
      valor: `línea N° ${a.tala.lineNo} del ${diaConNombre(a.tala.fecha)}${a.tala.vigente ? "" : " · se anuló en el Libro TH"}`,
      aviso: !a.tala.vigente,
    });
  } else {
    out.push({ rotulo: "Tala", valor: "sin línea de tala en el Libro TH", aviso: true });
  }
  out.push({
    rotulo: "Trozado",
    valor: `línea N° ${a.trozado.lineNo} del ${diaConNombre(a.trozado.fecha)}${a.trozado.vigente ? "" : " · se anuló en el Libro TH"}`,
    aviso: !a.trozado.vigente,
  });
  out.push(ubicacion(a));
  const censo = [a.censo?.parcela ? `parcela ${a.censo.parcela}` : null, a.censo?.condicion].filter(Boolean).join(" · ");
  if (censo) out.push({ rotulo: "Censo", valor: censo });
  return out;
}

/** ¿Se anuló algo del árbol en el Libro TH? El bloque se pinta como historia. */
export const arbolConHistoria = (a: ArbolDeTroza): boolean => !a.trozado.vigente || (a.tala != null && !a.tala.vigente);

/**
 * «En planta 98·96 cm · 4.20 m = 1.394 m³ (la guía dice 1.659 m³)». `null` si
 * llegó como dice la guía. El libro sigue con la medida de la guía.
 */
export function fraseDeMedidaEnPlanta(
  recibida: MedidaEnPlanta | null | undefined,
  volumenGuiaM3: number | null | undefined,
): string | null {
  if (!recibida) return null;
  const cm = (v: number | null) => (finito(v) ? formatNumber(Number(v), { max: 1 }) : "—");
  const medidas = `${cm(recibida.d1Cm)}·${cm(recibida.d2Cm)} cm · ${finito(recibida.largoM) ? formatNumber(Number(recibida.largoM), 2) : "—"} m`;
  const m3 = finito(recibida.volumenM3) ? ` = ${fmtM3(Number(recibida.volumenM3))} m³` : "";
  const guia = finito(volumenGuiaM3) ? ` (la guía dice ${fmtM3(Number(volumenGuiaM3))} m³)` : "";
  return `En planta ${medidas}${m3}${guia}`;
}
