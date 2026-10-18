"use client";

/**
 * Lo que el Libro TH avisa desde la banda y lo que cuenta su embudo
 * (compactación 17-10, Brandon: «compactar el Libro TH» como el CTP).
 *
 * Antes eran dos bloques arriba de las Secciones: el resumen «Aprovechamiento»
 * (`LothResumenStrip`, con sus bloqueos, alertas y lo movilizado fuera del
 * plan) y el aviso de «líneas sin permiso» (`LothAtarSinPlan`). Juntos se
 * comían ~110 px antes de la tabla y sólo se veían en Secciones. Ahora:
 *  · los AVISOS van a la campana de la banda (`LothAvisosLibro`), en todas las
 *    vistas, y con un número en la pestaña donde se resuelven (`alertas`);
 *  · las CIFRAS del embudo, a una tarjeta de los Indicadores de Secciones
 *    (`LothEmbudoKpi`).
 * Un solo pedido de cada fuente para las dos cosas. El estado de la ventana de
 * avisos vive acá y no en el botón: a 1280 el botón cae dentro del «⋯» del
 * libro, que se desmonta al aparecer una ventana.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { leerJson } from "@/lib/errores/sin-dato";
import { formatNumber } from "@/lib/format";
import { logger } from "@/lib/logger";
import type { AtarSinPlanConteo } from "@/lib/forestal/loth-atar-sin-plan";
import type { Anomaly } from "@/lib/forestal/loth-constants";

/** Lo que usa el libro de `/api/admin/forestal/plan?analytics=1` (libro entero, sin plan). */
export interface AnalyticsLibroTh {
  hasPlan: boolean;
  aprovechamiento: {
    funnel: { taladoM3: number; trozadoM3: number; despachoTrozaM3: number; despachoProductoM3: number };
    rendimientoGlobalPct: number;
    bySpecies: { species: string }[];
  };
  balance: {
    rows: { movilizado: number; saldo: number }[];
    fueraDePlan?: { species: string; movilizadoM3: number }[];
  } | null;
  anomalias: Anomaly[];
}

/** El embudo del libro entero: las mismas cuentas que tenía el resumen. */
export interface EmbudoLibroTh {
  talado: number;
  trozado: number;
  movilizado: number;
  rendimientoPct: number;
  especies: number;
  /** Saldo del POA de las especies autorizadas (0 si el plan no declara volúmenes). */
  movilizadoAutorizado: number;
  autorizado: number;
  pctPoa: number;
  excedido: boolean;
  fueraDePlan: { species: string; movilizadoM3: number }[];
  volFueraDePlan: number;
  /** Sin nada talado, trozado ni movilizado no hay embudo que mostrar. */
  hayActividad: boolean;
}

export function embudoDe(a: AnalyticsLibroTh): EmbudoLibroTh {
  const f = a.aprovechamiento.funnel;
  const movilizado = f.despachoTrozaM3 + f.despachoProductoM3;
  const rows = a.balance?.rows ?? [];
  const movilizadoAutorizado = rows.reduce((s, r) => s + r.movilizado, 0);
  const autorizado = rows.reduce((s, r) => s + r.movilizado + Math.max(0, r.saldo), 0);
  /* Lo que salió de especies que el POA no declara: el saldo NO lo cuenta
     (recorre las autorizadas), así que va aparte y en rojo. */
  const fueraDePlan = a.balance?.fueraDePlan ?? [];
  return {
    talado: f.taladoM3,
    trozado: f.trozadoM3,
    movilizado,
    rendimientoPct: a.aprovechamiento.rendimientoGlobalPct,
    especies: a.aprovechamiento.bySpecies.length,
    movilizadoAutorizado,
    autorizado,
    pctPoa: autorizado > 0 ? Math.min(100, (movilizadoAutorizado / autorizado) * 100) : 0,
    excedido: rows.some((r) => r.saldo < -1e-6),
    fueraDePlan,
    volFueraDePlan: fueraDePlan.reduce((s, x) => s + x.movilizadoM3, 0),
    hayActividad: f.taladoM3 > 0 || f.trozadoM3 > 0 || movilizado > 0,
  };
}

/** Un renglón de la ventana de avisos. */
export interface AvisoLibroTh {
  clave: string;
  /** `bloquea` = rojo (un bloqueo, lo movilizado fuera del plan); `atrasado` = ámbar. */
  tono: "bloquea" | "atrasado";
  /** Cuántos casos, cuando son varios del mismo tipo. */
  cantidad: number | null;
  titulo: string;
  detalle: string;
  /** Dónde se resuelve: atar las líneas, o la vista Cumplimiento. */
  accion: "atar" | "cumplimiento";
}

/** El nombre de cada tipo de bloqueo o alerta (`ForestPlanDB.analytics`). */
const TITULO_ANOMALIA: Record<string, [string, string]> = {
  trozado_gt_talado: ["Trozado mayor que lo talado", "especies con más trozado que talado"],
  rend_aserrio_imposible: ["Producto mayor que la materia prima", "veces producto mayor que la materia prima"],
  exceso_autorizado: ["Movilizado sobre lo autorizado", "especies movilizadas sobre lo autorizado"],
  saldo_bajo: ["Poco saldo del POA", "especies con poco saldo del POA"],
  troza_fantasma: ["Troza despachada sin trozado", "trozas despachadas sin trozado"],
  fuera_de_plazo: ["Líneas fuera de plazo", "avisos de líneas fuera de plazo"],
};

const lista = (xs: string[], tope = 3) =>
  xs.length <= tope ? xs.join(", ") : `${xs.slice(0, tope).join(", ")} y ${xs.length - tope} más`;

/** Los renglones, en el orden en que se miran: rojo antes que ámbar. */
export function avisosDe(sinPermiso: number, puedeAtar: boolean, a: AnalyticsLibroTh | null): AvisoLibroTh[] {
  const out: AvisoLibroTh[] = [];
  if (a) {
    const e = embudoDe(a);
    if (e.volFueraDePlan > 0) {
      out.push({
        clave: "fuera-de-plan",
        tono: "bloquea",
        cantidad: e.fueraDePlan.length > 1 ? e.fueraDePlan.length : null,
        titulo: `${formatNumber(e.volFueraDePlan, 2)} m³ movilizados fuera del plan`,
        detalle: lista(e.fueraDePlan.map((x) => `${x.species} ${formatNumber(x.movilizadoM3, 2)} m³`)),
        accion: "cumplimiento",
      });
    }
    const grupos = new Map<string, Anomaly[]>();
    for (const an of a.anomalias) grupos.set(an.code, [...(grupos.get(an.code) ?? []), an]);
    const filas = [...grupos.entries()].map(([code, xs]): AvisoLibroTh => {
      const [uno, varios] = TITULO_ANOMALIA[code] ?? ["Revisa el libro", "avisos del libro"];
      const especies = xs.map((x) => x.species).filter((s): s is string => !!s);
      return {
        clave: `anomalia-${code}`,
        tono: xs.some((x) => x.level === "error") ? "bloquea" : "atrasado",
        cantidad: xs.length > 1 ? xs.length : null,
        titulo: xs.length > 1 ? varios.charAt(0).toUpperCase() + varios.slice(1) : uno,
        detalle: xs.length === 1 ? xs[0].message : especies.length > 0 ? lista(especies) : xs[0].message,
        accion: "cumplimiento",
      };
    });
    out.push(...filas.sort((x, y) => (x.tono === y.tono ? 0 : x.tono === "bloquea" ? -1 : 1)));
  }
  if (sinPermiso > 0) {
    out.push({
      clave: "sin-permiso",
      tono: "atrasado",
      cantidad: sinPermiso,
      titulo: sinPermiso === 1 ? "Línea sin permiso" : "Líneas sin permiso",
      detalle: puedeAtar
        ? "Cuentan en el saldo de todos los permisos. Átalas al permiso de sus talas."
        : "Cuentan en el saldo de todos los permisos. Las ata el administrador o el dueño.",
      accion: "atar",
    });
  }
  return out;
}

export interface EstadoAvisosLibroTh {
  analytics: AnalyticsLibroTh | null;
  embudo: EmbudoLibroTh | null;
  sinPermiso: AtarSinPlanConteo | null;
  avisos: AvisoLibroTh[];
  /** Número por vista del riel: dónde se resuelve cada aviso. */
  alertas: Record<string, number>;
  cargando: boolean;
  fallo: boolean;
  /** La ventana de avisos (acá, no en el botón: ver arriba). */
  abierto: boolean;
  setAbierto: (v: boolean) => void;
}

async function pedir<T>(url: string, signal: AbortSignal): Promise<T | null> {
  const r = await fetch(url, { credentials: "include", signal });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return leerJson<T>(r);
}

export function useLothAvisosLibro(reloadSignal: number, puedeAtar: boolean): EstadoAvisosLibroTh {
  const [analytics, setAnalytics] = useState<AnalyticsLibroTh | null>(null);
  const [sinPermiso, setSinPermiso] = useState<AtarSinPlanConteo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);
  const [abierto, setAbiertoState] = useState(false);
  const setAbierto = useCallback((v: boolean) => setAbiertoState(v), []);

  useEffect(() => {
    const ac = new AbortController();
    setCargando(true);
    (async () => {
      /* Cada fuente por su lado: sin el conteo, igual se ven los bloqueos. */
      const [an, sp] = await Promise.allSettled([
        pedir<{ analytics?: AnalyticsLibroTh | null }>("/api/admin/forestal/plan?analytics=1", ac.signal),
        pedir<AtarSinPlanConteo>("/api/admin/forestal/loth/atar-plan", ac.signal),
      ]);
      if (ac.signal.aborted) return;
      if (an.status === "fulfilled") setAnalytics(an.value?.analytics ?? null);
      if (sp.status === "fulfilled" && sp.value) setSinPermiso(sp.value);
      const caidas = [an, sp].filter((x): x is PromiseRejectedResult => x.status === "rejected");
      for (const c of caidas) logger.warn("[loth-avisos] no se pudo revisar el libro", { error: String(c.reason) });
      setFallo(caidas.length === 2);
      setCargando(false);
    })().catch((err) => logger.error("[loth-avisos] revisión rota", { error: String(err) }));
    return () => ac.abort();
  }, [reloadSignal]);

  return useMemo(() => {
    const embudo = analytics ? embudoDe(analytics) : null;
    const avisos = avisosDe(sinPermiso?.total ?? 0, puedeAtar, analytics);
    const alertas: Record<string, number> = {};
    if (sinPermiso && sinPermiso.total > 0) alertas.secciones = sinPermiso.total;
    const deCumplimiento = (analytics?.anomalias.length ?? 0) + (embudo?.fueraDePlan.length ?? 0);
    if (deCumplimiento > 0) alertas.cumplimiento = deCumplimiento;
    return { analytics, embudo, sinPermiso, avisos, alertas, cargando, fallo, abierto, setAbierto };
  }, [analytics, sinPermiso, puedeAtar, cargando, fallo, abierto, setAbierto]);
}
