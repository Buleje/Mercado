/**
 * Las guías de tu Libro TH que todavía no entraron al Libro CTP (ADR-481,
 * Brandon 08-10: «en nuevo ingreso de madera, cuando se sacó del libro de
 * títulos habilitantes al CTP, se tiene que rellenar todo… arregla eso»).
 *
 * «Recibir» (28-09, ADR-450) ya registra la guía del TH con todas sus trozas
 * sin tipear, pero sólo si la guía PASÓ al CTP al emitirla. Las importadas
 * (ADR-461), las de antes del 28-09 o aquellas cuya guardada se quitó no
 * tenían camino: el alta manual llenaba titular y permiso y nada más.
 *
 * Acá se decide, con las MISMAS reglas que el pase y que «Recibir», cuáles se
 * pueden ingresar y por qué no las otras:
 *
 *   · ya entró = un ingreso vivo con el mismo N° tramo a tramo
 *     (`mismoNumeroGtf`) que puede ser del mismo dueño (`puedeSerDelDueno`):
 *     la regla de `GtfNumeroDB.ingresosVivos`;
 *   · la guardada que la espera se elige con `elegirGuiaDelDueno`, como
 *     `GuiasGuardadasDB.eleccionPorNumeroGtf`;
 *   · va a tu planta = `destinoDeGuiaTh` (RUC del destinatario = el de tu Ficha);
 *   · su lista alcanza = `ingresosDesdeGuiaTh`.
 *
 * PURO: sin React, sin fetch, sin Prisma.
 */

import { mismoNumeroGtf } from "./gtf-talonario";
import { elegirGuiaDelDueno, mismoDuenoDeGuia, puedeSerDelDueno } from "./loth-talonario";
import {
  destinoDeGuiaTh,
  especiesDeItems,
  identidadDeGuiaTh,
  ingresosDesdeGuiaTh,
  leerItemsGuiaTh,
  mismaGuiaTh,
} from "./guia-th-al-ctp";
import { leerGtfDatos } from "./ctp-gtf-datos";
import { vencimientoDeGuia } from "./fecha-de-llegada";

/** La guía del TH tal como sale de la base (sólo las emitidas, no borradas, de trozas). */
export interface GuiaThCruda {
  id: string;
  gtfNumber: string;
  gtfDate: Date | string | null;
  titularName: string | null;
  tituloHabilitante: string | null;
  origen: string | null;
  items: unknown;
  volumenTotalM3: number | null;
  piezasTotal: number | null;
  gtfDatos: unknown;
  createdAt: Date | string;
}

/** Un ingreso vivo del Libro CTP, con lo que dice de quién es. */
export interface IngresoParaCruce {
  gtfNumber: string;
  providerName: string | null;
  originCode: string | null;
}

/** Una guía guardada viva del Libro CTP (ADR-442). */
export interface GuardadaParaCruce {
  id: string;
  gtfNumber: string;
  titularNombre: string | null;
  permisoCodigo: string | null;
}

export interface GuiaThPorIngresar {
  gtfId: string;
  gtfNumber: string;
  /** `AAAA-MM-DD` (fecha date-only de la guía). */
  gtfDate: string | null;
  titular: string | null;
  permiso: string | null;
  /** De dónde salió la madera: distrito, provincia y departamento de la guía. */
  origen: string | null;
  destinatario: string | null;
  especies: string[];
  trozas: number;
  /** m³ de la guía: la suma de sus trozas si la lista alcanza; si no, el total declarado. */
  volumenM3: number | null;
  vencimiento: string | null;
  /** La guía guardada que ya la espera en Ingresos (pasó al emitir), si hay. */
  guardadaId: string | null;
  /** Se puede ingresar desde acá, con todo relleno. */
  lista: boolean;
  /** Por qué no, en palabras de la persona. `null` si `lista`. */
  motivo: string | null;
}

export interface CruceGuiasTh {
  porIngresar: GuiaThPorIngresar[];
  /** Las guías del TH que ya tienen su ingreso en el CTP. */
  ingresadas: { gtfId: string; gtfNumber: string }[];
}

const txt = (v: string | null | undefined): string => (v ?? "").trim();
const dia = (d: Date | string | null): string | null => {
  if (!d) return null;
  const iso = d instanceof Date ? d.toISOString() : String(d);
  return /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10) : null;
};
const ms = (d: Date | string): number => (d instanceof Date ? d.getTime() : Date.parse(String(d))) || 0;

/**
 * Cruza las guías del TH con el libro. Una guía con el mismo N° y el mismo
 * dueño emitida dos veces (reemisión) cuenta una vez: la más nueva, como
 * `guiaThDeNumero` (las anuladas ni llegan acá).
 */
export function cruzarGuiasTh(input: {
  guias: readonly GuiaThCruda[];
  ingresos: readonly IngresoParaCruce[];
  guardadas: readonly GuardadaParaCruce[];
  rucPropio: string | null;
}): CruceGuiasTh {
  const porIngresar: GuiaThPorIngresar[] = [];
  const ingresadas: CruceGuiasTh["ingresadas"] = [];
  const vistas: { gtfNumber: string; dueno: { titular: string | null; permiso: string | null } }[] = [];

  const ordenadas = [...input.guias].sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  for (const g of ordenadas) {
    const datos = leerGtfDatos(g.gtfDatos);
    const identidad = identidadDeGuiaTh(g, datos);
    if (vistas.some((v) => mismoNumeroGtf(v.gtfNumber, g.gtfNumber) && mismoDuenoDeGuia(v.dueno, identidad) !== false)) continue;
    vistas.push({ gtfNumber: g.gtfNumber, dueno: identidad });

    const entro = input.ingresos.some(
      (e) => mismoNumeroGtf(e.gtfNumber, g.gtfNumber) && puedeSerDelDueno({ titular: e.providerName, permiso: e.originCode }, identidad),
    );
    if (entro) {
      ingresadas.push({ gtfId: g.id, gtfNumber: g.gtfNumber });
      continue;
    }

    const items = leerItemsGuiaTh(g.items);
    const declarado = g.volumenTotalM3 != null && Number.isFinite(Number(g.volumenTotalM3)) ? Number(g.volumenTotalM3) : null;
    const reparto = ingresosDesdeGuiaTh(items, { volumenDeclaradoM3: declarado, gtfNumber: g.gtfNumber });
    const destino = destinoDeGuiaTh(datos, input.rucPropio);

    const conNumero = input.guardadas.filter((x) => mismoNumeroGtf(x.gtfNumber, g.gtfNumber));
    const eleccion = elegirGuiaDelDueno(conNumero, identidad, (x) => ({ titular: x.titularNombre, permiso: x.permisoCodigo }));
    const guardadaId = eleccion.estado === "una" ? eleccion.guia.id : null;
    /* El pase no guarda encima de la guardada de OTRO titular con el mismo N°
       (la base admite una viva por N°): eso se dice antes de tocar el botón. */
    const otra = eleccion.estado === "ambigua" ? eleccion.candidatas[0] : eleccion.estado === "ninguna" ? conNumero[0] : null;

    /* Mismo titular pero otro permiso = otra guía: «Recibir» la rechazaría
       (OTRA_GUIA), así que se dice acá y no se ofrece «Traer con todo». */
    const distinta = eleccion.estado === "una" ? mismaGuiaTh(eleccion.guia, identidad) : null;

    const motivo = !destino.propio
      ? destino.mensaje
      : !reparto.ok
        ? reparto.motivo
        : distinta && !distinta.ok
          ? distinta.motivo
          : otra
          ? `En tu Libro CTP ya hay una guía guardada con el N° ${otra.gtfNumber}${txt(otra.titularNombre) ? ` de ${txt(otra.titularNombre)}` : ""}: es de otro talonario. Revisa el N° o ingrésala a mano.`
          : null;

    const lugar = [datos.guia.distrito, datos.guia.provincia, datos.guia.departamento].map(txt).filter(Boolean).join(", ");
    porIngresar.push({
      gtfId: g.id,
      gtfNumber: g.gtfNumber,
      gtfDate: dia(g.gtfDate),
      titular: identidad.titular,
      permiso: identidad.permiso,
      origen: lugar || txt(g.origen) || null,
      destinatario: txt(datos.destinatario.nombre) || null,
      especies: especiesDeItems(items),
      trozas: items.length || g.piezasTotal || 0,
      volumenM3: reparto.ok ? reparto.totalM3 : declarado,
      vencimiento: vencimientoDeGuia([{ gtfDatos: g.gtfDatos }]).vencimiento,
      guardadaId,
      lista: motivo == null,
      motivo,
    });
  }
  /* Primero las que se pueden ingresar; dentro, la guía más nueva arriba. */
  porIngresar.sort((a, b) => Number(b.lista) - Number(a.lista) || String(b.gtfDate ?? "").localeCompare(String(a.gtfDate ?? "")));
  return { porIngresar, ingresadas };
}

/**
 * De las guías por ingresar, la que corresponde a un N° escrito (el puente
 * «Ingresar al CTP» del Libro TH manda sólo el N°). Dos de dueños distintos
 * con ese N° = «ambigua»: se elige en la lista, nunca la primera.
 */
export function guiaPorNumero(
  porIngresar: readonly GuiaThPorIngresar[],
  gtfNumber: string,
): { estado: "una"; guia: GuiaThPorIngresar } | { estado: "ninguna" } | { estado: "ambigua"; candidatas: GuiaThPorIngresar[] } {
  const mias = porIngresar.filter((g) => mismoNumeroGtf(g.gtfNumber, gtfNumber));
  if (mias.length === 0) return { estado: "ninguna" };
  if (mias.length === 1) return { estado: "una", guia: mias[0] };
  return { estado: "ambigua", candidatas: mias };
}

/** Lo que devuelve «Traer con todo»: la guardada lista para «Recibir». */
export interface GuiaThAlistada {
  guardadaId: string;
  gtfNumber: string;
  /** true = la guía recién pasó a tu Libro CTP (no estaba guardada). */
  creada: boolean;
}
