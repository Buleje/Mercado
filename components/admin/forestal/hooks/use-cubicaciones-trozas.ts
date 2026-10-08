"use client";

/**
 * Cubicaciones de trozas guardadas en el servidor (ADR-478): el patio del
 * cubicador con DUEÑO, para valorizarlo y descontarlo de su adelanto.
 *
 * Todo lo que es plata lo decide el servidor: re-cubica desde las medidas,
 * valoriza por especie y reparte entre los adelantos. Acá sólo se pide, se
 * muestra la vista previa y se traducen los códigos de error a lo que el
 * usuario tiene que hacer. Contrato: `.claude/autonomo/contratos-2026-10-08/cubicacion-cuenta.md` §3.4.
 */

import { useCallback, useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import type { CuentaPersona } from "@/lib/adelantos/cuenta-unificada";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import type {
  AplicarCubicacionInput, CubicacionTrozasResumen, EstadoCubicacion, GuardarCubicacionInput as GuardarCubicacionInputServidor, SentidoCubicacion, TrozaCongelada,
} from "@/lib/forestal/cubicacion-cuenta";
import type { TrozaCubicada } from "@/lib/forestal/cubicacion-trozas";
import { diametroUnico, type DiametrosPorTroza } from "@/lib/forestal/cubicacion-trozas-formula";

export const RUTA_CUBICACIONES_TROZAS = "/api/admin/forestal/cubicaciones-trozas";

export type { EstadoCubicacion, SentidoCubicacion } from "@/lib/forestal/cubicacion-cuenta";

/** Una cubicación como la devuelve el servidor; `trozas` sólo en el detalle (`GET …/[id]`). */
export type CubicacionTrozas = CubicacionTrozasResumen & { trozas?: TrozaCongelada[] };

/** Lo que el modal de guardar le manda al servidor (`guardarCubicacionSchema` / `editarCubicacionSchema`). */
export type GuardarCubicacionInput = Omit<GuardarCubicacionInputServidor, "sentido"> & { sentido: SentidoCubicacion; version?: number };

export type Resultado<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; codigo: string | null; mensaje: string; extra: Record<string, unknown> };

/** El rótulo de cada estado, igual en la lista y en la cubicación abierta. */
export const ESTADO_CUB: Record<EstadoCubicacion, { label: string; clase: string }> = {
  borrador: { label: "Sin descontar", clase: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
  aplicada: { label: "Descontada", clase: "bg-[var(--accent-soft)] text-[var(--accent-dark)] dark:text-[var(--accent)]" },
  anulada: { label: "Anulada", clase: "bg-[var(--data-error-500)]/10 text-[var(--data-error-700)] dark:text-[var(--data-error-500)] line-through" },
};

/* ── Errores: el código del servidor → lo que tienes que hacer ─────────────── */

const fmtSoles = (n: unknown) => `S/ ${Number(n).toFixed(2)}`;

export function mensajeDeError(codigo: string | null, extra: Record<string, unknown>, fallback: string): string {
  switch (codigo) {
    case "MONTO_CAMBIO":
      return `El servidor calculó ${fmtSoles(extra.monto)}: revisa los precios y confirma otra vez.`;
    case "GUIA_YA_VALORIZADA":
      return "Esa guía ya tiene su plata anotada (costo de la guía): no se paga dos veces la misma madera.";
    case "DESACTUALIZADA":
      return "Alguien cambió esta cubicación mientras la mirabas. Ábrela de nuevo.";
    case "YA_APLICADA":
      return "Ya se descontó de la cuenta: no se edita. Anúlala y vuelve a hacerla.";
    case "SIN_ADELANTO_ABIERTO":
      return "Esta persona no tiene adelantos abiertos: la cubicación queda guardada, sin descontar.";
    case "EXCEDE_LO_RECIBIDO":
      return "Vale más de lo que le debes devolver: baja el precio o descuenta sólo una parte aparte.";
    case "FALTA_PRECIO":
      return `Falta el precio de ${String(extra.especie ?? "una especie")}.`;
    case "LIQUIDADA_DESPUES":
      return "Después se liquidó la cuenta de esta persona: anula primero esa liquidación.";
    default:
      return fallback;
  }
}

async function pedir<T>(url: string, init: RequestInit, leer: (j: unknown) => T): Promise<Resultado<T>> {
  try {
    const res = await fetch(url, { credentials: "include", ...init });
    const j: unknown = res.status === 204 ? null : await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: leer(j) };
    /* Las rutas responden `{ error: CODIGO, message, ...extra }` (ADR-478 §3.4). */
    const cuerpo = (j ?? {}) as Record<string, unknown>;
    const codigo = typeof cuerpo.error === "string" && /^[A-Z][A-Z_]+$/.test(cuerpo.error) ? cuerpo.error : null;
    const base =
      typeof cuerpo.message === "string" && cuerpo.message ? cuerpo.message
      : res.status === 403 ? "Tu rol no puede hacer esto."
      : res.status === 429 ? "Demasiados intentos seguidos: espera un minuto."
      : `No se pudo (${res.status}).`;
    return { ok: false, status: res.status, codigo, mensaje: typeof cuerpo.message === "string" && cuerpo.message ? base : mensajeDeError(codigo, cuerpo, base), extra: cuerpo };
  } catch {
    return { ok: false, status: 0, codigo: null, mensaje: "Sin conexión: no se guardó nada. Prueba de nuevo.", extra: {} };
  }
}

/** La respuesta puede venir pelada o envuelta (`{ cubicacion }`). */
const unaCubicacion = (j: unknown): CubicacionTrozas => {
  const o = (j ?? {}) as Record<string, unknown>;
  return (o.cubicacion ?? j) as CubicacionTrozas;
};
const muchas = (j: unknown): CubicacionTrozas[] => {
  const o = (j ?? {}) as Record<string, unknown>;
  const arr = Array.isArray(j) ? j : Array.isArray(o.cubicaciones) ? o.cubicaciones : Array.isArray(o.items) ? o.items : [];
  return arr as CubicacionTrozas[];
};
const jsonPost = (method: string, body: unknown): RequestInit => ({
  method,
  headers: csrfHeaders({ "Content-Type": "application/json" }),
  body: JSON.stringify(body),
});

/* ── Escrituras ───────────────────────────────────────────────────────────── */

export const guardarCubicacionTrozas = (input: GuardarCubicacionInput, id?: string) =>
  pedir(id ? `${RUTA_CUBICACIONES_TROZAS}/${id}` : RUTA_CUBICACIONES_TROZAS, jsonPost(id ? "PATCH" : "POST", input), unaCubicacion);

export const aplicarCubicacionTrozas = (
  id: string,
  body: AplicarCubicacionInput,
) => pedir(`${RUTA_CUBICACIONES_TROZAS}/${id}/aplicar`, jsonPost("POST", body), unaCubicacion);

export const anularCubicacionTrozas = (id: string, motivo: string) =>
  pedir(`${RUTA_CUBICACIONES_TROZAS}/${id}/anular`, jsonPost("POST", { motivo }), unaCubicacion);

export const borrarCubicacionTrozas = (id: string) =>
  pedir(`${RUTA_CUBICACIONES_TROZAS}/${id}`, { method: "DELETE", headers: csrfHeaders() }, () => true);

/* ── Lecturas ─────────────────────────────────────────────────────────────── */

export const leerCubicacionTrozas = (id: string) => pedir(`${RUTA_CUBICACIONES_TROZAS}/${id}`, {}, unaCubicacion);

/** Lista (sin medidas). `activo=false` no pide nada: el modal todavía no se abrió. */
export function useCubicacionesTrozas(filtros: { beneficiario?: string; estado?: EstadoCubicacion }, activo = true) {
  const [lista, setLista] = useState<CubicacionTrozas[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const { beneficiario, estado } = filtros;
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    const q = new URLSearchParams();
    if (beneficiario) q.set("beneficiario", beneficiario);
    if (estado) q.set("estado", estado);
    setError(null);
    void pedir(`${RUTA_CUBICACIONES_TROZAS}${q.toString() ? `?${q}` : ""}`, {}, muchas).then((r) => {
      if (!vivo) return;
      if (r.ok) setLista(r.data);
      else { setLista([]); setError(r.mensaje); }
    });
    return () => { vivo = false; };
  }, [activo, beneficiario, estado, vuelta]);
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { lista, cargando: activo && lista === null && !error, error, recargar };
}

/** Una cubicación con sus medidas. */
export function useCubicacionTrozas(id: string | null) {
  const [cub, setCub] = useState<CubicacionTrozas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    if (!id) return;
    let vivo = true;
    setError(null);
    void leerCubicacionTrozas(id).then((r) => {
      if (!vivo) return;
      if (r.ok) setCub(r.data);
      else setError(r.mensaje);
    });
    return () => { vivo = false; };
  }, [id, vuelta]);
  const recargar = useCallback(() => setVuelta((v) => v + 1), []);
  return { cub, setCub, cargando: !!id && !cub && !error, error, recargar };
}

export type PersonaCuenta = Pick<CuentaPersona, "clave" | "nombre" | "beneficiarioId" | "parteId"> & {
  /** `undefined` = tu rol no ve la plata (`conSaldos: false`): sólo el nombre. */
  adelantos?: CuentaPersona["adelantos"];
  liquidacionesVivas?: number;
};

const leerPersonas = (j: unknown): PersonaCuenta[] => {
  const arr = ((j ?? {}) as { personas?: PersonaCuenta[] }).personas;
  return Array.isArray(arr) ? arr : [];
};

/**
 * Las filas de «Cuenta por persona» (las de Adelantos y las del directorio,
 * unidas), sin documento ni teléfono. Con saldos sólo si tu rol lee Adelantos:
 * el almacenero, que sí guarda (B6), recibe sólo los nombres.
 */
export function usePersonasDeLaCuenta(activo: boolean) {
  const [personas, setPersonas] = useState<PersonaCuenta[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!activo || personas) return;
    let vivo = true;
    void pedir(`${RUTA_CUBICACIONES_TROZAS}/personas`, {}, leerPersonas).then((r) => {
      if (!vivo) return;
      if (r.ok) setPersonas(r.data);
      else { setPersonas([]); setError(r.mensaje); }
    });
    return () => { vivo = false; };
  }, [activo, personas]);
  return { personas, cargando: activo && personas === null, error };
}

/**
 * Los adelantos ABIERTOS/EXCEDIDOS de la persona del lado que toca: comprar
 * madera paga lo DADO; venderla devuelve lo RECIBIDO (ADR-448). Sólo para la
 * vista previa del reparto: el servidor vuelve a elegirlos con candado. En
 * soles y sin cuotas pactadas, como el servidor (`abiertosDe`).
 */
export function useAdelantosAbiertos(beneficiarioId: string | null, sentido: SentidoCubicacion) {
  const [adelantos, setAdelantos] = useState<DbAdelanto[] | null>(null);
  useEffect(() => {
    if (!beneficiarioId) { setAdelantos([]); return; }
    let vivo = true;
    setAdelantos(null);
    void pedir(`/api/adelantos?beneficiarioId=${encodeURIComponent(beneficiarioId)}`, {}, (j) => (Array.isArray(j) ? (j as DbAdelanto[]) : [])).then((r) => {
      if (!vivo) return;
      const direccion = sentido === "venta" ? "RECIBIDO" : "DADO";
      setAdelantos(
        r.ok
          ? r.data.filter(
              (a) =>
                a.direccion === direccion &&
                (a.status === "ABIERTO" || a.status === "EXCEDIDO") &&
                a.moneda === "PEN" &&
                a.modalidad !== "ENTREGAS_PACTADAS" &&
                (a.entregasPactadas?.length ?? 0) === 0,
            )
          : [],
      );
    });
    return () => { vivo = false; };
  }, [beneficiarioId, sentido]);
  return adelantos;
}

/* ── Del patio al cuerpo del POST ─────────────────────────────────────────── */

/**
 * Las filas del cubicador → `trozas` del POST. Sólo medidas crudas: el
 * volumen lo vuelve a sacar el servidor. Con un Ø va UNO (el que se midió).
 */
export function trozasParaGuardar(
  rows: readonly (TrozaCubicada & { codigo?: string })[],
  diametros: DiametrosPorTroza,
  especieFaltante: string,
): GuardarCubicacionInput["trozas"] {
  return rows.map((t) => {
    const especie = t.especie?.trim() || especieFaltante.trim();
    const codigo = typeof t.codigo === "string" && t.codigo.trim() ? t.codigo.trim() : undefined;
    return diametros === 1
      ? { ...(codigo ? { codigo } : {}), especie, d1: diametroUnico(t), largo: t.largo }
      : { ...(codigo ? { codigo } : {}), especie, d1: t.d1, d2: t.d2, largo: t.largo };
  });
}

/**
 * «último: S/ 1,20» por especie: el precio de la cubicación APLICADA más nueva
 * de esa persona que la traía. No es una tarifa guardada (B4): es memoria.
 * Sólo de la MISMA fórmula (como el detalle del servidor): un precio por PT
 * sugerido para un lote en m³ Smalian es 424 veces otra cosa.
 */
export function ultimosPrecios(aplicadas: readonly CubicacionTrozas[] | null, formula: CubicacionTrozas["formula"]): Record<string, number> {
  const out: Record<string, number> = {};
  const nuevasPrimero = [...(aplicadas ?? [])]
    .filter((c) => c.estado === "aplicada" && c.formula === formula)
    .sort((a, b) => (b.fecha + (b.createdAt ?? "")).localeCompare(a.fecha + (a.createdAt ?? "")));
  for (const c of nuevasPrimero) {
    for (const l of c.porEspecie ?? []) if (l.precio != null && out[l.clave] == null) out[l.clave] = l.precio;
  }
  return out;
}

