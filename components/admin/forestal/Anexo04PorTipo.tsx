"use client";

/**
 * Anexo04PorTipo — «Un anexo por tipo» (Brandon, 2026-10-03: «hoy, para sacar
 * Comercial y Larga angosta por separado, filtras y descargas dos veces; con
 * esto un botón saca un PDF por tipo»). También por especie.
 *
 * Parte lo que está en pantalla —con el filtro y el formato elegidos— en un
 * anexo por tipo (o especie) y los baja en UN PDF: cada anexo empieza en hoja
 * nueva con su encabezado y su (3) VOLUMEN TOTAL propio. Un PDF y no varios:
 * el navegador bloquea la segunda descarga automática.
 *
 * NO se registra en «Emitidos», a propósito: la bandeja guarda por N° + GTF
 * (upsert) y los anexos de un mismo PDF llevan el MISMO N° y la misma GTF —
 * registrar uno por tipo dejaría sólo el último, pisando a los demás sin
 * aviso. Inventarles un N° («12-A») tampoco: el anexo es una declaración
 * jurada y el N° lo escribe quien firma. Sale para revisar; para emitir, se
 * filtra cada tipo y se descarga uno por uno, cada uno con su N°.
 */
import { useMemo, useState } from "react";
import { Layers, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { DatosAnexo04 } from "@/lib/forestal/anexo04-serfor";
import { exportarAnexosPDF, type TraseraParaPdf } from "@/lib/forestal/anexo04-pdf";
import { nombrePdfPartido, partirAnexo, type CriterioParte } from "@/lib/forestal/anexo04-partir";

const BTN = "inline-flex h-11 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-60";

export default function Anexo04PorTipo({
  filas, especieGlobal, datos, trasera, totalManual, conCandado, onAviso,
}: {
  /** Lo que imprime la hoja: ya filtrado y en el formato elegido. */
  filas: PiezaCubicada[];
  especieGlobal?: string;
  datos: DatosAnexo04;
  /** La trasera del papel: va una sola vez, al final (es UN camión). */
  trasera?: TraseraParaPdf | null;
  /** (3) declarado a mano: es del anexo entero, cada parte sale con su total calculado. */
  totalManual: number | null;
  /** El candado del cuadre, si quien abre el anexo lo pasa. */
  conCandado?: (accion: () => void) => () => void;
  onAviso?: (msg: string, tono: "success" | "error") => void;
}) {
  const porTipo = useMemo(() => partirAnexo(filas, "tipo", especieGlobal), [filas, especieGlobal]);
  const porEspecie = useMemo(() => partirAnexo(filas, "especie", especieGlobal), [filas, especieGlobal]);
  const [generando, setGenerando] = useState<CriterioParte | null>(null);
  if (porTipo.length < 2 && porEspecie.length < 2) return null;

  const bajar = (criterio: CriterioParte) => {
    const partes = criterio === "tipo" ? porTipo : porEspecie;
    setGenerando(criterio);
    exportarAnexosPDF(
      partes.map((p, i) => ({
        piezas: p.piezas, datos, especieGlobal,
        trasera: i === partes.length - 1 ? trasera ?? null : null,
      })),
      nombrePdfPartido(criterio, datos.gtf),
    )
      .then(() => onAviso?.(
        `${partes.length} anexos en un PDF (${partes.map((p) => p.rotulo).join(", ")}). Sale para revisar: no queda en «Emitidos».` +
          (totalManual != null ? " Cada uno lleva su volumen calculado, no el declarado a mano." : ""),
        "success",
      ))
      .catch(() => onAviso?.("No se pudo generar el PDF por partes.", "error"))
      .finally(() => setGenerando(null));
  };
  const boton = (criterio: CriterioParte, n: number, label: string) => (
    <button
      type="button"
      onClick={(conCandado ?? ((a: () => void) => a))(() => bajar(criterio))}
      disabled={generando != null}
      title={`Un anexo por ${criterio} en un solo PDF: ${(criterio === "tipo" ? porTipo : porEspecie).map((p) => `${p.rotulo} ${p.totalPiezas} pzas`).join(" · ")}`}
      className={BTN}
    >
      {generando === criterio ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Layers className="h-4 w-4" aria-hidden />}
      {label}
      <span className="rounded-full bg-[var(--surface-sunken)] px-1.5 font-mono text-xs tabular-nums">{n}</span>
    </button>
  );

  return (
    <div role="group" aria-label="Un anexo por tipo o especie" className="mr-auto flex flex-wrap items-center gap-1.5">
      {porTipo.length > 1 && boton("tipo", porTipo.length, "Un anexo por tipo")}
      {porEspecie.length > 1 && boton("especie", porEspecie.length, "Por especie")}
      <InfoTip
        title="Un anexo por tipo"
        what="Parte lo que ves en la hoja en un anexo por tipo (o por especie) y los baja juntos en un PDF. Cada anexo empieza en hoja nueva con su total."
        affects="Sale para revisar: no queda en «Emitidos», porque todos llevan el mismo N° y la misma GTF. Para emitir, filtra cada tipo y descárgalo con su N°."
        example="Comercial 120 pzas + Larga angosta 40 pzas → un PDF con dos anexos: el de comercial y el de larga angosta."
        side="top"
      />
    </div>
  );
}
