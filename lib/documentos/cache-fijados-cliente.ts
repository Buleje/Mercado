"use client";

/**
 * Caché del Acceso rápido del Archivo (lo fijado), para pintarlo al instante.
 *
 * Lleva nombres de carpetas y papeles, así que va como la lista del Archivo
 * (`cache-lista-cliente.ts`): memoria del módulo + `sessionStorage`, con la clave
 * de quién mira (tienda + usuario + rol), NUNCA `localStorage` (Ley 29733, PCs
 * compartidas en caja). Entrar, salir o suplantar lo borra. La verdad está en
 * el servidor, por persona (`/api/admin/preferences/fijados-drive`).
 *
 * Antes del 16-10 lo fijado vivía sólo en `localStorage`
 * (`drive-acceso-rapido:<slug>`), sin decir de quién era: en la PC de caja, el
 * cajero que entraba después veía (y subía como suyo) lo que fijó el dueño.
 * Eso queda como «legado»: no se pinta a nadie y sólo lo adopta quien ya ve
 * todo el Archivo (dueño), que así no pierde lo que fijó en ese navegador.
 */

import { cachedJsonVigente, oirEscrituras } from "@/lib/client-cache-fetch";
import { identidadActual } from "@/lib/documentos/cache-lista-cliente";
import { veTodoElDrive } from "@/lib/documents/doc-access";

const CLAVE = "archivo:v1:fijados";
const memoria = new Map<string, unknown[]>();

function sesion(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null; // almacenamiento bloqueado: queda sólo la memoria
  }
}

/** Lo fijado que vio quien mira ahora (`null` si no se sabe quién o no hay nada). */
export function fijadosGuardados(): unknown[] | null {
  const quien = identidadActual();
  if (!quien) return null;
  const enMemoria = memoria.get(quien);
  if (enMemoria) return enMemoria;
  const s = sesion();
  const crudo = s?.getItem(CLAVE);
  if (!s || !crudo) return null;
  try {
    const v = JSON.parse(crudo) as { quien?: unknown; fijados?: unknown };
    if (v.quien === quien && Array.isArray(v.fijados)) {
      memoria.set(quien, v.fijados);
      return v.fijados;
    }
  } catch (err) {
    console.warn("[acceso-rapido] la caché de la pestaña no se pudo leer", err);
  }
  s.removeItem(CLAVE); // de otra sesión o roto: no se muestra y no se deja ahí
  return null;
}

/** Guarda lo fijado de quien mira (sin quién, no se guarda). */
export function guardarFijados(fijados: unknown[]): void {
  const quien = identidadActual();
  if (!quien) return;
  memoria.set(quien, fijados);
  try {
    sesion()?.setItem(CLAVE, JSON.stringify({ quien, fijados }));
  } catch (err) {
    console.warn("[acceso-rapido] no entró en sessionStorage", err);
  }
}

/** Para tests y para «salir»: no queda nada de nadie. */
export function olvidarFijados(): void {
  memoria.clear();
  sesion()?.removeItem(CLAVE);
}

/* ── Legado (localStorage de antes del 16-10, sin dueño) ────────────────── */

const claveLegado = (slug: string) => `drive-acceso-rapido:${slug}`;

/** ¿Quien mira puede adoptar el legado? Sólo quien ya ve todo el Archivo: no se le revela nada. */
export function puedeAdoptarLegado(): boolean {
  const yo = cachedJsonVigente<{ role?: string | null } | null>("/api/auth/me", Number.POSITIVE_INFINITY);
  return !!identidadActual() && veTodoElDrive(yo?.role);
}

/** Lo que quedó en este navegador (crudo: el hook lo sanea). `[]` si no hay o está roto. */
export function leerLegado(slug: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(claveLegado(slug)) ?? "[]");
  } catch (err) {
    console.warn("[acceso-rapido] el legado no se pudo leer", err);
    return [];
  }
}

export function borrarLegado(slug: string): void {
  try {
    localStorage.removeItem(claveLegado(slug));
  } catch (err) {
    console.warn("[acceso-rapido] el legado no se pudo borrar", err);
  }
}

if (typeof window !== "undefined") {
  oirEscrituras(({ cambiaSesion }) => {
    if (cambiaSesion) olvidarFijados();
  });
}
