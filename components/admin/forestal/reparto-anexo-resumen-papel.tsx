"use client";

/**
 * BotonResumenPapel — «Resumen del papel (PDF)» de un permiso: arma el MISMO
 * Anexo 04 que abre «Anexo 04 de este permiso» (mismas piezas, misma especie
 * global, la unidad de la columna V que se eligió en el anexo) y baja el PDF
 * con lo que lleva cada hoja, el resumen general y el control de cuadre.
 */
import { useState } from "react";
import { FileText } from "@buleje/design-system/icons";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { useAnexo04Datos } from "@/hooks/use-anexo04-datos";
import { exportarResumenPapelPDF } from "@/lib/forestal/anexo04-resumen-papel-pdf";
import { fmtAnexo } from "@/lib/forestal/anexo04-serfor";

export default function BotonResumenPapel({ piezas, especie, etiqueta }: { piezas: PiezaCubicada[]; especie: string; etiqueta: string }) {
  const [datos] = useAnexo04Datos();
  const [estado, setEstado] = useState<{ tipo: "generando" | "ok" | "difiere" | "error"; texto: string } | null>(null);

  const bajar = () => {
    setEstado({ tipo: "generando", texto: "Generando…" });
    exportarResumenPapelPDF(piezas, datos, { especieGlobal: especie || undefined }, { subtitulo: `Permiso: ${etiqueta}` })
      .then((r) => setEstado(r.cuadra
        ? { tipo: "ok", texto: `Cuadra: ${fmtAnexo(r.totalImpresoM3)} m³ en ${r.hojas.length} hoja${r.hojas.length === 1 ? "" : "s"}` }
        : { tipo: "difiere", texto: "Hay diferencias: mira el control de cuadre del PDF" }))
      .catch(() => setEstado({ tipo: "error", texto: "No se pudo generar el PDF" }));
  };

  return (
    <>
      <button
        type="button"
        onClick={bajar}
        disabled={estado?.tipo === "generando" || piezas.length === 0}
        title="PDF con lo que lleva cada hoja del Anexo 04 de este permiso (tipo, especie, reg, piezas, m³, PT), el resumen general y el control de cuadre"
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-60"
      >
        <FileText className="h-3.5 w-3.5" aria-hidden /> Resumen del papel (PDF)
      </button>
      {estado && estado.tipo !== "generando" && (
        <span
          role="status"
          className={`text-xs font-semibold ${estado.tipo === "ok" ? "text-[var(--data-success)]" : "text-[var(--data-error)]"}`}
        >
          {estado.texto}
        </span>
      )}
    </>
  );
}
