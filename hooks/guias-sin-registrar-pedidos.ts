"use client";

/**
 * Los pedidos de «Guías sin registrar» (ADR-446) y cómo se dice cada fallo en
 * palabras del aserradero. Aparte del hook para que se lean (y se prueben) sin
 * React.
 */
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import type { RespuestaPendientes, ResultadoGuia, UsadaLiberada } from "@/lib/db/forest-ctp-guia-desde-anexo.db";
import type { TipoComercial } from "@/lib/forestal/cubicacion-tipo";
import {
  esperaLegible,
  mensajeDeCodigo,
  type EleccionesPorGuia,
} from "@/components/admin/forestal/guias-sin-registrar-pantalla";

export const URL_GUIAS_A_DESPACHO = "/api/admin/forestal/anexos/a-despacho";
/** El POST acepta hasta 10 guías por pedido (`postSchema`). */
export const MAX_POR_PEDIDO = 10;

export type Respuesta<T> =
  | { ok: true; datos: T }
  | { ok: false; status: number; codigo: string | null; mensaje: string; esperarSeg: number | null };

type CuerpoDeError = { error?: unknown; message?: unknown; issues?: unknown; retryAfter?: unknown };

function mensajeDeError(status: number, j: CuerpoDeError | null, esperarSeg: number | null): string {
  const codigo = typeof j?.error === "string" ? j.error : null;
  const delServidor = typeof j?.message === "string" ? j.message : "";
  if (status === 429) {
    return `Llegaste al límite de registros de la tienda: espera ${esperaLegible(esperarSeg ?? 60)} y vuelve a intentar.`;
  }
  if (status === 409) return mensajeDeCodigo(codigo, delServidor || "El libro rechazó el pedido.");
  if (delServidor) return delServidor;
  if (status === 401) return "Tu sesión se cerró: vuelve a entrar.";
  if (status === 403) return "Solo el administrador o el dueño pueden registrar estas guías.";
  if (status === 400 && Array.isArray(j?.issues) && j.issues[0] && typeof j.issues[0].message === "string") {
    return `El pedido no es válido: ${j.issues[0].message}`;
  }
  return status === 0 ? "Sin conexión con el servidor." : `El servidor respondió con un error (${status}).`;
}

/** Cuántos segundos pide esperar un 429: el cuerpo (`retryAfter`) o la cabecera `Retry-After`. */
function segundosDeEspera(r: Response, j: CuerpoDeError | null): number | null {
  const n = Number(typeof j?.retryAfter === "number" ? j.retryAfter : r.headers.get("Retry-After"));
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : null;
}

export async function pedir<T>(metodo: "GET" | "POST", cuerpo?: unknown): Promise<Respuesta<T>> {
  try {
    const r = await fetch(metodo === "GET" ? `${URL_GUIAS_A_DESPACHO}?pendientes=1` : URL_GUIAS_A_DESPACHO, {
      method: metodo,
      credentials: "include",
      cache: "no-store",
      headers: metodo === "POST" ? csrfHeaders({ "Content-Type": "application/json" }) : undefined,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const j = await leerJson<T & CuerpoDeError>(r);
    if (r.ok && j) return { ok: true, datos: j };
    const esperarSeg = r.status === 429 ? segundosDeEspera(r, j) ?? 60 : null;
    return {
      ok: false,
      status: r.status,
      codigo: typeof j?.error === "string" ? j.error : null,
      mensaje: mensajeDeError(r.status, j, esperarSeg),
      esperarSeg,
    };
  } catch {
    return { ok: false, status: 0, codigo: null, mensaje: mensajeDeError(0, null, null), esperarSeg: null };
  }
}

/** Espera `ms` en pasos cortos; corta antes si `cortar()` se vuelve cierto (Detener, cerrar). */
export async function esperarCortable(ms: number, cortar: () => boolean): Promise<void> {
  const fin = Date.now() + ms;
  while (Date.now() < fin && !cortar()) {
    await new Promise((r) => setTimeout(r, Math.min(500, fin - Date.now())));
  }
}

// ── Lo que el hook entrega a la pantalla ─────────────────────────────────

export interface GrupoAElegir {
  clave: string;
  especie: string;
  tipo: TipoComercial;
}

export interface EstadoGuiasSinRegistrar {
  datos: RespuestaPendientes | null;
  cargando: boolean;
  simulando: boolean;
  error: string | null;
  elecciones: EleccionesPorGuia;
  /** Corridas «usado» que ninguna guía toma y que el dueño marcó para devolver al patio. */
  liberar: ReadonlySet<string>;
  /** Lo que pasó con cada guía registrada (o intentada) en esta sesión. */
  resultados: Readonly<Record<string, ResultadoGuia>>;
  liberadas: readonly UsadaLiberada[];
  registrando: { anexoId: string; desde: number } | null;
  fila: {
    total: number;
    hechas: number;
    deteniendo: boolean;
    /** Esperando el límite u otra pestaña: hasta cuándo y por qué. */
    espera: { hasta: number; motivo: string } | null;
  } | null;
  /** La guía que se puede registrar ahora (la más vieja lista). */
  siguiente: string | null;
  cargar: () => Promise<void>;
  revisar: () => Promise<void>;
  /** `corridas = null` vuelve a la propuesta; `[]` = sin origen. */
  elegir: (anexoId: string, grupo: GrupoAElegir, corridas: string[] | null) => void;
  alternarLiberar: (corridaId: string) => void;
  registrar: (anexoId: string) => Promise<void>;
  registrarListas: () => Promise<void>;
  detener: () => void;
}
