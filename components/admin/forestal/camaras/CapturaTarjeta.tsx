"use client";

/**
 * Una foto del historial: la imagen, cuándo y de qué cámara, lo que describió
 * la IA y sus pastillas (`ChipsDeCaptura`).
 *
 * En el celular va acostada —miniatura a la izquierda, datos a la derecha—:
 * parada, cada foto ocupaba media pantalla y veinte fotos eran diez pantallas
 * de scroll. Desde `sm` vuelve a ser tarjeta con la imagen arriba.
 */

import type { ReactNode } from "react";
import { Trash2 } from "@buleje/design-system/icons";
import { etiquetaDeCaptura, type Captura } from "@/lib/camaras/camaras";
import { formatDateTimeShort } from "@/lib/format";
import ChipsDeCaptura from "./ChipsDeCaptura";
import type { ChalecosPantalla } from "./camaras-ui";

interface Props {
  captura: Captura;
  nombreCamara: string;
  anteriorUrl?: string | null;
  guardando: boolean;
  confirmando: string | null;
  onBorrar: () => void;
  onConfirmar: (refId: string) => void;
  onAsignarChaleco: (numero: string) => void;
  chalecosVivos: ChalecosPantalla;
  /** «En vivo» de la cámara de esta foto: ¿qué pasa ahí ahora? */
  enVivo?: ReactNode;
}

export default function CapturaTarjeta({
  captura: c,
  nombreCamara,
  anteriorUrl,
  guardando,
  confirmando,
  onBorrar,
  onConfirmar,
  onAsignarChaleco,
  chalecosVivos,
  enVivo,
}: Props) {
  const cuando = formatDateTimeShort(c.at);
  return (
    <li
      data-testid="camara-captura"
      className="flex overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] sm:flex-col"
    >
      <a
        href={c.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-28 shrink-0 bg-[var(--surface-sunken)] sm:w-full"
        aria-label={`Abrir la foto de ${nombreCamara} del ${cuando}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen de storage propio, sin layout fijo */}
        <img
          src={c.url}
          alt=""
          className="h-full min-h-24 w-full object-cover sm:aspect-video sm:h-auto"
          loading="lazy"
        />
      </a>
      <div className="min-w-0 flex-1 space-y-1.5 p-2.5">
        <div className="flex items-start gap-1.5">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold text-[var(--text-primary)]">
              {nombreCamara}
            </span>
            <span className="block truncate text-xs text-[var(--text-tertiary)]">
              {cuando} · {etiquetaDeCaptura(c)}
            </span>
          </span>
          {enVivo}
          <button
            type="button"
            onClick={onBorrar}
            disabled={guardando}
            aria-label="Borrar esta foto del historial"
            title={`Borrar del historial la foto del ${cuando}`}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-ink)] disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        </div>
        {c.lectura?.descripcion && (
          <p
            className="line-clamp-2 text-xs leading-snug text-[var(--text-secondary)]"
            title={c.lectura.descripcion}
          >
            {c.lectura.descripcion}
          </p>
        )}
        <ChipsDeCaptura
          captura={c}
          anteriorUrl={anteriorUrl}
          confirmando={confirmando}
          onConfirmar={onConfirmar}
          onAsignarChaleco={onAsignarChaleco}
          chalecosVivos={chalecosVivos}
        />
      </div>
    </li>
  );
}
