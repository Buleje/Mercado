"use client";

import { useRef } from "react";
import { ImageIcon } from "@buleje/design-system/icons";
import type { LogoTramite } from "@/lib/forestal/tramites-logo";

/**
 * Logo del membrete (ADR-364 ronda 6): botón-preview grande, igual patrón que
 * `Anexo04Campos.ImagenGuardada` — una caja de 20px de alto no deja juzgar un
 * logo. Vive acá (no en `tramites-logo.ts`, que es sólo lectura/escritura de
 * localStorage) porque es puramente presentacional.
 */
export default function TramiteLogoMembrete({
  logo,
  onArchivo,
  onQuitar,
}: {
  logo: LogoTramite | null;
  onArchivo: (f?: File) => void;
  onQuitar: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2">
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          onArchivo(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => ref.current?.click()}
        title={logo ? "Cambiar logo" : "Subir logo"}
        aria-label={logo ? "Cambiar logo del membrete" : "Subir logo del membrete"}
        className={`flex h-11 w-16 items-center justify-center overflow-hidden rounded-xl border-2 bg-[var(--surface-raised)] p-1 transition ${logo ? "border-[var(--data-success-500)]/50" : "border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"}`}
      >
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- dataURL local, no pasa por el optimizador
          <img src={logo.src} alt="Logo del membrete" className="max-h-full max-w-full object-contain" />
        ) : (
          <ImageIcon className="h-5 w-5" />
        )}
      </button>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-bold text-[var(--text-primary)]">Logo del membrete</span>
        <div className="flex items-center gap-2 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          <span>Va arriba de la hoja, al lado de la razón social</span>
          {logo && (
            <button type="button" onClick={onQuitar} className="font-bold underline hover:text-[var(--data-error-700)]">
              Quitar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
