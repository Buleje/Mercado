"use client";

/**
 * El control de la lectura en voz alta, flotando sobre la pantalla.
 *
 * Leer una tabla larga al oído es un trabajo de dos manos: una anota en el
 * papel y la otra sigue en la pantalla. Hasta ahora el único control era el
 * mismo botón que la había arrancado —arriba del todo, fuera de vista una vez
 * que la lectura empieza a bajar por la tabla—, y sólo servía para CORTARLA:
 * frenar un segundo para terminar de anotar significaba volver a empezar por
 * la primera fila.
 *
 * Por eso flota: mientras lee, el control tiene que estar donde estén los ojos,
 * y los ojos están siguiendo la fila que suena.
 *
 * Tres acciones, ninguna escondida:
 *  - **Pausar / Seguir** — frena donde está y retoma por esa misma fila.
 *  - **Reiniciar** — vuelve a la primera y sigue leyendo.
 *  - **Detener** — corta y cierra el control.
 *
 * Y el progreso con todas las letras («fila 34 de 300»): sin eso, una pausa
 * larga deja sin saber por dónde iba, que es justo lo que la pausa vino a
 * resolver.
 */

import { Pause, Play, RotateCcw, Square, Volume2 } from "@buleje/design-system/icons";

export interface EstadoLectura {
  pausada: boolean;
  /** Posición 0-based de la fila que suena. */
  idx: number;
  total: number;
}

export default function ControlLecturaFlotante({
  estado,
  onPausar,
  onReanudar,
  onReiniciar,
  onDetener,
  etiqueta = "Leyendo la tabla",
}: {
  /** `null` = no hay lectura en curso y el control no existe. */
  estado: EstadoLectura | null;
  onPausar: () => void;
  onReanudar: () => void;
  onReiniciar: () => void;
  onDetener: () => void;
  etiqueta?: string;
}) {
  if (!estado) return null;
  const actual = Math.min(estado.idx + 1, estado.total);
  const pct = estado.total > 0 ? (actual / estado.total) * 100 : 0;

  return (
    <div
      role="status"
      aria-live="polite"
      /* Abajo y centrado: es donde no tapa ni la tabla ni la fila resaltada,
         que suele quedar a media pantalla. Por encima de la capa de pantalla
         completa de la tabla, o al expandirla el control desaparecería justo
         cuando más se usa. */
      className="fixed bottom-4 left-1/2 z-[9996] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 shadow-[var(--shadow-lg)]"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
          <Volume2
            className={`h-4 w-4 text-[var(--accent)] ${estado.pausada ? "" : "animate-pulse"}`}
            aria-hidden
          />
          {estado.pausada ? "En pausa" : etiqueta}
        </p>
        <p className="font-mono text-xs font-bold tabular-nums text-[var(--text-tertiary)]">
          fila {actual.toLocaleString("es-PE")} de {estado.total.toLocaleString("es-PE")}
        </p>
      </div>

      <div className="mb-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
        <div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex gap-2">
        {estado.pausada ? (
          <Boton onClick={onReanudar} Icono={Play} label="Seguir" destacado />
        ) : (
          <Boton onClick={onPausar} Icono={Pause} label="Pausar" destacado />
        )}
        <Boton onClick={onReiniciar} Icono={RotateCcw} label="Reiniciar" hint="Volver a la primera fila" />
        <Boton onClick={onDetener} Icono={Square} label="Detener" />
      </div>
    </div>
  );
}

function Boton({
  onClick,
  Icono,
  label,
  hint,
  destacado,
}: {
  onClick: () => void;
  Icono: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  destacado?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint ?? label}
      className={`inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border text-xs font-bold transition-colors ${
        destacado
          ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] hover:brightness-95 dark:text-[var(--accent)]"
          : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      }`}
    >
      <Icono className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}
