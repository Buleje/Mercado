"use client";

/**
 * use-plan-empresa — el plan de la empresa en el cliente (ADR-497).
 *
 * `PlanEmpresaProvider` lee todo el plan en UNA llamada y cada vista toma su
 * sección con `useSeccionPlan(seccion)`: edita en memoria y se guarda sola
 * (1,2 s después del último cambio). Cada guardado manda la `version` que se
 * editó; si otra persona guardó primero, la sección queda en `conflicto` con
 * lo que hay ahora, y se elige: tomar lo suyo o guardar lo mío encima.
 *
 * Al cerrar la pestaña con cambios sin guardar, el navegador avisa.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  leerSeccion,
  vacia,
  type ConflictoSeccion,
  type DatosPlan,
  type DatosSeccion,
  type PlanEmpresaRespuesta,
  type SeccionGuardada,
  type SeccionPlan,
} from "@/lib/planificacion/secciones";

export type EstadoGuardado = "guardado" | "cambios" | "guardando" | "error" | "conflicto";

interface EstadoSeccion {
  datos: unknown;
  version: number;
  actualizado: string | null;
  autor: string | null;
  estado: EstadoGuardado;
  error: string | null;
  /** En conflicto: lo que otro guardó. */
  suyo: SeccionGuardada | null;
  /** Sube con cada cambio local: si cambió mientras se guardaba, queda pendiente. */
  rev: number;
}

interface Contexto {
  cargando: boolean;
  error: string | null;
  recargar: () => void;
  ocultas: SeccionPlan[];
  puedeEditar: boolean;
  membrete: PlanEmpresaRespuesta["membrete"] | null;
  secciones: Partial<Record<SeccionPlan, EstadoSeccion>>;
  cambiar: (s: SeccionPlan, siguiente: (prev: unknown) => unknown) => void;
  guardarAhora: (s: SeccionPlan) => Promise<void>;
  resolver: (s: SeccionPlan, como: "suyo" | "mio") => void;
}

const Ctx = createContext<Contexto | null>(null);

/** El cuerpo JSON de una respuesta, o `null` si no trae (un 502 del proxy viene en HTML). */
export async function cuerpoJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
const ESPERA_MS = 1200;
const JSON_HEADERS = { "Content-Type": "application/json" };

function inicial(s: SeccionPlan, g: SeccionGuardada | undefined): EstadoSeccion {
  return {
    datos: g ? leerSeccion(s, g.datos) : vacia(s),
    version: g?.version ?? 0,
    actualizado: g?.actualizado ?? null,
    autor: g?.autor ?? null,
    estado: "guardado",
    error: null,
    suyo: null,
    rev: 0,
  };
}

export function PlanEmpresaProvider({ children }: { children: ReactNode }) {
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resp, setResp] = useState<PlanEmpresaRespuesta | null>(null);
  const [secciones, setSecciones] = useState<Partial<Record<SeccionPlan, EstadoSeccion>>>({});
  const ref = useRef(secciones);
  ref.current = secciones;
  const timers = useRef(new Map<SeccionPlan, ReturnType<typeof setTimeout>>());

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/planificacion", { cache: "no-store" });
      if (!res.ok) throw new Error((await cuerpoJson(res) as { error?: string } | null)?.error ?? "No se pudo leer el plan");
      const data = (await res.json()) as PlanEmpresaRespuesta;
      setResp(data);
      const todas = (Object.keys(data.secciones) as SeccionPlan[]).reduce<Partial<Record<SeccionPlan, EstadoSeccion>>>(
        (acc, s) => ({ ...acc, [s]: inicial(s, data.secciones[s] as SeccionGuardada) }),
        {},
      );
      setSecciones(todas);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el plan");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const parchar = useCallback((s: SeccionPlan, p: Partial<EstadoSeccion>) => {
    setSecciones((prev) => {
      const actual = prev[s] ?? inicial(s, undefined);
      return { ...prev, [s]: { ...actual, ...p } };
    });
  }, []);

  const guardarAhora = useCallback(
    async (s: SeccionPlan, forzarVersion?: number) => {
      const t = timers.current.get(s);
      if (t) clearTimeout(t);
      timers.current.delete(s);
      const actual = ref.current[s];
      if (!actual || actual.estado === "conflicto" && forzarVersion === undefined) return;
      const revEnviada = actual.rev;
      parchar(s, { estado: "guardando", error: null });
      try {
        const res = await fetch(`/api/admin/planificacion/${s}`, {
          method: "PUT",
          headers: csrfHeaders(JSON_HEADERS),
          body: JSON.stringify({ version: forzarVersion ?? actual.version, datos: actual.datos }),
        });
        const body = (await cuerpoJson(res)) as (ConflictoSeccion & SeccionGuardada & { error?: string }) | null;
        if (res.status === 409) {
          const c = body as ConflictoSeccion;
          parchar(s, { estado: "conflicto", suyo: c.actual, error: c.error });
          return;
        }
        if (!res.ok) {
          parchar(s, { estado: "error", error: body?.error ?? "No se guardó. Reintenta." });
          return;
        }
        const g = body as SeccionGuardada;
        const siguio = (ref.current[s]?.rev ?? revEnviada) !== revEnviada;
        parchar(s, {
          version: g.version,
          actualizado: g.actualizado,
          autor: g.autor,
          suyo: null,
          error: null,
          estado: siguio ? "cambios" : "guardado",
        });
        if (siguio) programar(s);
      } catch {
        parchar(s, { estado: "error", error: "Sin conexión: no se guardó. Reintenta." });
      }
    },
    // `programar` se declara abajo y sólo usa refs: no cambia entre renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [parchar],
  );

  const programar = useCallback(
    (s: SeccionPlan) => {
      const t = timers.current.get(s);
      if (t) clearTimeout(t);
      timers.current.set(
        s,
        setTimeout(() => void guardarAhora(s), ESPERA_MS),
      );
    },
    [guardarAhora],
  );

  const cambiar = useCallback(
    (s: SeccionPlan, siguiente: (prev: unknown) => unknown) => {
      setSecciones((prev) => {
        const actual = prev[s] ?? inicial(s, undefined);
        const estado: EstadoGuardado = actual.estado === "conflicto" ? "conflicto" : "cambios";
        return { ...prev, [s]: { ...actual, datos: siguiente(actual.datos), estado, rev: actual.rev + 1 } };
      });
      if (ref.current[s]?.estado !== "conflicto") programar(s);
    },
    [programar],
  );

  const resolver = useCallback(
    (s: SeccionPlan, como: "suyo" | "mio") => {
      const actual = ref.current[s];
      if (!actual?.suyo) return;
      if (como === "suyo") {
        parchar(s, { ...inicial(s, actual.suyo), rev: actual.rev + 1 });
        return;
      }
      void guardarAhora(s, actual.suyo.version);
    },
    [guardarAhora, parchar],
  );

  // Cambios sin guardar al cerrar: el navegador pregunta.
  useEffect(() => {
    const avisar = (e: BeforeUnloadEvent) => {
      const pendiente = Object.values(ref.current).some((x) => x && x.estado !== "guardado");
      if (pendiente) e.preventDefault();
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, []);

  // Al salir del módulo: lo pendiente se manda ya.
  useEffect(() => {
    const pendientes = timers.current;
    return () => {
      for (const s of pendientes.keys()) void guardarAhora(s);
    };
  }, [guardarAhora]);

  const valor = useMemo<Contexto>(
    () => ({
      cargando,
      error,
      recargar: () => void cargar(),
      ocultas: resp?.ocultas ?? [],
      puedeEditar: resp?.puedeEditar ?? false,
      membrete: resp?.membrete ?? null,
      secciones,
      cambiar,
      guardarAhora: (s) => guardarAhora(s),
      resolver,
    }),
    [cargando, error, cargar, resp, secciones, cambiar, guardarAhora, resolver],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

function useCtxPlan(): Contexto {
  const c = useContext(Ctx);
  if (!c) throw new Error("usePlanEmpresa va dentro de <PlanEmpresaProvider>");
  return c;
}

/** El plan entero: carga, permisos, membrete y los datos de cada sección visible. */
export function usePlanEmpresa() {
  const c = useCtxPlan();
  const datos = useMemo(() => {
    const out: Partial<DatosPlan> = {};
    for (const [s, v] of Object.entries(c.secciones) as [SeccionPlan, EstadoSeccion][]) {
      (out as Record<SeccionPlan, unknown>)[s] = v.datos;
    }
    return out;
  }, [c.secciones]);
  const pendientes = useMemo(
    () => (Object.entries(c.secciones) as [SeccionPlan, EstadoSeccion][]).filter(([, v]) => v.estado !== "guardado").map(([s]) => s),
    [c.secciones],
  );
  return {
    cargando: c.cargando,
    error: c.error,
    recargar: c.recargar,
    ocultas: c.ocultas,
    puedeEditar: c.puedeEditar,
    membrete: c.membrete,
    datos,
    pendientes,
  };
}

export interface SeccionPlanHook<S extends SeccionPlan> {
  datos: DatosSeccion<S>;
  /** Cambia en memoria y programa el guardado. */
  cambiar: (siguiente: DatosSeccion<S> | ((prev: DatosSeccion<S>) => DatosSeccion<S>)) => void;
  guardarAhora: () => Promise<void>;
  estado: EstadoGuardado;
  error: string | null;
  version: number;
  actualizado: string | null;
  autor: string | null;
  /** Este rol no la puede ver (socios, inversión). */
  oculta: boolean;
  puedeEditar: boolean;
  /** En conflicto: lo que guardó la otra persona. */
  suyo: SeccionGuardada<S> | null;
  tomarLoSuyo: () => void;
  guardarLoMio: () => void;
}

export function useSeccionPlan<S extends SeccionPlan>(seccion: S): SeccionPlanHook<S> {
  const c = useCtxPlan();
  const e = c.secciones[seccion];
  const oculta = c.ocultas.includes(seccion);
  const datos = useMemo(() => (e ? (e.datos as DatosSeccion<S>) : vacia(seccion)), [e, seccion]);
  const { cambiar: cambiarCtx, guardarAhora: guardarCtx, resolver } = c;
  const cambiar = useCallback<SeccionPlanHook<S>["cambiar"]>(
    (siguiente) =>
      cambiarCtx(seccion, (prev) => {
        const base = (prev ?? vacia(seccion)) as DatosSeccion<S>;
        return typeof siguiente === "function" ? (siguiente as (p: DatosSeccion<S>) => DatosSeccion<S>)(base) : siguiente;
      }),
    [cambiarCtx, seccion],
  );
  return {
    datos,
    cambiar,
    guardarAhora: () => guardarCtx(seccion),
    estado: e?.estado ?? "guardado",
    error: e?.error ?? null,
    version: e?.version ?? 0,
    actualizado: e?.actualizado ?? null,
    autor: e?.autor ?? null,
    oculta,
    puedeEditar: c.puedeEditar && !oculta,
    suyo: (e?.suyo as SeccionGuardada<S> | null) ?? null,
    tomarLoSuyo: () => resolver(seccion, "suyo"),
    guardarLoMio: () => resolver(seccion, "mio"),
  };
}

/** Id corto para los ítems nuevos de una lista. */
export function nuevoId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 12)
    : Math.random().toString(36).slice(2, 14);
}
