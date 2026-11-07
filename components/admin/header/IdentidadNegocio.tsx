"use client";

/**
 * Identidad del negocio en el encabezado del panel (Brandon 23-10: «arriba de
 * la barra lateral sácale el logo y el tipo de negocio, que ahí vayan los
 * enlaces; el logo, el rubro y la información de mi negocio, al lado de
 * Opciones, junto con el usuario»). `LogoNegocio` va en el botón y en la
 * tarjeta; `TarjetaNegocio` es la cabeza del menú de `AdminUserDropdown`.
 */

import { useState } from "react";
import { cn } from "@/lib/utils";
import { CodigoTienda } from "@/components/superadmin/_shared/CodigoTienda";
import type { IdentidadNegocio } from "@/hooks/use-identidad-negocio";

const TAMANO = {
  sm: "h-9 w-9 rounded-lg text-sm",
  md: "h-12 w-12 rounded-xl text-lg",
} as const;

/** El logo del negocio; sin logo (o si no carga), la inicial sobre el acento. */
export function LogoNegocio({ nombre, logoUrl, tamano = "sm" }: { nombre: string; logoUrl: string | null; tamano?: keyof typeof TAMANO }) {
  const [roto, setRoto] = useState<string | null>(null);
  if (logoUrl && roto !== logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- el logo puede venir de cualquier almacenamiento (Ajustes o registro): next/image exige el dominio
      <img
        src={logoUrl}
        alt=""
        onError={() => setRoto(logoUrl)}
        className={cn(TAMANO[tamano], "shrink-0 object-contain bg-[var(--surface-raised)] p-0.5 ring-1 ring-[var(--rule-base)]")}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(TAMANO[tamano], "inline-flex shrink-0 items-center justify-center bg-[var(--accent-dark)] font-bold text-white")}
    >
      {nombre.trim().charAt(0).toUpperCase() || "N"}
    </span>
  );
}

/** Cabeza del menú: logo, nombre, rubro (cambia el tipo con permiso), RUC e ID de soporte. */
export function TarjetaNegocio({ identidad, onCambiarRubro }: { identidad: IdentidadNegocio; onCambiarRubro?: () => void }) {
  return (
    <div data-qa="tarjeta-negocio" className="border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-3.5">
      <div className="flex items-center gap-3">
        <LogoNegocio nombre={identidad.nombre} logoUrl={identidad.logoUrl} tamano="md" />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 break-words text-sm font-semibold leading-snug text-[var(--text-primary)]" title={identidad.nombre}>
            {identidad.nombre}
          </p>
          {onCambiarRubro ? (
            <button
              type="button"
              onClick={onCambiarRubro}
              title="Cambiar tipo de negocio"
              className="mt-1 inline-flex min-h-8 items-center rounded-lg bg-primary/10 px-2 text-xs font-semibold text-[var(--accent-ink)] ring-1 ring-inset ring-primary/20 transition-opacity hover:opacity-80 dark:text-[var(--accent)]"
            >
              {identidad.rubro}
            </button>
          ) : (
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{identidad.rubro}</p>
          )}
          {identidad.ruc && <p className="mt-0.5 text-xs text-[var(--text-secondary)] tabular-nums">RUC {identidad.ruc}</p>}
        </div>
      </div>
      {/* Fila propia: «ID de tu negocio 525-146» no entra al lado del logo sin partirse. */}
      <CodigoTienda codigo={identidad.codigo} etiqueta="ID de tu negocio" className="mt-2.5 flex w-full justify-between" />
    </div>
  );
}
