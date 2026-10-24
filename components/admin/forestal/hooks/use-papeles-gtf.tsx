"use client";

/**
 * usePapelesGtf — los papeles de una GTF del Libro TH, en el visor de la vista:
 *   · guía completa (con `gtfDatos`) → la hoja SERFOR y su lista de trozas;
 *   · guía anotada a mano → la hoja de casilleros de siempre, con la carátula
 *     del libro (casilleros 6 y 7 del titular);
 *   · «Imprimir resumen interno» (R1-R4, 08-10) → el mismo visor.
 * Salió de `LothGtfView` (08-10, la vista pasaba de 300 líneas) sin cambiar lo
 * que abre ni cómo.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { documentoGtfLoth, type LothGtfCaratula, type LothGtfDoc } from "@/lib/forestal/loth-gtf-oficial";
import { esc } from "@/lib/forestal/ctp-documento-print";
import { leerGtfDatos } from "@/lib/forestal/ctp-gtf-datos";
import { piezasDeItems } from "@/lib/forestal/loth-guia-despacho";
import { papelesGuiaLoth } from "@/lib/forestal/loth-guia-print";
import type { HojaResumenInterno } from "@/lib/forestal/gtf-resumen-interno-print";
import CtpDocumentoVisor, { type DocumentoImprimible } from "../CtpDocumentoVisor";
import { archivoDeGuiaLoth } from "../LothGuiaRegistrada";
import type { Gtf } from "../gtf-tabla-columnas";
import { useResumenInternoGtf } from "./use-resumen-interno-gtf";

export function usePapelesGtf(): { imprimir: (g: Gtf) => void; resumen: (g: Gtf) => void; visor: ReactNode } {
  /** Los papeles de una guía, abiertos en el visor. */
  const [hojas, setHojas] = useState<{ g: Gtf; docs: DocumentoImprimible[]; activo: number } | null>(null);
  /** Identidad del titular para la hoja oficial (casilleros 6 y 7). */
  const [caratula, setCaratula] = useState<LothGtfCaratula | null>(null);

  // La carátula del libro es la identidad legal que va en la hoja: sin ella los
  // casilleros del titular salen vacíos y el papel no sirve en un control.
  useEffect(() => {
    fetch("/api/admin/forestal/loth/caratula", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setCaratula(j?.active ?? null))
      .catch((err) => console.warn("[loth-gtf] no se pudo leer la carátula", err));
  }, []);

  const abrirHoja = useCallback((g: Gtf, hoja: HojaResumenInterno) => setHojas({ g, docs: [hoja], activo: 0 }), []);
  const { abrir: abrirResumen } = useResumenInternoGtf(abrirHoja);

  /** Imprime: la guía completa va al visor con su lista; la anotada a mano, a la hoja de siempre. */
  const imprimir = useCallback(
    (g: Gtf) => {
      if (!g.gtfDatos) {
        printGtfOficial(g, caratula);
        return;
      }
      const papeles = papelesGuiaLoth({
        gtfNumber: g.gtfNumber,
        gtfDate: (g.gtfDate ?? "").slice(0, 10),
        titular: g.titularName ?? "",
        datos: leerGtfDatos(g.gtfDatos),
        piezas: piezasDeItems(g.items),
        anulada: g.status === "anulada" ? g.annulledReason ?? "Anulada" : null,
      });
      setHojas({ g, docs: [papeles.gtf, papeles.lista], activo: 0 });
    },
    [caratula],
  );
  const resumen = useCallback((g: Gtf) => void abrirResumen(g), [abrirResumen]);

  const visor = hojas ? (
    <CtpDocumentoVisor
      documentos={hojas.docs}
      activo={hojas.activo}
      onActivo={(i) => setHojas((h) => (h ? { ...h, activo: i } : h))}
      onClose={() => setHojas(null)}
      onArchivar={(doc) =>
        archivoDeGuiaLoth(
          { gtfNumber: hojas.g.gtfNumber, titular: hojas.g.titularName ?? "", datos: leerGtfDatos(hojas.g.gtfDatos) },
          doc,
        )
      }
    />
  ) : null;

  return { imprimir, resumen, visor };
}

/**
 * Imprime la guía en la hoja de casilleros SERFOR — la MISMA que usa el Libro
 * CTP. Antes cada libro tenía su papel: el del título habilitante, que es el que
 * viaja con la madera desde el bosque, era el peor de los dos.
 */
function printGtfOficial(g: Gtf, caratula: LothGtfCaratula | null) {
  const { cuerpo, css, titulo } = documentoGtfLoth(g as unknown as LothGtfDoc, caratula);
  const w = window.open("", "_blank", "width=920,height=1000");
  if (!w) return;
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${css}</style></head><body>${cuerpo}</body></html>`,
  );
  w.document.close();
}
