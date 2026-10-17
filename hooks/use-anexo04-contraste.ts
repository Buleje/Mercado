"use client";

/**
 * use-anexo04-contraste — contra qué se coteja el anexo.
 *
 * Si se emite desde una línea del Libro, manda esa guía. Si se emite desde el
 * cubicador eligiendo una cubicación guardada, la referencia es la CORRIDA de
 * producción que la originó: el anexo no puede detallar más de lo que esa
 * corrida produjo, igual que no puede amparar más de lo que dice una guía.
 */
import { useCallback, useState } from "react";
import type { DeclaradoEnLibro } from "@/lib/forestal/anexo04-validacion";

export function useAnexo04Contraste(declaradoDeLaGuia?: DeclaradoEnLibro | null): {
  contraste: DeclaradoEnLibro | null;
  /** Trae la corrida de la cubicación elegida (no hace nada si vino del Libro). */
  usarCorrida: (ctpEntryId?: string) => Promise<void>;
} {
  const [corrida, setCorrida] = useState<DeclaradoEnLibro | null>(null);

  const usarCorrida = useCallback(async (ctpEntryId?: string) => {
    if (!ctpEntryId || declaradoDeLaGuia) { setCorrida(null); return; }
    try {
      const r = await fetch(`/api/admin/forestal/ctp?entryId=${encodeURIComponent(ctpEntryId)}`, {
        credentials: "include", cache: "no-store",
      });
      if (!r.ok) { setCorrida(null); return; }
      const j = (await r.json()) as { entry?: { quantity?: string | null; unit?: string | null; pieces?: number | null } };
      setCorrida(j.entry
        ? { cantidad: Number(j.entry.quantity ?? 0), unidad: j.entry.unit ?? null, piezas: j.entry.pieces, fuente: "corrida" }
        : null);
    } catch {
      // Sin la corrida el anexo se emite igual: es un cotejo, no un requisito.
      setCorrida(null);
    }
  }, [declaradoDeLaGuia]);

  return { contraste: declaradoDeLaGuia ?? corrida, usarCorrida };
}
