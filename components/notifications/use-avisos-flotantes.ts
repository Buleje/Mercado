"use client";

/**
 * useAvisosFlotantes — cada aviso NUEVO de la campana sale como notificación
 * flotante (toast) y suena el sonido elegido (Brandon 20-10). Lo monta
 * `NotificationBell` con su total sin leer.
 *
 * - La primera carga es la base: lo que ya estaba sin leer al abrir el panel
 *   no sale flotando.
 * - Cuando el total SUBE, pide los nuevos sin leer (tantos como subió, tope 5).
 * - Dos pestañas del panel: el id se RECLAMA en `localStorage` antes de
 *   mostrarlo (`avisos-flotantes:<negocio>:<usuario>`); la que llega segunda
 *   ya lo ve reclamado y no lo repite. El sondeo de la campana se pausa con
 *   la pestaña oculta: la que está a la vista es la que avisa.
 * - El sonido suena UNA vez por tanda, aunque los flotantes estén apagados.
 */
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import { tocarSonido } from "@/lib/agenda/sonidos";
import type { AvisoPantalla } from "@/lib/agenda/aviso-pantalla";
import { useConfigAviso } from "@/hooks/use-aviso-agenda";
import { escribirGuardado, leerGuardado, useClaveDeUsuario } from "@/hooks/use-clave-de-usuario";
import { abrirCentro, hayCentroUnificado } from "./centro-unificado";
import { abrirAccionDeAviso } from "./notificaciones-categorias";
import {
  armarTanda,
  cuantosPedir,
  cuerpoCorto,
  estiloDe,
  listaGuardada,
  reclamar,
  textoResto,
  totalNuevos,
  type AvisoFlotante,
} from "./avisos-flotantes";

const API = "/api/notification-center";
const PREFIJO = "avisos-flotantes";

type Preferencias = Pick<AvisoPantalla, "sonido" | "volumen" | "flotantes">;

function leerLista(clave: string): string[] {
  const texto = leerGuardado(clave);
  if (!texto) return [];
  try {
    return listaGuardada(JSON.parse(texto));
  } catch {
    return [];
  }
}

/** La campana relee su total al oírlo (`NotificationBell`): sin esto el número tardaba hasta 30 s en bajar. */
export const EVENTO_RELEER_CAMPANA = "notificaciones:releer";

/** Como la campana: PATCH con el token CSRF (sin él, 403); después la campana relee su total. */
function marcarLeido(id: string): void {
  void fetch(`${API}/${id}/read`, { method: "PATCH", headers: csrfHeaders() })
    .then((r) => {
      if (!r.ok) logger.warn("[avisos-flotantes] no se guardó el leído", { id, status: r.status });
      else window.dispatchEvent(new Event(EVENTO_RELEER_CAMPANA));
    })
    .catch((err: unknown) => logger.warn("[avisos-flotantes] no se guardó el leído", { id, error: String(err) }));
}

function mostrarUno(n: AvisoFlotante): void {
  const { tipo, duracion } = estiloDe(n.severity);
  const url = n.actionUrl;
  toast[tipo](n.title, {
    id: `aviso-flotante-${n.id}`,
    description: cuerpoCorto(n.body) || undefined,
    duration: duracion,
    action: url
      ? {
          label: n.actionLabel?.trim() || "Ver",
          onClick: () => {
            marcarLeido(n.id);
            abrirAccionDeAviso(url);
          },
        }
      : undefined,
  });
}

function mostrarResto(resto: number, ultimo: string): void {
  const conCentro = hayCentroUnificado();
  toast.info(textoResto(resto), {
    id: `aviso-flotante-resto-${ultimo}`,
    description: conCentro ? undefined : "Míralos en la campana (tecla N)",
    duration: 9_000,
    action: conCentro ? { label: "Ver todas", onClick: () => void abrirCentro("todas") } : undefined,
  });
}

async function avisarNuevos(clave: string, pedir: number, subio: number, pref: Preferencias, vivo: () => boolean): Promise<void> {
  let items: AvisoFlotante[];
  try {
    const res = await fetch(`${API}?${new URLSearchParams({ limit: String(pedir), unread: "true" })}`);
    if (!res.ok) {
      logger.warn("[avisos-flotantes] no se pudieron traer los avisos nuevos", { status: res.status });
      return;
    }
    const data: unknown = await res.json();
    items = Array.isArray(data) ? (data as AvisoFlotante[]) : [];
  } catch (err) {
    logger.warn("[avisos-flotantes] no se pudieron traer los avisos nuevos", { error: String(err) });
    return;
  }
  if (!vivo()) return;
  const sinLeer = items.filter((n) => !n.readAt);
  /* Leer, reclamar y escribir sin un `await` en medio: la otra pestaña lee lo ya reclamado. */
  const { mios, lista } = reclamar(leerLista(clave), sinLeer.map((n) => n.id));
  if (mios.length === 0) return;
  escribirGuardado(clave, lista);

  if (pref.sonido !== "ninguno") tocarSonido(pref.sonido, pref.volumen);
  if (!pref.flotantes) return;
  const nuevos = sinLeer.filter((n) => mios.includes(n.id));
  const tanda = armarTanda(nuevos, totalNuevos(subio, items.length, mios.length));
  /* Sonner pone adelante el último que llega: el resumen primero y el más urgente al final, encima de todo. */
  if (tanda.resto > 0) mostrarResto(tanda.resto, mios[0] ?? "");
  for (const n of [...tanda.sueltos].reverse()) mostrarUno(n);
}

/** Tras bajar el total, una subida en este rato es la marca que no se guardó, no avisos nuevos. */
const SUBIDA_POR_MARCA_FALLIDA_MS = 10_000;

export function useAvisosFlotantes(unreadCount: number, cargando: boolean): void {
  const { config } = useConfigAviso();
  const clave = useClaveDeUsuario(PREFIJO);
  const antes = useRef<number | null>(null);
  /** Cuándo bajó el total por última vez (alguien marcó leído). */
  const bajo = useRef(0);
  const deQuien = useRef<string | null>(null);
  const pref = useRef<Preferencias>(config);
  const montado = useRef(true);

  useEffect(() => {
    pref.current = { sonido: config.sonido, volumen: config.volumen, flotantes: config.flotantes };
  }, [config.sonido, config.volumen, config.flotantes]);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  useEffect(() => {
    /* Sin saber quién es no hay dónde reclamar: la base se toma recién entonces. */
    if (cargando || clave === null) return;
    /* Otra persona u otro negocio sin recargar: se vuelve a tomar la base. */
    if (deQuien.current !== clave) {
      deQuien.current = clave;
      antes.current = null;
    }
    const base = antes.current;
    antes.current = unreadCount;
    if (base !== null && unreadCount < base) bajo.current = Date.now();
    /* Un «marcar leído» que falló devuelve el total enseguida: esa subida no son
       avisos nuevos (revisión 20-10: salían los viejos como flotantes). */
    if (Date.now() - bajo.current < SUBIDA_POR_MARCA_FALLIDA_MS) return;
    const pedir = cuantosPedir(base, unreadCount);
    if (pedir === 0 || !clave || base === null) return;
    void avisarNuevos(clave, pedir, unreadCount - base, pref.current, () => montado.current);
  }, [unreadCount, cargando, clave]);
}
