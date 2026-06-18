"use client";

/**
 * MemberStack — prueba social de la junta: avatares apilados de vecinos (cálido,
 * humano) + conteo + línea de progreso precisa (cuadrada). Los vecinos son
 * anónimos por privacidad (Ley 29733): mostramos siluetas, no nombres ni datos.
 * Avatares ocupados = acento; libres = contorno punteado. Si target > 6 se
 * colapsa en "+N".
 */

import { User } from "@buleje/design-system/icons";

const MAX_SLOTS = 6;

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
      : `Faltan ${remaining} vecino${remaining === 1 ? "" : "s"}`;

  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="flex -space-x-2.5">
          {Array.from({ length: slots }, (_, i) => {
            const joined = i < count;
            return (
              <div
                key={i}
                className={
                  joined
                    ? "flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent)] ring-2 ring-[var(--surface-raised)]"
                    : "flex h-10 w-10 items-center justify-center rounded-full border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] ring-2 ring-[var(--surface-raised)]"
                }
              >
                <User
                  className={
                    joined
                      ? "h-4 w-4 text-white"
                      : "h-4 w-4 text-[var(--text-tertiary)]"
                  }
                  strokeWidth={2.25}
                  aria-hidden
                />
              </div>
            );
          })}
          {overflow > 0 && (
            <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] text-sm font-black tabular-nums text-[var(--text-secondary)] ring-2 ring-[var(--surface-raised)]">
              +{overflow}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <p className="text-base font-extrabold tabular-nums text-[var(--text-primary)]">
            {count}{" "}
            <span className="font-semibold text-[var(--text-tertiary)]">
              de {target} vecinos
            </span>
          </p>
          <p className="inline-flex items-center gap-2 text-base font-semibold text-[var(--text-secondary)]">
            {status}
            {bumped && !isExpired && (
              <span className="bg-[var(--accent)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-black uppercase tracking-wide text-white">
                +1 vecino
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Línea de progreso precisa (cuadrada) */}
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
