"use client";

/**
 * use-ctp-respaldos — datos y llamadas de la pestaña «Respaldos» (ADR-530).
 * La lista, guardar uno a mano, comparar con el libro de hoy y recuperar lo
 * borrado. Los errores salen en palabras del operador, nunca un código pelado.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp, pedirJsonCtp } from "@/lib/forestal/ctp-fetch";
import type {
  ComparacionRespaldo,
  RecuperarRespaldoPedido,
  RespaldoCreado,
  RespaldosListado,
  ResultadoRecuperar,
} from "@/lib/forestal/ctp-respaldo-tipos";

const API = "/api/admin/forestal/ctp/respaldos";

export const urlDescarga = (id: string) => `${API}/${encodeURIComponent(id)}/descargar`;

async function cuerpoDe(r: Response): Promise<{ error?: string; message?: string; code?: string } | null> {
  try {
    return await r.json();
  } catch {
    return null;
  }
}

function textoDeError(cuerpo: { error?: string; message?: string } | null, estado: number): string {
  const t = cuerpo?.message ?? cuerpo?.error;
  if (typeof t === "string" && t.trim()) return t;
  if (estado === 401 || estado === 403) return "Solo el dueño o un administrador puede hacer esto.";
  return `El servidor respondió ${estado}. Vuelve a intentarlo en un momento.`;
}

export function useCtpRespaldos() {
  const [listado, setListado] = useState<RespaldosListado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [errorGuardar, setErrorGuardar] = useState<string | null>(null);
  /* La carga más nueva gana: una respuesta vieja no pisa a la reciente. */
  const ultima = useRef(0);

  const recargar = useCallback(async () => {
    const n = ++ultima.current;
    try {
      const datos = await pedirJsonCtp<RespaldosListado>(API, "los respaldos");
      if (n === ultima.current) {
        setListado(datos);
        setError(null);
      }
    } catch (err) {
      if (n === ultima.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (n === ultima.current) setCargando(false);
    }
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const guardar = useCallback(
    async (nota: string): Promise<boolean> => {
      setGuardando(true);
      setErrorGuardar(null);
      try {
        const r = await fetch(API, {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify(nota.trim() ? { nota: nota.trim().slice(0, 200) } : {}),
        });
        if (!r.ok) {
          setErrorGuardar(textoDeError(await cuerpoDe(r), r.status));
          return false;
        }
        (await r.json()) as RespaldoCreado;
        await recargar();
        return true;
      } catch {
        setErrorGuardar("Sin conexión: no se guardó el respaldo. Revisa tu internet e inténtalo de nuevo.");
        return false;
      } finally {
        setGuardando(false);
      }
    },
    [recargar],
  );

  return { listado, cargando, error, guardando, errorGuardar, guardar, recargar };
}

/** Comparar un respaldo con el libro de hoy y recuperar lo marcado. */
export function useCompararRespaldo(id: string) {
  const [comparacion, setComparacion] = useState<ComparacionRespaldo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recuperando, setRecuperando] = useState(false);
  const [errorRecuperar, setErrorRecuperar] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoRecuperar | null>(null);
  const ultima = useRef(0);

  const comparar = useCallback(async () => {
    const n = ++ultima.current;
    setCargando(true);
    try {
      const datos = await pedirJsonCtp<ComparacionRespaldo>(
        `${API}/${encodeURIComponent(id)}/comparar`,
        "la comparación con el respaldo",
      );
      if (n === ultima.current) {
        setComparacion(datos);
        setError(null);
      }
    } catch (err) {
      if (n === ultima.current) setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (n === ultima.current) setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    void comparar();
  }, [comparar]);

  const recuperar = useCallback(
    async (seleccion: RecuperarRespaldoPedido["seleccion"]) => {
      if (!comparacion) return;
      setRecuperando(true);
      setErrorRecuperar(null);
      setAviso(null);
      try {
        const pedido: RecuperarRespaldoPedido = { seleccion, esperado: comparacion.huellaHoy };
        const r = await fetch(`${API}/${encodeURIComponent(id)}/recuperar`, {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          credentials: "include",
          body: JSON.stringify(pedido),
        });
        const cuerpo = await cuerpoDe(r);
        if (r.status === 409 && cuerpo?.code === "LIBRO_CAMBIO") {
          setAviso("El libro cambió mientras mirabas. Lo comparé de nuevo: revisa y vuelve a marcar.");
          await comparar();
          return;
        }
        if (!r.ok) {
          setErrorRecuperar(textoDeError(cuerpo, r.status));
          return;
        }
        invalidarCtp();
        setResultado(cuerpo as unknown as ResultadoRecuperar);
      } catch {
        setErrorRecuperar("Sin conexión: no se recuperó nada. Revisa tu internet e inténtalo de nuevo.");
      } finally {
        setRecuperando(false);
      }
    },
    [comparacion, id, comparar],
  );

  return { comparacion, cargando, error, recuperando, errorRecuperar, aviso, resultado, recuperar };
}
