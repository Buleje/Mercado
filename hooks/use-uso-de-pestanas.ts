"use client";

import { useSyncExternalStore } from "react";
import { leerDelServidor, subirAlServidor } from "@/lib/admin/guardado-servidor";
import {
  contadorALista,
  listaAContador,
  sumarUso,
  unirContadores,
  type ContadorDeUso,
} from "@/lib/admin/orden-por-uso";

/**
 * Cuántas veces abre cada persona cada pestaña («Menú en tu orden», Brandon
 * 19-10). Mismo camino que «Abriste hace poco»: el navegador lo tiene para
 * pintar al instante y el servidor (`/api/admin/preferences/panel`, clave
 * `uso-pestanas`) lo lleva a la otra computadora. Sin schema.
 *
 * La barra lee el contador SIN esperar a `/api/auth/me`: por eso se guarda
 * aparte quién fue la última persona (`…:quien`). La cabecera llama a
 * `iniciarUsoDePestanas` cuando sabe quién es, y ahí se junta con el servidor.
 */
const LLAVE = "admin-uso-pestanas";
const PUNTERO = `${LLAVE}:quien`;
/** Fuera de `admin-`: `lib/tenant-cache.ts` borra ese prefijo al cambiar de negocio, y esto es de la persona, no del negocio. */
const LLAVE_MODO = "orden-pestanas-panel";
const EN_SERVIDOR = "uso-pestanas";
/** Un PUT reescribe la fila de `Settings` del negocio: se junta 1 min (cerrar u ocultar la pestaña vacía lo pendiente, `guardado-servidor`). */
const DEMORA_SUBIR = 60_000;

let quien: string | null = null;
/** Ya se juntó con el servidor en esta carga: recién ahí se sube (si no, pisaría lo de la otra computadora). */
let unido = false;

function leer(clave: string): string | null {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
}
function escribir(clave: string, valor: string): void {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    /* modo privado o cuota llena: se cuenta sólo en memoria de esta carga */
  }
}

const quienActual = () => quien ?? (typeof window === "undefined" ? null : leer(PUNTERO));

function leerLocal(q: string): ContadorDeUso {
  try {
    return listaAContador(JSON.parse(leer(`${LLAVE}:${q}`) ?? "[]"));
  } catch {
    return {};
  }
}
const guardarLocal = (q: string, c: ContadorDeUso) => escribir(`${LLAVE}:${q}`, JSON.stringify(contadorALista(c)));

/** La cabecera ya sabe quién es (`tenant:usuario`): fija la persona y junta con el servidor una vez. */
export function iniciarUsoDePestanas(q: string): void {
  if (quien === q) return;
  quien = q;
  unido = false;
  escribir(PUNTERO, q);
  void leerDelServidor(q, EN_SERVIDOR).then((valor) => {
    if (quien !== q || valor === undefined) return;
    unido = true;
    const local = leerLocal(q);
    const junto = valor ? unirContadores(local, listaAContador(valor)) : local;
    guardarLocal(q, junto);
    if (Object.keys(junto).length > 0) subirAlServidor(q, EN_SERVIDOR, contadorALista(junto), DEMORA_SUBIR);
  });
}

/** El contador de la persona de esta computadora, o `null` si todavía no se sabe quién es. */
export function leerContadorDeUso(): ContadorDeUso | null {
  const q = quienActual();
  return q ? leerLocal(q) : null;
}

/** Suma una apertura de «tab:vista». */
export function registrarUsoDePestana(clave: string, ahora: number = Date.now()): void {
  const q = quienActual();
  if (!q) return;
  const c = sumarUso(leerLocal(q), clave, ahora);
  guardarLocal(q, c);
  if (unido) subirAlServidor(q, EN_SERVIDOR, contadorALista(c), DEMORA_SUBIR);
}

/* ── «Orden de siempre / Ordenar por mi uso»: lo recuerda el navegador ── */

export type ModoOrden = "uso" | "siempre";
const oyentes = new Set<() => void>();
const leerModo = (): ModoOrden => (leer(LLAVE_MODO) === "siempre" ? "siempre" : "uso");
const modoEnServidor = (): ModoOrden => "siempre";
function suscribirModo(avisar: () => void) {
  oyentes.add(avisar);
  const deOtraPestana = (e: StorageEvent) => {
    if (e.key === LLAVE_MODO) avisar();
  };
  window.addEventListener("storage", deOtraPestana);
  return () => {
    oyentes.delete(avisar);
    window.removeEventListener("storage", deOtraPestana);
  };
}

export function fijarModoOrden(modo: ModoOrden): void {
  escribir(LLAVE_MODO, modo);
  for (const avisar of oyentes) avisar();
}

/** En el servidor «siempre»: el orden por uso depende del navegador y no puede salir en el HTML. */
export function useModoOrden(): ModoOrden {
  return useSyncExternalStore(suscribirModo, leerModo, modoEnServidor);
}
