"use client";

/**
 * Debajo del visor del puente: la última foto que pasó al historial y lo que
 * la IA leyó en ella —personas, placa con su guía, chalecos con su dueño—, con
 * las mismas pastillas del historial (`ChipsDeCaptura`), que se confirman igual.
 */

import { useState } from "react";
import { Sparkles } from "@buleje/design-system/icons";
import { etiquetaDeCaptura, type Captura } from "@/lib/camaras/camaras";
import ChipsDeCaptura from "./ChipsDeCaptura";
import { horaODia, type ChalecosPantalla } from "./camaras-ui";

interface Props {
  captura: Captura | null;
  chalecosVivos: ChalecosPantalla;
  onConfirmar: (capturaId: string, refId: string) => Promise<unknown>;
  onAsignarChaleco: (numero: string) => void;
}

export default function LecturaUltimaFoto({ captura: c, chalecosVivos, onConfirmar, onAsignarChaleco }: Props) {
  const [confirmando, setConfirmando] = useState<string | null>(null);

  if (!c) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
        <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Todavía no pasó ninguna foto al historial: la primera entra cuando la imagen cambie.
      </p>
    );
  }

  const confirmar = async (refId: string) => {
    setConfirmando(refId);
    try {
      await onConfirmar(c.id, refId);
    } finally {
      setConfirmando(null);
    }
  };

  return (
    <div className="flex gap-2.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2">
      <a
        href={c.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block w-24 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-sunken)] sm:w-32"
        aria-label="Abrir la última foto guardada"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- imagen de storage propio, sin layout fijo */}
        <img src={c.url} alt="" loading="lazy" className="aspect-video h-full w-full object-cover" />
      </a>
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-[var(--accent-ink)]" aria-hidden />
          <span className="truncate">
            Lo que vio la IA · {horaODia(c.at)} · {etiquetaDeCaptura(c)}
          </span>
        </p>
        {c.lectura?.descripcion && (
          <p className="line-clamp-2 text-xs leading-snug text-[var(--text-secondary)]" title={c.lectura.descripcion}>
            {c.lectura.descripcion}
          </p>
        )}
        <ChipsDeCaptura
          captura={c}
          confirmando={confirmando}
          onConfirmar={(refId) => void confirmar(refId)}
          onAsignarChaleco={onAsignarChaleco}
          chalecosVivos={chalecosVivos}
        />
      </div>
    </div>
  );
}
