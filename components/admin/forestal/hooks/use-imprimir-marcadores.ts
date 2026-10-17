"use client";
/**
 * «Marcador A4 · cámara» en Imprimir etiquetas (ADR-480): asigna un marcador
 * a cada troza en el servidor y abre una hoja A4 por troza. La ventana se
 * abre en el MISMO clic (después del `await` el navegador la bloquea).
 */
import { useState } from "react";
import { toast } from "sonner";
import { imprimirMarcadoresDeTrozas } from "@/lib/camaras/imprimir-marcadores";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";

export function useImprimirMarcadores() {
  const [imprimiendo, setImprimiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imprimir = async (trozas: readonly TrozaConsumible[]): Promise<number> => {
    setError(null);
    const ventana = window.open("", "_blank", "width=980,height=760");
    if (!ventana) {
      setError("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio.");
      return 0;
    }
    ventana.document.write('<!doctype html><meta charset="utf-8"><title>Preparando marcadores…</title><p style="font:16px system-ui;padding:24px">Preparando marcadores…</p>');
    setImprimiendo(true);
    try {
      const r = await imprimirMarcadoresDeTrozas(trozas, { origin: window.location.origin, ventana });
      if (r.impresas === 0) ventana.close();
      if (r.rechazados.length)
        setError(`${r.rechazados.length} sin marcador: ${r.rechazados.map((x) => x.motivo).slice(0, 3).join(" · ")}`);
      if (r.impresas) toast.success(`${r.impresas} ${r.impresas === 1 ? "marcador listo" : "marcadores listos"}`, { description: "Se abrió en una pestaña nueva" });
      return r.impresas;
    } catch (e) {
      try {
        ventana.close();
      } catch {
        /* ya cerrada */
      }
      setError(e instanceof Error ? e.message : "No se pudieron imprimir los marcadores.");
      return 0;
    } finally {
      setImprimiendo(false);
    }
  };

  return { imprimir, imprimiendo, error };
}
