"use client";

/**
 * La troza como card, para el celular del patio.
 *
 * El picker se usa parado frente a la pila. La <table> de 6 columnas obliga a
 * scrollear en horizontal justo cuando hay que tildar rápido, y el target real
 * era un checkbox de 16px: con guantes eso no se toca. Acá el target es la card
 * entera.
 *
 * Arriba va el CÓDIGO DE PLANTA, no la codificación del bosque: en el patio se
 * pregunta por el número pintado en la testa ("traeme la 118"), que es
 * justamente el porqué del campo (ADR-325).
 */

import { Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { LABEL_BLOQUEO, motivoBloqueo, type TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

export default function CtpTrozaCardMobile({
  troza: t,
  elegida,
  onToggle,
}: {
  troza: TrozaConsumible;
  elegida: boolean;
  onToggle: () => void;
}) {
  const bloqueo = motivoBloqueo(t);
  return (
    <li>
      <button
        type="button"
        disabled={Boolean(bloqueo)}
        onClick={onToggle}
        aria-pressed={elegida}
        className={cn(
          "flex w-full items-center gap-3 rounded-2xl border-2 px-3 py-3 text-left transition-colors",
          bloqueo
            ? "border-[var(--rule-soft)] opacity-60"
            : elegida
              ? "border-[var(--accent)] bg-primary/5"
              : "border-[var(--rule-base)] hover:border-[var(--accent)]",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 transition-colors",
            elegida
              ? "border-[var(--accent)] bg-[var(--accent)] text-white"
              : "border-[var(--rule-base)]",
          )}
        >
          {elegida && <Check className="h-4 w-4" />}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <b className="font-mono text-base text-[var(--text-primary)]">
              {t.codigoPlanta ?? t.codificacion ?? "—"}
            </b>
            {/* Las dos codificaciones conviven: la de planta manda, la del bosque
                queda al lado porque es la que casa con la guía. */}
            {t.codigoPlanta && t.codificacion && (
              <span className="font-mono text-sm text-[var(--text-tertiary)]">{t.codificacion}</span>
            )}
          </span>
          <span className="mt-0.5 block truncate text-sm text-[var(--text-secondary)]">
            {t.especieComun ?? "—"}
            {t.gtfNumber && (
              <>
                {" · "}
                <span className="font-mono">{t.gtfNumber}</span>
              </>
            )}
          </span>
          {bloqueo && (
            <span className="mt-1 inline-block rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-sm font-bold text-[var(--text-tertiary)]">
              {LABEL_BLOQUEO[bloqueo]}
            </span>
          )}
        </span>

        <span className="shrink-0 text-right">
          <span className="block font-mono text-base font-bold tabular-nums text-[var(--text-primary)]">
            {t.volumenM3 != null ? fmtM3(Number(t.volumenM3)) : "—"}
          </span>
          <span className="block text-sm text-[var(--text-tertiary)]">m³</span>
        </span>
      </button>
    </li>
  );
}
