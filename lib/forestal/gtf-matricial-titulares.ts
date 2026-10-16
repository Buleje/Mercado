/**
 * gtf-matricial-titulares — una disposición del talonario POR TITULAR
 * (Brandon 15-10: «una disposición por titular»). Cada titular compra su
 * talonario en su imprenta y los casilleros no caen en el mismo lugar.
 *
 * La identidad del titular es la MISMA que usa la numeración de la guía
 * (ADR-452, `esDelDueno` de `loth-talonario.ts`): mismo plan, mismo título
 * habilitante o el mismo titular escrito como sea. La clave guardada es la
 * forma canónica de `mismaPersona`: sus palabras sin relleno (SAC, COMUNIDAD,
 * NATIVA…), sin tildes, ordenadas.
 *
 * Guardado (misma clave de PlatformSettings que antes):
 *   { version: 2, empresa: { guia, lista } | null, porTitular: { <clave>: {...} } }
 * Compatible hacia atrás: la disposición de antes (`{ guia, lista }` sueltas)
 * pasa a ser la «de la empresa», y un titular sin la suya arranca copiándola.
 * `perfiles` (16-10): la calibración de cada impresora, de todos los titulares
 * (`gtf-matricial-perfiles.ts`); sin ella, Oficina + Monte de fábrica.
 *
 * Funciones puras: las usa la DB class dentro del bloqueo de la clave.
 */

import {
  disposicionDeFabrica,
  normalizarDisposicion,
  normalizarHoja,
  type DisposicionHoja,
  type DisposicionTalonario,
  type FormatoTalonario,
} from "./gtf-matricial-disposicion";
import { normalizarPerfiles, perfilesDeFabrica, type PerfilesTalonario } from "./gtf-matricial-perfiles";
import { esDelDueno } from "./loth-talonario";
import { palabrasDelTitular } from "./serfor-titular";

/** Tope de talonarios guardados por tenant: el KV no es una tabla. */
export const MAX_TITULARES = 300;

/** El dueño del talonario, con los mismos tres datos que la numeración. */
export interface DuenoTalonario {
  titular: string | null;
  permiso: string | null;
  planId: string | null;
}

export interface EntradaTitular {
  /** Como se escribió la primera vez que se guardó. */
  nombre: string;
  permiso: string | null;
  planId: string | null;
  guia: DisposicionHoja;
  lista: DisposicionHoja;
  actualizado: { en: string; por: string } | null;
}

export interface AlmacenTalonario {
  version: 2;
  empresa: DisposicionTalonario | null;
  porTitular: Record<string, EntradaTitular>;
  /** Una calibración por impresora; Oficina siempre está. */
  perfiles: PerfilesTalonario;
}

export type OrigenDisposicion = "titular" | "empresa" | "fabrica";

export interface DisposicionResuelta {
  disposicion: DisposicionTalonario;
  /** De dónde salió: la guardada del titular, la de la empresa (todavía no tiene la suya) o la de fábrica. */
  origen: OrigenDisposicion;
  /** null = guía sin titular: se edita la de la empresa. */
  titular: { clave: string; nombre: string } | null;
}

export interface ResumenTitular {
  clave: string;
  nombre: string;
  actualizado: string | null;
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** La clave del titular: sus palabras canónicas ordenadas. null si no tiene nombre. */
export function claveDeTitular(nombre: string | null | undefined): string | null {
  const t = texto(nombre);
  if (!t) return null;
  const ps = [...palabrasDelTitular(t)].sort();
  return ps.length ? ps.join(" ") : null;
}

export const almacenVacio = (): AlmacenTalonario => ({ version: 2, empresa: null, porTitular: {}, perfiles: perfilesDeFabrica() });

function normalizarEntrada(raw: unknown): EntradaTitular | null {
  if (!esObjeto(raw)) return null;
  const nombre = texto(raw.nombre);
  if (!nombre) return null;
  const d = normalizarDisposicion(raw);
  return { nombre, permiso: texto(raw.permiso), planId: texto(raw.planId), guia: d.guia, lista: d.lista, actualizado: d.actualizado ?? null };
}

/** Lo guardado, de cualquier versión. La de antes (`{ guia, lista }`) pasa a ser la de la empresa. */
export function normalizarAlmacen(raw: unknown): AlmacenTalonario {
  if (!esObjeto(raw)) return almacenVacio();
  if (raw.version === 2 || esObjeto(raw.porTitular)) {
    // Sin prototipo: una clave «__proto__» o «constructor» guardada es un titular más, no un atajo al objeto.
    const porTitular: Record<string, EntradaTitular> = Object.create(null);
    if (esObjeto(raw.porTitular)) {
      for (const [k, v] of Object.entries(raw.porTitular)) {
        const e = normalizarEntrada(v);
        if (e && Object.keys(porTitular).length < MAX_TITULARES) porTitular[k] = e;
      }
    }
    return {
      version: 2,
      empresa: esObjeto(raw.empresa) ? normalizarDisposicion(raw.empresa) : null,
      porTitular,
      perfiles: normalizarPerfiles(raw.perfiles),
    };
  }
  const hayVieja = esObjeto(raw.guia) || esObjeto(raw.lista);
  return { version: 2, empresa: hayVieja ? normalizarDisposicion(raw) : null, porTitular: {}, perfiles: perfilesDeFabrica() };
}

/** El talonario guardado de este dueño: clave exacta primero, si no la misma vara que la numeración. */
export function buscarTitular(alm: AlmacenTalonario, dueno: DuenoTalonario): { clave: string; entrada: EntradaTitular } | null {
  const clave = claveDeTitular(dueno.titular);
  if (!clave) return null;
  const exacta = Object.hasOwn(alm.porTitular, clave) ? alm.porTitular[clave] : undefined;
  if (exacta) return { clave, entrada: exacta };
  for (const [k, e] of Object.entries(alm.porTitular)) {
    if (esDelDueno({ titular: e.nombre, permiso: e.permiso, planId: e.planId }, dueno)) return { clave: k, entrada: e };
  }
  return null;
}

const deEntrada = (e: EntradaTitular): DisposicionTalonario => ({ guia: e.guia, lista: e.lista, actualizado: e.actualizado });

/** La de la empresa, o la de fábrica si nunca se guardó ninguna. */
const base = (alm: AlmacenTalonario): { disposicion: DisposicionTalonario; origen: OrigenDisposicion } =>
  alm.empresa ? { disposicion: alm.empresa, origen: "empresa" } : { disposicion: disposicionDeFabrica(), origen: "fabrica" };

/** La disposición que abre el modal para la guía de este dueño. */
export function resolverDisposicion(alm: AlmacenTalonario, dueno: DuenoTalonario): DisposicionResuelta {
  const clave = claveDeTitular(dueno.titular);
  if (!clave) return { ...base(alm), titular: null };
  const hallado = buscarTitular(alm, dueno);
  if (hallado) return { disposicion: deEntrada(hallado.entrada), origen: "titular", titular: { clave: hallado.clave, nombre: hallado.entrada.nombre } };
  return { ...base(alm), titular: { clave, nombre: texto(dueno.titular) ?? clave } };
}

/**
 * Guarda UNA hoja en el talonario del dueño (o en el de la empresa si la guía
 * no tiene titular). Un titular nuevo arranca de la que veía (la de la
 * empresa o la de fábrica): guardar su guía no le resetea la lista.
 * null = ya hay `MAX_TITULARES` talonarios y éste sería uno más.
 */
export function guardarHojaEnAlmacen(
  alm: AlmacenTalonario,
  dueno: DuenoTalonario,
  formato: FormatoTalonario,
  hoja: unknown,
  actualizado: { en: string; por: string },
): { almacen: AlmacenTalonario; disposicion: DisposicionTalonario } | null {
  const limpia = normalizarHoja(formato, hoja);
  const clave = claveDeTitular(dueno.titular);
  if (!clave) {
    const empresa: DisposicionTalonario = { ...base(alm).disposicion, [formato]: limpia, actualizado };
    return { almacen: { ...alm, empresa }, disposicion: empresa };
  }
  const hallado = buscarTitular(alm, dueno);
  if (!hallado && Object.keys(alm.porTitular).length >= MAX_TITULARES) return null;
  const previa = hallado ? deEntrada(hallado.entrada) : base(alm).disposicion;
  const entrada: EntradaTitular = {
    nombre: hallado?.entrada.nombre ?? texto(dueno.titular) ?? clave,
    permiso: hallado?.entrada.permiso ?? texto(dueno.permiso),
    planId: hallado?.entrada.planId ?? texto(dueno.planId),
    guia: previa.guia,
    lista: previa.lista,
    [formato]: limpia,
    actualizado,
  };
  const k = hallado?.clave ?? clave;
  return { almacen: { ...alm, porTitular: { ...alm.porTitular, [k]: entrada } }, disposicion: deEntrada(entrada) };
}

/** La de otro titular (o «empresa») para «Copiar de otro titular». null si no existe. */
export function disposicionDe(alm: AlmacenTalonario, de: string): DisposicionTalonario | null {
  if (de === "empresa") return base(alm).disposicion;
  // hasOwn: «constructor» o «toString» por la API devolvían {} en vez de null (revisión 15-10).
  return Object.hasOwn(alm.porTitular, de) ? deEntrada(alm.porTitular[de]) : null;
}

/** Los titulares que ya tienen su talonario, por nombre. */
export function resumenTitulares(alm: AlmacenTalonario): ResumenTitular[] {
  return Object.entries(alm.porTitular)
    .map(([clave, e]) => ({ clave, nombre: e.nombre, actualizado: e.actualizado?.en ?? null }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
}
