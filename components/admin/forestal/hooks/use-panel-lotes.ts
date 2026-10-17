"use client";

/**
 * use-panel-lotes — el estado y las escrituras del panel «Lotes» de la
 * Distribución de rolliza (Brandon, 2026-10-03).
 *
 * Toda escritura va por las puertas de siempre del Libro:
 *  · sugeridos del patio → `POST /lotes-aserrio/propuestas {propuestas}`
 *    (`ForestLotePropuestaDB.crear`: `create` + `agregarTrozas`);
 *  · lote nuevo con trozas elegidas → `POST /lotes-aserrio/propuestas
 *    {modo: "crear", bloques}` (todo o nada, ADR-464);
 *  · sumar / sacar piezas de un lote → `PATCH /lotes-aserrio {accion:
 *    "agregar" | "quitar"}` (lock por troza, L-A1, ADR-393, T1).
 *
 * Después, el bloque recuerda su `loteId` y sus `trozaIds`: en el dispositivo
 * siempre y, si hay una distribución guardada abierta, se anota SÓLO eso en la
 * del servidor (sin subir lo demás de la tabla). Nada se consume acá: el
 * descuento de volumen es el de siempre, al registrar la producción.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { volumenLibre, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import type { ResultadoLotesPorBloque } from "@/lib/forestal/lotes-por-bloque";
import type { PropuestaDeLote, PropuestasDelPatio, ResultadoCrearLotes } from "@/lib/forestal/propuesta-de-lotes";
import {
  bloqueDesdeLote,
  permisoDelLote,
  ponerLoteEnLaTabla,
  trozaIdsLibresDelLote,
  trozaIdsTrasAgregar,
  trozaIdsTrasQuitar,
  vincularBloque,
} from "@/lib/forestal/panel-lotes-reparto";
import type { EstadoLotesAserrio, ResultadoGuardado } from "./use-lotes-aserrio";
import { crearLotesDelPatio, leerPropuestasDelPatio } from "../reparto-panel-lotes-api";
import { anotarLoteEnLaGuardada, crearLotesPorBloque } from "../reparto-lotes-sugeridos-api";

let contador = 0;
const nuevoId = () => `blq-${Date.now().toString(36)}-l${contador++}`;
const mensaje = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** El m³ de las trozas del patio más las del lote (las apartadas no están en el patio). */
const conTrozasDelLote = (patio: ReadonlyMap<string, number>, lote: LoteAserrio): Map<string, number> =>
  new Map([...patio, ...lote.trozas.map((t) => [t.id, Number(t.volumenM3) || 0] as [string, number])]);

export interface PanelLotesProps {
  bloques: BloqueRolliza[];
  /** Guarda la tabla entera en el dispositivo (lo hace la Distribución). */
  onGuardar: (next: BloqueRolliza[]) => void;
  /** El MISMO estado de lotes y patio de la Distribución: recargarlo acá la actualiza allá. */
  estadoLotes: EstadoLotesAserrio;
  /** La distribución guardada abierta, si hay: ahí se anota sólo el lote y las trozas. */
  distribucionId: string | null;
}

type Anotacion = Map<string, Pick<BloqueRolliza, "loteId" | "trozaIds">>;

export function usePanelLotes({ bloques, onGuardar, estadoLotes, distribucionId }: PanelLotesProps) {
  /* Lo último que se vio: una escritura termina segundos después y no puede
     guardar la tabla de cuando empezó (pisaría lo que se editó mientras). */
  const ultimo = useRef({ bloques, onGuardar, distribucionId });
  useEffect(() => {
    ultimo.current = { bloques, onGuardar, distribucionId };
  }, [bloques, onGuardar, distribucionId]);

  const { recargar: recargarLotes, agregarTrozas, quitarTroza } = estadoLotes;
  /* El m³ de cada troza del patio (para descontarlo del bloque que la cede). */
  const m3DelPatio = useRef(new Map<string, number>());
  useEffect(() => {
    m3DelPatio.current = new Map(estadoLotes.trozas.map((t) => [t.id, Number(t.volumenM3) || 0]));
  }, [estadoLotes.trozas]);

  const [patio, setPatio] = useState<PropuestasDelPatio | null>(null);
  const [errorPatio, setErrorPatio] = useState<string | null>(null);
  const [cargandoPatio, setCargandoPatio] = useState(true);

  const recargarPatio = useCallback(async () => {
    setCargandoPatio(true);
    try {
      setPatio(await leerPropuestasDelPatio());
      setErrorPatio(null);
    } catch (e) {
      setErrorPatio(mensaje(e));
    } finally {
      setCargandoPatio(false);
    }
  }, []);

  /* Al abrir: lo que propone el patio y los lotes de AHORA (otro equipo pudo armar uno). */
  useEffect(() => {
    void recargarPatio();
    recargarLotes().catch((err: unknown) => logger.error("[reparto.lotes] recargar lotes falló", { error: String(err) }));
  }, [recargarPatio, recargarLotes]);

  const refrescar = useCallback(() => {
    void recargarPatio();
    recargarLotes().catch((err: unknown) => logger.error("[reparto.lotes] recargar lotes falló", { error: String(err) }));
  }, [recargarPatio, recargarLotes]);

  /** Guarda la tabla y, si hay guardada abierta, anota sólo lote + trozas de los bloques tocados. */
  const cambiar = useCallback((fn: (prev: BloqueRolliza[]) => BloqueRolliza[], anotar?: Anotacion) => {
    const u = ultimo.current;
    const next = fn(u.bloques);
    u.onGuardar(next);
    ultimo.current = { ...u, bloques: next };
    if (u.distribucionId && anotar && anotar.size > 0) {
      anotarLoteEnLaGuardada(u.distribucionId, anotar).catch((err: unknown) =>
        logger.error("[reparto.lotes] anotar en la distribución guardada falló", { error: String(err) }),
      );
    }
  }, []);

  /** Cambia un bloque que ya está en la tabla y anota su lote y sus trozas. */
  const cambiarBloque = useCallback(
    (bloqueId: string, cambio: (b: BloqueRolliza) => Partial<BloqueRolliza>) => {
      const b = ultimo.current.bloques.find((x) => x.id === bloqueId);
      if (!b) return;
      const nuevo = { ...b, ...cambio(b) };
      cambiar(
        (prev) => prev.map((x) => (x.id === bloqueId ? nuevo : x)),
        new Map([[bloqueId, { loteId: nuevo.loteId ?? null, trozaIds: nuevo.trozaIds ?? null }]]),
      );
    },
    [cambiar],
  );

  /** 1. Crea los lotes elegidos del patio; cada uno entra como bloque con sus trozas. */
  const crearDelPatio = useCallback(
    async (elegidas: PropuestaDeLote[]): Promise<ResultadoCrearLotes> => {
      const r = await crearLotesDelPatio(
        elegidas.map((p) => ({ especie: p.especie, permiso: p.permiso, trozaIds: p.trozaIds })),
      );
      if (r.creados.length > 0) {
        /* Sin repetir madera: un bloque sin lote que ya tenía esas trozas se las cede al del lote. */
        const m3De = m3DelPatio.current;
        cambiar((prev) =>
          r.creados.reduce(
            (lista, c) =>
              ponerLoteEnLaTabla(
                lista,
                bloqueDesdeLote(nuevoId(), { id: c.loteId, code: c.code, especie: c.especie, permiso: c.permiso }, c.m3, c.trozaIds ?? null),
                m3De,
              ).lista,
            prev,
          ),
        );
        refrescar();
      }
      return r;
    },
    [cambiar, refrescar],
  );

  /** 2a. Un lote del Libro como bloque nuevo. No se repite: un lote, un bloque. */
  const traerLote = useCallback(
    (lote: LoteAserrio) => {
      if (ultimo.current.bloques.some((x) => x.loteId === lote.id)) return;
      const b = bloqueDesdeLote(
        nuevoId(),
        { id: lote.id, code: lote.code, especie: lote.speciesCommon, permiso: permisoDelLote(lote) },
        volumenLibre(lote),
        trozaIdsLibresDelLote(lote),
      );
      cambiar((prev) => ponerLoteEnLaTabla(prev, b, conTrozasDelLote(m3DelPatio.current, lote)).lista);
    },
    [cambiar],
  );

  /** 2b. Vincula un bloque existente a un lote. Devuelve el motivo si no se puede. */
  const vincular = useCallback(
    (bloqueId: string, lote: LoteAserrio): string | null => {
      const u = ultimo.current;
      const b = u.bloques.find((x) => x.id === bloqueId);
      if (!b) return "Ese bloque ya no está en la tabla.";
      const r = vincularBloque(b, lote, u.bloques);
      if ("motivo" in r) return r.motivo;
      cambiarBloque(bloqueId, () => r.bloque);
      return null;
    },
    [cambiarBloque],
  );

  /** 3a. Suma piezas al lote del bloque. El servidor devuelve las rechazadas con su motivo. */
  const agregarAlLote = useCallback(
    async (bloqueId: string, lote: LoteAserrio, ids: string[]): Promise<ResultadoGuardado> => {
      const r = await agregarTrozas(lote.id, ids);
      const rechazadas = new Set(r.rechazadas.map((x) => x.id));
      const entraron = ids.filter((id) => !rechazadas.has(id));
      if (entraron.length > 0) {
        cambiarBloque(bloqueId, (b) => ({ trozaIds: trozaIdsTrasAgregar(b, lote, entraron) }));
        void recargarPatio();
      }
      return r;
    },
    [agregarTrozas, cambiarBloque, recargarPatio],
  );

  /** 3b. Bloque sin lote: se le arma uno con EXACTAMENTE las piezas elegidas (todo o nada). */
  const crearLoteDelBloque = useCallback(
    async (bloqueId: string, ids: string[]): Promise<ResultadoLotesPorBloque> => {
      const b = ultimo.current.bloques.find((x) => x.id === bloqueId);
      if (!b) throw new Error("Ese bloque ya no está en la tabla.");
      const r = await crearLotesPorBloque([{ bloqueId, etiqueta: b.etiqueta, trozaIds: ids }]);
      const c = r.creados[0];
      if (c) {
        cambiarBloque(bloqueId, (x) => ({
          loteId: c.loteId,
          trozaIds: ids,
          especie: x.especie.trim() ? x.especie : c.especie,
          permiso: x.permiso?.trim() ? x.permiso : c.permiso,
        }));
        refrescar();
      }
      return r;
    },
    [cambiarBloque, refrescar],
  );

  /** 3c. Saca una pieza del lote del bloque (la puerta «quitar» del Libro). */
  const quitarDelLote = useCallback(
    async (bloqueId: string, lote: LoteAserrio, trozaId: string): Promise<void> => {
      await quitarTroza(lote.id, trozaId);
      cambiarBloque(bloqueId, (b) => ({ trozaIds: trozaIdsTrasQuitar(b, lote, trozaId) }));
      void recargarPatio();
    },
    [quitarTroza, cambiarBloque, recargarPatio],
  );

  /** Iguala el m³ del bloque a sus trozas. Cambia una cifra: queda para guardar a mano. */
  const igualarM3 = useCallback(
    (bloqueId: string, m3: number) => cambiar((prev) => prev.map((x) => (x.id === bloqueId ? { ...x, m3 } : x))),
    [cambiar],
  );

  return {
    patio, errorPatio, cargandoPatio, recargarPatio,
    crearDelPatio, traerLote, vincular, agregarAlLote, crearLoteDelBloque, quitarDelLote, igualarM3,
  };
}

export type PanelLotes = ReturnType<typeof usePanelLotes>;
