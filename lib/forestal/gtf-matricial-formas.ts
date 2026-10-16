/**
 * gtf-matricial-formas — elegir, guardar, crear, renombrar y borrar las
 * «formas» del talonario (Brandon 16-10). El modelo y lo de antes están en
 * `gtf-matricial-titulares.ts`.
 *
 * Al abrir una guía se elige SOLA la forma de su dueño:
 *   1. la de su permiso Y su titular («exacta»);
 *   2. si no, la de su titular con otro permiso;
 *   3. si no, la de su permiso con el titular escrito distinto;
 *   4. si no, ninguna: se ve la de la empresa (o la de fábrica) y el primer
 *      «Guardar» crea la suya con el nombre «<permiso> · <titular>».
 * Empates: la guardada más reciente. Una elegida a mano (`formaId`) manda.
 *
 * Funciones puras: la DB class las usa dentro del bloqueo de la clave.
 */

import { z } from "zod";
import {
  disposicionDeFabrica,
  normalizarHoja,
  type DisposicionHoja,
  type DisposicionTalonario,
  type FormatoTalonario,
} from "./gtf-matricial-disposicion";
import {
  claveDeTitular,
  coincidencia,
  esDeLaEmpresa,
  ID_FORMA_EMPRESA,
  ID_FORMA_RE,
  idDeClaveV2,
  MAX_FORMAS,
  NOMBRE_FORMA_MAX,
  nombreAutomatico,
  texto,
  type AlmacenTalonario,
  type Coincidencia,
  type DuenoTalonario,
  type Firma,
  type FormaTalonario,
} from "./gtf-matricial-titulares";

/** Lo que la API acepta como id de forma y como nombre. */
export const formaIdSchema = z.string().trim().regex(ID_FORMA_RE, "Esa forma no existe");
export const nombreFormaSchema = z.string().trim().min(1, "Escribe un nombre").max(NOMBRE_FORMA_MAX, `Hasta ${NOMBRE_FORMA_MAX} letras`);

export interface ResumenForma {
  id: string;
  nombre: string;
  permiso: string | null;
  titular: string | null;
  actualizado: string | null;
  /** Qué tanto es del dueño de la guía abierta (null = de otro). */
  coincide: Coincidencia | null;
  /** La de la empresa: de ésa arranca un dueño que todavía no tiene la suya. */
  empresa: boolean;
}

/** De dónde sale lo que se ve: una forma guardada, la de la empresa (todavía no tiene la suya) o la de fábrica. */
export type OrigenDisposicion = "forma" | "empresa" | "fabrica";

export interface FormaResuelta {
  disposicion: DisposicionTalonario;
  origen: OrigenDisposicion;
  /** La forma que se edita y se imprime. null = el dueño todavía no tiene la suya: la crea el primer «Guardar». */
  forma: ResumenForma | null;
  /** Por qué se eligió: su coincidencia con la guía, o «elegida» (a mano, de otro dueño). */
  coincide: Coincidencia | "elegida" | null;
  /** Sin forma: el nombre con que se creará y de cuál arranca. */
  nueva: { nombre: string; desde: string | null } | null;
  /** El titular de la guía (para el encabezado de la hoja). null = guía sin titular. */
  titular: { clave: string; nombre: string } | null;
}

export type ErrorForma = "no_existe" | "tope" | "nombre_repetido";
export type ResultadoForma = { ok: true; almacen: AlmacenTalonario; forma: FormaTalonario; creada: boolean } | { ok: false; error: ErrorForma };

export const MENSAJE_ERROR_FORMA: Record<ErrorForma, string> = {
  no_existe: "Esa forma del talonario ya no existe: elige otra.",
  tope: `Ya hay ${MAX_FORMAS} formas guardadas: borra una que no uses o usa otra.`,
  nombre_repetido: "Ya hay una forma con ese nombre: elige otro.",
};

const RANGO: Record<Coincidencia, number> = { exacta: 0, titular: 1, permiso: 2 };
const lista = (alm: AlmacenTalonario): FormaTalonario[] => Object.values(alm.formas);
const fecha = (f: FormaTalonario): string => f.actualizado?.en ?? f.creada?.en ?? "";
const hojas = (f: FormaTalonario): DisposicionTalonario => ({ guia: f.guia, lista: f.lista, actualizado: f.actualizado });
const igualNombre = (a: string, b: string): boolean => a.localeCompare(b, "es", { sensitivity: "base" }) === 0;

export const formaDe = (alm: AlmacenTalonario, id: string | null | undefined): FormaTalonario | null =>
  id && Object.hasOwn(alm.formas, id) ? alm.formas[id] : null;

/** La más reciente de las que cumplen. */
const masReciente = (fs: FormaTalonario[]): FormaTalonario | null =>
  fs.reduce<FormaTalonario | null>((m, f) => (!m || fecha(f) > fecha(m) || (fecha(f) === fecha(m) && f.id < m.id) ? f : m), null);

/** La forma de este dueño (la mejor coincidencia; empate = la más reciente). `sin` = ignorar ésa (la que se borra). */
export function formaDelDueno(alm: AlmacenTalonario, dueno: DuenoTalonario, sin?: string): { forma: FormaTalonario; coincide: Coincidencia } | null {
  for (const nivel of ["exacta", "titular", "permiso"] as const) {
    const f = masReciente(lista(alm).filter((x) => x.id !== sin && coincidencia(x, dueno) === nivel));
    if (f) return { forma: f, coincide: nivel };
  }
  return null;
}

/** La de la empresa (sin referencia), la más reciente. */
const formaEmpresa = (alm: AlmacenTalonario): FormaTalonario | null => masReciente(lista(alm).filter(esDeLaEmpresa));

/** De la que arranca un dueño sin la suya: la de la empresa, o la de fábrica. */
function base(alm: AlmacenTalonario): { disposicion: DisposicionTalonario; origen: "empresa" | "fabrica"; desde: FormaTalonario | null } {
  const e = formaEmpresa(alm);
  return e ? { disposicion: hojas(e), origen: "empresa", desde: e } : { disposicion: disposicionDeFabrica(), origen: "fabrica", desde: null };
}

export function resumen(f: FormaTalonario, dueno: DuenoTalonario): ResumenForma {
  return {
    id: f.id,
    nombre: f.nombre,
    permiso: f.permiso,
    titular: f.titular,
    actualizado: fecha(f) || null,
    coincide: coincidencia(f, dueno),
    empresa: esDeLaEmpresa(f),
  };
}

/** Todas, las del dueño arriba (exacta → titular → permiso) y después por nombre. */
export function resumenFormas(alm: AlmacenTalonario, dueno: DuenoTalonario): ResumenForma[] {
  const r = (c: Coincidencia | null) => (c ? RANGO[c] : 9);
  return lista(alm)
    .map((f) => resumen(f, dueno))
    .sort((a, b) => r(a.coincide) - r(b.coincide) || a.nombre.localeCompare(b.nombre, "es"));
}

/**
 * La que abre el modal (y la que imprime la salida) para la guía de este
 * dueño. `formaId` = la elegida a mano: manda. null = esa forma no existe.
 */
export function resolverForma(alm: AlmacenTalonario, dueno: DuenoTalonario, formaId?: string | null): FormaResuelta | null {
  const clave = claveDeTitular(dueno.titular);
  const titular = clave ? { clave, nombre: texto(dueno.titular) ?? clave } : null;
  if (formaId) {
    const f = formaDe(alm, formaId);
    if (!f) return null;
    const c = coincidencia(f, dueno);
    return { disposicion: hojas(f), origen: "forma", forma: resumen(f, dueno), coincide: c ?? "elegida", nueva: null, titular };
  }
  const hallada = formaDelDueno(alm, dueno);
  if (hallada) return { disposicion: hojas(hallada.forma), origen: "forma", forma: resumen(hallada.forma, dueno), coincide: hallada.coincide, nueva: null, titular };
  const b = base(alm);
  return { disposicion: b.disposicion, origen: b.origen, forma: null, coincide: null, nueva: { nombre: nombreLibre(alm, nombreAutomatico(dueno)), desde: b.desde?.nombre ?? null }, titular };
}

/** El nombre, con « (2)», « (3)»… si ya hay una con ése (sin pasarse del largo). */
export function nombreLibre(alm: AlmacenTalonario, nombre: string, sin?: string): string {
  const ocupado = (n: string) => lista(alm).some((f) => f.id !== sin && igualNombre(f.nombre, n));
  if (!ocupado(nombre)) return nombre;
  for (let i = 2; ; i++) {
    const cola = ` (${i})`;
    const n = `${nombre.slice(0, NOMBRE_FORMA_MAX - cola.length).trim()}${cola}`;
    if (!ocupado(n)) return n;
  }
}

const conForma = (alm: AlmacenTalonario, f: FormaTalonario): AlmacenTalonario => {
  const formas = Object.assign(Object.create(null) as Record<string, FormaTalonario>, alm.formas);
  formas[f.id] = f;
  return { ...alm, formas };
};

function nuevaForma(dueno: DuenoTalonario, nombre: string, h: { guia: DisposicionHoja; lista: DisposicionHoja }, firma: Firma, id: string): FormaTalonario {
  return {
    id,
    nombre,
    permiso: texto(dueno.permiso),
    titular: texto(dueno.titular),
    planId: texto(dueno.planId),
    guia: h.guia,
    lista: h.lista,
    creada: firma,
    actualizado: firma,
  };
}

/**
 * Guarda UNA hoja. Con `formaId`, en ésa. Sin él, en la del dueño
 * («exacta»); si no tiene, la crea con el nombre automático, arrancando de la
 * que veía (la de la empresa o la de fábrica): guardar su guía no le resetea
 * la lista. `nuevoId` lo pone quien llama (el servidor).
 */
export function guardarHoja(
  alm: AlmacenTalonario,
  dueno: DuenoTalonario,
  formaId: string | null | undefined,
  formato: FormatoTalonario,
  hoja: unknown,
  firma: Firma,
  nuevoId: string,
): ResultadoForma {
  const limpia = normalizarHoja(formato, hoja);
  const delDueno = formaId ? null : formaDelDueno(alm, dueno);
  const hallada = formaId ? formaDe(alm, formaId) : delDueno?.coincide === "exacta" ? delDueno.forma : null;
  if (formaId && !hallada) return { ok: false, error: "no_existe" };
  if (hallada) {
    const f: FormaTalonario = { ...hallada, [formato]: limpia, actualizado: firma };
    return { ok: true, almacen: conForma(alm, f), forma: f, creada: false };
  }
  if (lista(alm).length >= MAX_FORMAS) return { ok: false, error: "tope" };
  const previa = base(alm).disposicion;
  const f = nuevaForma(dueno, nombreLibre(alm, nombreAutomatico(dueno)), { guia: previa.guia, lista: previa.lista, [formato]: limpia }, firma, nuevoId);
  return { ok: true, almacen: conForma(alm, f), forma: f, creada: true };
}

/**
 * «Nueva forma (copia de esta)»: con las dos hojas que se ven (aunque no estén
 * guardadas) y la referencia de la guía abierta. Sin nombre, el automático.
 */
export function crearForma(
  alm: AlmacenTalonario,
  dueno: DuenoTalonario,
  datos: { nombre?: string | null; guia: unknown; lista: unknown },
  firma: Firma,
  nuevoId: string,
): ResultadoForma {
  if (lista(alm).length >= MAX_FORMAS) return { ok: false, error: "tope" };
  const pedido = texto(datos.nombre)?.slice(0, NOMBRE_FORMA_MAX);
  if (pedido && nombreLibre(alm, pedido) !== pedido) return { ok: false, error: "nombre_repetido" };
  const nombre = pedido ?? nombreLibre(alm, nombreAutomatico(dueno));
  const f = nuevaForma(dueno, nombre, { guia: normalizarHoja("guia", datos.guia), lista: normalizarHoja("lista", datos.lista) }, firma, nuevoId);
  return { ok: true, almacen: conForma(alm, f), forma: f, creada: true };
}

/** Cambia sólo el nombre: la fecha de la forma es la de su calibración (con ella se desempata al elegir). */
export function renombrarForma(alm: AlmacenTalonario, id: string, nombre: string): ResultadoForma {
  const f = formaDe(alm, id);
  if (!f) return { ok: false, error: "no_existe" };
  const limpio = (texto(nombre) ?? "").slice(0, NOMBRE_FORMA_MAX);
  if (!limpio) return { ok: true, almacen: alm, forma: f, creada: false };
  if (nombreLibre(alm, limpio, id) !== limpio) return { ok: false, error: "nombre_repetido" };
  const nueva: FormaTalonario = { ...f, nombre: limpio };
  return { ok: true, almacen: conForma(alm, nueva), forma: nueva, creada: false };
}

export function borrarForma(alm: AlmacenTalonario, id: string): ResultadoForma {
  const f = formaDe(alm, id);
  if (!f) return { ok: false, error: "no_existe" };
  const formas = Object.assign(Object.create(null) as Record<string, FormaTalonario>, alm.formas);
  delete formas[id];
  return { ok: true, almacen: { ...alm, formas }, forma: f, creada: false };
}

/**
 * Las dos hojas de otra forma, para «Copiar de otra forma». Admite el id, «empresa»
 * (la de la empresa, o la de fábrica) y la clave de titular de la v2. null si no existe.
 */
export function disposicionDe(alm: AlmacenTalonario, de: string): DisposicionTalonario | null {
  const f = formaDe(alm, de) ?? formaDe(alm, idDeClaveV2(de));
  if (f) return hojas(f);
  return de === ID_FORMA_EMPRESA ? base(alm).disposicion : null;
}
