"use client";

/**
 * La burbuja del mosaico minimizado (Brandon 2026-10-07): «igual que la
 * burbuja de "+" flotante». Mientras está, el video sigue corriendo escondido;
 * tocarla lo vuelve a mostrar al instante.
 *
 * Muestra la última foto de persona (o un cuadro del video), el punto «en
 * vivo», cuántas cámaras y cuántas fotos de personas llegaron desde que se
 * minimizó. Se arrastra y se pega al borde (`use-burbuja-arrastre`). La ✕
 * pide una confirmación de una línea: cortar todas gasta un toque más que
 * volver a pedirlas.
 */

import { useEffect, useRef, useState } from "react";
import { m } from "framer-motion";
import { Pause, Users, Video, X } from "@buleje/design-system/icons";
import { DURATION, EASE, tapPress } from "@/components/ui-system";
import { cn } from "@/lib/utils";
import { useBurbujaArrastre } from "./use-burbuja-arrastre";

interface Props {
  camaras: number;
  /** Cuántas tienen video ahora. */
  viendo: number;
  /** El reloj de 5 min las pausó. */
  pausado: boolean;
  miniatura: string | null;
  /** Fotos de personas desde que se minimizó. */
  fotos: number;
  onExpandir: () => void;
  onCerrar: () => void;
}

const PASTILLA =
  "absolute top-1/2 flex -translate-y-1/2 items-center gap-2 whitespace-nowrap rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5 text-sm font-semibold text-[var(--text-primary)] shadow-[var(--shadow-lg)]";

export default function MosaicoBurbuja({ camaras, viendo, pausado, miniatura, fotos, onExpandir, onCerrar }: Props) {
  const a = useBurbujaArrastre();
  const [confirmando, setConfirmando] = useState(false);
  const boton = useRef<HTMLButtonElement>(null);
  const noCortar = useRef<HTMLButtonElement>(null);

  /* Al minimizar, el foco viene a la burbuja: si no, se perdía en <body>. */
  useEffect(() => {
    boton.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (!confirmando) return;
    noCortar.current?.focus({ preventScroll: true });
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirmando(false);
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [confirmando]);

  const enVivo = viendo > 0 && !pausado;
  const adentro = a.lado === "der" ? "right-full mr-3" : "left-full ml-3";
  const descripcion = [
    `En vivo minimizado: ${camaras} ${camaras === 1 ? "cámara" : "cámaras"}`,
    pausado ? "pausado, toca para seguir" : `${viendo} con video`,
    fotos ? `${fotos} ${fotos === 1 ? "foto" : "fotos"} de personas desde que minimizaste` : null,
    pausado ? null : "Toca para abrir",
  ]
    .filter(Boolean)
    .join(". ");

  return (
    <m.div
      initial={{ opacity: 0, scale: 0.6 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: DURATION.base, ease: EASE.editorial }}
      style={a.estilo}
      onPointerDown={a.onPointerDown}
      onClickCapture={a.onClickCapture}
      className={cn(
        /* z-40 (como el chat): el menú abierto del «+» (z-50) queda encima, no tapado. */
        "fixed z-40 h-14 w-14 touch-none select-none",
        a.arrastrando && "cursor-grabbing",
        a.iman && "motion-safe:transition-[left,top] motion-safe:duration-300 motion-safe:ease-out",
      )}
      data-mosaico-burbuja={pausado ? "pausado" : "en-vivo"}
    >
      <m.button
        ref={boton}
        type="button"
        onClick={onExpandir}
        whileTap={tapPress}
        aria-label={descripcion}
        title={pausado ? "Pausado · toca para seguir" : "Toca para ver las cámaras · arrástrala para moverla"}
        className="relative block h-14 w-14 cursor-pointer overflow-hidden rounded-full bg-[var(--text-primary)] text-[var(--surface-canvas)] shadow-[var(--shadow-xl)] ring-2 ring-[var(--surface-canvas)] transition-transform hover:scale-105"
      >
        {miniatura ? (
          // eslint-disable-next-line @next/next/no-img-element -- cuadro local (data URL) del video
          <img src={miniatura} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <Video className="absolute inset-0 m-auto h-6 w-6" strokeWidth={1.75} aria-hidden />
        )}
        {/* La pausa va debajo de la franja: el número de cámaras se sigue leyendo. */}
        {pausado && (
          <span aria-hidden className="absolute inset-0 grid place-items-center bg-[var(--text-primary)]/60">
            <Pause className="h-5 w-5 text-[var(--surface-canvas)]" strokeWidth={2.25} />
          </span>
        )}
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-0.5 bg-[var(--text-primary)]/75 pb-1 pt-0.5 text-xs font-bold tabular-nums text-[var(--surface-canvas)]"
        >
          <Video className="h-3 w-3" strokeWidth={2.25} />
          {camaras}
        </span>
      </m.button>

      {/* Punto «en vivo»: rojo y latiendo con video; gris pausado o sin señal. */}
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-0 top-0 h-3.5 w-3.5 rounded-full ring-2 ring-[var(--surface-canvas)]",
          enVivo ? "bg-[var(--data-error-500)]" : "bg-[var(--text-tertiary)]",
        )}
      >
        {enVivo && (
          <span className="absolute inset-0 rounded-full bg-[var(--data-error-500)] opacity-60 motion-safe:animate-ping" />
        )}
      </span>

      {fotos > 0 && (
        <span
          aria-hidden
          className="pointer-events-none absolute -right-1.5 -top-1.5 inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full bg-[var(--accent-dark)] px-1 text-xs font-bold tabular-nums text-[var(--surface-canvas)] ring-2 ring-[var(--surface-canvas)] dark:bg-[var(--accent)]"
        >
          <Users className="h-3 w-3" strokeWidth={2.25} />
          {fotos > 99 ? "99+" : fotos}
        </span>
      )}

      <button
        type="button"
        onClick={() => setConfirmando(true)}
        aria-label="Cortar el video de todas las cámaras"
        title="Cortar el video"
        data-sin-arrastre
        className={cn(
          "absolute -bottom-1.5 grid h-6 w-6 place-items-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] shadow-[var(--shadow-sm)] hover:text-[var(--text-primary)]",
          "before:absolute before:-inset-2.5 before:content-['']",
          a.lado === "der" ? "-left-1.5" : "-right-1.5",
        )}
      >
        <X className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
      </button>

      {confirmando ? (
        <div role="group" aria-label="¿Cortar el video?" data-sin-arrastre className={cn(PASTILLA, adentro)}>
          <span>¿Cortar el video?</span>
          <button
            type="button"
            onClick={onCerrar}
            className="rounded-lg border border-[var(--data-error-500)]/60 px-2 py-1 text-sm font-bold text-[var(--data-error-ink)] hover:bg-[var(--data-error-500)]/10"
          >
            Cortar
          </button>
          <button
            ref={noCortar}
            type="button"
            onClick={() => setConfirmando(false)}
            className="rounded-lg border border-[var(--rule-base)] px-2 py-1 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Dejar
          </button>
        </div>
      ) : (
        pausado && (
          <span aria-hidden className={cn(PASTILLA, adentro, "pointer-events-none")}>
            Pausado · toca para seguir
          </span>
        )
      )}
    </m.div>
  );
}
