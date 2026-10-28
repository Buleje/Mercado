"use client";

import { useCallback, useState } from "react";
import { abrirResumenesDelCubicador, sembrarBloques } from "@/lib/forestal/sembrar-reparto";
import type { BloqueParaDistribucion } from "@/lib/forestal/bloque-de-lote-consumido";

/**
 * Lleva un lote YA consumido a la Distribución de rolliza (ADR-521): pide al
 * servidor el bloque que adopta su corrida abierta, lo siembra en la hoja de
 * rolliza y abre los Resúmenes del cubicador. Ahí se reparte lo aserrado y el
 * Recorrido del permiso declara la corrida.
 *
 * Si el lote ya estaba en la hoja no se duplica (`sembrarBloques` lo da por
 * repetido) y se abre igual: la misma madera dos veces sería un error en la
 * hoja que se firma.
 */
type Respuesta = Extract<BloqueParaDistribucion, { ok: true }>;

export function useLlevarLoteADistribucion(): {
  llevar: (loteId: string) => Promise<void>;
  llevando: boolean;
  error: string | null;
} {
  const [llevando, setLlevando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const llevar = useCallback(async (loteId: string) => {
    setLlevando(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/admin/forestal/lotes-aserrio/bloque-para-distribucion?loteId=${encodeURIComponent(loteId)}`,
        { credentials: "include" },
      );
      const json = (await r.json().catch((err: unknown) => ({ message: String(err) }))) as
        | Partial<Respuesta>
        | { message?: string };
      if (!r.ok || !("bloque" in json) || !json.bloque) {
        const msg = "message" in json && json.message ? json.message : null;
        setError(msg ?? `No se pudo llevar el lote a la Distribución (HTTP ${r.status}).`);
        return;
      }
      const siembra = sembrarBloques([json.bloque], "lote-consumido");
      if (siembra.sinTenant) {
        setError("No se detecta la operación activa: recarga el panel y vuelve a intentar. No se llevó nada.");
        return;
      }
      /* El bloque del lote ya estaba en la hoja, quizá de ANTES de consumirlo
         (sin su corrida): ese bloque no la adopta y el plan la ve como ajena.
         Se dice en vez de abrir como si nada (revisión 27-10). */
      if (siembra.sembrados === 0 && siembra.repetidos > 0) {
        setError(
          "Este lote ya estaba en la Distribución. Si lo pusiste antes de consumirlo, quítalo de la hoja y vuelve a llevarlo para que tome su corrida.",
        );
        return;
      }
      abrirResumenesDelCubicador();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sin conexión: vuelve a intentarlo.");
    } finally {
      setLlevando(false);
    }
  }, []);

  return { llevar, llevando, error };
}
