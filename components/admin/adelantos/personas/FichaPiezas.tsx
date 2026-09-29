"use client";

/**
 * Las piezas chicas de la ficha de una persona: la cifra grande y el aviso de
 * una línea. Salieron de `FichaPersonaModal` sin cambiar nada.
 */

export function Kpi({
  label,
  valor,
  pie,
  tono = "neutro",
}: {
  label: string;
  valor: string;
  pie?: string;
  tono?: "neutro" | "success" | "warning" | "error" | "info";
}) {
  const color =
    tono === "info"
      ? "text-[var(--data-info-ink)]"
      : tono === "success"
      ? "text-[var(--data-success)]"
      : tono === "warning"
        ? "text-[var(--data-warning)]"
        : tono === "error"
          ? "text-[var(--data-error)]"
          : "text-[var(--text-primary)]";
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</p>
      <p className={`mt-1 text-2xl font-extrabold tabular-nums ${color}`}>{valor}</p>
      {pie && <p className="text-sm text-[var(--text-secondary)]">{pie}</p>}
    </div>
  );
}

export function Aviso({ tono, children }: { tono: "error" | "info" | "neutro"; children: React.ReactNode }) {
  const cls =
    tono === "error"
      ? "bg-[var(--data-error)]/10 text-[var(--data-error)]"
      : tono === "info"
        ? "bg-[var(--data-info)]/10 text-[var(--data-info)]"
        : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]";
  return (
    <div className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-semibold ${cls}`}>{children}</div>
  );
}
