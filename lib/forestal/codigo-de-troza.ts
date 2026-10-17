/**
 * codigo-de-troza — el «Código» que se le pega a cada pieza en «Producir sin lote».
 *
 * Brandon (2026-09-14): *«campo de Código que se rellena manualmente y al poner
 * el código ya vayan saliendo opciones de código a escoger (según lo puesto en
 * trozas disponibles); si no hay, ponerlo igual el código; si hay, usarlo y
 * rellenarse la especie según ese código»*.
 *
 * ## Lo que NO es — «esto no afectará, sólo es interno»
 *
 * Una anotación del cubicado y nada más:
 *
 * - **No se manda al servidor.** Vive en las piezas del `localStorage` de ese
 *   espacio (`-ctp-produccion`); quien sube piezas lo saca con `sinCodigoDeTroza`.
 * - **No agrupa.** `unificarPorMedida` sigue juntando por medida/especie/tipo/
 *   dueño: dos piezas iguales con códigos distintos son el MISMO paquete.
 * - **No se declara** y **no consume ni marca trozas**: atribuir materia prima
 *   es un acto del Libro con sus invariantes (I2/T1), no un texto tipeado acá.
 *
 * PURO y client-safe.
 */

import { estaDisponible, type TrozaConsumible } from "./consumo-trozas";
import { claveEspecie } from "./loth-constants";

/** Cuántas sugerencias se muestran: más que esto ya no se lee, se scrollea. */
export const TOPE_SUGERENCIAS = 8;

/** Una troza del patio que se puede ofrecer por su código. */
export interface TrozaParaCodigo {
  id: string;
  codigo: string;
  especie: string | null;
  m3: number | null;
  guia: string | null;
  /** El título habilitante que ampara esa troza — con él se propone el permiso del asiento. */
  permiso: string | null;
  d1Cm: number | null;
  d2Cm: number | null;
  largoM: number | null;
}

/** Lo que el cubicador necesita para ofrecer códigos: la lista y cómo le fue al leerla. */
export interface FuenteCodigoDeTroza {
  trozas: TrozaParaCodigo[];
  cargando: boolean;
  /** Si la lectura falló: el campo funciona igual, sin sugerencias. */
  error: string | null;
}

const normalizar = (s: string | null | undefined): string =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/**
 * ¿Es un código de verdad o el marcador de «no tiene»?
 *
 * Medido en Blas (2026-09-14): 49 de las 160 trozas disponibles traen
 * `codificacion = "-"` —toda una guía sin codificar—. Ofrecerlas como «código
 * -» llenaba la lista con 49 opciones idénticas. Un valor sin ninguna letra ni
 * número («-», «—», «--», «.», espacios) es «sin código».
 */
export function esCodigoReal(s: string | null | undefined): boolean {
  return /[\p{L}\p{N}]/u.test(s ?? "");
}

/**
 * De lo que devuelve `/trozas/patio` a lo que se puede ofrecer: sólo las que
 * se pueden usar (el mismo criterio que el picker de consumo: ni consumida, ni
 * despachada, ni descarte, ni madre retrozada, ni sin llegar, ni sin volumen) y
 * sólo las que tienen un código real. Si la codificación es el marcador, sirve
 * el código de planta.
 *
 * Y sólo las de guías YA RECIBIDAS: una troza cuya guía sigue pendiente no llegó
 * a la planta, así que no pudo pasar por la sierra (medido en Blas: 104 de 111
 * códigos eran de 9 guías pendientes y rellenaban la especie de madera que no
 * estaba). Es el mismo corte que el patio (`use-filtro-patio`) y la capacidad
 * de planta.
 */
export function trozasParaCodigo(trozas: readonly TrozaConsumible[]): TrozaParaCodigo[] {
  const out: TrozaParaCodigo[] = [];
  for (const t of trozas) {
    if (!estaDisponible(t) || t.guiaRecepcionada === false) continue;
    const codificacion = t.codificacion?.trim() ?? "";
    const planta = t.codigoPlanta?.trim() ?? "";
    const codigo = esCodigoReal(codificacion) ? codificacion : esCodigoReal(planta) ? planta : "";
    if (!codigo) continue;
    out.push({
      id: t.id,
      codigo,
      especie: t.especieComun?.trim() || null,
      m3: t.volumenM3 ?? null,
      guia: t.gtfNumber?.trim() || null,
      permiso: t.permiso?.trim() || null,
      d1Cm: t.d1Cm ?? null,
      d2Cm: t.d2Cm ?? null,
      largoM: t.largoM ?? null,
    });
  }
  return out;
}

/**
 * Orden dentro de un grupo: el más corto primero y después el orden natural.
 * Con códigos de dos cifras («2» → «2», «20», «21»… «25») eso es lo que se
 * espera leer; `numeric` evita que «100» caiga entre «10» y «11».
 */
function ordenDeCodigo(a: TrozaParaCodigo, b: TrozaParaCodigo): number {
  return (
    a.codigo.length - b.codigo.length ||
    a.codigo.localeCompare(b.codigo, "es", { numeric: true, sensitivity: "base" }) ||
    (a.guia ?? "").localeCompare(b.guia ?? "", "es", { numeric: true }) ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Las sugerencias para lo que se lleva escrito: primero las que EMPIEZAN con
 * eso, después las que lo CONTIENEN, sin distinguir mayúsculas ni tildes.
 * «2» muestra «2», «20»… «25» antes que «12» o «32».
 *
 * No se deduplica por código: si dos trozas comparten uno, son dos piezas del
 * patio y cada opción dice su m³ y su guía.
 */
export function sugerirCodigosDeTroza(
  trozas: readonly TrozaParaCodigo[],
  texto: string,
  tope = TOPE_SUGERENCIAS,
): TrozaParaCodigo[] {
  if (!esCodigoReal(texto)) return [];
  const q = normalizar(texto);
  const prefijo: TrozaParaCodigo[] = [];
  const contiene: TrozaParaCodigo[] = [];
  for (const t of trozas) {
    const c = normalizar(t.codigo);
    if (c.startsWith(q)) prefijo.push(t);
    else if (c.includes(q)) contiene.push(t);
  }
  return [...prefijo.sort(ordenDeCodigo), ...contiene.sort(ordenDeCodigo)].slice(0, Math.max(0, tope));
}

/**
 * La troza de un código escrito a mano, sin elegirlo de la lista.
 *
 * Devuelve una sólo si no hay duda sobre la especie: ninguna coincidencia → `null`
 * (el código queda tal cual y la especie no se toca); varias con especies
 * distintas → `null` también, porque elegir una sería adivinar.
 */
export function trozaDeCodigoExacto(
  trozas: readonly TrozaParaCodigo[],
  texto: string,
): TrozaParaCodigo | null {
  if (!esCodigoReal(texto)) return null;
  const q = normalizar(texto);
  const iguales = trozas.filter((t) => normalizar(t.codigo) === q);
  if (iguales.length === 0) return null;
  const claves = new Set(iguales.map((t) => claveEspecie(t.especie)));
  return claves.size === 1 ? iguales[0] : null;
}

/**
 * La especie que se pone al elegir una troza, en el nombre que ofrece el
 * catálogo del cubicador (ADR-410): el patio puede decir «TORNILLO» o «Tornillo
 * (Cedrelinga catenaeformis)» y el selector ofrece «Tornillo». Si el catálogo no
 * la tiene, va el nombre tal cual —mejor eso que dejarla sin especie—. `null` =
 * la troza no dice especie: no se toca la que está puesta.
 */
export function resolverEspecie(
  especieTroza: string | null | undefined,
  ofrecidas: readonly string[],
): string | null {
  const nombre = (especieTroza ?? "").trim();
  if (!nombre) return null;
  if (ofrecidas.includes(nombre)) return nombre;
  const clave = claveEspecie(nombre);
  return ofrecidas.find((e) => claveEspecie(e) === clave) ?? nombre;
}

/** La pieza sin su código: lo que se sube al servidor nunca lo lleva. */
export function sinCodigoDeTroza<T extends { codigo?: string }>(pieza: T): Omit<T, "codigo"> {
  const { codigo: _codigo, ...resto } = pieza;
  return resto;
}

// ── Del código escrito al permiso del asiento (ADR-417) ─────────────────────

/** Lo que los códigos anotados saben decir sobre el permiso a declarar. */
export type PermisoSugerido =
  /** Todos los códigos reconocidos vienen del mismo título habilitante. */
  | { estado: "uno"; permiso: string; guias: string[]; codigos: string[] }
  /** Vienen de varios: no se elige por nadie, se muestran. */
  | { estado: "varios"; permisos: string[]; codigos: string[] }
  /** Ningún código reconocido, o los reconocidos no tienen permiso cargado. */
  | { estado: "sin-dato" };

/**
 * De los códigos que se escribieron al cubicar al permiso que debería declarar
 * el asiento.
 *
 * Por qué sirve: en el tenant real cada código lleva a UNA sola guía (24 guías,
 * 3 permisos, 0 códigos ambiguos), así que un código alcanza para saber de qué
 * título habilitante salió esa madera — y 6 de las 14 corridas se registraron
 * sin permiso.
 *
 * Con códigos de varios permisos NO se elige: dos permisos en una corrida es
 * información, no un empate a resolver por sorteo. Y sigue siendo una
 * SUGERENCIA: el campo es libre porque quien registra puede saber algo que el
 * patio todavía no.
 */
export function permisoDesdeLosCodigos(
  codigos: readonly string[],
  trozas: readonly TrozaParaCodigo[],
): PermisoSugerido {
  const buscados = [...new Set(codigos.map((c) => c?.trim()).filter((c): c is string => esCodigoReal(c ?? "")))];
  if (buscados.length === 0) return { estado: "sin-dato" };
  const porPermiso = new Map<string, { guias: Set<string>; codigos: Set<string> }>();
  for (const codigo of buscados) {
    for (const t of trozas) {
      if (t.codigo !== codigo || !t.permiso) continue;
      const bolsa = porPermiso.get(t.permiso) ?? { guias: new Set<string>(), codigos: new Set<string>() };
      if (t.guia) bolsa.guias.add(t.guia);
      bolsa.codigos.add(codigo);
      porPermiso.set(t.permiso, bolsa);
    }
  }
  const permisos = [...porPermiso.keys()];
  if (permisos.length === 0) return { estado: "sin-dato" };
  if (permisos.length > 1) return { estado: "varios", permisos, codigos: buscados };
  const unico = permisos[0]!;
  const bolsa = porPermiso.get(unico)!;
  return { estado: "uno", permiso: unico, guias: [...bolsa.guias], codigos: [...bolsa.codigos] };
}
