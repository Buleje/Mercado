"use client";
/**
 * Una red de Tienda online › Redes y medición en una fila (11-10): marca,
 * nombre y ⓘ · su campo · conectada o no. Antes cada red era una tarjeta de
 * ~160 px con el estado repetido arriba en un chip.
 */
import { Check, Link2 } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import type { Feature, Icon } from "./funciones";

const FIELD =
  "w-full h-12 text-sm border border-[var(--rule-base)] rounded-xl px-3 bg-[var(--surface-raised)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";

/** Las funciones que desbloquea cada red, dentro de su ⓘ. */
export function ListaDeFunciones({ features, nota }: { features: Feature[]; nota?: string }) {
  return (
    <span className="block space-y-2">
      {features.map(({ title, desc }) => (
        <span key={title} className="block">
          <span className="block font-bold text-[var(--text-primary)]">{title}</span>
          <span className="block">{desc}</span>
        </span>
      ))}
      {nota && <span className="block border-t border-[var(--rule-soft)] pt-2">{nota}</span>}
    </span>
  );
}

/** Una red en una fila: marca, nombre y ⓘ · su campo · conectada o no. A 400 px se apila. */
export function FilaCanal({
  Brand,
  name,
  detalle,
  connected,
  accent,
  features,
  nota,
  children,
}: {
  Brand: Icon;
  name: string;
  detalle?: string;
  connected: boolean;
  accent: string;
  features: Feature[];
  nota?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid items-center gap-3 p-3 sm:p-4 lg:grid-cols-[17rem_minmax(0,1fr)_auto]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-sunken)]" style={{ color: accent }}>
          <Brand className="h-5 w-5" />
        </span>
        <span className="min-w-0">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)]">{name}</CardTitle>
          {detalle && <span className="block text-sm text-[var(--text-secondary)]">{detalle}</span>}
        </span>
        <InfoTip title={`Qué desbloquea ${name}`} ancho="w-96" body={<ListaDeFunciones features={features} nota={nota} />} />
      </div>
      <div className="min-w-0">{children}</div>
      <span
        className={cn(
          "flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold",
          connected
            ? "bg-[var(--data-success-50)] text-[var(--data-success-ink)]"
            : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
        )}
      >
        {connected ? <Check className="h-4 w-4" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
        {connected ? "Conectado" : "Sin conectar"}
      </span>
    </div>
  );
}

export function Field({
  label,
  placeholder,
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-semibold text-[var(--text-secondary)]">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={FIELD}
      />
    </label>
  );
}
