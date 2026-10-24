"use client";

/**
 * La ficha de una guía de Ingresos, direccionable: `?ingreso=<id de un asiento>`.
 *
 * El id es el de UN asiento del libro (lo que tienen a mano Saldos, Trozas y
 * Despacho: el `woodEntryId` de la troza); lo que se abre es la ficha de SU
 * guía (ADR-350), que junta las líneas de todas sus especies. El enlace lo
 * arma `lib/admin/enlaces-panel.ts` (cosa `ingreso`).
 *
 * La URL manda y la pantalla la sigue:
 *  - llegar con `?ingreso=` (enlace, QR, otra pestaña, «adelante») abre la
 *    ficha. Si la guía no está en la página de la lista (otro período, otra
 *    página, ya recibida), se busca por su GTF sin período;
 *  - «Ver ficha» escribe el id (entrada nueva: el «atrás» la cierra);
 *  - la ficha se cierra, o la reemplaza otra ventana (documento, cuadre,
 *    plata): el parámetro sale y el «atrás» siguiente no la reabre.
 */

import { useCallback, useEffect, useRef } from "react";
import { useFichaEnUrl } from "@/hooks/use-ficha-en-url";
import { logger } from "@/lib/logger";
import type { GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";
import type { WoodEntry } from "../ctp-shared";

export const PARAM_INGRESO = "ingreso";

type Guia = GuiaIngreso<WoodEntry>;

const esDeLaGuia = (g: Guia, id: string) => g.lineas.some((l) => l.id === id);

/** La guía de un asiento que no está en la página: el asiento dice su GTF y la GTF trae sus líneas. */
export async function buscarGuiaDelAsiento(id: string): Promise<Guia | null> {
  const r = await fetch(`/api/admin/forestal/wood-entries/${encodeURIComponent(id)}`, { credentials: "include" });
  if (!r.ok) return null;
  const asiento = ((await r.json()) as { entry?: WoodEntry })?.entry;
  if (!asiento?.gtfNumber) return null;
  const q = new URLSearchParams({ agrupar: "guia", gtf: asiento.gtfNumber, limit: "20", offset: "0" });
  const r2 = await fetch(`/api/admin/forestal/wood-entries?${q}`, { credentials: "include" });
  if (!r2.ok) return null;
  const { guias } = (await r2.json()) as { guias?: Guia[] };
  return guias?.find((g) => esDeLaGuia(g, id)) ?? null;
}

interface Opciones {
  /** Las guías de la página que se ve. */
  guias: readonly Guia[];
  /** La lista todavía no llegó: esperar antes de buscar afuera. */
  cargando: boolean;
  /** La ficha abierta en la pantalla, o `null`. */
  abierta: Guia | null;
  /** Abre la ficha (pide sus piezas). */
  abrir: (g: Guia) => void;
  /** Cierra la ficha en la pantalla (sin tocar la URL). */
  cerrar: () => void;
  /** El enlace apunta a un asiento que no existe (o no se pudo leer). */
  noEncontrada: () => void;
}

export interface GuiaDeIngresoEnUrl {
  /** «Ver ficha» desde la lista: abre y deja el enlace copiable en la URL. */
  abrirFicha: (g: Guia) => void;
}

export function useGuiaDeIngresoEnUrl({ guias, cargando, abierta, abrir, cerrar, noEncontrada }: Opciones): GuiaDeIngresoEnUrl {
  const url = useFichaEnUrl(PARAM_INGRESO);
  const { id, cerrar: sacarDeLaUrl } = url;
  const acciones = useRef({ abrir, cerrar, noEncontrada });
  useEffect(() => {
    acciones.current = { abrir, cerrar, noEncontrada };
  });

  /** El id que ya se atendió (abierto o buscándose): una vez por id, no en cada render. */
  const atendido = useRef<string | null>(null);
  /** Descarta la búsqueda de un id que ya no es el de la URL. */
  const turno = useRef(0);

  /* URL → pantalla. */
  useEffect(() => {
    if (!id) {
      turno.current++;
      if (atendido.current) {
        atendido.current = null;
        if (abierta) acciones.current.cerrar();
      }
      return;
    }
    if (abierta && esDeLaGuia(abierta, id)) {
      atendido.current = id;
      return;
    }
    if (atendido.current === id || cargando) return;
    atendido.current = id;
    const enLaPagina = guias.find((g) => esDeLaGuia(g, id));
    if (enLaPagina) {
      acciones.current.abrir(enLaPagina);
      return;
    }
    const mio = ++turno.current;
    buscarGuiaDelAsiento(id)
      .catch((err) => {
        logger.warn("[ingresos] no se pudo buscar la guía del enlace", { error: String(err) });
        return null;
      })
      .then((g) => {
        if (mio !== turno.current) return;
        if (g) {
          acciones.current.abrir(g);
          return;
        }
        acciones.current.noEncontrada();
        sacarDeLaUrl();
      });
  }, [id, guias, cargando, abierta, sacarDeLaUrl]);

  /* Pantalla → URL: la ficha se cerró (o la reemplazó otra ventana) con su id puesto. */
  const antes = useRef<Guia | null>(abierta);
  useEffect(() => {
    const previa = antes.current;
    antes.current = abierta;
    if (previa && !abierta && id && esDeLaGuia(previa, id)) sacarDeLaUrl();
  }, [abierta, id, sacarDeLaUrl]);

  const ponerEnLaUrl = url.abrir;
  const abrirFicha = useCallback(
    (g: Guia) => {
      const primera = g.lineas[0]?.id;
      if (primera) atendido.current = primera;
      acciones.current.abrir(g);
      if (primera) ponerEnLaUrl(primera);
    },
    [ponerEnLaUrl],
  );

  return { abrirFicha };
}
