"use client";

import { useCallback, useEffect, useState } from "react";
import { logger } from "@/lib/logger";
import type { PapelDelPanel } from "@/lib/papeles/vista-panel";

/** El tope que acepta la ruta (`FiltroPapelesSchema`): los 200 más nuevos. */
const LIMITE = 200;

export type ErrorPapeles = "sin_permiso" | "fallo";

/**
 * Los papeles que emitió el negocio (`GET /api/admin/papeles`, ADR-534), sin la
 * clave del QR. `papeles` es `null` mientras carga.
 */
export function usePapelesEmitidos() {
  const [papeles, setPapeles] = useState<PapelDelPanel[] | null>(null);
  const [error, setError] = useState<ErrorPapeles | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/admin/papeles?limite=${LIMITE}`, { credentials: "include", cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401 || r.status === 403) throw new ErrorDeRuta("sin_permiso");
        if (!r.ok) throw new ErrorDeRuta("fallo", `HTTP ${r.status}`);
        return (await r.json()) as { papeles?: unknown };
      })
      .then((j) => {
        if (!vivo) return;
        setPapeles(Array.isArray(j.papeles) ? (j.papeles as PapelDelPanel[]) : []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!vivo) return;
        const tipo = err instanceof ErrorDeRuta ? err.tipo : "fallo";
        if (tipo === "fallo") logger.warn("[papeles] no se pudo leer la lista", { error: String(err) });
        setError(tipo);
      });
    return () => {
      vivo = false;
    };
  }, [tick]);

  const recargar = useCallback(() => setTick((t) => t + 1), []);
  return { papeles, error, recargar };
}

class ErrorDeRuta extends Error {
  constructor(
    readonly tipo: ErrorPapeles,
    detalle?: string,
  ) {
    super(detalle ?? tipo);
  }
}
