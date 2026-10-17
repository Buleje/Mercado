"use client";

/**
 * use-lotes-mixtos — los lotes mixtos del negocio (ADR-441) y lo que se hace
 * con ellos: abrir, apartar y sacar trozas, repartir y anular.
 *
 * El mixto es la pila escaneada guardada en el SERVIDOR: varios equipos y
 * varios días suman al mismo. Por eso cada acción relee la lista (otra tablet
 * pudo apartar o repartir mientras tanto) y la pantalla la relee al abrirse.
 *
 * Apartar y sacar van por la cola del patio (`escribirDelPatio`): sin señal
 * quedan anotados en el equipo y suben solos al volver; un rechazo del libro
 * (4xx) se devuelve tal cual, no se encola. Crear, repartir y anular exigen
 * conexión: lanzan con el mensaje del servidor.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { SECCION_COLA_MIXTO } from "@/lib/forestal/lote-mixto-vista";
import { escribirDelPatio } from "@/lib/forestal/patio-cola";
import type {
  LoteMixto,
  RechazoDeTroza,
  RespuestaAnular,
  RespuestaQuitar,
  RespuestaReparto,
  RespuestaReserva,
} from "@/lib/forestal/lote-mixto";

export type { LoteMixto, RechazoDeTroza, RespuestaReparto } from "@/lib/forestal/lote-mixto";

export const URL_LOTES_MIXTOS = "/api/admin/forestal/lotes-mixtos";

/** Cómo terminó un apartar/sacar: en el libro, anotado sin señal, o rechazado. */
export type ResultadoReserva =
  | { estado: "ok"; hechas: number; rechazadas: RechazoDeTroza[] }
  | { estado: "encolada"; detras: boolean }
  | { estado: "error"; mensaje: string };

async function mutar<T>(method: "POST" | "PATCH", body: unknown): Promise<T> {
  const r = await fetch(URL_LOTES_MIXTOS, {
    method,
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify(body),
  });
  const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    const msg = typeof json.message === "string" ? json.message : typeof json.error === "string" ? json.error : null;
    throw new Error(msg ?? `El servidor respondió ${r.status}`);
  }
  invalidarCtp("/forestal/");
  return json as T;
}

/** La lista del GET. El servidor responde `{ mixtos }`. */
function leerLista(j: unknown): LoteMixto[] {
  const o = (j ?? {}) as { mixtos?: unknown };
  return Array.isArray(o.mixtos) ? (o.mixtos as LoteMixto[]) : [];
}

const aRechazadas = (v: unknown): RechazoDeTroza[] =>
  Array.isArray(v)
    ? v
        .filter((x): x is Record<string, unknown> => x != null && typeof x === "object")
        .map((x) => ({
          id: String(x.id ?? ""),
          codigo: typeof x.codigo === "string" ? x.codigo : null,
          motivo: typeof x.motivo === "string" && x.motivo.trim() ? x.motivo : "El libro no la aceptó.",
        }))
    : [];

export interface EstadoLotesMixtos {
  mixtos: LoteMixto[];
  /** Abiertos, el más nuevo primero: el primero es el que se abre. */
  abiertos: LoteMixto[];
  /** Repartidos, el más nuevo primero: el historial con sus lotes hijos. */
  repartidos: LoteMixto[];
  cargando: boolean;
  error: string | null;
  /** `fresco` tira el caché antes: lo que otra tablet apartó se ve al abrir. */
  recargar: (fresco?: boolean) => Promise<void>;
  crear: (notas?: string) => Promise<LoteMixto>;
  /** Aparta o saca trozas. No relee: quien llama junta varias lecturas y relee una vez. */
  reservar: (
    mixto: Pick<LoteMixto, "id" | "code">,
    accion: "agregar" | "quitar",
    trozaIds: string[],
    resumen?: string,
  ) => Promise<ResultadoReserva>;
  repartir: (
    mixtoId: string,
    opts: { destinos?: Record<string, string>; notas?: string },
  ) => Promise<RespuestaReparto>;
  anular: (mixtoId: string, motivo: string) => Promise<RespuestaAnular>;
}

const nuevoPrimero = (a: LoteMixto, b: LoteMixto) =>
  (b.repartidoEn ?? b.abiertoEn ?? "").localeCompare(a.repartidoEn ?? a.abiertoEn ?? "") ||
  b.code.localeCompare(a.code);

/**
 * @param opts.activo `false` = no pide nada (la pantalla que lo monta todavía
 *   no se abrió). Consumos lo monta siempre: la tarjeta del mixto vive ahí.
 */
export function useLotesMixtos(opts: { activo?: boolean } = {}): EstadoLotesMixtos {
  const activo = opts.activo ?? true;
  const [mixtos, setMixtos] = useState<LoteMixto[]>([]);
  const [cargando, setCargando] = useState(activo);
  const [error, setError] = useState<string | null>(null);
  /** Sólo escribe el último pedido: una carga vieja no pisa la vigente. */
  const pedidoRef = useRef(0);

  const recargar = useCallback(
    async (fresco = false) => {
      if (!activo) return;
      const pedido = ++pedidoRef.current;
      if (fresco) invalidarCtp(URL_LOTES_MIXTOS);
      setCargando(true);
      try {
        const j = await ctpGet<unknown>(URL_LOTES_MIXTOS);
        if (pedido !== pedidoRef.current) return;
        setMixtos(leerLista(j));
        setError(null);
      } catch (e) {
        if (pedido !== pedidoRef.current) return;
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (pedido === pedidoRef.current) setCargando(false);
      }
    },
    [activo],
  );

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const crear = useCallback<EstadoLotesMixtos["crear"]>(
    async (notas) => {
      const r = await mutar<{ mixto: LoteMixto }>("POST", notas?.trim() ? { notas: notas.trim() } : {});
      await recargar();
      return r.mixto;
    },
    [recargar],
  );

  const reservar = useCallback<EstadoLotesMixtos["reservar"]>(async (mixto, accion, trozaIds, resumen) => {
    const r = await escribirDelPatio({
      section: SECCION_COLA_MIXTO,
      url: URL_LOTES_MIXTOS,
      metodo: "PATCH",
      payload: { accion, loteMixtoId: mixto.id, trozaIds },
      resumen,
    });
    if (r.estado === "error") return { estado: "error", mensaje: r.mensaje ?? "El libro no lo aceptó." };
    if (r.estado === "encolada") return { estado: "encolada", detras: Boolean(r.detras) };
    invalidarCtp("/forestal/");
    const cuerpo = (r.cuerpo ?? {}) as Partial<RespuestaReserva & RespuestaQuitar>;
    return {
      estado: "ok",
      hechas: Number(accion === "agregar" ? (cuerpo.agregadas ?? 0) + (cuerpo.yaEstaban ?? 0) : cuerpo.quitadas) || 0,
      rechazadas: aRechazadas(cuerpo.rechazadas),
    };
  }, []);

  const repartir = useCallback<EstadoLotesMixtos["repartir"]>(
    async (mixtoId, { destinos, notas }) => {
      const r = await mutar<RespuestaReparto>("PATCH", {
        accion: "repartir",
        loteMixtoId: mixtoId,
        ...(destinos && Object.keys(destinos).length > 0 ? { destinos } : {}),
        ...(notas?.trim() ? { notas: notas.trim() } : {}),
      });
      await recargar();
      return { ...r, lotes: Array.isArray(r.lotes) ? r.lotes : [], excluidas: aRechazadas(r.excluidas) };
    },
    [recargar],
  );

  const anular = useCallback<EstadoLotesMixtos["anular"]>(
    async (mixtoId, motivo) => {
      const r = await mutar<RespuestaAnular>("PATCH", { accion: "anular", loteMixtoId: mixtoId, motivo: motivo.trim() });
      await recargar();
      return r;
    },
    [recargar],
  );

  const abiertos = useMemo(() => mixtos.filter((m) => m.status === "abierto").sort(nuevoPrimero), [mixtos]);
  const repartidos = useMemo(() => mixtos.filter((m) => m.status === "repartido").sort(nuevoPrimero), [mixtos]);

  return { mixtos, abiertos, repartidos, cargando, error, recargar, crear, reservar, repartir, anular };
}
