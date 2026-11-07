"use client";

import { type Paperclip, Check } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

export function OpcionVia({
  activa,
  onClick,
  Icon,
  titulo,
  detalle,
  deshabilitada,
}: {
  activa: boolean;
  onClick: () => void;
  Icon: typeof Paperclip;
  titulo: string;
  detalle: string;
  deshabilitada?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={deshabilitada}
      className={cn(
        "flex flex-col items-start gap-0.5 rounded-xl border-2 px-3 min-h-11 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        activa
          ? "border-[var(--data-success-700)] bg-[var(--data-success-50)] dark:border-[var(--data-success-500)] dark:bg-[var(--data-success-500)]/12"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--text-tertiary)]",
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
        <Icon className="h-4 w-4" /> {titulo}
      </span>
      <span className="text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">
        {detalle}
      </span>
    </button>
  );
}

export function ResultadoEnvio({
  resultado,
}: {
  resultado: { enviados: { nombre: string }[]; fallidos: { nombre: string; error: string }[] };
}) {
  return (
    <div className="space-y-3 py-4">
      {resultado.enviados.length > 0 && (
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]">
            <Check className="h-6 w-6" />
          </span>
          <p className="text-sm font-bold text-[var(--text-primary)]">
            {resultado.enviados.length === 1
              ? "Archivo enviado"
              : `${resultado.enviados.length} archivos enviados`}
          </p>
          <ul className="text-xs text-[var(--text-secondary)]">
            {resultado.enviados.map((e) => (
              <li key={e.nombre}>{e.nombre}</li>
            ))}
          </ul>
        </div>
      )}
      {resultado.fallidos.length > 0 && (
        <div className="rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] p-3 dark:bg-[var(--data-error-500)]/12">
          <p className="text-xs font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
            No salieron
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-[var(--text-secondary)]">
            {resultado.fallidos.map((f) => (
              <li key={f.nombre}>
                {f.nombre} — {f.error}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
