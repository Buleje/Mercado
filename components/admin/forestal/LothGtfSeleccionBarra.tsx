"use client";

/**
 * La barra de las guías tildadas en la vista GTF del Libro TH: cuenta lo
 * elegido (guías, m³ vigentes, piezas) y ofrece los formatos de Trámites que
 * aceptan guías (`GuiasAFormatoBarra`, la misma que usa «Guías emitidas» del
 * CTP). Los ids del Libro TH viajan SIN prefijo: así eran las URLs desde el
 * primer día (`tramite-guias-url`).
 */

import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { CifraSeleccion } from "./ctp-barra-seleccion";
import type { Gtf } from "./gtf-tabla-columnas";
import GuiasAFormatoBarra from "./GuiasAFormatoBarra";

export default function LothGtfSeleccionBarra({ elegidas, onLimpiar }: { elegidas: readonly Gtf[]; onLimpiar: () => void }) {
  if (elegidas.length === 0) return null;

  const anuladas = elegidas.filter((g) => g.status === "anulada").length;
  /* Vista previa: el volumen que declara el libro lo da el servidor. */
  const volumen = elegidas.filter((g) => g.status !== "anulada").reduce((a, g) => a + Number(g.volumenTotalM3 ?? 0), 0);
  const piezas = elegidas.reduce((a, g) => a + (g.piezasTotal ?? g.items?.length ?? 0), 0);
  const cifras: CifraSeleccion[] = [
    { label: elegidas.length === 1 ? "Guía" : "Guías", valor: anuladas > 0 ? `${elegidas.length} (${anuladas} anulada${anuladas === 1 ? "" : "s"})` : String(elegidas.length), fuerte: true },
    { label: "Volumen", valor: `${fmtM3(volumen)} m³` },
    { label: "Piezas", valor: String(piezas) },
  ];

  return <GuiasAFormatoBarra elegidas={elegidas} refs={elegidas.map((g) => g.id)} cifras={cifras} onLimpiar={onLimpiar} />;
}
