"use client";

/**
 * use-lotes-aserrio — los lotes de aserrío y el patio, en un solo estado (ADR-334).
 *
 * Las dos listas se piden juntas siempre: un lote sin el patio no puede decir
 * qué queda libre, y el patio sin los lotes no sabe qué está apartado. Cada
 * acción recarga las dos — después de guardar piezas, las dos cambiaron.
 *
 * Las mutaciones LANZAN con el mensaje del servidor (que es el que explica la
 * invariante: «ese lote está consumido», «es Capirona y el lote es de
 * Tornillo»). Quien llama decide dónde mostrarlo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { conContratoId } from "@/lib/forestal/contrato-filtro";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import type {
  CambiosLote,
  EstadoLotesAserrio,
  ResultadoGuardado,
  TrozaRechazada,
} from "./use-lotes-aserrio-tipos";

export type { CambiosLote, EstadoLotesAserrio, ResultadoGuardado, TrozaRechazada } from "./use-lotes-aserrio-tipos";

const API = "/api/admin/forestal/lotes-aserrio";

/** Toda escritura tira el caché del módulo: si no, la próxima lectura miente. */
async function mutar<T>(body: unknown, method: "POST" | "PATCH"): Promise<T> {
  const r = await fetch(API, {
    method,
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify(body),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(json?.message ?? json?.error ?? `El servidor respondió ${r.status}`);
  invalidarCtp("/forestal/");
  return json as T;
}

/** La URL del patio, con `?contratoId=` sólo si viene (el filtro lo hace el servidor). */
export function urlDelPatio(contratoId: string | null | undefined): string {
  const qs = conContratoId(new URLSearchParams(), contratoId).toString();
  return `/api/admin/forestal/trozas/patio${qs ? `?${qs}` : ""}`;
}

/**
 * @param opts.contratoId «Solo este permiso» (ADR-431): el patio se pide ya
 *   acotado a ese contrato. Opt-in: los otros cuatro consumidores (Lotes,
 *   Producción, Historia del lote y el reparto) llaman sin argumentos y siguen
 *   pidiendo la misma URL de siempre.
 */
export function useLotesAserrio(opts: { contratoId?: string | null } = {}): EstadoLotesAserrio {
  const contratoId = opts.contratoId ?? null;
  const [lotes, setLotes] = useState<LoteAserrio[]>([]);
  const [trozas, setTrozas] = useState<TrozaConsumible[]>([]);
  const [patioTruncado, setPatioTruncado] = useState<{ hay: number; leidas: number } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /**
   * El número del último pedido. Al prender «Solo este permiso» salen dos: el
   * del patio entero (grande, lento) y el acotado (chico, rápido). Si el lento
   * llegara último pisaría al acotado y la pantalla mostraría toda la planta con
   * el interruptor diciendo «solo este permiso» — la carga vieja que pisa la
   * vigente. Sólo escribe el pedido que sigue siendo el último.
   */
  const pedidoRef = useRef(0);

  const recargar = useCallback(async () => {
    const pedido = ++pedidoRef.current;
    setCargando(true);
    try {
      /* Deduplicado (ADR-347): la pestaña monta este hook desde dos lugares y
         pedía el patio y los lotes dos veces por carga. */
      const [rl, rt] = await Promise.all([
        ctpGet<{ lotes?: LoteAserrio[] }>(`${API}?limite=500`),
        ctpGet<{ trozas?: TrozaConsumible[]; total?: number; devueltas?: number; truncado?: boolean }>(
          urlDelPatio(contratoId),
        ),
      ]);
      if (pedido !== pedidoRef.current) return;
      setLotes(rl.lotes ?? []);
      setTrozas(rt.trozas ?? []);
      setPatioTruncado(
        rt.truncado ? { hay: rt.total ?? 0, leidas: rt.devueltas ?? (rt.trozas ?? []).length } : null,
      );
      setError(null);
    } catch (e) {
      if (pedido !== pedidoRef.current) return;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (pedido === pedidoRef.current) setCargando(false);
    }
  }, [contratoId]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const agregarTrozas = useCallback(
    async (loteId: string, trozaIds: string[]): Promise<ResultadoGuardado> => {
      const r = await mutar<{ agregadas: number; rechazadas?: TrozaRechazada[] }>(
        { accion: "agregar", loteId, trozaIds },
        "PATCH",
      );
      await recargar();
      return { loteId, code: null, agregadas: r.agregadas, rechazadas: r.rechazadas ?? [] };
    },
    [recargar],
  );

  const crearConTrozas = useCallback<EstadoLotesAserrio["crearConTrozas"]>(
    async ({ speciesCommon, speciesScientific, notes, trozaIds, ...programacion }) => {
      /* Se abre el lote y recién después se le meten las piezas: el POST valida
         la especie y el PATCH valida pieza por pieza. Si el segundo falla, el
         lote queda abierto y vacío — visible y deshacible, no perdido. */
      const creado = await mutar<{ lote: { id: string; code: string } }>(
        {
          modo: "abierto",
          speciesCommon,
          speciesScientific: speciesScientific ?? null,
          notes: notes ?? null,
          ...programacion,
        },
        "POST",
      );
      const loteId = creado.lote.id;
      if (trozaIds.length === 0) {
        await recargar();
        return { loteId, code: creado.lote.code, agregadas: 0, rechazadas: [] };
      }
      const r = await agregarTrozas(loteId, trozaIds);
      return { ...r, code: creado.lote.code };
    },
    [agregarTrozas, recargar],
  );

  const crearInventario = useCallback<EstadoLotesAserrio["crearInventario"]>(
    async (input) => {
      const r = await mutar<{ lote: { id: string; code: string }; corrida: { id: string; lineNo: number } }>(
        { modo: "inventario", ...input },
        "POST",
      );
      await recargar();
      return r;
    },
    [recargar],
  );

  const consumirEnPatio = useCallback<EstadoLotesAserrio["consumirEnPatio"]>(
    async ({ loteId, trozaIds, fecha, observaciones }) => {
      const r = await mutar<{
        corrida: { id: string; lineNo: number };
        piezas: number;
        volumenM3: number;
        rechazadas?: TrozaRechazada[];
      }>(
        {
          accion: "consumir",
          loteId,
          trozaIds,
          ...(fecha ? { fecha } : {}),
          ...(observaciones ? { observaciones } : {}),
        },
        "PATCH",
      );
      await recargar();
      return { ...r, rechazadas: r.rechazadas ?? [] };
    },
    [recargar],
  );

  const sumarACorrida = useCallback<EstadoLotesAserrio["sumarACorrida"]>(
    async ({ loteId, corridaId, trozaIds, fecha }) => {
      const r = await mutar<{
        piezas: number;
        volumenM3: number;
        volumenTotalM3: number;
        loteCerrado: boolean;
      }>({ accion: "sumar-corrida", loteId, corridaId, trozaIds, ...(fecha ? { fecha } : {}) }, "PATCH");
      await recargar();
      return r;
    },
    [recargar],
  );

  const cerrarLote = useCallback<EstadoLotesAserrio["cerrarLote"]>(
    async ({ loteId, motivo }) => {
      const r = await mutar<{ code: string; liberadas: number; volumenM3: number; teniaCorridas: boolean }>(
        { accion: "cerrar", loteId, motivo },
        "PATCH",
      );
      await recargar();
      return r;
    },
    [recargar],
  );

  const reabrirLote = useCallback<EstadoLotesAserrio["reabrirLote"]>(
    async (loteId) => {
      const r = await mutar<{ code: string; piezasConsumidas: number }>({ accion: "reabrir", loteId }, "PATCH");
      await recargar();
      return r;
    },
    [recargar],
  );

  const quitarDeCorrida = useCallback<EstadoLotesAserrio["quitarDeCorrida"]>(
    async ({ corridaId, trozaIds }) => {
      const r = await mutar<{
        piezas: number;
        volumenM3: number;
        volumenTotalM3: number;
        lotesReabiertos: string[];
      }>({ accion: "quitar-corrida", corridaId, trozaIds }, "PATCH");
      await recargar();
      return r;
    },
    [recargar],
  );

  const quitarTroza = useCallback(
    async (loteId: string, trozaId: string) => {
      await mutar({ accion: "quitar", loteId, trozaId }, "PATCH");
      await recargar();
    },
    [recargar],
  );

  const editarLote = useCallback(
    async (loteId: string, cambios: CambiosLote) => {
      await mutar({ accion: "editar", loteId, ...cambios }, "PATCH");
      await recargar();
    },
    [recargar],
  );

  const deshacer = useCallback(
    async (loteId: string) => {
      const r = await fetch(`${API}?id=${encodeURIComponent(loteId)}`, {
        method: "DELETE",
        headers: csrfHeaders({}),
        credentials: "include",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.message ?? j?.error ?? `El servidor respondió ${r.status}`);
      }
      invalidarCtp("/forestal/");
      await recargar();
    },
    [recargar],
  );

  const deshacerForzado = useCallback<EstadoLotesAserrio["deshacerForzado"]>(
    async (loteId, motivo, forzar) => {
      const r = await mutar<{ code: string; corridaAnulada: boolean }>(
        { accion: "deshacer-forzado", loteId, motivo, ...(forzar ? { forzar } : {}) },
        "PATCH",
      );
      await recargar();
      return r;
    },
    [recargar],
  );

  return {
    lotes, trozas, patioTruncado, cargando, error, recargar,
    crearConTrozas, crearInventario, agregarTrozas, consumirEnPatio, sumarACorrida, quitarDeCorrida,
    cerrarLote, reabrirLote, quitarTroza, editarLote, deshacer, deshacerForzado,
  };
}
