"use client";

/**
 * MemberStack — prueba social de la junta en fichas CUADRADAS (rectas, sin
 * radio) de vecinos: ocupadas = acento + silueta; libres = contorno punteado.
 * Vecinos anónimos por privacidad (Ley 29733): siluetas, nunca nombres ni datos.
 * Si target > 8 colapsa en "+N". Debajo, una línea de progreso precisa.
 */

import { User } from "@buleje/design-system/icons";

const MAX_SLOTS = 8;

interface Props {
  count: number;
  target: number;
  remaining: number;
  progress: number;
  isComplete: boolean;
  isExpired: boolean;
  bumped: boolean;
}

export function MemberStack({
  count,
  target,
  remaining,
  progress,
  isComplete,
  isExpired,
  bumped,
}: Props) {
  const slots = Math.min(target, MAX_SLOTS);
  const overflow = target - slots;
  const status = isExpired
    ? "Esta junta ya cerró"
    : isComplete
      ? "¡Junta completa!"
      : remaining === 1
        ? "Falta 1 vecino"
        : `Faltan ${remaining} vecinos`;

  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <p className="inline-flex items-center gap-2 text-base font-semibold text-[var(--text-secondary)]">
          {status}
          {bumped && !isExpired && (
            <span className="bg-[var(--accent)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-black uppercase tracking-wide text-white">
              +1 vecino
            </span>
          )}
        </p>
        <p className="shrink-0 text-base font-extrabold tabular-nums text-[var(--text-primary)]">
          {count}
          <span className="font-semibold text-[var(--text-tertiary)]">
            /{target}
          </span>
        </p>
      </div>

      {/* Fichas cuadradas de vecinos */}
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: slots }, (_, i) => {
          const joined = i < count;
          return (
            <div
              key={i}
              className={
                joined
                  ? "flex h-10 w-10 items-center justify-center bg-[var(--accent)]"
                  : "flex h-10 w-10 items-center justify-center border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)]"
              }
            >
              <User
                className={
                  joined ? "h-4 w-4 text-white" : "h-4 w-4 text-[var(--text-tertiary)]"
                }
                strokeWidth={2.25}
                aria-hidden
              />
            </div>
          );
        })}
        {overflow > 0 && (
          <div className="flex h-10 w-10 items-center justify-center border border-[var(--rule-base)] bg-[var(--surface-sunken)] text-sm font-black tabular-nums text-[var(--text-secondary)]">
            +{overflow}
          </div>
        )}
      </div>

      {/* Línea de progreso precisa (recta) */}
      <div
        className="mt-3 h-1.5 w-full bg-[var(--surface-sunken)]"
        role="progressbar"
        aria-valuenow={count}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-label={`${count} de ${target} vecinos`}
      >
        <div
          className="h-full bg-[var(--accent)] transition-[width] duration-500 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
