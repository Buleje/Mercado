/**
 * gtf-matricial-titulares — lo guardado del talonario de la matricial y de
 * quién es cada «forma».
 *
 * Una FORMA (Brandon 16-10: «cada encaje y configuración se guardará
 * independiente con su nombre… para usar varias formas en diferentes
 * permisos») es todo lo que encaja un papel: las dos hojas (guía y lista) con
 * su medida, corrimiento, campos y tabla. Lleva un nombre que se puede cambiar
 * y una REFERENCIA: el dueño de las guías para las que se calibró (permiso y
 * titular, la misma identidad con que se numeran: ADR-452, `loth-talonario.ts`).
 * Con la referencia se elige sola al abrir una guía (`gtf-matricial-formas.ts`).
 *
 * Las impresoras (`perfiles`) NO son de la forma: son la calibración de cada
 * matricial (Oficina / Monte) y valen para todas.
 *
 * Guardado (misma clave de PlatformSettings, `gtf-talonario:<tenantId>`):
 *   v3 { version: 3, formas: { <id>: FormaTalonario }, perfiles }
 * Compatible hacia atrás, al leer:
 *   v2 { version: 2, empresa, porTitular: { <clave>: {...} }, perfiles } →
 *      la de la empresa pasa a la forma «empresa» (sin referencia: es de la que
 *      arranca un dueño sin la suya) y cada titular a una forma con su nombre
 *      automático. Los ids salen de la clave: dos lecturas dan los mismos.
 *   v1 { guia, lista } sueltas → la forma «empresa».
 * La primera escritura (guardar una hoja, una impresora) ya deja la v3.
 *
 * Funciones puras: la DB class las usa dentro del bloqueo de la clave.
 */

import { normalizarDisposicion, type DisposicionHoja } from "./gtf-matricial-disposicion";
import { normalizarPerfiles, perfilesDeFabrica, type PerfilesTalonario } from "./gtf-matricial-perfiles";
import { mismoPermiso, mismoTitular } from "./loth-talonario";
import { palabrasDelTitular } from "./serfor-titular";

/** Tope de formas que se pueden crear por tenant: el KV no es una tabla (≈9 KB cada una). */
export const MAX_FORMAS = 60;
/** Lo que se lee de lo guardado antes (la v2 admitía 300 titulares): leer nunca pierde una. */
const MAX_LEIDAS = 300;
export const NOMBRE_FORMA_MAX = 60;
/** Id corto: letras, números y guiones. */
export const ID_FORMA_RE = /^[a-z0-9][a-z0-9-]{0,23}$/;
/** La forma que viene de la «de la empresa» de antes. */
export const ID_FORMA_EMPRESA = "empresa";
export const NOMBRE_EMPRESA = "La empresa";

/** El dueño del talonario, con los mismos tres datos que la numeración. */
export interface DuenoTalonario {
  titular: string | null;
  permiso: string | null;
  planId: string | null;
}

export interface Firma {
  en: string;
  por: string;
}

export interface FormaTalonario {
  id: string;
  nombre: string;
  /** Referencia: el dueño de las guías para las que se calibró. Todo null = la de la empresa. */
  permiso: string | null;
  titular: string | null;
  planId: string | null;
  guia: DisposicionHoja;
  lista: DisposicionHoja;
  creada: Firma | null;
  actualizado: Firma | null;
}

export interface AlmacenTalonario {
  version: 3;
  /** Sin prototipo: un id «constructor» guardado es una forma más, no un atajo al objeto. */
  formas: Record<string, FormaTalonario>;
  /** Una calibración por impresora; Oficina siempre está. */
  perfiles: PerfilesTalonario;
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const firmaDe = (v: unknown): Firma | null => (esObjeto(v) && typeof v.en === "string" && typeof v.por === "string" ? { en: v.en, por: v.por } : null);

const sinPrototipo = <T>(): Record<string, T> => Object.create(null) as Record<string, T>;

/** La clave del titular: sus palabras canónicas ordenadas. null si no tiene nombre. */
export function claveDeTitular(nombre: string | null | undefined): string | null {
  const t = texto(nombre);
  if (!t) return null;
  const ps = [...palabrasDelTitular(t)].sort();
  return ps.length ? ps.join(" ") : null;
}

/** «17-CPO/C-J-001-02 · Maderera El Aguajal SAC»; sin permiso, el titular; sin nada, «La empresa». */
export function nombreAutomatico(d: Pick<DuenoTalonario, "permiso" | "titular">): string {
  const partes = [texto(d.permiso), texto(d.titular)].filter((p): p is string => !!p);
  return (partes.length ? partes.join(" · ") : NOMBRE_EMPRESA).slice(0, NOMBRE_FORMA_MAX).trim();
}

/** La de la empresa: sin titular, sin permiso y sin plan. De ésa arranca un dueño sin la suya. */
export const esDeLaEmpresa = (f: Pick<FormaTalonario, "titular" | "permiso" | "planId">): boolean =>
  !texto(f.titular) && !texto(f.permiso) && !texto(f.planId);

export type Coincidencia = "exacta" | "titular" | "permiso";

/**
 * ¿La forma es de este dueño? «exacta» = mismo permiso (o plan) Y mismo
 * titular; «titular» = el mismo titular con otro permiso; «permiso» = el mismo
 * permiso con el titular escrito distinto (la vara de la numeración). Sin
 * titular de los dos lados: exacta si tampoco hay permiso o es el mismo.
 */
export function coincidencia(f: Pick<FormaTalonario, "titular" | "permiso" | "planId">, d: DuenoTalonario): Coincidencia | null {
  const tf = texto(f.titular);
  const td = texto(d.titular);
  const mismoPerm = (!!texto(d.planId) && f.planId === d.planId) || mismoPermiso(f.permiso, d.permiso);
  const sinPermiso = !texto(f.permiso) && !texto(f.planId) && !texto(d.permiso) && !texto(d.planId);
  if (!tf && !td) return mismoPerm || sinPermiso ? "exacta" : null;
  const mismoTit = !!tf && !!td && mismoTitular(tf, td);
  if (mismoTit) return mismoPerm || sinPermiso ? "exacta" : "titular";
  return mismoPerm ? "permiso" : null;
}

export const almacenVacio = (): AlmacenTalonario => ({ version: 3, formas: sinPrototipo(), perfiles: perfilesDeFabrica() });

function normalizarForma(id: string, raw: unknown): FormaTalonario | null {
  if (!esObjeto(raw) || !ID_FORMA_RE.test(id)) return null;
  const nombre = texto(raw.nombre)?.slice(0, NOMBRE_FORMA_MAX);
  if (!nombre) return null;
  const d = normalizarDisposicion(raw);
  return {
    id,
    nombre,
    permiso: texto(raw.permiso),
    titular: texto(raw.titular),
    planId: texto(raw.planId),
    guia: d.guia,
    lista: d.lista,
    creada: firmaDe(raw.creada),
    actualizado: firmaDe(raw.actualizado),
  };
}

/** FNV-1a de 32 bits en base 36: el id de un titular de la v2 sale siempre igual de su clave. */
function hashCorto(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** El id que toma el talonario de un titular guardado en la v2 (para «Copiar de» con la clave vieja). */
export const idDeClaveV2 = (clave: string): string => `t-${hashCorto(clave)}`;

/** La de la empresa de antes, como forma. */
function formaEmpresa(raw: unknown): FormaTalonario {
  const d = normalizarDisposicion(raw);
  const act = d.actualizado ?? null;
  return { id: ID_FORMA_EMPRESA, nombre: NOMBRE_EMPRESA, permiso: null, titular: null, planId: null, guia: d.guia, lista: d.lista, creada: act, actualizado: act };
}

function desdeV2(raw: Record<string, unknown>): Record<string, FormaTalonario> {
  const formas = sinPrototipo<FormaTalonario>();
  if (esObjeto(raw.empresa)) formas[ID_FORMA_EMPRESA] = formaEmpresa(raw.empresa);
  if (!esObjeto(raw.porTitular)) return formas;
  for (const [clave, v] of Object.entries(raw.porTitular)) {
    if (!esObjeto(v) || Object.keys(formas).length >= MAX_LEIDAS) continue;
    const titular = texto(v.nombre);
    if (!titular) continue;
    let id = idDeClaveV2(clave);
    for (let n = 2; Object.hasOwn(formas, id); n++) id = `${idDeClaveV2(clave)}-${n}`;
    const d = normalizarDisposicion(v);
    const permiso = texto(v.permiso);
    const act = d.actualizado ?? null;
    formas[id] = { id, nombre: nombreAutomatico({ permiso, titular }), permiso, titular, planId: texto(v.planId), guia: d.guia, lista: d.lista, creada: act, actualizado: act };
  }
  return formas;
}

/** Lo guardado, de cualquier versión, como v3. */
export function normalizarAlmacen(raw: unknown): AlmacenTalonario {
  if (!esObjeto(raw)) return almacenVacio();
  if (raw.version === 3 || esObjeto(raw.formas)) {
    const formas = sinPrototipo<FormaTalonario>();
    if (esObjeto(raw.formas)) {
      for (const [id, v] of Object.entries(raw.formas)) {
        const f = normalizarForma(id, v);
        if (f && Object.keys(formas).length < MAX_LEIDAS) formas[id] = f;
      }
    }
    return { version: 3, formas, perfiles: normalizarPerfiles(raw.perfiles) };
  }
  if (raw.version === 2 || esObjeto(raw.porTitular)) {
    return { version: 3, formas: desdeV2(raw), perfiles: normalizarPerfiles(raw.perfiles) };
  }
  const formas = sinPrototipo<FormaTalonario>();
  if (esObjeto(raw.guia) || esObjeto(raw.lista)) formas[ID_FORMA_EMPRESA] = formaEmpresa(raw);
  return { version: 3, formas, perfiles: perfilesDeFabrica() };
}
