/**
 * ctp-trozas-individuales — el tipo, el estado en una palabra y el CSV de la
 * lista «una fila por pieza» (`CtpTrozasIndividuales`). Aparte para que el
 * componente quede en lo que dibuja.
 */

import { LABEL_BLOQUEO, motivoBloqueo } from "@/lib/forestal/consumo-trozas";

export interface TrozaIndividual {
  id: string;
  orden: number;
  codificacion: string | null;
  codigoPlanta: string | null;
  parcela: string | null;
  especieComun: string | null;
  especieCientifica: string | null;
  dimensiones: string | null;
  d1Cm: number | null;
  d2Cm: number | null;
  largoM: number | null;
  diametroCm: number | null;
  volumenM3: number | null;
  noRecepcionada?: boolean | null;
  descarte?: boolean | null;
  trozaOrigenId?: string | null;
  consumidaEnId?: string | null;
  retrozos?: number;
  /** Cuándo se imprimió su última etiqueta QR (ADR-436), si el listado lo trae. */
  etiquetadaEn?: string | null;
  ingreso: { id: string; gtfNumber: string; providerName: string; entryDate: string };
}

/** Qué se puede decir de la pieza en una palabra — y si se puede etiquetar
 *  (la MISMA regla que decide si se puede consumir, `motivoBloqueo`). */
export function estado(t: TrozaIndividual): { label: string; cls: string; libre: boolean } {
  const m = motivoBloqueo({
    id: t.id,
    woodEntryId: t.ingreso.id,
    codificacion: t.codificacion,
    especieComun: t.especieComun,
    volumenM3: t.volumenM3,
    consumidaEnId: t.consumidaEnId,
    noRecepcionada: t.noRecepcionada,
    descarte: t.descarte,
    trozaOrigenId: t.trozaOrigenId,
    retrozos: t.retrozos,
  });
  if (m === null) return { label: "En patio", cls: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]", libre: true };
  if (m === "ya_consumida") return { label: "Aserrada", cls: "text-[var(--text-tertiary)]", libre: false };
  return { label: LABEL_BLOQUEO[m], cls: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]", libre: false };
}

export function exportarTrozasCsv(filtradas: readonly TrozaIndividual[]): void {
  const cab = ["N°", "Codigo troza", "Codigo planta", "Parcela", "Especie", "Cientifico", "D1(cm)", "D2(cm)", "Largo(m)", "Diametro(cm)", "Volumen(m3)", "GTF", "Fecha", "Estado"];
  const filas = filtradas.map((t, i) => [
    i + 1, t.codificacion ?? "", t.codigoPlanta ?? "", t.parcela ?? "", t.especieComun ?? "", t.especieCientifica ?? "",
    t.d1Cm ?? "", t.d2Cm ?? "", t.largoM ?? "", t.diametroCm ?? "", t.volumenM3 ?? "",
    t.ingreso.gtfNumber, String(t.ingreso.entryDate).slice(0, 10), estado(t).label,
  ]);
  /* `;` y coma decimal: el mismo criterio que el resto del libro, que es lo
     que espera el Excel en es-PE. */
  const cel = (v: unknown) => { const s = String(v ?? ""); return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = "﻿" + [cab, ...filas].map((f) => f.map((v) => cel(typeof v === "number" ? String(v).replace(".", ",") : v)).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url; a.download = `trozas-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
