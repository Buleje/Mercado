"use client";

/**
 * CtpEtiquetasFormatos — elegir en qué papel salen las etiquetas de trozas
 * (ADR-436): cuatro tarjetas con un dibujito a escala de la etiqueta, para que
 * «Rollo 50×30» y «Testa A6» se distingan de un vistazo y no por la medida.
 *
 * El último elegido se recuerda en este navegador: quien tiene la térmica la
 * usa siempre, y volver a elegirla en cada tanda es un clic de más.
 */

import { useEffect, useState } from "react";
import {
  FORMATOS_ETIQUETA,
  FORMATO_ETIQUETA_DEFAULT,
  esFormatoEtiqueta,
  type FormatoEtiqueta,
  type FormatoEtiquetaInfo,
} from "@/lib/forestal/ctp-troza-etiquetas";

const CLAVE_FORMATO = "ctp-etiquetas-formato";

/** El formato guardado en este navegador (el default si no hay o no se puede leer). */
export function useFormatoEtiquetaRecordado() {
  const [formato, setFormato] = useState<FormatoEtiqueta>(FORMATO_ETIQUETA_DEFAULT);
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(CLAVE_FORMATO);
      if (esFormatoEtiqueta(v)) setFormato(v);
    } catch {
      // Modo privado o almacenamiento bloqueado: se queda el default.
    }
  }, []);
  const elegir = (f: FormatoEtiqueta) => {
    setFormato(f);
    try {
      window.localStorage.setItem(CLAVE_FORMATO, f);
    } catch {
      // Sin almacenamiento: vale para esta tanda, no se recuerda.
    }
  };
  return [formato, elegir] as const;
}

/** El dibujito: la etiqueta a escala, con su QR, sus barras y el código. */
function Miniatura({ f }: { f: FormatoEtiquetaInfo }) {
  if (f.id === "a4-3x7") {
    return (
      <span aria-hidden className="grid h-12 w-9 grid-cols-3 gap-px rounded-sm border border-[var(--rule-strong)] bg-[var(--surface-raised)] p-0.5">
        {Array.from({ length: 21 }, (_, i) => (
          <span key={i} className="rounded-[1px] bg-[var(--text-tertiary)]/45" />
        ))}
      </span>
    );
  }
  /* Todas a la misma escala (0,42 px por mm) salvo el tope de alto: así el
     rollo chico se ve chico y la testa, grande. */
  const esc = Math.min(0.42, 48 / f.altoMm);
  const w = Math.round(f.anchoMm * esc);
  const h = Math.round(f.altoMm * esc);
  const qr = Math.round(f.qrMm * esc);
  const vertical = f.id === "testa-a6";
  return (
    <span
      aria-hidden
      style={{ width: w, height: h }}
      className={`flex gap-0.5 rounded-sm border border-[var(--rule-strong)] bg-[var(--surface-raised)] p-0.5 ${vertical ? "flex-col items-center" : "items-start"}`}
    >
      <span className={`flex min-w-0 flex-1 flex-col gap-px ${vertical ? "w-full items-center" : ""}`}>
        <span className={`rounded-[1px] bg-[var(--text-primary)] ${vertical ? "h-2.5 w-4/5" : "h-1 w-3/4"}`} />
        <span className="h-1 w-full bg-[repeating-linear-gradient(90deg,var(--text-primary)_0_1px,transparent_1px_2px)]" />
      </span>
      <span style={{ width: qr, height: qr }} className="shrink-0 rounded-[1px] border-2 border-[var(--text-primary)]" />
    </span>
  );
}

export default function CtpEtiquetasFormatos({
  valor,
  onCambio,
}: {
  valor: FormatoEtiqueta;
  onCambio: (f: FormatoEtiqueta) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-bold text-[var(--text-primary)]">Formato</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FORMATOS_ETIQUETA.map((f) => {
          const activo = valor === f.id;
          return (
            <label
              key={f.id}
              className={`relative flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-2.5 text-center transition-colors focus-within:ring-2 focus-within:ring-[var(--accent)]/40 ${
                activo
                  ? "border-[var(--accent)] bg-primary/10 dark:bg-[var(--accent)]/12"
                  : "border-[var(--rule-base)] hover:bg-[var(--surface-sunken)]"
              }`}
            >
              <input
                type="radio"
                name="formato-etiqueta"
                value={f.id}
                checked={activo}
                onChange={() => onCambio(f.id)}
                className="sr-only"
              />
              <span className="flex h-14 items-center justify-center">
                <Miniatura f={f} />
              </span>
              <span className="text-sm font-bold leading-tight text-[var(--text-primary)]">{f.nombre}</span>
              <span className="text-xs leading-snug text-[var(--text-secondary)]">{f.uso}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
