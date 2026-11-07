"use client";

import { useState } from "react";
import { Bell } from "@buleje/design-system/icons";
import { cn } from "@buleje/design-system";
import { CentroNotificaciones } from "@/components/superadmin/notificaciones/CentroNotificaciones";
import { useBandejaAvisos } from "@/components/superadmin/notificaciones/use-bandeja-avisos";

/** «99+» pasado el tope: el globo no crece más que la campana. */
function corto(n: number): string {
  return n > 99 ? "99+" : String(n);
}

/**
 * Campana del topbar del superadmin. Abre el centro de notificaciones (modal
 * central, Brandon 2026-10-18; antes era un cajón angosto a la derecha).
 *
 * El globo es ROJO con el número de urgentes si hay alguno; si no, neutro con
 * el total. Así «106» deja de gritar cuando ninguno es para hoy.
 */
export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const { data, cargando, fallo, recargar } = useBandejaAvisos(open);

  const total = data?.total ?? 0;
  const urgentes = data?.niveles.urgente ?? 0;
  const resto = total - urgentes;

  const resumen =
    total === 0
      ? "Notificaciones: todo al día"
      : urgentes > 0
        ? `${urgentes} ${urgentes === 1 ? "urgente" : "urgentes"}${resto > 0 ? ` · ${resto} más` : ""}`
        : `${total} pendientes, ninguno urgente`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative rounded-xl p-2 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
        title={resumen}
        aria-label={`Abrir notificaciones: ${resumen.replace(" · ", ", ")}`}
        aria-haspopup="dialog"
        data-qa="campana-notificaciones"
      >
        <Bell className="h-4 w-4" />
        {total > 0 && (
          <>
            <span
              className={cn(
                "absolute -right-0.5 -top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-xs font-bold tabular-nums ring-2 ring-[var(--surface-canvas)]",
                urgentes > 0
                  ? "bg-[var(--data-error-500)] text-white shadow-sm shadow-[var(--data-error-500)]/40"
                  : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
              )}
              aria-hidden
            >
              {corto(urgentes > 0 ? urgentes : total)}
            </span>
            {urgentes > 0 && (
              <span
                className="pointer-events-none absolute -right-0.5 -top-0.5 h-[18px] w-[18px] animate-ping rounded-full bg-[var(--data-error-500)]/40"
                aria-hidden
              />
            )}
          </>
        )}
      </button>

      <CentroNotificaciones
        open={open}
        onClose={() => setOpen(false)}
        data={data}
        cargando={cargando}
        fallo={fallo}
        onReintentar={() => void recargar()}
      />
    </>
  );
}
