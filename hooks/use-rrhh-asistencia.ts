"use client";

/**
 * use-rrhh-asistencia — la hoja de asistencia (ADR-414 §4), día o mes.
 *
 * Cada toque de celda se ve al instante (optimista) y se acumula en un buffer
 * que se vacía en UNA sola llamada a `PUT /api/rrhh/asistencia` tras ~800ms de
 * inactividad — tildar 20 casilleros seguidos no dispara 20 requests (bucket
 * `GENEROUS`, pero igual es la cortesía correcta con la red del patio). Si el
 * componente se desmonta con cambios pendientes (cambiar de día/mes), el
 * flush se dispara igual antes de perderlos.
 *
 * El masivo («Todos presentes») es una llamada aparte, inmediata: no tiene
 * sentido acumularla con marcas sueltas.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { csrfHeaders } from "@/lib/csrf-client";
import { etiquetaDia } from "@/lib/rrhh/fechas";
import type { AsistenciaDTO, EstadoAsistencia, FechaKey, HojaAsistenciaDTO } from "@/lib/rrhh/tipos";
import type { RrhhApiError } from "./use-rrhh-puestos";

export interface MarcaInput {
  colaboradorId: string;
  fecha: FechaKey;
  /** `null` = quitar la marca del día. */
  estado: EstadoAsistencia | null;
  entrada?: string | null;
  salida?: string | null;
  refrigerioMin?: number;
  horas?: number | null;
  nota?: string | null;
}

export interface MasivoInput {
  fecha: FechaKey;
  estado?: EstadoAsistencia;
  entrada?: string | null;
  salida?: string | null;
  colaboradorIds?: string[];
  sobrescribir?: boolean;
  nota?: string | null;
}

export interface OmitidoMasivo {
  colaboradorId: string;
  nombre: string;
  motivo: "ya_marcado" | "no_activo" | "no_ingresado" | "cesado";
}

const DEBOUNCE_MS = 800;

const clave = (colaboradorId: string, fecha: FechaKey) => `${colaboradorId}|${fecha}`;

/** Lo que devuelve un flush: si algo falló, con qué motivo y de qué fecha — para que quien navegó lejos lo pueda avisar igual. */
export interface ResultadoFlush {
  ok: boolean;
  fallos: { fecha: FechaKey; motivo: string }[];
}

/**
 * «No se guardaron 2 marcas del jueves 11/09: <motivo>» — agrupa por
 * fecha+motivo, un toast por grupo. Exportado: lo usan también
 * `HojaDelDia`/`HojaDelMes` cuando `guardarAhora()` falla justo antes de
 * navegar a otro día/mes (ALTO 5) — ahí `flush()` no se avisa solo porque el
 * componente todavía está montado, así que es responsabilidad de quien llama.
 */
export function avisarFallos(fallos: { fecha: FechaKey; motivo: string }[]) {
  const porGrupo = new Map<string, { fecha: FechaKey; motivo: string; n: number }>();
  for (const f of fallos) {
    const k = `${f.fecha}::${f.motivo}`;
    const previo = porGrupo.get(k);
    porGrupo.set(k, { fecha: f.fecha, motivo: f.motivo, n: (previo?.n ?? 0) + 1 });
  }
  for (const { fecha, motivo, n } of porGrupo.values()) {
    toast.error(`No se ${n === 1 ? "guardó" : "guardaron"} ${n} ${n === 1 ? "marca" : "marcas"} del ${etiquetaDia(fecha)}: ${motivo}`);
  }
}

export interface UseRrhhAsistenciaResult {
  hoja: HojaAsistenciaDTO | null;
  loading: boolean;
  error: string | null;
  guardando: boolean;
  /** Claves `colaboradorId|fecha` con un cambio local todavía sin confirmar por el servidor. */
  pendientes: ReadonlySet<string>;
  /** Claves `colaboradorId|fecha` cuyo último guardado falló, con el motivo. */
  erroresPorCelda: ReadonlyMap<string, string>;
  marcar: (input: MarcaInput) => void;
  /**
   * Vacía el buffer YA (ej. antes de cambiar de día/mes). Idempotente si no
   * hay nada pendiente. Devuelve si falló algo — quien llama sabe de qué
   * fecha se está yendo y puede avisarlo aunque la hoja visible ya haya
   * cambiado para cuando la respuesta vuelve.
   */
  guardarAhora: () => Promise<ResultadoFlush>;
  masivo: (input: MasivoInput) => Promise<
    | { ok: true; creadas: number; reemplazadas: number; omitidos: OmitidoMasivo[] }
    | { ok: false; error: RrhhApiError }
  >;
  recargar: () => void;
}

export function useRrhhAsistencia(desde: FechaKey, hasta: FechaKey): UseRrhhAsistenciaResult {
  const [hoja, setHoja] = useState<HojaAsistenciaDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [pendientes, setPendientes] = useState<Set<string>>(new Set());
  const [erroresPorCelda, setErroresPorCelda] = useState<Map<string, string>>(new Map());
  const [tick, setTick] = useState(0);

  const bufferRef = useRef<Map<string, MarcaInput>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Versión de la última EDICIÓN LOCAL por celda (no de la respuesta del
   * servidor) — para que dos `flush()` superpuestos de la misma celda no se
   * pisen. Si tildás una celda, y ANTES de que su flush vuelva la tildás de
   * nuevo, el segundo toque dispara su propio flush con una versión más
   * nueva; cuando el primero responde, su resultado ya está viejo y no debe
   * sobreescribir el optimista (más nuevo) que dejó el segundo toque.
   */
  const versionRef = useRef<Map<string, number>>(new Map());
  /** `false` tras desmontar — el flush del cleanup (fire-and-forget, nadie lo espera) se avisa SOLO, con un toast. */
  const montadoRef = useRef(true);
  useEffect(() => () => { montadoRef.current = false; }, []);

  useEffect(() => {
    let vigente = true;
    setLoading(true);
    setError(null);
    fetch(`/api/rrhh/asistencia?desde=${desde}&hasta=${hasta}`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("No se pudo cargar la asistencia");
        return r.json() as Promise<HojaAsistenciaDTO>;
      })
      .then((data) => {
        if (!vigente) return;
        setHoja(data);
        setErroresPorCelda(new Map());
      })
      .catch((err) => {
        console.error("[rrhh] asistencia falló", err);
        if (vigente) setError(err instanceof Error ? err.message : "No se pudo cargar la asistencia");
      })
      .finally(() => {
        if (vigente) setLoading(false);
      });
    return () => {
      vigente = false;
    };
  }, [desde, hasta, tick]);

  const recargar = useCallback(() => setTick((t) => t + 1), []);

  /** Aplica la marca al estado local YA — antes de que el servidor confirme. */
  const aplicarOptimista = useCallback((input: MarcaInput) => {
    setHoja((prev) => {
      if (!prev) return prev;
      const k = clave(input.colaboradorId, input.fecha);
      const sinEsta = prev.marcas.filter((m) => clave(m.colaboradorId, m.fecha) !== k);
      if (input.estado === null) return { ...prev, marcas: sinEsta };
      const previa = prev.marcas.find((m) => clave(m.colaboradorId, m.fecha) === k);
      const nueva: AsistenciaDTO = {
        id: previa?.id ?? `optimista-${k}`,
        colaboradorId: input.colaboradorId,
        fecha: input.fecha,
        estado: input.estado,
        entrada: input.entrada !== undefined ? input.entrada : (previa?.entrada ?? null),
        salida: input.salida !== undefined ? input.salida : (previa?.salida ?? null),
        refrigerioMin: input.refrigerioMin ?? previa?.refrigerioMin ?? 0,
        horas: input.horas !== undefined ? input.horas : (previa?.horas ?? null),
        nota: input.nota !== undefined ? input.nota : (previa?.nota ?? null),
        origen: "manual",
        marcadoPor: previa?.marcadoPor ?? "",
        marcadoEn: new Date().toISOString(),
      };
      return { ...prev, marcas: [...sinEsta, nueva] };
    });
  }, []);

  const flush = useCallback(async (): Promise<ResultadoFlush> => {
    if (bufferRef.current.size === 0) return { ok: true, fallos: [] };
    const marcas = [...bufferRef.current.values()];
    const claves = marcas.map((m) => clave(m.colaboradorId, m.fecha));
    // Fecha de cada clave, para poder armar el aviso «N marcas del jueves
    // 11/09» sin tener que reparsear la clave compuesta más abajo.
    const fechaPorClave = new Map(marcas.map((m) => [clave(m.colaboradorId, m.fecha), m.fecha]));
    // Instantánea de "qué versión de cada celda es esta petición": si al
    // volver la respuesta la celda ya tiene una versión MÁS NUEVA (un toque
    // posterior armó su propio flush), esta respuesta quedó vieja y NO debe
    // tocar esa celda — el flush del toque más nuevo ya se encarga.
    const versionEnvio = new Map(claves.map((k) => [k, versionRef.current.get(k) ?? 0]));
    const sigueVigente = (k: string) => versionRef.current.get(k) === versionEnvio.get(k);
    bufferRef.current.clear();
    if (montadoRef.current) setGuardando(true);
    const fallos: { fecha: FechaKey; motivo: string }[] = [];
    try {
      const res = await fetch("/api/rrhh/asistencia", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ marcas }),
        credentials: "include",
      });
      if (res.ok) {
        const data = (await res.json()) as { guardadas: AsistenciaDTO[] };
        const vigentes = data.guardadas.filter((g) => sigueVigente(clave(g.colaboradorId, g.fecha)));
        if (montadoRef.current) {
          setHoja((prev) => {
            if (!prev) return prev;
            const guardadasPorClave = new Map(vigentes.map((g) => [clave(g.colaboradorId, g.fecha), g]));
            const conservadas = prev.marcas.filter((m) => !guardadasPorClave.has(clave(m.colaboradorId, m.fecha)));
            return { ...prev, marcas: [...conservadas, ...vigentes] };
          });
          setErroresPorCelda((prev) => {
            const siguiente = new Map(prev);
            for (const k of claves) if (sigueVigente(k)) siguiente.delete(k);
            return siguiente;
          });
        }
      } else if (res.status === 422) {
        const data = (await res.json()) as { errores?: { colaboradorId: string; fecha: string; motivo: string; message: string }[] };
        const erroresVigentes = (data.errores ?? []).filter((e) => sigueVigente(clave(e.colaboradorId, e.fecha)));
        for (const e of erroresVigentes) fallos.push({ fecha: e.fecha, motivo: e.message });
        if (montadoRef.current) {
          setErroresPorCelda((prev) => {
            const siguiente = new Map(prev);
            for (const e of erroresVigentes) siguiente.set(clave(e.colaboradorId, e.fecha), e.message);
            return siguiente;
          });
        }
      } else {
        for (const k of claves) if (sigueVigente(k)) fallos.push({ fecha: fechaPorClave.get(k) ?? "", motivo: "No se pudo guardar" });
        if (montadoRef.current) {
          setErroresPorCelda((prev) => {
            const siguiente = new Map(prev);
            for (const k of claves) if (sigueVigente(k)) siguiente.set(k, "No se pudo guardar");
            return siguiente;
          });
        }
      }
    } catch (err) {
      console.error("[rrhh] guardar asistencia falló", err);
      for (const k of claves) if (sigueVigente(k)) fallos.push({ fecha: fechaPorClave.get(k) ?? "", motivo: "Sin conexión — reintentá" });
      if (montadoRef.current) {
        setErroresPorCelda((prev) => {
          const siguiente = new Map(prev);
          for (const k of claves) if (sigueVigente(k)) siguiente.set(k, "Sin conexión — reintentá");
          return siguiente;
        });
      }
    } finally {
      if (montadoRef.current) {
        // Sólo se limpia `pendientes` de las claves que siguen vigentes: una
        // celda con un toque más nuevo todavía tiene SU flush por delante.
        setPendientes((prev) => {
          const siguiente = new Set(prev);
          for (const k of claves) if (sigueVigente(k)) siguiente.delete(k);
          return siguiente;
        });
        setGuardando(false);
      }
      // El flush del cleanup de desmontaje es fire-and-forget — nadie espera
      // esta promesa, así que si algo falló, el ÚNICO lugar donde puede
      // avisarse es acá mismo (ALTO 5: un error de un día/mes que ya no
      // existe en pantalla no tiene dónde mostrarse).
      if (!montadoRef.current && fallos.length > 0) avisarFallos(fallos);
    }
    return { ok: fallos.length === 0, fallos };
  }, []);

  const guardarAhora = useCallback(async (): Promise<ResultadoFlush> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    return flush();
  }, [flush]);

  const marcar = useCallback((input: MarcaInput) => {
    aplicarOptimista(input);
    const k = clave(input.colaboradorId, input.fecha);
    versionRef.current.set(k, (versionRef.current.get(k) ?? 0) + 1);
    bufferRef.current.set(k, input);
    setPendientes((prev) => new Set(prev).add(k));
    setErroresPorCelda((prev) => {
      if (!prev.has(k)) return prev;
      const siguiente = new Map(prev);
      siguiente.delete(k);
      return siguiente;
    });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flush();
    }, DEBOUNCE_MS);
  }, [aplicarOptimista, flush]);

  // Vaciar el buffer si el componente se va (cambio de día/mes, cerrar el hub).
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (bufferRef.current.size > 0) void flush();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const masivo = useCallback(async (input: MasivoInput) => {
    setGuardando(true);
    try {
      const res = await fetch("/api/rrhh/asistencia/masivo", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(input),
        credentials: "include",
      });
      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: "error_desconocido" })) as RrhhApiError;
        toast.error(error.message ?? "No se pudo hacer el masivo");
        return { ok: false as const, error };
      }
      const data = (await res.json()) as { creadas: number; reemplazadas: number; omitidos: OmitidoMasivo[] };
      recargar();
      return { ok: true as const, ...data };
    } finally {
      setGuardando(false);
    }
  }, [recargar]);

  return { hoja, loading, error, guardando, pendientes, erroresPorCelda, marcar, guardarAhora, masivo, recargar };
}
