import "server-only";
import { kvBorrar, kvEscribir, kvLeer } from "@/lib/camaras/kv-efimero.server";
import { hashSecretoTv, nuevoCodigoTv, nuevoSecretoTv, secretoTvCoincide } from "@/lib/camaras/tv-token.server";
import { TV_CODIGO_VIDA_S, type TvEmparejarRespuesta } from "@/lib/camaras/pantallas-tv";

/**
 * El código que muestra el televisor (ADR-473), en Redis `tv:par:<codigo>`.
 *
 *   TV  POST /api/tv/emparejar   → crea { secretoHash, estado: "esperando" } EX 10 min
 *   Dueño POST /api/admin/camaras/pantallas { codigo } → crea la pantalla y
 *         marca el par «vinculada» con el negocio y la pantalla
 *   TV  GET /api/tv/estado?codigo (+ header `x-tv-secreto`) → la primera vez
 *         que lo ve «vinculada», y con la pantalla confirmada, BORRA el par
 *         (un solo uso) y recibe la cookie
 *
 * El código solo NO alcanza para robar la sesión: el estado exige el secreto
 * que sólo conoce el TV que lo pidió, y el par se consume en ese mismo pedido.
 */

const CLAVE_PAR = (codigo: string) => `tv:par:${codigo}`;
const CLAVE_TOMA = (codigo: string) => `tv:par:${codigo}:toma`;
/** Cuánto aguanta el candado de «vinculando» si el proceso muere a la mitad. */
const SEGUNDOS_TOMA = 30;
const INTENTOS_CODIGO = 8;

export type ParTv =
  | { estado: "esperando"; secretoHash: string }
  | { estado: "vinculada"; secretoHash: string; tid: string; pid: string; nombre: string; expiraEn: string };

function parDe(raw: unknown): ParTv | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.secretoHash !== "string") return null;
  if (o.estado === "esperando") return { estado: "esperando", secretoHash: o.secretoHash };
  if (
    o.estado === "vinculada" &&
    typeof o.tid === "string" &&
    typeof o.pid === "string" &&
    typeof o.nombre === "string" &&
    typeof o.expiraEn === "string"
  ) {
    return { estado: "vinculada", secretoHash: o.secretoHash, tid: o.tid, pid: o.pid, nombre: o.nombre, expiraEn: o.expiraEn };
  }
  return null;
}

/** Código nuevo; si por azar ya existe uno igual vivo, se sortea otro (SET NX). */
export async function crearParTv(ahora = Date.now()): Promise<TvEmparejarRespuesta | null> {
  const secreto = nuevoSecretoTv();
  const par: ParTv = { estado: "esperando", secretoHash: hashSecretoTv(secreto) };
  for (let i = 0; i < INTENTOS_CODIGO; i++) {
    const codigo = nuevoCodigoTv();
    if (await kvEscribir(CLAVE_PAR(codigo), par, TV_CODIGO_VIDA_S, { soloSiNueva: true })) {
      return { codigo, secreto, expiraEn: new Date(ahora + TV_CODIGO_VIDA_S * 1000).toISOString() };
    }
  }
  return null;
}

export type ConsultaPar =
  /** Inexistente, vencido o secreto malo: la MISMA respuesta (no revela qué códigos están vivos). */
  | { tipo: "vencido" }
  | { tipo: "esperando" }
  | { tipo: "vinculada"; tid: string; pid: string; nombre: string; expiraEn: string };

/** Sólo lee: el par se consume con `consumirParTv` cuando la pantalla está confirmada. */
export async function consultarParTv(codigo: string, secreto: string): Promise<ConsultaPar> {
  const par = parDe(await kvLeer<unknown>(CLAVE_PAR(codigo)));
  if (!par || !secretoTvCoincide(secreto, par.secretoHash)) return { tipo: "vencido" };
  if (par.estado === "esperando") return { tipo: "esperando" };
  return { tipo: "vinculada", tid: par.tid, pid: par.pid, nombre: par.nombre, expiraEn: par.expiraEn };
}

/** Borra el par y dice si fue ESTE pedido: el único que recibe la cookie (un solo uso). */
export const consumirParTv = (codigo: string) => kvBorrar(CLAVE_PAR(codigo));

export type TomaPar = { ok: true; soltar: () => Promise<void> } | { ok: false; motivo: "vencido" | "ocupado" | "usado" };

/**
 * El panel toma el código para vincularlo: candado (SET NX) + relectura. Dos
 * clics a la vez (o dos dueños) no crean dos pantallas con el mismo código.
 */
export async function tomarParTv(codigo: string): Promise<TomaPar> {
  if (!(await kvEscribir(CLAVE_TOMA(codigo), "1", SEGUNDOS_TOMA, { soloSiNueva: true }))) {
    return { ok: false, motivo: "ocupado" };
  }
  const soltar = async () => {
    await kvBorrar(CLAVE_TOMA(codigo));
  };
  const par = parDe(await kvLeer<unknown>(CLAVE_PAR(codigo)));
  if (!par || par.estado !== "esperando") {
    await soltar();
    return { ok: false, motivo: par ? "usado" : "vencido" };
  }
  return { ok: true, soltar };
}

/** Marca el par como vinculado (con su secreto de siempre) para que el TV lo recoja. */
export async function marcarParVinculado(
  codigo: string,
  datos: { tid: string; pid: string; nombre: string; expiraEn: string },
): Promise<boolean> {
  const par = parDe(await kvLeer<unknown>(CLAVE_PAR(codigo)));
  if (!par || par.estado !== "esperando") return false;
  const vinculado: ParTv = { estado: "vinculada", secretoHash: par.secretoHash, ...datos };
  return kvEscribir(CLAVE_PAR(codigo), vinculado, TV_CODIGO_VIDA_S);
}
