"use client";

/**
 * Un cuadro del TV: el video de la cámara con su nombre y su hora (o su
 * estado) encima, legibles a 3 m. En el mosaico es un botón: OK lo amplía.
 * Ampliado ocupa la pantalla y, si es de Hik-Connect, ofrece SD/HD.
 */

import { useCallback, useState, type ReactNode } from "react";
import { Video } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { Cartel, MedioNube, MedioPropio, MedioPuente } from "./CuadroTvVisores";
import { FOCO_TV } from "./tv-estilos";
import type { CamaraTv } from "./tv-ui";

interface Props {
  camara: CamaraTv;
  /** `true` = ampliada (sin botón alrededor; con SD/HD si es de Hik-Connect). */
  grande?: boolean;
  /** Sólo Hik-Connect: `false` = en espera de su turno o pausada por inactividad. */
  activoNube?: boolean;
  onArrancoNube?: () => void;
  /** En el mosaico: OK sobre el cuadro. */
  onAbrir?: () => void;
  inicial?: boolean;
}

export default function CuadroTv({ camara, grande = false, activoNube = true, onArrancoNube, onAbrir, inicial }: Props) {
  const [estado, setEstado] = useState<{ texto: string; vivo: boolean }>({ texto: "Conectando…", vivo: false });
  const alInformar = useCallback((texto: string, vivo: boolean) => {
    setEstado((e) => (e.texto === texto && e.vivo === vivo ? e : { texto, vivo }));
  }, []);

  let medio: ReactNode;
  if (camara.tipo === "propio") medio = <MedioPropio camaraId={camara.id} nombre={camara.nombre} alInformar={alInformar} />;
  else if (camara.tipo === "puente") medio = <MedioPuente camaraId={camara.id} nombre={camara.nombre} alInformar={alInformar} />;
  else if (camara.tipo === "nube") {
    medio = (
      <MedioNube
        camaraId={camara.id}
        conCodigo={camara.conCodigo}
        activo={activoNube}
        grande={grande}
        alInformar={alInformar}
        onArranco={onArrancoNube}
      />
    );
  } else {
    medio = <Cartel icono="sin" texto="Esta cámara sólo manda fotos cuando detecta algo: no tiene video en vivo." />;
  }

  const contenido = (
    <>
      <span className="absolute inset-0 bg-[var(--surface-sunken)]">{medio}</span>
      {/* Nombre y hora/estado: una franja abajo, sobre un velo para leerse encima de cualquier imagen. */}
      <span
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-3 bg-[var(--surface-canvas)]/80 px-4 py-2 text-left",
          grande ? "text-3xl" : "text-xl",
        )}
      >
        <span className="min-w-0 flex-1 truncate font-bold text-[var(--text-primary)]">{camara.nombre}</span>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-2 font-bold tabular-nums",
            estado.vivo ? "text-[var(--data-success-500)]" : "text-[var(--text-secondary)]",
          )}
          aria-live="polite"
        >
          {estado.vivo && <Video className="h-6 w-6" aria-hidden />}
          {estado.texto}
        </span>
      </span>
    </>
  );

  if (grande) {
    return (
      <div className="relative h-full w-full overflow-hidden rounded-2xl" data-tv-cuadro={camara.id}>
        {contenido}
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onAbrir}
      data-tv-foco
      data-tv-inicial={inicial || undefined}
      data-tv-cuadro={camara.id}
      aria-label={`${camara.nombre}: ver en grande`}
      className={cn(FOCO_TV, "relative h-full w-full overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] focus:border-[var(--accent)]")}
    >
      {contenido}
    </button>
  );
}
