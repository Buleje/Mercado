"use client";

/**
 * use-puesta-al-dia — los datos de «Para poner al día» en la ficha del permiso.
 *
 * Reusa el volumen que la ficha ya tiene (precio y la lista de corridas sin
 * materia prima salen de ahí) y pide aparte SÓLO lo que falta, en paralelo y
 * sin bloquear el primer pintado:
 *  · la llegada de sus guías (`wood-entries/recepcion`), si tiene guías;
 *  · la vista previa de «Acomodar» acotada al permiso, si alguna GTF tiene dos
 *    o más especies (si no, no hay a dónde mover);
 *  · el patio del permiso y los lotes, si hay corridas sin materia prima (las
 *    MISMAS URLs que «Descontar la madera usada»: `ctpGet` las comparte).
 *
 * Cada vez que llega un volumen nuevo (la ficha recarga después de cada
 * arreglo, con `invalidarCtp()` antes) se vuelve a pedir: así la lista se
 * recalcula sola. Mientras tanto se sigue mostrando lo anterior.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { URL_RECEPCION } from "@/hooks/use-contexto-de-llegada";
import type { PlanAcomodo } from "@/lib/forestal/acomodar-trozas";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import type { ContextoDeLlegada } from "@/lib/forestal/fecha-de-llegada";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import {
  armarPuestaAlDia,
  guiasRecibidasDelPermiso,
  hayGuiasDeVariasEspecies,
  resumirDescontar,
  resumirFecha,
  resumirPrecio,
  resumirTrozas,
  TROZAS_SIN_NADA,
  type Dato,
  type GuiaRecibidaDelPermiso,
  type PuestaAlDia,
  type ResumenDescontar,
} from "@/lib/forestal/puesta-al-dia-del-permiso";
import { planDescontar } from "@/lib/forestal/vincular-desde-permiso";
import type { VolumenDelPermiso } from "@/lib/forestal/volumen-del-permiso";
import { logger } from "@/lib/logger";
import { URL_LOTES_DEL_PATIO, urlDelPatio } from "./use-lotes-aserrio";

/** El tope del endpoint de llegada (`MAX_GUIAS_CONTEXTO`). */
const TOPE_GUIAS = 60;
const URL_ACOMODAR = "/api/admin/forestal/wood-entries/acomodar-trozas";

interface Patio {
  trozas: TrozaConsumible[];
  lotes: LoteAserrio[];
}

const CARGANDO = { estado: "cargando" } as const;
const listo = <T,>(valor: T): Dato<T> => ({ estado: "listo", valor });
const mensaje = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Pide `url` y devuelve lo que se sabe: nunca rechaza (el error es un estado del paso). */
function pedir<T>(url: string, que: string): Promise<Dato<T>> {
  return ctpGet<T>(url).then(
    (d) => listo(d),
    (err: unknown) => {
      logger.warn(`[puesta-al-dia] no se pudo leer ${que}`, { error: String(err) });
      return { estado: "error", mensaje: mensaje(err) } as const;
    },
  );
}

export interface EstadoPuestaAlDia {
  lista: PuestaAlDia;
  /** Las guías ya recibidas del permiso: las candidatas de «Corregir la recepción». */
  recibidas: GuiaRecibidaDelPermiso[];
  /** De ésas, SÓLO las que cuenta el paso 1 (recibidas después de sus corridas): con ellas abre el modal. */
  aCorregir: GuiaRecibidaDelPermiso[];
  /** Hay un pedido en vuelo (después de un arreglo, mientras se recalcula). */
  actualizando: boolean;
  reintentar: () => void;
}

export function usePuestaAlDia(volumen: VolumenDelPermiso): EstadoPuestaAlDia {
  const gtfs = useMemo(() => [...new Set(volumen.guias.map((g) => g.gtf.trim()).filter(Boolean))].sort(), [volumen.guias]);
  const variasEspecies = useMemo(() => hayGuiasDeVariasEspecies(volumen.guias), [volumen.guias]);
  const sinMp = volumen.avisos.corridasSinMateriaPrima.ids;

  const [llegada, setLlegada] = useState<Dato<{ guias: ContextoDeLlegada[] }>>(CARGANDO);
  const [acomodo, setAcomodo] = useState<Dato<PlanAcomodo>>(CARGANDO);
  const [patio, setPatio] = useState<Dato<Patio>>(CARGANDO);
  const [actualizando, setActualizando] = useState(false);
  const [vuelta, setVuelta] = useState(0);
  const permisoRef = useRef(volumen.contratoId);

  useEffect(() => {
    /* Otro permiso: lo pintado es del anterior, no se muestra mientras llega. */
    if (permisoRef.current !== volumen.contratoId) {
      permisoRef.current = volumen.contratoId;
      setLlegada(CARGANDO);
      setAcomodo(CARGANDO);
      setPatio(CARGANDO);
    }
    let vivo = true;
    const guias = gtfs.slice(0, TOPE_GUIAS);
    const qs = guias.map((g) => `gtf=${encodeURIComponent(g)}`).join("&");
    const nada = <T,>(v: T) => Promise.resolve<Dato<T> | null>(listo(v));
    /* Los tres llegan y se aplican JUNTOS: la contestación de la llegada sola
       (más rápida) mostraba el paso 1 hecho con el patio todavía viejo, y el
       paso 4 decía «sin madera» un segundo antes de decir «se pueden ya». */
    const tareas = [
      guias.length > 0 ? pedir<{ guias: ContextoDeLlegada[] }>(`${URL_RECEPCION}?${qs}`, "la llegada de las guías") : nada({ guias: [] }),
      variasEspecies
        ? pedir<{ plan: PlanAcomodo }>(`${URL_ACOMODAR}?contratoId=${encodeURIComponent(volumen.contratoId)}`, "las trozas")
        : Promise.resolve(null),
      sinMp.length > 0
        ? Promise.all([
            pedir<{ lotes?: LoteAserrio[] }>(URL_LOTES_DEL_PATIO, "los lotes"),
            pedir<{ trozas?: TrozaConsumible[] }>(urlDelPatio(volumen.contratoId), "el patio del permiso"),
          ])
        : Promise.resolve(null),
    ] as const;
    setActualizando(true);
    void Promise.all(tareas).then(([l, a, pt]) => {
      if (!vivo) return;
      if (l) setLlegada(l);
      if (a) setAcomodo(a.estado === "listo" ? listo(a.valor.plan) : a);
      if (pt) {
        const [lotes, trozas] = pt;
        setPatio(
          lotes.estado !== "listo"
            ? lotes
            : trozas.estado !== "listo"
              ? trozas
              : listo({ lotes: lotes.valor.lotes ?? [], trozas: trozas.valor.trozas ?? [] }),
        );
      }
      setActualizando(false);
    });
    return () => {
      vivo = false;
    };
    // `volumen` entero: cada recarga de la ficha trae uno nuevo y la lista se rehace.
  }, [volumen, gtfs, variasEspecies, sinMp, vuelta]);

  const contextos = llegada.estado === "listo" ? llegada.valor.guias : null;

  const lista = useMemo(() => {
    const corridas = new Set(sinMp);
    const descontar: Dato<ResumenDescontar> =
      sinMp.length === 0
        ? listo(resumirDescontar({ grupos: [], apartadas: [] }))
        : patio.estado !== "listo"
          ? patio
          : listo(
              resumirDescontar(
                planDescontar(
                  volumen.corridas.filter((c) => corridas.has(c.id)),
                  patio.valor.trozas,
                  patio.valor.lotes,
                  volumen.guias.map((g) => ({ id: g.id, gtf: g.gtf, especie: g.especie, m3: g.m3, consumidoM3: g.consumidoM3 })),
                ),
              ),
            );
    return armarPuestaAlDia({
      fecha: llegada.estado === "listo" ? listo(resumirFecha(gtfs, llegada.valor.guias)) : llegada,
      trozas: !variasEspecies ? listo(TROZAS_SIN_NADA) : acomodo.estado === "listo" ? listo(resumirTrozas(acomodo.valor)) : acomodo,
      precio: resumirPrecio(volumen.guias),
      descontar,
    });
  }, [volumen, gtfs, variasEspecies, sinMp, llegada, acomodo, patio]);

  const recibidas = useMemo(
    () => (contextos ? guiasRecibidasDelPermiso(volumen.guias, contextos) : []),
    [volumen.guias, contextos],
  );

  /* El paso dice «corrige N guías»: el modal abre con ESAS N, no con todas las
     recibidas del permiso (revisión 25-09: decía 1 y el modal mostraba 3 sin marcar). */
  const aCorregir = useMemo(() => {
    if (llegada.estado !== "listo") return [];
    const sospechosas = new Set(resumirFecha(gtfs, llegada.valor.guias).sospechosas);
    return recibidas.filter((g) => sospechosas.has(g.clave));
  }, [llegada, gtfs, recibidas]);

  const reintentar = useCallback(() => setVuelta((v) => v + 1), []);

  return { lista, recibidas, aCorregir, actualizando, reintentar };
}
