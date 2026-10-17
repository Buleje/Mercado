/**
 * La ficha de SERFOR entera, con la guía importada al Libro TH (ADR-461, 02-10
 * noche — Brandon: «se importará también los datos, como propietario,
 * destinatario, permiso, punto de partida […] es decir estarán todos los datos
 * y detalles de la guía»).
 *
 * `ForestGtf.gtfDatos` guarda los casilleros con `gtfDatosSchema` (el esquema
 * de la GTF de salida del CTP). Lo que la ficha publica y ese esquema no tiene
 * —el cuadro de productos (37), el estado y la fecha de registro en SERFOR,
 * la dirección del titular, el RUC de la instancia, el volumen declarado y las
 * etiquetas que ningún casillero mira— viaja en una llave APARTE del mismo
 * JSON: `fichaSerfor`. Va aparte y no dentro del esquema compartido a
 * propósito: ese esquema valida lo que manda el NAVEGADOR en el despacho con
 * guía y en las guías del CTP, y una «ficha de SERFOR» que pudiera llegar desde
 * el navegador es justo lo que la revisión de seguridad del 02-10 cerró. Esta
 * llave la escribe sólo el importador, en el servidor; `ForestGtf.gtfDatos` no
 * se vuelve a escribir después de emitir (sólo cambia el estado).
 *
 * Sin la lista de trozas: ésas son las líneas del libro y `ForestGtf.items`.
 *
 * PURO y client-safe.
 */

import type { GtfSerfor } from "./serfor-gtf";
import { camposNoMapeados } from "./gtf-serfor-bloques";
import { repararFichaSerfor } from "./serfor-texto-danado";
import { fichaGtfSchema } from "./loth-importar-guia-esquemas";

/** La llave del JSON de la guía donde va la ficha. */
export const LLAVE_FICHA_SERFOR = "fichaSerfor";
/** `true` = vino del SNIFFS o de una ficha de SERFOR guardada en el CTP; `false` = foto o PDF. */
export const LLAVE_FICHA_VERIFICADA = "fichaSerforVerificada";

/**
 * La ficha para mostrar y guardar: reparada, sin la lista de trozas y con
 * `campos` reducido a lo que ningún casillero muestra (el resto ya está en su
 * campo; repetirlo sólo engorda el JSON de cada guía de la lista).
 */
export function fichaParaMostrar(g: GtfSerfor): GtfSerfor {
  const f = repararFichaSerfor(g);
  const extra = camposNoMapeados(f);
  return { ...f, trozas: [], campos: Object.fromEntries(extra.map((c) => [c.etiqueta, c.valor])) };
}

/**
 * La ficha guardada con una guía importada, leída con el MISMO esquema (con
 * topes) que la de una foto. `null` si la guía no la tiene (anotada a mano, o
 * importada antes del 02-10 noche) o si no se puede leer.
 */
export function fichaDeGuiaImportada(gtfDatos: unknown): { ficha: GtfSerfor; verificada: boolean } | null {
  if (!gtfDatos || typeof gtfDatos !== "object" || Array.isArray(gtfDatos)) return null;
  const o = gtfDatos as Record<string, unknown>;
  const crudo = o[LLAVE_FICHA_SERFOR];
  if (!crudo || typeof crudo !== "object") return null;
  const r = fichaGtfSchema.safeParse(crudo);
  if (!r.success) return null;
  if (!r.data.gtfNumber && !r.data.numeroRegistro) return null;
  return { ficha: repararFichaSerfor(r.data), verificada: o[LLAVE_FICHA_VERIFICADA] === true };
}
