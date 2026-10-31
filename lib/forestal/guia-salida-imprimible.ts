/**
 * guia-salida-imprimible — la GTF de SALIDA del CTP (la de un despacho del
 * Libro CTP, madera aserrada o trozas que salen sin aserrar) lista para los
 * MISMOS papeles que la guía del Libro TH: hoja SERFOR, talonario de la
 * matricial y «con formato» (Brandon 27-10: «que tenga las funciones parecidas
 * … para la madera que sale, sea aserrada o directa en trozas»).
 *
 * Una guía ampara VARIOS productos: cada producto es una línea del libro con
 * el mismo N° (ADR-362). Lo que se imprime es la guía ENTERA, se pida desde la
 * línea que sea; la cabecera (menor `lineNo`) ancla el QR y la forma del
 * talonario.
 *
 * El servidor la arma (`GET RUTA_GUIA_SALIDA?despacho=<id>`) con la Ficha del
 * CTP y los permisos cargados, y devuelve también las `entradas` del talonario:
 * el modal, «con formato» y la salida PDF/ESC-P imprimen los mismos valores
 * que la hoja SERFOR (`documentoGtfSalida`), sin recalcular nada en el cliente.
 * PURO y client-safe.
 */

import type { CtpFicha, PermisoDeGuia } from "./ctp-ficha-types";
import type { GtfDatos } from "./ctp-gtf-datos";
import { fechaGtf, type CuerpoGtfInput, type LineaProducto } from "./ctp-gtf-formato";
// Sólo el TIPO: `ctp-gtf-print` es "use client" y desde el servidor tira (23-10).
import type { GtfCadena } from "./ctp-gtf-print";
import { listaDeTrozas, type PiezaGuia } from "./loth-guia-despacho";
import { hojasDeLaLista, type EntradasGuiaLoth } from "./loth-guia-print";
import { FILAS_POR_LISTA } from "./loth-lista-numero";

export const RUTA_GUIA_SALIDA = "/api/admin/forestal/ctp/guia-salida";

export interface GuiaSalidaImprimible {
  /** La primera línea viva de la guía (menor `lineNo`): ancla el QR y la forma del talonario. */
  despachoId: string;
  lineNo: number;
  /** Todas las líneas vivas con ese N°, una por producto (en orden de `lineNo`). */
  lineIds: string[];
  gtfNumber: string;
  /** `YYYY-MM-DD` (fecha de la cabecera) — casillero (3). */
  fecha: string;
  /** El cuerpo guardado de la cabecera (`gtfDatos`), normalizado. */
  datos: GtfDatos;
  /** El detalle (37): una fila por línea, con el binomio completado del catálogo. */
  lineas: LineaProducto[];
  /** De dónde salió todo lo de la guía: corridas y trozas sin transformar (`lineNo: null`). */
  cadena: GtfCadena;
  /** Las trozas que salieron SIN aserrar en esta guía (ADR-363), para su lista. [] = madera transformada. */
  trozas: PiezaGuia[];
  /** Madera en rollo (`esMaderaEnRollo`): con lista de trozas; si no, sólo la guía. */
  enRollo: boolean;
  /** Quién emite: la razón social de la Ficha del CTP (vacío si la Ficha no la tiene). */
  titular: string;
  /** Lo que falta para imprimir el original (`faltantesGtf`, por nombre de campo). Vacío = se puede. */
  faltan: string[];
  /**
   * La guía está anulada: se pidió desde una línea anulada y se arma con las
   * anuladas de ese N° (vigentes con vigentes, como `claveGuiaCtp`). Se imprime
   * con su sello, nunca como válida, y sin lista (anular devuelve las trozas).
   */
  anulada: boolean;
}

export interface RespuestaGuiaSalida {
  guia: GuiaSalidaImprimible;
  /** Las entradas del talonario y de «con formato», armadas por el servidor (las mismas de la hoja SERFOR). */
  entradas: EntradasGuiaLoth;
}

const t = (v: string | null | undefined) => (v ?? "").trim();

/**
 * Por qué el original no puede salir todavía (`faltan`), en palabras de la
 * pantalla; null = se puede. Lo dicen IGUAL la hoja SERFOR, el talonario,
 * «con formato» y la salida PDF/ESC-P: el original es lo que se muestra en un
 * puesto de control y no sale a medias por ninguno de los cuatro caminos.
 */
export const faltanParaImprimir = (guia: Pick<GuiaSalidaImprimible, "faltan">): string | null =>
  guia.faltan.length ? `Falta completar la guía: ${guia.faltan.join(", ")}. Ábrela con el botón Guía.` : null;

/** (32) Las GTF con las que ENTRÓ la materia prima: una sola vez cada una aunque dos corridas compartan origen. */
export const guiasDeOrigen = (cadena: GtfCadena | null | undefined): string[] => [
  ...new Set((cadena?.corridas ?? []).flatMap((c) => c.guias)),
];

/**
 * Las hojas de la lista de la salida y lo que va en el (35).
 *
 * · Trozas que salen sin aserrar → la lista viaja con la guía: se parte como
 *   la del Libro TH (`hojasDeLaLista`). El CTP no imprimía lista de salida
 *   antes del 27-10, así que no hay hojas viejas que respetar: sin la marca
 *   guardada se parte de a 30, como el talonario.
 * · Madera transformada → no hay lista de trozas: el (35) lleva el N° de la
 *   lista de productos que escribió el operador en el despacho («N° lista de
 *   trozas / producto») o, si no escribió nada, el N° de la guía (como se
 *   imprimía siempre).
 */
export function listasDeLaSalida(datos: GtfDatos, gtfNumber: string, trozas: number): EntradasGuiaLoth["listas"] {
  const filasPorLista = datos.guia.filasPorLista ?? FILAS_POR_LISTA;
  if (trozas > 0) return hojasDeLaLista({ ...datos, guia: { ...datos.guia, filasPorLista } }, gtfNumber, trozas);
  const casillero35 = t(datos.guia.listaTrozasNro) || gtfNumber;
  return { hojas: 1, numeros: [casillero35], casillero35, filasPorHoja: filasPorLista };
}

/**
 * La salida del CTP INICIA su transporte en el CTP: el bloque (17)-(20d) va
 * «No aplica» (la opción «Del área del título o de un CTP» del formato 2024,
 * la misma que elige el Libro TH). El formulario del CTP no pide ese modo, y
 * sin él el bloque salía en blanco —un casillero en blanco de una declaración
 * jurada se puede llenar después— (QA 27-10). Un modo elegido se respeta.
 */
export function conPartidaDeSalida(datos: GtfDatos): GtfDatos {
  const partida = datos.traslado?.partida;
  if (!partida || partida.modo) return datos;
  return { ...datos, traslado: { ...datos.traslado, partida: { ...partida, modo: "inicio" } } };
}

export interface CuerpoGuiaSalidaInput {
  gtfNumber: string | null | undefined;
  /** `YYYY-MM-DD` de la línea — casillero (3). */
  fecha: string | null | undefined;
  /** Ficha del CTP; `Partial` porque una ficha a medio llenar igual imprime. */
  ficha: Partial<CtpFicha>;
  datos: GtfDatos;
  /** El detalle (37), ya armado (una fila por producto). */
  lineas: readonly LineaProducto[];
  cadena: GtfCadena | null | undefined;
  permisos?: readonly PermisoDeGuia[] | null;
  /** Cuántas trozas van en la lista (las que salieron sin aserrar). 0/ausente = madera transformada. */
  trozasEnLista?: number;
}

/**
 * La entrada del formato de casilleros de la GTF de salida: la MISMA para la
 * hoja SERFOR (`documentoGtfSalida`) y para el talonario de la matricial
 * (`entradasGuiaSalida`), así los dos papeles dicen lo mismo casillero por
 * casillero.
 */
export function cuerpoGuiaSalida(i: CuerpoGuiaSalidaInput): CuerpoGtfInput {
  const numero = i.gtfNumber ?? "";
  return {
    // La ficha llega parcial (se imprime aunque esté a medio llenar): los
    // casilleros sin dato quedan en blanco, que es el comportamiento correcto.
    ficha: i.ficha as CtpFicha,
    datos: conPartidaDeSalida(i.datos),
    lineas: [...i.lineas],
    numeroGtf: numero,
    fechaExpedicion: i.fecha ?? "",
    listasTrozas: listasDeLaSalida(i.datos, numero, i.trozasEnLista ?? 0).casillero35,
    gtfOrigen: guiasDeOrigen(i.cadena).join(", "),
    // Buleje no registra ante la ARFFS: mientras el operador no cargue el N°
    // que devuelve el SNIFFS, el recuadro va en blanco para llenarlo a mano.
    registroSerfor: "",
    permisos: i.permisos ?? undefined,
  };
}

/**
 * Lo que la hoja SERFOR, el talonario y «con formato» imprimen de la guía de
 * salida, ANTES de volverse HTML o renglones de la matricial (el par de
 * `entradasGuiaLoth` para el CTP). La lista sólo existe si salieron trozas sin
 * aserrar; su encabezado es el CTP, que es quien emite.
 */
export function entradasGuiaSalida(
  guia: GuiaSalidaImprimible,
  ficha: Partial<CtpFicha>,
  permisos?: readonly PermisoDeGuia[] | null,
): EntradasGuiaLoth {
  const numero = t(guia.gtfNumber);
  // Las trozas ya traen su binomio del catálogo (lo completa el servidor).
  const filas = guia.trozas.length ? listaDeTrozas(guia.trozas) : [];
  const listas = listasDeLaSalida(guia.datos, numero, filas.length);
  // El logo (data URL, pesado) no lo lee ningún casillero: no viaja en el JSON.
  const fichaDelCuerpo: Partial<CtpFicha> = { ...ficha };
  delete fichaDelCuerpo.logo;
  const ubicacion = [ficha.distrito, ficha.provincia, ficha.region].map(t).filter(Boolean).join(" · ");
  const codigoCtp = t(ficha.codigoCtp);
  return {
    cuerpo: cuerpoGuiaSalida({
      gtfNumber: guia.gtfNumber,
      fecha: guia.fecha,
      ficha: fichaDelCuerpo,
      datos: guia.datos,
      lineas: guia.lineas,
      cadena: guia.cadena,
      permisos,
      trozasEnLista: filas.length,
    }),
    filas,
    listas,
    lista: {
      titular: t(ficha.razonSocial) || t(ficha.nombreCtp) || "Centro de Transformación Primaria",
      subtitulo: codigoCtp ? `Código de CTP: ${codigoCtp}` : undefined,
      ubicacion,
      ruc: t(ficha.ruc) || undefined,
      guia: numero,
      fecha: fechaGtf(guia.fecha),
      observaciones: t(guia.datos.observaciones),
    },
  };
}
