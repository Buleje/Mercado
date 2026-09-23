/**
 * Lo que viaja al servidor cuando el cubicador GUARDA el lote o lo VINCULA a la
 * corrida del Libro (2026-09-23, hallazgo de revisión).
 *
 * Con «más nuevas primero» la tabla está dada vuelta, y lo guardado lo leen
 * otros: el Anexo 04 (`Anexo04Origen` → `construirAnexo04`) numera las filas en
 * el orden en que llegan, y al reabrir la cubicación «como se dictó» se deja
 * tal cual. Guardar la tabla como se ve sacaba el Anexo al revés. Se guarda
 * SIEMPRE en el orden del papel (`enOrdenDelPapel`), que es el de dictado.
 */
import { enOrdenDelPapel, type OrdenFilas } from "./cubicador-bloques-especie";
import type { PiezaCubicada } from "./cubicacion";
import { sinCodigoDeTroza } from "./codigo-de-troza";

/** Las piezas de «Guardar cubicación»: sólo lo que el servidor guarda, en el orden del papel. */
export function piezasParaGuardar(rows: PiezaCubicada[], orden: OrdenFilas) {
  return enOrdenDelPapel(rows, orden).map((p) => ({
    id: p.id,
    cantidad: p.cantidad,
    espesor: p.espesor,
    ancho: p.ancho,
    largo: p.largo,
    uEspesor: p.uEspesor,
    uAncho: p.uAncho,
    uLargo: p.uLargo,
    especie: p.especie ?? null,
  }));
}

/** Las piezas que se vinculan a la corrida al enviar al Libro: sin el código interno de la troza. */
export function piezasParaVincular(rows: PiezaCubicada[], orden: OrdenFilas) {
  return enOrdenDelPapel(rows, orden).map(sinCodigoDeTroza);
}
