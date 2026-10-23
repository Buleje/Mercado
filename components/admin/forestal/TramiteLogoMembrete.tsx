"use client";

import type { LogoTramite } from "@/lib/forestal/tramites-logo";

/**
 * Logo del membrete (ADR-514): ya no se sube acá. Es el de Ajustes › Negocio ›
 * Logo, el mismo de todos los papeles de la empresa. Esto sólo lo muestra y
 * dice dónde cambiarlo.
 */
export default function TramiteLogoMembrete({ logo, deAjustes }: { logo: LogoTramite | null; deAjustes: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-12 w-16 items-center justify-center overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element -- dataURL local, no pasa por el optimizador
          <img src={logo.src} alt="Logo del membrete" className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Sin logo</span>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-bold text-[var(--text-primary)]">Logo del membrete</span>
        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          {deAjustes
            ? "Es el logo de tu negocio. Para cambiarlo ve a Ajustes › Negocio › Logo."
            : logo
              ? "Logo guardado antes en este navegador. Súbelo en Ajustes › Negocio › Logo para que salga en todos tus papeles."
              : "Súbelo en Ajustes › Negocio › Logo y saldrá en todos tus papeles."}
        </span>
      </div>
    </div>
  );
}
