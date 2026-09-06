"use client";

/**
 * AvisoArchivo — lo que se ve cuando el archivo no se pudo traer.
 *
 * Reemplaza a los tres carteles distintos que tenía cada visor (y al peor de
 * los casos: el cuerpo del error dibujado como si fuera el documento). Dice qué
 * pasó en criollo, y cuando el servidor pidió esperar muestra la cuenta regresiva
 * y reintenta solo al llegar a cero — el usuario no tiene que adivinar cuándo
 * volver a abrirlo.
 */

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Clock, Download, RefreshCw } from "@buleje/design-system/icons";
import { comoErrorArchivo } from "@/lib/documentos/archivo-remoto";

export default function AvisoArchivo({
  error, titulo, sugerencia, onReintentar, urlDescarga,
}: {
  error: unknown;
  /** Qué no se pudo mostrar, ej. "No se pudo mostrar la planilla". */
  titulo: string;
  /** Salida alternativa, ej. "Descargala para abrirla en Excel". */
  sugerencia?: string;
  onReintentar: () => void;
  /** Si se pasa, se ofrece bajar el archivo mientras tanto. */
  urlDescarga?: string;
}) {
  const err = comoErrorArchivo(error);
  const [restan, setRestan] = useState(err.espera);
  // El callback vive en un ref: si entrara como dependencia del efecto, una
  // función inline del padre reiniciaría la cuenta regresiva en cada render.
  const reintentar = useRef(onReintentar);
  reintentar.current = onReintentar;

  // Cuenta regresiva del límite: al llegar a cero se reintenta solo. El efecto
  // se reinicia con cada error nuevo (la clave es el mensaje + la espera).
  useEffect(() => {
    setRestan(err.espera);
    if (err.espera <= 0) return;
    const t = setInterval(() => {
      setRestan((s) => {
        if (s <= 1) {
          clearInterval(t);
          reintentar.current();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [err.espera, err.message]);

  const esLimite = err.motivo === "limite";
  const Icono = esLimite ? Clock : AlertCircle;
  const color = esLimite
    ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
    : "text-[var(--data-error-600)] dark:text-[var(--data-error-500)]";

  return (
    <div className="flex flex-col items-center gap-2 px-6 py-10 text-center">
      <Icono className={`h-8 w-8 ${color}`} aria-hidden />
      <p className="text-sm font-bold text-[var(--text-primary)]">{titulo}</p>
      <p className="max-w-md text-sm text-[var(--text-secondary)]">{err.message}</p>

      {esLimite && restan > 0 && (
        <p className="text-sm tabular-nums text-[var(--text-tertiary)]">
          Reintento automático en {restan}s
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => { setRestan(0); onReintentar(); }}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
        >
          <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar ahora
        </button>
        {urlDescarga && (
          <a
            href={`${urlDescarga}${urlDescarga.includes("?") ? "&" : "?"}download=1`}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <Download className="h-4 w-4" aria-hidden /> Descargar
          </a>
        )}
      </div>

      {sugerencia && <p className="max-w-md text-xs text-[var(--text-tertiary)]">{sugerencia}</p>}
    </div>
  );
}
