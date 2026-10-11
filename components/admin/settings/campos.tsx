"use client";

/**
 * Los campos de Configuración: etiqueta, inputs, interruptor, tarjeta y botón
 * de guardar. Salieron de `SettingsModule` (2.365 líneas) tal cual estaban.
 */
import { cn } from "@/lib/utils";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { ALTURA_CONTROL } from "@/components/ui-system/button-variants";
import PlegableDelPanel from "@/components/admin/shared/Plegable";

/**
 * Lo común a los campos de Ajustes (contrato de diseño, ADR-489): el alto de
 * control del panel (`ALTURA_CONTROL`, 48 px, decisión de Brandon 09-10), borde
 * y foco con tokens. Antes eran 44 px y cada campo repetía sus clases.
 */
export const CLASE_CAMPO = cn(
  ALTURA_CONTROL.clase,
  "px-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)]",
  "outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors duration-[var(--dur-fast)]",
);

/*
 * La etiqueta va en `--text-secondary` en los dos temas. El `dark:text-muted` de
 * antes compilaba al gris del tema CLARO (#6b7280, `@theme inline` no lo cambia
 * en oscuro): 3,29:1 sobre la tarjeta oscura, bajo el 4,5:1 del texto chico.
 */
export function FieldLabel({ icon, children, htmlFor }: { icon?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)] mb-1">
      {icon}{children}
    </label>
  );
}

export function TextInput({ value, onChange, placeholder, mono, type = "text", disabled, id }: {
  value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; type?: string; disabled?: boolean; id?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={cn("w-full", CLASE_CAMPO, "disabled:opacity-50 disabled:cursor-not-allowed", mono && "font-mono")}
    />
  );
}

export function NumberInput({ value, onChange, min, max, step, suffix, id }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string; id?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        id={id}
        type="number"
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        min={min} max={max} step={step}
        className={cn("flex-1 font-mono", CLASE_CAMPO)}
      />
      {suffix && <span className="text-sm text-[var(--text-secondary)] font-medium shrink-0">{suffix}</span>}
    </div>
  );
}

export function SelectInput({ value, onChange, options, id, ariaLabel }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; id?: string; ariaLabel?: string;
}) {
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={e => onChange(e.target.value)}
      className={cn("w-full cursor-pointer", CLASE_CAMPO)}
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

/**
 * El interruptor de Ajustes es el `Interruptor` del DS (contrato de diseño,
 * ADR-489): salió de acá y vuelve con los mismos props (`enabled`, `onChange`,
 * `label`, `desc`, `danger`), así que Cobros, Equipo y Tienda no cambian.
 */
export { Interruptor as Toggle } from "@/components/ui-system/Interruptor";

/**
 * Tarjeta de un bloque de Ajustes. Ley de la vista (2026-10-08): el título es
 * `CardTitle` (la sección ya tiene su `SectionTitle`), la explicación va en un
 * ⓘ y no en un párrafo, y `accion` cabe en la misma fila del título.
 */
export function SectionCard({ title, desc, accion, children }: {
  title: string; desc?: string; accion?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 sm:px-5 min-h-12 py-2 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
        <CardTitle className="text-sm font-bold">{title}</CardTitle>
        {desc && <InfoTip title={title} what={desc} />}
        {accion && <div className="ml-auto shrink-0">{accion}</div>}
      </div>
      <div className="px-4 sm:px-5 py-4 space-y-4">{children}</div>
    </div>
  );
}

/** Texto largo de Ajustes (descripción, pie del ticket): mismo borde, foco y letra que los campos. */
export function TextArea({ id, value, onChange, placeholder, rows = 2, maxLength }: {
  id?: string; value: string; onChange: (v: string) => void; placeholder?: string; rows?: number; maxLength?: number;
}) {
  return (
    <textarea
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      maxLength={maxLength}
      className="w-full px-3 py-2.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
    />
  );
}

/**
 * Bloque plegable y recordado de Ajustes: el `Plegable` del panel
 * (components/admin/shared/Plegable.tsx) con la clave de siempre
 * («ajustes-plegable-<clave>»), así nadie pierde lo que dejó abierto.
 */
export function Plegable({ clave, titulo, resumen, children }: {
  clave: string; titulo: string; resumen: string; children: React.ReactNode;
}) {
  return (
    <PlegableDelPanel clave={`ajustes-plegable-${clave}`} titulo={titulo} resumen={resumen}>
      {children}
    </PlegableDelPanel>
  );
}
