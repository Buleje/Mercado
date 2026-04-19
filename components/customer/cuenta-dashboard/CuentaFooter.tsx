"use client";

/**
 * CuentaFooter — footer minimal del dashboard con links utilitarios.
 *
 * Links: Cerrar sesion, Preferencias, Ayuda.
 */

import Link from "next/link";
import { memo } from "react";
import { BodyText, Caption } from "@buleje/design-system";
import { HelpCircle, Settings, LogOut } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export interface CuentaFooterProps {
  onSignOut?: () => void;
  className?: string;
}

export const CuentaFooter = memo(function CuentaFooter({
  onSignOut,
  className,
}: CuentaFooterProps) {
  return (
    <footer
      className={cn(
        "mt-4 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5",
        className,
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <BodyText className="font-semibold">Buleje - Buleje</BodyText>
          <Caption className="block mt-0.5 text-[var(--text-tertiary)]">
            Tu bodega de confianza en Pucallpa
          </Caption>
        </div>
        <nav className="flex flex-wrap items-center gap-1" aria-label="Acciones de cuenta">
          <Link
            href="/ayuda"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[length:var(--ts-xs)] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <HelpCircle className="h-3.5 w-3.5" aria-hidden />
            Ayuda
          </Link>
          <Link
            href="/cuenta/preferencias"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[length:var(--ts-xs)] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <Settings className="h-3.5 w-3.5" aria-hidden />
            Configuracion
          </Link>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[length:var(--ts-xs)] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden />
            Cerrar sesion
          </button>
        </nav>
      </div>
    </footer>
  );
});

export default CuentaFooter;
