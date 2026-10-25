"use client";

import { Search } from "@buleje/design-system/icons";
import { FiltroColumnaTexto, SUMMARY_CABECERA_COMPACTO, usePopoverCabecera } from "@/components/admin/shared/filtros-columna";

/**
 * La lupa de una columna de texto de Facturas y boletas. Escribe en el alcance
 * (que va a la base): el campo ya espera a que dejes de teclear y la lista
 * espera otra vez antes de pedir. Mismo aspecto que la lupa de las demás tablas.
 */
export function EmbudoTextoCabecera({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const { ref, alAbrir, estilo } = usePopoverCabecera(64, 224);
  return (
    <details ref={ref} onToggle={alAbrir} className="inline-block align-middle font-normal normal-case tracking-normal">
      <summary
        role="button"
        aria-label={`Buscar en ${label}`}
        title={value ? `${label}: «${value}»` : `Buscar en ${label}`}
        className={`${SUMMARY_CABECERA_COMPACTO} ${value ? "border-[var(--accent)] bg-primary/10" : "border-[var(--rule-base)]"}`}
      >
        <Search className={`h-4 w-4 ${value ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"}`} aria-hidden />
      </summary>
      <div style={estilo} className="z-50 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-2 shadow-[var(--shadow-lg)]">
        <FiltroColumnaTexto label={label} value={value} onChange={onChange} className="mt-0! w-52!" />
      </div>
    </details>
  );
}
