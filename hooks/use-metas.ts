"use client";

/**
 * useMetas — las metas del negocio y su avance, leídos de la base (ADR-488).
 *
 * Dos lecturas en paralelo: `/api/goals` (las metas) y `/api/goals/avance`
 * (cuánto lleva cada una, derivado en el servidor de los datos del período).
 * Si el avance falla, las metas igual se muestran («sin dato»): una lectura
 * caída no esconde la lista.
 *
 * Se refresca cada 60 s SOLO con la pestaña a la vista, y al volver a ella.
 * Una respuesta vieja no pisa a una nueva (contador de pedidos).
 *
 * Lo usan la vista de metas, el modal y las vistas Hoy/Calendario/Logros.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { limaDateKey } from "@/lib/utils";
import type { MetaCrear, MetaDTO, MetaEditar } from "@/lib/admin/metas-tareas";
import type { AvanceMetaDTO, RespuestaAvance } from "@/lib/admin/metas-catalogo";

const CADA_MS = 60_000;
const JSON_HEADERS = { "Content-Type": "application/json" };

export type ResultadoMeta = { ok: true; meta: MetaDTO } | { ok: false; error: string };

async function mensajeDeError(res: Response, porDefecto: string): Promise<string> {
  try {
    const j = (await res.json()) as { error?: unknown };
    return typeof j.error === "string" && j.error ? j.error : porDefecto;
  } catch {
    return porDefecto;
  }
}

/** POST /api/goals. No recarga nada: eso lo hace quien llama. */
export async function crearMeta(datos: MetaCrear): Promise<ResultadoMeta> {
  try {
    const res = await fetch("/api/goals", { method: "POST", headers: csrfHeaders(JSON_HEADERS), body: JSON.stringify(datos) });
    if (!res.ok) return { ok: false, error: await mensajeDeError(res, "No se pudo guardar la meta. Reintenta.") };
    return { ok: true, meta: (await res.json()) as MetaDTO };
  } catch {
    return { ok: false, error: "Sin conexión: no se guardó la meta." };
  }
}

/** PATCH /api/goals/:id. */
export async function editarMeta(id: string, cambios: MetaEditar): Promise<ResultadoMeta> {
  try {
    const res = await fetch(`/api/goals/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: csrfHeaders(JSON_HEADERS),
      body: JSON.stringify(cambios),
    });
    if (!res.ok) return { ok: false, error: await mensajeDeError(res, "No se pudo guardar el cambio. Reintenta.") };
    return { ok: true, meta: (await res.json()) as MetaDTO };
  } catch {
    return { ok: false, error: "Sin conexión: no se guardó el cambio." };
  }
}

/** DELETE /api/goals/:id. */
export async function borrarMeta(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/goals/${encodeURIComponent(id)}`, { method: "DELETE", headers: csrfHeaders() });
    if (!res.ok && res.status !== 404) return { ok: false, error: await mensajeDeError(res, "No se pudo eliminar la meta.") };
    return { ok: true };
  } catch {
    return { ok: false, error: "Sin conexión: no se eliminó la meta." };
  }
}

export interface UseMetas {
  metas: MetaDTO[];
  /** Avance por id de meta. Falta una → todavía no se midió o la lectura cayó. */
  avances: Map<string, AvanceMetaDTO>;
  /** El día de Lima con que se midió (el del servidor si respondió). */
  hoy: string;
  cargando: boolean;
  /** No se pudieron leer las metas (la lista, no el avance). */
  error: string | null;
  /** Las metas llegaron pero el avance no: las tarjetas dicen «sin dato». */
  avanceCaido: boolean;
  /** `fresco` salta la caché del avance (botón «Actualizar»). */
  recargar: (fresco?: boolean) => Promise<void>;
  crear: (datos: MetaCrear) => Promise<ResultadoMeta>;
  editar: (id: string, cambios: MetaEditar) => Promise<ResultadoMeta>;
  borrar: (id: string) => Promise<{ ok: boolean; error?: string }>;
}

export function useMetas(): UseMetas {
  const [metas, setMetas] = useState<MetaDTO[]>([]);
  const [avances, setAvances] = useState<Map<string, AvanceMetaDTO>>(() => new Map());
  const [hoy, setHoy] = useState(() => limaDateKey());
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [avanceCaido, setAvanceCaido] = useState(false);
  const pedido = useRef(0);
  /* La lista vigente para `borrar`: leerla del updater de setMetas es un efecto dentro de un updater. */
  const metasRef = useRef<MetaDTO[]>([]);
  useEffect(() => {
    metasRef.current = metas;
  }, [metas]);

  const recargar = useCallback(async (fresco = false) => {
    const n = ++pedido.current;
    try {
      const [rMetas, rAvance] = await Promise.all([
        fetch("/api/goals", { cache: "no-store" }),
        fetch(`/api/goals/avance${fresco ? "?fresco=1" : ""}`, { cache: "no-store" }).catch(() => null),
      ]);
      if (!rMetas.ok) throw new Error(`HTTP ${rMetas.status}`);
      const lista = (await rMetas.json()) as MetaDTO[];
      let respuesta: RespuestaAvance | null = null;
      if (rAvance?.ok) {
        try {
          respuesta = (await rAvance.json()) as RespuestaAvance;
        } catch {
          respuesta = null;
        }
      }
      if (n !== pedido.current) return;
      setMetas(Array.isArray(lista) ? lista : []);
      setAvances(new Map((respuesta?.avances ?? []).map((a) => [a.id, a])));
      setHoy(respuesta?.hoy || limaDateKey());
      setAvanceCaido(respuesta === null);
      setError(null);
    } catch {
      if (n === pedido.current) setError("No se pudieron cargar tus metas.");
    } finally {
      if (n === pedido.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
    const tic = window.setInterval(() => {
      if (document.visibilityState === "visible") void recargar();
    }, CADA_MS);
    const alVolver = () => {
      if (document.visibilityState === "visible") void recargar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      window.clearInterval(tic);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [recargar]);

  const crear = useCallback(
    async (datos: MetaCrear) => {
      const r = await crearMeta(datos);
      if (r.ok) await recargar();
      return r;
    },
    [recargar],
  );

  const editar = useCallback(
    async (id: string, cambios: MetaEditar) => {
      const r = await editarMeta(id, cambios);
      if (r.ok) await recargar();
      return r;
    },
    [recargar],
  );

  /* Se quita de la vista al toque; si el servidor dice que no, vuelve. */
  const borrar = useCallback(
    async (id: string) => {
      const quitada = metasRef.current.find((m) => m.id === id);
      setMetas((prev) => prev.filter((m) => m.id !== id));
      const r = await borrarMeta(id);
      if (!r.ok && quitada) {
        setMetas((prev) => (prev.some((m) => m.id === id) ? prev : [...prev, quitada]));
      }
      if (r.ok) void recargar();
      return r;
    },
    [recargar],
  );

  return { metas, avances, hoy, cargando, error, avanceCaido, recargar, crear, editar, borrar };
}

// ── Vista previa del modal: «En este período llevas …» ───────────────────────

export interface VistaPrevia {
  cargando: boolean;
  /** `undefined` = no hay vista previa (meta a mano, o el servidor no la dio). */
  avance?: number | null;
  etiqueta?: string;
  parcial?: string;
}

/** Acepta `{avance}`, `{avance: {avance}}` o `{avances: [{avance}]}`: lo que mida, sin casarse con una forma. */
function leerPrevia(j: unknown): Omit<VistaPrevia, "cargando"> | null {
  if (!j || typeof j !== "object") return null;
  const o = j as Record<string, unknown>;
  const fuente =
    o.avance && typeof o.avance === "object"
      ? (o.avance as Record<string, unknown>)
      : Array.isArray(o.avances) && o.avances[0] && typeof o.avances[0] === "object"
        ? (o.avances[0] as Record<string, unknown>)
        : o;
  const valor = fuente.avance ?? fuente.valor;
  if (valor !== null && typeof valor !== "number") return null;
  return {
    avance: valor,
    etiqueta: typeof fuente.etiqueta === "string" ? fuente.etiqueta : undefined,
    parcial: typeof fuente.parcial === "string" ? fuente.parcial : undefined,
  };
}

/** GET /api/goals/avance?category&period&unit, con 400 ms de espera entre teclas. `null` la apaga. */
export function useVistaPreviaMeta(consulta: { category: string; period: string; unit: string } | null): VistaPrevia {
  const [previa, setPrevia] = useState<VistaPrevia>({ cargando: false });
  const clave = consulta ? `${consulta.category}|${consulta.period}|${consulta.unit}` : "";

  useEffect(() => {
    if (!clave) {
      setPrevia({ cargando: false });
      return;
    }
    const [category, period, unit] = clave.split("|");
    const ctrl = new AbortController();
    setPrevia((p) => ({ ...p, cargando: true }));
    const espera = window.setTimeout(() => {
      const qs = new URLSearchParams({ category: category ?? "", period: period ?? "", unit: unit ?? "" });
      fetch(`/api/goals/avance?${qs.toString()}`, { cache: "no-store", signal: ctrl.signal })
        .then(async (res) => (res.ok ? leerPrevia(await res.json()) : null))
        .then((leida) => {
          if (!ctrl.signal.aborted) setPrevia(leida ? { cargando: false, ...leida } : { cargando: false });
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setPrevia({ cargando: false });
        });
    }, 400);
    return () => {
      window.clearTimeout(espera);
      ctrl.abort();
    };
  }, [clave]);

  return previa;
}
