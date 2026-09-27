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
