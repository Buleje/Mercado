"use client";

/**
 * Las dos impresiones de etiquetas del Libro TH (sacadas de
 * `LothLibroOperaciones`, 08-10): «Etiquetas QR» de cualquier sección (Tala,
 * Trozado…) y «Imprimir etiquetas» de Trozado. Desde la unificación (QR5) las
 * dos salen con la misma etiqueta; cambia qué líneas entran.
 *
 * La ventana se abre YA, en el clic: después de un `await` el navegador la
 * bloquea como pop-up (gotcha de ADR-436). La base pública de los QR la espera
 * la impresión (`imprimirEtiquetasTrozasLoth`), nunca el host del navegador.
 */

import { useCallback, useState } from "react";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import type { PlanTablero } from "@/lib/forestal/loth-tablero-permiso";
import { printTrozaLabels } from "@/lib/forestal/loth-labels";
import { imprimirEtiquetasTrozasLoth } from "@/lib/forestal/loth-troza-etiquetas";

const ESPERA =
  '<!doctype html><meta charset="utf-8"><title>Generando etiquetas…</title><p style="font:16px system-ui;padding:24px">Generando etiquetas…</p>';

type Modo = "secciones" | "trozado";

export function useEtiquetasLibroLoth(opts: {
  tituloHabilitante: string | null;
  planNumber: string | null;
  /** Los permisos del libro: cada etiqueta lleva el de SU línea. */
  planes: readonly PlanTablero[];
  setError: (msg: string | null) => void;
}) {
  const { tituloHabilitante, planNumber, planes, setError } = opts;
  const [imprimiendo, setImprimiendo] = useState<Modo | null>(null);

  const imprimir = useCallback(
    (lineas: readonly LothEntryDTO[], modo: Modo) => {
      const ventana = window.open("", "_blank", "width=980,height=760");
      if (!ventana) {
        setError("El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio.");
        return;
      }
      ventana.document.write(ESPERA);
      setImprimiendo(modo);
      setError(null);
      const permisoDeLinea = (e: LothEntryDTO) => {
        const p = e.planId ? planes.find((x) => x.id === e.planId) : undefined;
        return p ? { tituloHabilitante: p.tituloHabilitante, planNumber: p.planNumber } : null;
      };
      const datos = { tituloHabilitante, planNumber, ventana, permisoDeLinea };
      (modo === "secciones" ? printTrozaLabels(lineas, datos) : imprimirEtiquetasTrozasLoth(lineas, datos))
        .then((n) => {
          if (n > 0) return;
          setError(
            modo === "secciones"
              ? "No hay códigos imprimibles en esta sección: las etiquetas salen de Tala y Trozado."
              : "Ninguna de estas líneas tiene código de troza o de árbol todavía.",
          );
          ventana.close();
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : String(err));
          try {
            ventana.close();
          } catch {
            /* ya cerrada */
          }
        })
        .finally(() => setImprimiendo(null));
    },
    [tituloHabilitante, planNumber, planes, setError],
  );

  return {
    /** «Etiquetas QR»: las líneas con código de cualquier sección. */
    imprimirEtiquetas: useCallback((lineas: readonly LothEntryDTO[]) => imprimir(lineas, "secciones"), [imprimir]),
    /** «Imprimir etiquetas» de Trozado. */
    imprimirEtiquetasTrozado: useCallback((lineas: readonly LothEntryDTO[]) => imprimir(lineas, "trozado"), [imprimir]),
    imprimiendoEtiquetas: imprimiendo === "secciones",
    imprimiendoTrozado: imprimiendo === "trozado",
  };
}
