"use client";

/**
 * «Alarma» de la cámara (ADR-472): sirena + luz de la «defensa activa».
 *
 * HOY DESHABILITADA (security 05-10): el botón se ve apagado con su ⓘ hasta
 * probarla en el sitio con Brandon (`alarmaHabilitada` del GET, ADR-472).
 *
 * Habilitada, nunca suena de un toque: primero pide confirmar y elegir cuánto
 * (15/30/60 s), y mientras suena —o quizá suena— el botón se vuelve rojo y
 * apaga al tocarlo. «Apagar» no se va hasta que la cámara confirmó el apagado.
 */

import { useState } from "react";
import { Loader2, Siren, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { DURACIONES_ALARMA } from "./use-controles-camara";

interface Props {
  nombre: string;
  /** `false` = botón deshabilitado con ⓘ (el servidor contesta 409). */
  habilitada: boolean;
  /** Sonando o quizá sonando: «Apagar» a la vista. */
  activa: boolean;
  /** El «sonar» falló de forma dudosa: no se sabe si suena. */
  quiza: boolean;
  segundos: number;
  ocupado: boolean;
  apagando: boolean;
  onSonar: (segundos: number) => void;
  onApagar: () => void;
  /** Clases del botón (las comparte con Foto/Detección). */
  boton: string;
}

export default function ControlesCamaraAlarma({
  nombre,
  habilitada,
  activa,
  quiza,
  segundos,
  ocupado,
  apagando,
  onSonar,
  onApagar,
  boton,
}: Props) {
  const [confirmar, setConfirmar] = useState(false);
  const [duracion, setDuracion] = useState<number>(30);

  if (activa)
    return (
      <button
        type="button"
        onClick={onApagar}
        disabled={apagando}
        className={cn(
          boton,
          "border-[var(--data-error-500)] bg-[var(--data-error-500)] text-white hover:text-white",
        )}
        data-alarma={quiza ? "quiza" : "sonando"}
        title={quiza ? "No se sabe si sonó: tócalo para apagarla por si acaso" : undefined}
      >
        {apagando ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Siren className="h-4 w-4 animate-pulse" aria-hidden />
        )}
        {apagando
          ? "Apagando…"
          : quiza
            ? "Apagar alarma (por si suena)"
            : segundos > 0
              ? `Apagar alarma (${segundos} s)`
              : "Apagar alarma"}
      </button>
    );

  if (!habilitada)
    return (
      <span className="inline-flex items-center gap-1">
        <button type="button" disabled className={boton} data-alarma="deshabilitada">
          <Siren className="h-4 w-4" aria-hidden />
          Alarma
        </button>
        <InfoTip
          title="Alarma deshabilitada"
          what="Se habilita tras probarla contigo en el sitio: primero hay que oír cuánto suena y comprobar que se apaga sola."
          example="Un día con gente en el patio: se prueba en «Entrada», se mide y recién ahí se prende este botón."
          side="top"
          ariaLabel="Por qué la alarma está deshabilitada"
        />
      </span>
    );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setConfirmar((c) => !c)}
        disabled={ocupado}
        aria-expanded={confirmar}
        className={boton}
        title="Hacer sonar la sirena y la luz de la cámara"
      >
        {ocupado ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Siren className="h-4 w-4" aria-hidden />
        )}
        Alarma
      </button>
      {confirmar && (
        <div
          role="alertdialog"
          aria-label="Confirmar la alarma"
          className="absolute bottom-full left-0 z-10 mb-2 w-72 space-y-2 rounded-xl border border-[var(--data-error-500)]/60 bg-[var(--surface-raised)] p-3 text-sm text-[var(--text-primary)] shadow-[var(--shadow-lg)] max-sm:static max-sm:mb-0 max-sm:mt-2 max-sm:w-full"
        >
          <p className="font-bold">¿Hacer sonar la alarma de «{nombre}»?</p>
          <p className="text-xs text-[var(--text-secondary)]">
            Suena la sirena y prende la luz de la cámara. Se oye en todo el patio.
          </p>
          <div className="flex gap-1" role="radiogroup" aria-label="Cuánto tiempo">
            {DURACIONES_ALARMA.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={duracion === s}
                onClick={() => setDuracion(s)}
                className={cn(
                  "h-11 flex-1 rounded-lg border text-sm font-bold",
                  duracion === s
                    ? "border-[var(--data-error-500)] bg-[var(--data-error-500)]/15 text-[var(--text-primary)]"
                    : "border-[var(--rule-base)] text-[var(--text-secondary)]",
                )}
              >
                {s} s
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirmar(false);
                onSonar(duracion);
              }}
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--data-error-500)] px-3 text-sm font-bold text-white"
              data-alarma="confirmar"
            >
              <Siren className="h-4 w-4" aria-hidden /> Sonar {duracion} s
            </button>
            <button
              type="button"
              onClick={() => setConfirmar(false)}
              className="inline-flex h-11 items-center gap-1 rounded-lg border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)]"
            >
              <X className="h-4 w-4" aria-hidden /> Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
