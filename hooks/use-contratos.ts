"use client";

/**
 * use-contratos — los datos de la pantalla Contratos del Libro CTP (ADR-421).
 *
 * Tres lecturas y una escritura, todas contra `/api/admin/forestal/contratos`:
 *  · la lista de permisos ya cargados,
 *  · los CANDIDATOS (códigos escritos en el libro que todavía no son contrato),
 *  · el balance de uno,
 *  · y sembrar un candidato (alta + vinculación de lo que ya trae ese código).
 *
 * El balance NO se calcula acá: llega armado del servidor y se resume con
 * `resumirBalance()`. Una pantalla que recalcula un total termina mostrando un
 * número distinto al del backend, y el que discute con el contador es el de la
 * pantalla.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import {
  resumirBalance,
  type BalanceContrato,
  type Contrato,
  type TipoContrato,
} from "@/lib/forestal/contratos";

/** Un código que ya está escrito en el libro y todavía no es contrato. */
export interface CandidatoContrato {
  codigo: string;
  codigoNorm: string;
  /** Cuántas filas del libro lo usan (ingresos + corridas + lotes). */
  filas: number;
  m3: number;
  /** Parece un typo o una prueba: se muestra aparte, no se siembra en tanda. */
  sospechoso: boolean;
  tipo: TipoContrato;
  titularSugerido: string | null;
}

/** Qué pasó al sembrar: cuántos papeles se crearon y qué se ató a cada uno. */
export interface ResultadoSembrado {
  creados: number;
  madera: number;
  produccion: number;
  lotes: number;
  errores: string[];
}

const BASE = "/api/admin/forestal/contratos";

/** El motivo que manda el servidor, o el código HTTP si no mandó ninguno. */
async function motivo(r: Response, quePedia: string): Promise<string> {
  // `leerJson`: un cuerpo de error que no es JSON (un 502 en HTML, un 204
  // vacío) es un dato ausente, no una falla que registrar — el status ya es
  // el mensaje.
  const j = await leerJson<{ message?: string; error?: string }>(r);
  return j?.message ?? j?.error ?? `No se pudo ${quePedia} (HTTP ${r.status})`;
}

/**
 * La lista de contratos + los candidatos a sembrar.
 *
 * Guarda de «carga vieja pisa lo optimista»: el GET del doble montaje (o el que
 * salió antes de sembrar) vuelve tarde y repondría la lista SIN el permiso
 * recién creado. Sólo aplica la carga más nueva, y sólo si no hubo cambios
 * mientras viajaba.
 */
export function useContratos() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  /** El balance de cada contrato, por id — lo que la tabla muestra en sus
   *  columnas de plata. Viene en la MISMA respuesta que la lista (`?balances=1`)
   *  para que las dos cosas no puedan contradecirse. */
  const [balances, setBalances] = useState<Record<string, BalanceContrato>>({});
  const [candidatos, setCandidatos] = useState<CandidatoContrato[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sembrando, setSembrando] = useState(false);

  const cargasRef = useRef({ ultima: 0, cambios: 0 });

  const cargar = useCallback(async (opciones?: { silenciosa?: boolean }) => {
    const esta = ++cargasRef.current.ultima;
    const cambiosAlSalir = cargasRef.current.cambios;
    // La silenciosa no muestra el spinner ni borra el aviso de un alta fallida.
    if (!opciones?.silenciosa) {
      setCargando(true);
      setError(null);
    }
    try {
      const [rl, rc] = await Promise.all([
        fetch(`${BASE}?balances=1`, { credentials: "include", cache: "no-store" }),
        fetch(`${BASE}?candidatos=1`, { credentials: "include", cache: "no-store" }),
      ]);
      if (!rl.ok) throw new Error(await motivo(rl, "cargar los contratos"));
      if (!rc.ok) throw new Error(await motivo(rc, "buscar los permisos del libro"));
      const lista = (await rl.json()) as { contratos?: Contrato[]; balances?: Record<string, BalanceContrato> };
      const cand = (await rc.json()) as { candidatos?: CandidatoContrato[] };
      if (esta === cargasRef.current.ultima && cambiosAlSalir === cargasRef.current.cambios) {
        setContratos(lista.contratos ?? []);
        setBalances(lista.balances ?? {});
        setCandidatos(cand.candidatos ?? []);
      }
    } catch (e) {
      if (esta === cargasRef.current.ultima && !opciones?.silenciosa) {
        setError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      if (esta === cargasRef.current.ultima) setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /**
   * Crea los permisos elegidos y ata lo que ya traen escrito (`?vincular=1`).
   *
   * De a uno y en serie: si uno falla —un código duplicado, por ejemplo— los
   * demás igual entran, y el error dice cuál fue. Una tanda que se cae entera
   * por un código obligaría a adivinar cuál era.
   */
  const sembrar = useCallback(
    async (elegidos: CandidatoContrato[]): Promise<ResultadoSembrado> => {
      const res: ResultadoSembrado = {
        creados: 0,
        madera: 0,
        produccion: 0,
        lotes: 0,
        errores: [],
      };
      if (elegidos.length === 0) return res;
      setSembrando(true);
      setError(null);
      cargasRef.current.cambios += 1;
      try {
        for (const c of elegidos) {
          try {
            const r = await fetch(`${BASE}?vincular=1`, {
              method: "POST",
              headers: { "Content-Type": "application/json", ...csrfHeaders() },
              credentials: "include",
              body: JSON.stringify({
                codigo: c.codigo,
                // El titular que más veces aparece con ese código. Sin ninguno
                // queda marcado para completar: inventarle un dueño al papel
                // sería peor que dejarlo vacío.
                titularNombre: c.titularSugerido?.trim() || "Sin registrar",
                tipo: c.tipo,
              }),
            });
            if (!r.ok) {
              res.errores.push(`${c.codigo}: ${await motivo(r, "crear el contrato")}`);
              continue;
            }
            const j = (await r.json()) as {
              vinculado?: { madera: number; produccion: number; lotes: number } | null;
            };
            res.creados += 1;
            res.madera += j.vinculado?.madera ?? 0;
            res.produccion += j.vinculado?.produccion ?? 0;
            res.lotes += j.vinculado?.lotes ?? 0;
          } catch (e) {
            res.errores.push(`${c.codigo}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        if (res.errores.length > 0) setError(res.errores.join(" · "));
      } finally {
        setSembrando(false);
        // La recarga NO se espera: el aviso de «se creó» tiene que salir al
        // terminar el alta, no cuando vuelva el GET. Si la red se demora, el
        // operador se queda mirando una pantalla que no dice nada y vuelve a
        // tocar el botón. `cargar` nunca rechaza: se traga su propio error.
        void cargar({ silenciosa: true });
      }
      return res;
    },
    [cargar],
  );

  return { contratos, balances, candidatos, cargando, error, sembrando, recargar: cargar, sembrar };
}

/**
 * El balance de UN contrato.
 *
 * Misma guarda: al saltar de un permiso a otro, la respuesta del primero puede
 * llegar después de la del segundo y pintar el balance equivocado bajo el
 * título correcto — que es la peor forma de mentir de una pantalla de plata.
 */
export function useBalanceContrato(contratoId: string | null) {
  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [balance, setBalance] = useState<BalanceContrato | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cargasRef = useRef(0);

  const cargar = useCallback(async () => {
    if (!contratoId) {
      setContrato(null);
      setBalance(null);
      return;
    }
    const esta = ++cargasRef.current;
    setCargando(true);
    setError(null);
    try {
      const r = await fetch(`${BASE}/${encodeURIComponent(contratoId)}?balance=1`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!r.ok) throw new Error(await motivo(r, "cargar el balance"));
      const j = (await r.json()) as { contrato?: Contrato; balance?: BalanceContrato };
      if (esta !== cargasRef.current) return;
      setContrato(j.contrato ?? null);
      setBalance(j.balance ?? null);
    } catch (e) {
      if (esta === cargasRef.current) {
        setError(e instanceof Error ? e.message : String(e));
        setBalance(null);
      }
    } finally {
      if (esta === cargasRef.current) setCargando(false);
    }
  }, [contratoId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return {
    contrato,
    balance,
    /** Egresos, por recuperar, costo por m³ y rendimiento — del módulo puro. */
    resumen: balance ? resumirBalance(balance) : null,
    cargando,
    error,
    recargar: cargar,
  };
}
