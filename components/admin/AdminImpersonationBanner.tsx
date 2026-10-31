"use client";

/**
 * components/admin/AdminImpersonationBanner.tsx
 *
 * Franja de la «vista de tienda» del superadmin (11-10): sólo cuando la sesión
 * del panel es una suplantación (lo confirma el servidor, ver
 * `useSuplantacionActiva`). Dice qué negocio se está viendo, cuántos minutos le
 * quedan a la vista (los que eligió el superadmin, de 5 a 60) y ofrece «Salir»,
 * que cierra la suplantación y vuelve al superadmin.
 *
 * «+15 min» (18-10): alarga la vista sin salir, auditado en el servidor. Nunca
 * deja más de 60 min por delante: en el tope queda deshabilitado y su ⓘ lo dice.
 * Si no se pudo (candado cerrado, sesión de superadmin vencida), el motivo
 * reemplaza al contador unos segundos.
 *
 * `sticky top-0` de 56 px encima del AdminTopHeader (que baja a `top-14` con la
 * franja activa): las dos quedan fijas al hacer scroll. A 400 px se acorta a
 * «Musa · quedan N min» y el botón a «+15» para que los dos de 48 px entren en
 * una sola fila.
 */

import { LogOut, Shield, TimerReset } from "@buleje/design-system/icons";
import { Button } from "@/components/ui-system/Button";
import Tooltip from "@/components/ui-system/Tooltip";
import { MINUTOS_EXTENDER, MINUTOS_SUPLANTACION_MAX } from "@/lib/auth/suplantacion";

export interface AdminImpersonationBannerProps {
  /** Nombre del negocio que se está viendo (o su slug si aún no cargó). */
  negocio: string;
  minutos: number;
  saliendo: boolean;
  onSalir: () => void;
  /** Sumar 15 min todavía agrega algo (false = la vista ya tiene 60 min por delante). */
  puedeExtender: boolean;
  extendiendo: boolean;
  /** Por qué no se alargó, o null. */
  aviso: string | null;
  onExtender: () => void;
}

export function AdminImpersonationBanner({
  negocio,
  minutos,
  saliendo,
  onSalir,
  puedeExtender,
  extendiendo,
  aviso,
  onExtender,
}: AdminImpersonationBannerProps) {
  const ayudaExtender = puedeExtender
    ? `Suma ${MINUTOS_EXTENDER} min sin salir (queda anotado en la auditoría)`
    : `Ya tienes el máximo: ${MINUTOS_SUPLANTACION_MAX} min por delante`;
  return (
    <div
      role="status"
      aria-live="polite"
      data-franja-suplantacion=""
      className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-[var(--rule-base)] bg-[color-mix(in_oklab,var(--data-warning)_10%,var(--surface-raised))] px-4 sm:px-6"
    >
      <Shield className="h-4 w-4 shrink-0 text-[var(--data-warning)]" aria-hidden="true" />
      <p className="min-w-0 flex-1 truncate text-sm text-[var(--text-primary)]">
        <span className="hidden sm:inline">Estás viendo </span>
        <span className="font-semibold">{negocio}</span>
        <span className="hidden sm:inline"> como superadmin</span>
        {aviso ? (
          <span className="text-[var(--data-error)]" data-aviso-extender=""> · {aviso}</span>
        ) : (
          <span className="text-[var(--text-secondary)]"> · quedan {minutos} min</span>
        )}
      </p>
      <Tooltip content={ayudaExtender} placement="bottom">
        {/* El span recibe el hover aunque el botón esté deshabilitado (un botón
            disabled no dispara eventos de mouse). */}
        <span className="inline-flex shrink-0" tabIndex={puedeExtender ? -1 : 0}>
          <Button
            variant="secondary"
            onClick={onExtender}
            disabled={!puedeExtender || extendiendo || saliendo}
            aria-label={`Sumar ${MINUTOS_EXTENDER} minutos a la vista`}
            data-extender-vista=""
            className="gap-2 disabled:pointer-events-none"
          >
            <TimerReset className="h-4 w-4" aria-hidden="true" />
            {extendiendo ? (
              "…"
            ) : (
              <>
                +{MINUTOS_EXTENDER}
                <span className="hidden sm:inline"> min</span>
              </>
            )}
          </Button>
        </span>
      </Tooltip>
      <Button variant="secondary" onClick={onSalir} disabled={saliendo} className="shrink-0 gap-2">
        <LogOut className="h-4 w-4" aria-hidden="true" />
        {saliendo ? "Saliendo…" : "Salir"}
      </Button>
    </div>
  );
}
