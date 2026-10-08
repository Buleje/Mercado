/**
 * tramites-permiso — el permiso que manda en la «Relación de guías» (Brandon
 * 08-10: «un oficio por permiso»; el titular, el RUC y el representante salen
 * del permiso elegido, no de la Ficha CTP).
 *
 * Dos guías son del mismo permiso si su CÓDIGO normalizado coincide
 * (`claveTitulo`: «19-SEC/REG-PLT-2025-096» ≡ «19 sec reg plt 2025 96»). Nunca
 * por el nombre del titular: en Blas la misma comunidad sale como «CCNN SAN
 * LUIS DE CHINCHIGUANI» y «COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI».
 *
 * PURO: sin React, sin fetch, sin DOM.
 */

import { claveTitulo } from "./loth-importar-guia";
import { claveNumeroGtf } from "./gtf-talonario";
import type { DatosTramite } from "./tramites-catalogo";
import type { FilaGuiaInforme } from "./tramites-relacion-guias";

/** La llave del código del permiso; `null` si la guía no dice ninguno. */
export const clavePermisoOficio = (codigo: string | null | undefined): string | null => claveTitulo(codigo);

/** ¿Los dos códigos son el mismo permiso? Uno vacío no es «el mismo» que nada. */
export function esElMismoPermiso(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = clavePermisoOficio(a);
  return ka !== null && ka === clavePermisoOficio(b);
}

// ─── «Traer de los libros»: repartir por permiso y avisar ────────────────────

/**
 * Las guías del listado del CTP repartidas por el permiso elegido. El listado
 * no trae el permiso: sale del detalle (`?ids=`). Una guía SIN detalle (pedido
 * caído, 429, borrada entre medio) no es «de otro permiso»: va a `sinLeer`, no
 * a `fuera`, y no se trae — «reintenta» la vuelve a pedir (las que ya están en
 * la tabla se saltan por N°). Sin permiso elegido pasa igual: traerla sin
 * permiso ni N° de lista la dejaría a medias y el reintento no la completaría.
 */
export function repartirPorPermiso<G, D extends { tituloHabilitante?: string | null }>(
  lista: readonly G[],
  detalle: ReadonlyMap<string, D>,
  idDe: (g: G) => string,
  elegido: string | null,
): { delPermiso: { guia: G; detalle: D }[]; fuera: number; sinLeer: number } {
  const delPermiso: { guia: G; detalle: D }[] = [];
  let fuera = 0;
  let sinLeer = 0;
  for (const g of lista) {
    const d = detalle.get(idDe(g));
    if (!d) sinLeer += 1;
    else if (elegido && clavePermisoOficio(d.tituloHabilitante) !== elegido) fuera += 1;
    else delPermiso.push({ guia: g, detalle: d });
  }
  return { delPermiso, fuera, sinLeer };
}

/** El aviso de «Traer de los libros»; `null` si se trajo todo sin novedad. */
export function avisoDeTraerGuias(o: {
  traidas: number;
  /** Libros que no respondieron («Libro CTP no habilitado», «Libro TH: error 500»). */
  avisos: readonly string[];
  fuera: number;
  sinLeer: number;
  permisoCodigo?: string;
}): string | null {
  const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);
  const dePermiso =
    o.fuera > 0
      ? ` ${o.fuera} ${plural(o.fuera, "guía de otro permiso (o sin permiso) no se trajo", "guías de otros permisos (o sin permiso) no se trajeron")}: este oficio es del ${o.permisoCodigo?.trim()}.`
      : "";
  const noLeidas =
    o.sinLeer > 0
      ? ` No se pudo leer el permiso de ${o.sinLeer} ${plural(o.sinLeer, "guía del Libro CTP (no se trajo)", "guías del Libro CTP (no se trajeron)")}; reintenta.`
      : "";
  const cola = dePermiso + noLeidas;
  if (o.traidas === 0) {
    const base =
      o.avisos.length === 2
        ? `Ningún libro respondió (${o.avisos.join(" · ")}). Agrega las guías a mano.`
        : o.sinLeer > 0
          ? o.avisos.map((a) => `${a}.`).join(" ")
          : o.avisos.length === 1
            ? `${o.avisos[0]}. El otro libro no tiene guías nuevas en el período.`
            : "Ningún libro tiene guías nuevas en ese período.";
    return (base + cola).trim();
  }
  if (o.avisos.length === 0 && !cola) return null;
  return `Se trajeron ${o.traidas}.${o.avisos.length ? ` ${o.avisos.join(" · ")}.` : ""}${cola}`;
}

// ─── Las guías agrupadas por permiso ─────────────────────────────────────────

/** Un permiso entre las guías elegidas: su código (como lo trae la primera guía) y cuántas guías tiene. */
export interface GrupoPermiso {
  clave: string;
  codigo: string;
  guias: number;
}

/** Lo mínimo de una guía para saber de qué permiso es. */
export interface GuiaConPermiso {
  gtfNumber: string;
  status: string;
  tituloHabilitante: string | null;
}

/**
 * Los permisos de las guías, el de más guías primero. Las líneas del CTP con el
 * mismo N° y estado son UNA guía (se cuentan una vez). Una guía sin permiso no
 * forma grupo: va con el oficio que se arme.
 */
export function permisosDeLasGuias(guias: readonly GuiaConPermiso[]): GrupoPermiso[] {
  const grupos = new Map<string, { codigo: string; guias: Set<string> }>();
  for (const g of guias) {
    const clave = clavePermisoOficio(g.tituloHabilitante);
    if (!clave) continue;
    const grupo = grupos.get(clave) ?? { codigo: (g.tituloHabilitante ?? "").trim(), guias: new Set<string>() };
    grupo.guias.add(`${claveNumeroGtf(g.gtfNumber) ?? g.gtfNumber.trim()}|${g.status}`);
    grupos.set(clave, grupo);
  }
  return [...grupos]
    .map(([clave, x]) => ({ clave, codigo: x.codigo, guias: x.guias.size }))
    .sort((a, b) => b.guias - a.guias || a.codigo.localeCompare(b.codigo));
}

/**
 * El aviso de la barra de guías elegidas, ANTES de salir del libro (Brandon
 * 08-10: «un oficio por permiso»): con guías de 2+ permisos, la Relación arma
 * un oficio por cada uno. `null` con uno solo (o ninguno).
 */
export function avisoDePermisos(grupos: readonly GrupoPermiso[]): string | null {
  if (grupos.length < 2) return null;
  return `Van ${grupos.length} permisos → ${grupos.length} oficios: la Relación arma uno por permiso.`;
}

/**
 * Con qué permiso se arma el oficio al llegar con guías: el del chip si está
 * entre ellas (es el permiso con el que se está trabajando), si no el de más
 * guías. Devuelve el CÓDIGO (va al papel); `null` si ninguna guía dice permiso.
 */
export function permisoPorDefecto(grupos: readonly GrupoPermiso[], codigoActivo?: string | null): string | null {
  if (grupos.length === 0) return null;
  const activo = clavePermisoOficio(codigoActivo);
  return (grupos.find((g) => g.clave === activo) ?? grupos[0]).codigo;
}

/** Las filas de la relación que dicen OTRO permiso que el elegido (las que no dicen ninguno, no). */
export function filasDeOtroPermiso(filas: readonly FilaGuiaInforme[], permisoCodigo: string | null | undefined): FilaGuiaInforme[] {
  const elegido = clavePermisoOficio(permisoCodigo);
  if (!elegido) return [];
  return filas.filter((f) => {
    const k = clavePermisoOficio(f.permiso);
    return k !== null && k !== elegido;
  });
}

// ─── Del permiso a los casilleros del oficio ─────────────────────────────────

/** Lo que el oficio lee de un `ForestContrato`. */
export interface PermisoDelOficio {
  id: string;
  codigo: string;
  titularNombre: string;
  titularDoc: string | null;
  titularDocTipo: string | null;
}

/** La ficha del Directorio del titular (si el permiso la tiene atada). */
export interface ParteDelPermiso {
  docTipo: string | null;
  docNumero: string | null;
  representante: string | null;
}

/** La Ficha CTP: sólo vale para un permiso cuyo titular ES el CTP. */
export interface FichaDelOficio {
  razonSocial?: string | null;
  ruc?: string | null;
  representante?: string | null;
}

export type FaltaDelPermiso = "titular" | "ruc";

/** «(por confirmar)», «(titular por confirmar)» o una raya: el permiso se sembró sin titular. */
export function titularPorConfirmar(nombre: string | null | undefined): boolean {
  return /^\(?\s*(titular\s+)?por confirmar\s*\)?$|^[—–\s-]*$/i.test((nombre ?? "").trim());
}

const normalizarNombre = (s: string | null | undefined): string =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();

/** El RUC de un documento: el que dice ser RUC o, sin tipo, uno de 11 dígitos. Un DNI no es RUC. */
function rucDe(tipo: string | null | undefined, numero: string | null | undefined): string {
  const n = (numero ?? "").trim();
  if (!n) return "";
  const t = (tipo ?? "").trim().toUpperCase();
  return t === "RUC" || (!t && /^\d{11}$/.test(n)) ? n : "";
}

function titularEsElCtp(p: PermisoDelOficio, ficha: FichaDelOficio | null): boolean {
  const razon = normalizarNombre(ficha?.razonSocial);
  return razon !== "" && !titularPorConfirmar(p.titularNombre) && razon === normalizarNombre(p.titularNombre);
}

function rucDelPermiso(p: PermisoDelOficio, parte: ParteDelPermiso | null, ficha: FichaDelOficio | null): string {
  return rucDe(p.titularDocTipo, p.titularDoc) || rucDe(parte?.docTipo, parte?.docNumero) || (titularEsElCtp(p, ficha) ? (ficha?.ruc ?? "").trim() : "");
}

/** Qué le falta al permiso para que el oficio salga completo (el aviso ofrece completarlo). */
export function faltasDelPermiso(p: PermisoDelOficio, parte: ParteDelPermiso | null, ficha: FichaDelOficio | null): FaltaDelPermiso[] {
  const faltan: FaltaDelPermiso[] = [];
  if (titularPorConfirmar(p.titularNombre)) faltan.push("titular");
  if (!rucDelPermiso(p, parte, ficha)) faltan.push("ruc");
  return faltan;
}

/**
 * Los casilleros que pone el permiso elegido: titular, RUC y representante.
 * Lo que el permiso no sabe queda VACÍO (el formulario lo marca para llenar):
 * el RUC y el representante de la Ficha CTP son del aserradero, no de la
 * comunidad, y sólo se usan si el titular del permiso es el propio CTP. Un
 * titular «por confirmar» no se escribe; si el casillero tenía la razón social
 * de la Ficha, se vacía (no es del permiso).
 */
export function datosDelPermiso(
  p: PermisoDelOficio,
  parte: ParteDelPermiso | null,
  ficha: FichaDelOficio | null,
  actual: DatosTramite,
): DatosTramite {
  const delCtp = titularEsElCtp(p, ficha);
  const cambios: DatosTramite = {
    permisoContratoId: p.id,
    permisoCodigo: p.codigo,
    entidadRuc: rucDelPermiso(p, parte, ficha),
    entidadRepresentante: (parte?.representante ?? "").trim() || (delCtp ? (ficha?.representante ?? "").trim() : ""),
  };
  if (!titularPorConfirmar(p.titularNombre)) cambios.entidadNombre = p.titularNombre.trim();
  else if (ficha?.razonSocial && normalizarNombre(actual.entidadNombre) === normalizarNombre(ficha.razonSocial)) cambios.entidadNombre = "";
  return cambios;
}
