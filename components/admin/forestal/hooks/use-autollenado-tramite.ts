"use client";

import { useEffect, useState } from "react";
import type { CtpReportFicha } from "@/lib/forestal/ctp-print-shared";
import type { AutollenadoTramite } from "../TramiteFormulario";

/**
 * Autollenado de los Trámites: la Ficha CTP es el membrete y el Libro tiene el
 * resto (la serie y el correlativo de la última GTF emitida). Se carga una vez
 * al montar: son los datos que el operador no debería re-tipear.
 */
export function useAutollenadoTramite(): { auto: AutollenadoTramite; autoListo: boolean } {
  const [auto, setAuto] = useState<AutollenadoTramite>({ ficha: null });
  const [autoListo, setAutoListo] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      const [f, salida] = await Promise.all([
        fetch("/api/admin/forestal/ctp-ficha", { credentials: "include" })
          .then((r) => (r.ok ? r.json() : null))
          .catch((err) => {
            console.warn("[tramites] ficha no disponible", err);
            return null;
          }),
        fetch("/api/admin/forestal/ctp?section=despacho", { credentials: "include" })
          .then((r) => (r.ok ? r.json() : null))
          .catch((err) => {
            console.warn("[tramites] despachos no disponibles", err);
            return null;
          }),
      ]);
      if (!vivo) return;
      const ficha: CtpReportFicha | null = f?.ficha ?? f ?? null;

      // Última GTF emitida: la serie es lo que va antes del último guion y el
      // correlativo lo que sigue. Si el CTP la escribe distinto, el operador lo
      // corrige en el formulario — es una sugerencia, no un dato del libro.
      const conGtf = (salida?.entries ?? []).filter((e: { gtfNumber?: string | null }) => e.gtfNumber?.trim());
      const ultima: string = conGtf[0]?.gtfNumber ?? "";
      const corte = ultima.lastIndexOf("-");
      setAuto({
        ficha,
        serieGtf: corte > 0 ? ultima.slice(0, corte) : ultima || undefined,
        ultimoCorrelativo: corte > 0 ? ultima.slice(corte + 1) : undefined,
        despachosCount: conGtf.length || undefined,
      });
      setAutoListo(true);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  return { auto, autoListo };
}
