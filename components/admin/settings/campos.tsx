"use client";

/**
 * Los campos de Configuración: etiqueta, inputs, interruptor, tarjeta y botón
 * de guardar. Salieron de `SettingsModule` (2.365 líneas) tal cual estaban.
 */
import { cn } from "@/lib/utils";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { Check, ChevronDown, Loader2, Save } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";

export function FieldLabel({ icon, children, htmlFor }: { icon?: React.ReactNode; children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] dark:text-muted mb-1.5">
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
      className={cn(
        "w-full px-3 h-11 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)]",
        "bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm",
        "outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        mono && "font-mono"
      )}
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
        className="flex-1 px-3 h-11 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-colors font-mono"
      />
      {suffix && <span className="text-xs text-[var(--text-secondary)] dark:text-muted font-medium shrink-0">{suffix}</span>}
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
      className="w-full px-3 h-11 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] dark:text-[var(--text-primary)] text-sm outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary cursor-pointer transition-colors"
    >
      {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function Toggle({ enabled, onChange, label, desc, danger }: {
  enabled: boolean; onChange: (v: boolean) => void; label: string; desc?: string; danger?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--surface-sunken)] border border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">{label}</p>
        {desc && <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-0.5">{desc}</p>}
      </div>
      <button
        type="button"
        aria-label={label}
        aria-pressed={enabled}
        onClick={() => onChange(!enabled)}
        className={cn(
          "relative w-11 h-6 rounded-full transition-colors shrink-0",
          enabled ? (danger ? "bg-[var(--data-error-500)]" : "bg-primary") : "bg-gray-300 dark:bg-gray-600"
        )}
      >
        <span aria-hidden="true" className={cn("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-[var(--surface-raised)] shadow transition-transform", enabled && "translate-x-5")} />
      </button>
    </div>
  );
}

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
      <div className="flex items-center gap-2 px-5 min-h-12 py-2.5 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
        <CardTitle className="text-sm font-bold">{title}</CardTitle>
        {desc && <InfoTip title={title} what={desc} />}
        {accion && <div className="ml-auto shrink-0">{accion}</div>}
      </div>
      <div className="px-5 py-4 space-y-4">{children}</div>
    </div>
  );
}

export function SaveButton({ saving, saved, onClick, label = "Guardar cambios" }: {
  saving: boolean; saved: boolean; onClick: () => void; label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving}
      className={cn(
        "flex items-center gap-2 px-5 min-h-11 rounded-xl font-semibold text-sm transition-all w-full justify-center",
        saved ? "bg-primary/10 text-white" : "bg-gray-900 dark:bg-white dark:text-[var(--text-primary)] text-white hover:bg-gray-800 dark:hover:bg-gray-100"
      )}
    >
      {saving && !saved ? <><Loader2 className="h-4 w-4 animate-spin" /> Guardando...</> :
       saved ? <><Check className="h-4 w-4" /> ¡Guardado!</> :
       <><Save className="h-4 w-4" /> {label}</>}
    </button>
  );
}

/**
 * Bloque plegable y recordado (ley del admin, regla 3): plegado sigue mostrando
 * su resumen en una línea. Lo de adentro se monta recién al abrir.
 */
export function Plegable({ clave, titulo, resumen, children }: {
  clave: string; titulo: string; resumen: string; children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useLocalStorage<boolean>(`ajustes-plegable-${clave}`, false);
  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden">
      <CardTitle className="text-sm font-bold">
        <button
          type="button"
          aria-expanded={abierto}
          onClick={() => setAbierto((v) => !v)}
          className="w-full flex items-center gap-3 px-5 min-h-14 py-2 text-left hover:bg-[var(--surface-sunken)] transition-colors"
        >
          <span className="flex-1 min-w-0">
            <span className="block">{titulo}</span>
            <span className="block text-xs font-normal text-[var(--text-secondary)]">{resumen}</span>
          </span>
          <ChevronDown className={cn("h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform", abierto && "rotate-180")} aria-hidden />
        </button>
      </CardTitle>
      {abierto && <div className="px-5 pb-5 pt-4 border-t border-[var(--rule-soft)]">{children}</div>}
    </div>
  );
}
