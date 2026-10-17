"use client";

/**
 * Busca en tu lista de clientes mientras escribes (F25): por nombre, razón
 * social, documento o celular. Desde 2 letras (o 3 dígitos), con 250 ms de
 * pausa; la respuesta vieja no pisa a la nueva.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import type { ClienteDeLista } from "./tipos";

async function pedir(q: string, signal?: AbortSignal): Promise<ClienteDeLista[]> {
  const res = await fetch(`/api/cotizaciones/clientes?q=${encodeURIComponent(q)}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { clientes?: ClienteDeLista[] };
  return Array.isArray(data.clientes) ? data.clientes : [];
}

export function useBuscarClientes(texto: string, activo = true) {
  const [resultados, setResultados] = useState<ClienteDeLista[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(false);
  const q = texto.trim();
  const listo = activo && q.length >= 2;

  useEffect(() => {
    if (!listo) {
      setResultados([]);
      setCargando(false);
      return;
    }
    const ctrl = new AbortController();
    setCargando(true);
    const t = setTimeout(() => {
      pedir(q, ctrl.signal)
        .then((r) => {
          setResultados(r);
          setError(false);
        })
        .catch((err) => {
          if (ctrl.signal.aborted) return;
          logger.warn("[cotizaciones] buscar clientes falló", { error: String(err) });
          setError(true);
          setResultados([]);
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setCargando(false);
        });
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, listo]);

  return { resultados, cargando, error, buscando: listo };
}

/** Para después del alta: trae al cliente recién guardado por su celular. */
export function useClientePorCelular() {
  const vivo = useRef(true);
  useEffect(() => () => { vivo.current = false; }, []);
  return useCallback(async (celular: string): Promise<ClienteDeLista | null> => {
    const digitos = celular.replace(/\D/g, "").slice(-9);
    if (digitos.length < 6) return null;
    try {
      const lista = await pedir(digitos);
      if (!vivo.current) return null;
      return lista.find((c) => c.phone.replace(/\D/g, "").endsWith(digitos)) ?? null;
    } catch (err) {
      logger.warn("[cotizaciones] traer cliente recién guardado falló", { error: String(err) });
      return null;
    }
  }, []);
}
