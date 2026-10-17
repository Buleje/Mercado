"use client";

/**
 * ¿El N.º de comprobante de la canasta ya está en otra compra? (C60). Pregunta
 * medio segundo después de dejar de escribir, una vez por número; si falla la
 * lectura no dice nada (el aviso ayuda, no frena).
 */
import { useEffect, useRef, useState } from "react";
import { buscarCompraConNumero, type CompraYaCargada } from "@/lib/compras/compra-con-numero";
import { logger } from "@/lib/logger";

const ESPERA_MS = 500;

export function useFacturaRepetida(numero: string, activo: boolean): CompraYaCargada | null {
  const [encontrada, setEncontrada] = useState<{ numero: string; compra: CompraYaCargada | null } | null>(null);
  const cache = useRef(new Map<string, CompraYaCargada | null>());
  const n = numero.trim().toUpperCase();
  const pregunta = activo && n.length >= 3;

  useEffect(() => {
    if (!pregunta) return;
    if (cache.current.has(n)) {
      setEncontrada({ numero: n, compra: cache.current.get(n) ?? null });
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      buscarCompraConNumero(n, ctrl.signal)
        .then((compra) => {
          cache.current.set(n, compra);
          setEncontrada({ numero: n, compra });
        })
        .catch((err: unknown) => {
          if (!ctrl.signal.aborted) logger.warn("[compra] ¿comprobante repetido? lectura failed", { error: String(err) });
        });
    }, ESPERA_MS);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [n, pregunta]);

  return pregunta && encontrada?.numero === n ? encontrada.compra : null;
}
