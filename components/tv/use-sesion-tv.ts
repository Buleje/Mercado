"use client";

/**
 * La sesión del televisor (Modo TV, contrato `lib/camaras/pantallas-tv.ts`).
 *
 *  · `useCamarasTv` — ¿este TV ya está vinculado? `GET /api/tv/camaras` con la
 *    cookie `buleje-tv`: 200 = sí (y trae las cámaras), 401 = pedir código.
 *    Se repite cada minuto: así llegan las altas y la desconexión desde el panel.
 *  · `useEmparejarTv` — sin vincular: pide un código, lo guarda en
 *    `sessionStorage` (un refresco no lo cambia) y pregunta cada 2 s si ya lo
 *    escribieron en el panel. Si vence, pide otro solo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { logger } from "@/lib/logger";
import {
  TV_HEADER_SECRETO,
  TV_RUTAS,
  TV_SONDEO_MS,
  type TvCamarasRespuesta,
  type TvEmparejarRespuesta,
  type TvEstadoRespuesta,
} from "@/lib/camaras/pantallas-tv";
import { camarasParaTv, TV_RECARGA_MS, type CamaraTv } from "./tv-ui";

const CLAVE_GUARDADO = "buleje-tv-codigo";

/* ── sessionStorage (puede no existir: modo privado, TV viejos) ─────────── */

function leerGuardado(): TvEmparejarRespuesta | null {
  try {
    const j = JSON.parse(sessionStorage.getItem(CLAVE_GUARDADO) ?? "null") as TvEmparejarRespuesta | null;
    return j && typeof j.codigo === "string" && typeof j.secreto === "string" && typeof j.expiraEn === "string"
      ? j
      : null;
  } catch {
    return null;
  }
}
function guardar(c: TvEmparejarRespuesta | null) {
  try {
    if (c) sessionStorage.setItem(CLAVE_GUARDADO, JSON.stringify(c));
    else sessionStorage.removeItem(CLAVE_GUARDADO);
  } catch (err) {
    logger.info("[tv] sin sessionStorage", { error: String(err) });
  }
}
/** Con 5 s de margen: un código a punto de vencer no se muestra. */
const vencio = (c: TvEmparejarRespuesta) => Date.parse(c.expiraEn) - 5_000 <= Date.now();

/* ── Vinculada: las cámaras ──────────────────────────────────────────────── */

export type FaseTv = "cargando" | "sin-vincular" | "vinculada" | "error";

export interface CamarasTv {
  fase: FaseTv;
  pantalla: TvCamarasRespuesta["pantalla"] | null;
  camaras: CamaraTv[];
  recargar: () => void;
  /** «Desconectar este TV»: borra la cookie y vuelve a pedir código. */
  salir: () => Promise<void>;
}

export function useCamarasTv(): CamarasTv {
  const [fase, setFase] = useState<FaseTv>("cargando");
  const [pantalla, setPantalla] = useState<CamarasTv["pantalla"]>(null);
  const [camaras, setCamaras] = useState<CamaraTv[]>([]);
  const [intento, setIntento] = useState(0);
  /* La lista cada minuto: si no cambió, no se toca (los videos no se reinician). */
  const huella = useRef("");

  useEffect(() => {
    let vigente = true;
    let t: ReturnType<typeof setTimeout> | null = null;
    const cargar = async () => {
      try {
        const r = await fetch(TV_RUTAS.camaras, { credentials: "include", cache: "no-store" });
        if (!vigente) return;
        if (r.status === 401 || r.status === 403) {
          huella.current = "";
          setCamaras([]);
          setFase("sin-vincular");
          return;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as TvCamarasRespuesta;
        if (!vigente) return;
        const nuevas = camarasParaTv(Array.isArray(j.camaras) ? j.camaras : []);
        const h = JSON.stringify(nuevas);
        if (h !== huella.current) {
          huella.current = h;
          setCamaras(nuevas);
        }
        setPantalla(j.pantalla ?? null);
        setFase("vinculada");
      } catch (err) {
        if (!vigente) return;
        logger.warn("[tv] no se pudo pedir la lista de cámaras", { error: String(err) });
        /* Con el mosaico andando, un corte de red no lo tira: se reintenta solo. */
        setFase((f) => (f === "vinculada" ? f : "error"));
      }
      t = setTimeout(() => void cargar(), TV_RECARGA_MS);
    };
    void cargar();
    return () => {
      vigente = false;
      if (t) clearTimeout(t);
    };
  }, [intento]);

  const recargar = useCallback(() => setIntento((n) => n + 1), []);
  const salir = useCallback(async () => {
    try {
      /* Los POST del TV llevan el `X-CSRF-Token` de la cookie que siembra `/tv`. */
      await fetch(TV_RUTAS.salir, { method: "POST", credentials: "include", headers: csrfHeaders() });
    } catch (err) {
      logger.warn("[tv] no se pudo avisar la desconexión", { error: String(err) });
    }
    huella.current = "";
    setCamaras([]);
    setPantalla(null);
    setFase("sin-vincular");
  }, []);

  return { fase, pantalla, camaras, recargar, salir };
}

/* ── Sin vincular: el código ─────────────────────────────────────────────── */

export interface EmparejarTv {
  codigo: TvEmparejarRespuesta | null;
  /** Problema de red: se muestra chico y se sigue intentando. */
  aviso: string | null;
}

export function useEmparejarTv(activo: boolean, onVinculada: () => void): EmparejarTv {
  const [codigo, setCodigo] = useState<TvEmparejarRespuesta | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const alVincular = useRef(onVinculada);
  useEffect(() => {
    alVincular.current = onVinculada;
  }, [onVinculada]);

  useEffect(() => {
    if (!activo) return;
    let vigente = true;
    let t: ReturnType<typeof setTimeout> | null = null;
    let actual = leerGuardado();
    if (actual && vencio(actual)) actual = null;
    setCodigo(actual);

    const pedirCodigo = async (): Promise<TvEmparejarRespuesta | null> => {
      const r = await fetch(TV_RUTAS.emparejar, {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: csrfHeaders(),
      });
      /* 201 con el código (`r.ok` lo cubre). */
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as TvEmparejarRespuesta;
      return typeof j.codigo === "string" && typeof j.secreto === "string" ? j : null;
    };

    const ciclo = async () => {
      if (!vigente) return;
      try {
        if (!actual || vencio(actual)) {
          actual = await pedirCodigo();
          if (!vigente) return;
          guardar(actual);
          setCodigo(actual);
        } else {
          /* El secreto va en un header, no en la URL: no queda en logs ni en el historial. */
          const r = await fetch(`${TV_RUTAS.estado}?codigo=${encodeURIComponent(actual.codigo)}`, {
            credentials: "include",
            cache: "no-store",
            headers: { [TV_HEADER_SECRETO]: actual.secreto },
          });
          const j = (await r.json().catch((err: unknown) => {
            logger.info("[tv] estado sin JSON", { error: String(err) });
            return null;
          })) as TvEstadoRespuesta | null;
          if (!vigente) return;
          if (j?.estado === "vinculada") {
            guardar(null);
            alVincular.current();
            return;
          }
          /* Vencido (también un secreto malo: el servidor no distingue), parámetros
             inválidos (400) o el servidor ya no lo conoce: otro código al toque. */
          if (j?.estado === "vencido" || [400, 403, 404, 410].includes(r.status)) {
            actual = null;
            guardar(null);
            t = setTimeout(() => void ciclo(), 0);
            return;
          }
        }
        setAviso(null);
      } catch (err) {
        if (!vigente) return;
        logger.warn("[tv] emparejar falló", { error: String(err) });
        setAviso("No hay conexión con el sistema. Sigo intentando…");
      }
      t = setTimeout(() => void ciclo(), TV_SONDEO_MS);
    };
    void ciclo();
    return () => {
      vigente = false;
      if (t) clearTimeout(t);
    };
  }, [activo]);

  return { codigo, aviso };
}
