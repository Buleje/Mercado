"use client";

/**
 * Traer del padrón oficial lo que ya está escrito en el documento.
 *
 * Se dispara SOLO cuando el número está completo (8 dígitos o 11), sin botón:
 * en el mostrador nadie piensa «ahora voy a consultar RENIEC», escribe el
 * número que le dictaron y espera que el sistema sepa.
 *
 * Cuidados que hacen la diferencia entre útil y molesto:
 *  · No consulta a medio tipear — se pagan las consultas y cada tecla sería una.
 *  · Recuerda lo ya consultado en la sesión: volver de 8 a 7 dígitos y de nuevo
 *    a 8 no vuelve a salir a la red.
 *  · Las respuestas viejas se descartan: si alguien corrige el número, la
 *    respuesta de la consulta anterior no puede pisar a la nueva.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import { normalizarNumero, tipoDeDocumento, type ResultadoDocumento } from "@/lib/documento/tipos";

/** Cuánto se espera después de la última tecla antes de salir a consultar. */
const ESPERA_MS = 450;

export type EstadoLookup =
  | { fase: "quieto" }
  | { fase: "consultando"; tipo: "DNI" | "RUC" }
  | { fase: "listo"; resultado: ResultadoDocumento };

export function useLookupDocumento(
  numero: string,
  /** Se llama SÓLO cuando el padrón encontró algo. */
  onEncontrado: (r: Extract<ResultadoDocumento, { encontrado: true }>) => void,
  opciones?: { activo?: boolean },
): { estado: EstadoLookup; reintentar: () => void; limpiar: () => void } {
  const [estado, setEstado] = useState<EstadoLookup>({ fase: "quieto" });
  const cache = useRef(new Map<string, ResultadoDocumento>());
  /** Sube en cada consulta: descarta las respuestas que llegan tarde. */
  const corrida = useRef(0);
  /** En un ref para no re-disparar el efecto cuando el padre re-renderiza. */
  const alEncontrar = useRef(onEncontrado);
  alEncontrar.current = onEncontrado;

  const activo = opciones?.activo ?? true;
  const limpio = normalizarNumero(numero);
  const tipo = tipoDeDocumento(limpio);

  const consultar = useCallback(async (num: string, forzar: boolean) => {
    const t = tipoDeDocumento(num);
    if (!t) return;

    if (!forzar) {
      const guardado = cache.current.get(num);
      if (guardado) {
        setEstado({ fase: "listo", resultado: guardado });
        if (guardado.encontrado) alEncontrar.current(guardado);
        return;
      }
    }

    const mia = ++corrida.current;
    setEstado({ fase: "consultando", tipo: t });
    try {
      const res = await fetch(`/api/documento/lookup?numero=${encodeURIComponent(num)}`, { credentials: "include" });
      const data = (await res.json()) as ResultadoDocumento;
      if (mia !== corrida.current) return; // llegó tarde: ya se está consultando otro
      cache.current.set(num, data);
      setEstado({ fase: "listo", resultado: data });
      if (data.encontrado) alEncontrar.current(data);
    } catch (e) {
      if (mia !== corrida.current) return;
      logger.warn("[documento] no se pudo consultar el padrón", { error: String(e) });
      setEstado({
        fase: "listo",
        resultado: { encontrado: false, numero: num, motivo: "No se pudo consultar ahora. Cargá los datos a mano." },
      });
    }
  }, []);

  useEffect(() => {
    if (!activo || !tipo) {
      setEstado({ fase: "quieto" });
      return;
    }
    const t = setTimeout(() => void consultar(limpio, false), ESPERA_MS);
    return () => clearTimeout(t);
  }, [limpio, tipo, activo, consultar]);

  return {
    estado,
    /* Reintentar salta el caché: el padrón pudo haber estado caído. */
    reintentar: () => void consultar(limpio, true),
    limpiar: () => setEstado({ fase: "quieto" }),
  };
}
