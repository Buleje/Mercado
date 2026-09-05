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

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";

const API = "/api/admin/forestal/lotes-aserrio";

/** Piezas que no entraron, con el motivo: «guardé 28 de 30» a secas obliga a contar a mano. */
export interface TrozaRechazada {
  id: string;
  codigo: string | null;
  motivo: string;
}

export interface ResultadoGuardado {
  loteId: string;
  code: string | null;
  agregadas: number;
  rechazadas: TrozaRechazada[];
}

/**
 * Lo que se puede corregir de un lote ya creado (Brandon, 2026-08-31): antes
 * sólo la nota. `undefined` = no tocar ese campo.
 */
export interface CambiosLote {
  code?: string | null;
  speciesCommon?: string;
  speciesScientific?: string | null;
  ordenProduccion?: string | null;
  tipoProductoConsumir?: string | null;
  /** `AAAA-MM-DD` o `null` para borrarla. */
  inicioProceso?: string | null;
  finProceso?: string | null;
  notes?: string | null;
}

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

export interface EstadoLotesAserrio {
  lotes: LoteAserrio[];
  /** El patio entero, incluidas las bloqueadas: el picker muestra el porqué. */
  trozas: TrozaConsumible[];
  /**
   * El patio NO entró entero en la lectura (pasa el tope del endpoint).
   * Quien dibuje una lista de piezas tiene que decirlo: mostrar de menos en
   * silencio hace que el operador crea que su madera desapareció.
   */
  patioTruncado: { hay: number; leidas: number } | null;
  cargando: boolean;
  error: string | null;
  recargar: () => Promise<void>;
  crearConTrozas: (input: {
    speciesCommon: string;
    speciesScientific?: string | null;
    notes?: string | null;
    /** Programación del lote (ADR-342): los campos del formulario oficial. */
    ordenProduccion?: string | null;
    tipoProductoConsumir?: string | null;
    inicioProceso?: string | null;
    finProceso?: string | null;
    /** Código a mano; vacío = correlativo automático `LA-2026-00N`. */
    code?: string | null;
    /** Vacío = el lote se declara y se carga después, en Consumos. */
    trozaIds: string[];
  }) => Promise<ResultadoGuardado>;
  agregarTrozas: (loteId: string, trozaIds: string[]) => Promise<ResultadoGuardado>;
  /**
   * Declara un lote como INVENTARIO (Brandon, 2026-08-31): entra y sale en el
   * mismo acto, sin trozas reales que apartar. El volumen consumido y los
   * paquetes producidos se declaran juntos; el tope del 56 % se valida en el
   * servidor con la misma puerta que el resto del libro.
   */
  crearInventario: (input: {
    speciesCommon: string;
    speciesScientific?: string | null;
    volumenConsumidoM3: number;
    fecha?: string;
    finProceso?: string | null;
    /** Código a mano; vacío = correlativo automático `LA-2026-00N`. */
    code?: string | null;
    notes?: string | null;
    paquetes: {
      codigo: string;
      productType?: string | null;
      presentacion?: string | null;
      cantidad: number;
      volumenM3: number;
      espesorCm?: number | null;
      anchoCm?: number | null;
      largoM?: number | null;
      observations?: string | null;
    }[];
  }) => Promise<{ lote: { id: string; code: string }; corrida: { id: string; lineNo: number } }>;
  /**
   * Consumir en el patio (ADR-340): las piezas entran al lote y a la sierra con
   * la fecha dada, y se abre la corrida que declarará la producción.
   */
  consumirEnPatio: (input: {
    loteId: string;
    trozaIds: string[];
    fecha?: string;
    /** Observación del consumo — va al casillero (11) del libro. */
    observaciones?: string | null;
  }) => Promise<{
    corrida: { id: string; lineNo: number };
    piezas: number;
    volumenM3: number;
    rechazadas: TrozaRechazada[];
  }>;
  /**
   * Sumar piezas a una corrida que todavía NO declaró (ADR-364): el turno que
   * entra en tandas es una sola corrida. Sobre una ya declarada el servidor
   * responde 422 — cambiarle el denominador del rendimiento a un asiento cerrado
   * es lo que el ADR prohíbe.
   */
  sumarACorrida: (input: {
    loteId: string;
    corridaId: string;
    trozaIds: string[];
    fecha?: string;
  }) => Promise<{ piezas: number; volumenM3: number; volumenTotalM3: number; loteCerrado: boolean }>;
  /**
   * El reverso (ADR-364): piezas mal tildadas que salen de una corrida abierta.
   * No las puede sacar todas — una corrida sin materia prima se anula, no se
   * vacía.
   */
  quitarDeCorrida: (input: { corridaId: string; trozaIds: string[] }) => Promise<{
    piezas: number;
    volumenM3: number;
    volumenTotalM3: number;
    lotesReabiertos: string[];
  }>;
  /**
   * Cerrar un lote parcial que no va a terminar de aserrarse: su madera libre
   * vuelve al patio y deja de figurar como trabajo pendiente. Motivo obligatorio.
   */
  cerrarLote: (input: { loteId: string; motivo: string }) => Promise<{
    code: string;
    liberadas: number;
    volumenM3: number;
    teniaCorridas: boolean;
  }>;
  /**
   * Vuelve a abrir un lote ya ASERRADO para seguirle cargando madera
   * (2026-09-02). Las piezas que ya entraron a una corrida no se tocan: siguen
   * atadas a ella. Un lote CERRADO no se reabre — el servidor lo rechaza.
   */
  reabrirLote: (loteId: string) => Promise<{ code: string; piezasConsumidas: number }>;
  quitarTroza: (loteId: string, trozaId: string) => Promise<void>;
  /** Código, especie, programación y nota — lo que se puede corregir de un lote ya creado. */
  editarLote: (loteId: string, cambios: CambiosLote) => Promise<void>;
  deshacer: (loteId: string) => Promise<void>;
  /**
   * DESHACER un lote consumido cuya corrida sigue viva (Brandon, 2026-08-31):
   * anula la corrida (con motivo) y suelta el lote, en un solo paso desde
   * Lotes. Sin `forzar`, falla si la corrida ya tiene despacho o reproceso
   * registrado — con `forzar: true` (Brandon, 2026-09-01: "sin excepción")
   * anula igual y ese despacho/reproceso queda sin corrida de origen.
   */
  deshacerForzado: (loteId: string, motivo: string, forzar?: boolean) => Promise<{ code: string; corridaAnulada: boolean }>;
}

export function useLotesAserrio(): EstadoLotesAserrio {
  const [lotes, setLotes] = useState<LoteAserrio[]>([]);
  const [trozas, setTrozas] = useState<TrozaConsumible[]>([]);
  const [patioTruncado, setPatioTruncado] = useState<{ hay: number; leidas: number } | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    try {
      /* Deduplicado (ADR-347): la pestaña monta este hook desde dos lugares y
         pedía el patio y los lotes dos veces por carga. */
      const [rl, rt] = await Promise.all([
        ctpGet<{ lotes?: LoteAserrio[] }>(`${API}?limite=500`),
        ctpGet<{ trozas?: TrozaConsumible[]; total?: number; devueltas?: number; truncado?: boolean }>(
          "/api/admin/forestal/trozas/patio",
        ),
      ]);
      setLotes(rl.lotes ?? []);
      setTrozas(rt.trozas ?? []);
      setPatioTruncado(
        rt.truncado ? { hay: rt.total ?? 0, leidas: rt.devueltas ?? (rt.trozas ?? []).length } : null,
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, []);

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
