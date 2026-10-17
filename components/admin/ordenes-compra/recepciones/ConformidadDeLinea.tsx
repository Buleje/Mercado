"use client";

import type { ConformidadServicio, ControlDeLinea } from "@/lib/compras/conformidad-recepcion";

const CAMPO =
  "h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-primary";

/**
 * C22 · El control pertinente de una línea de la recepción, según su producto:
 * un SERVICIO se acepta por alcance y alguien lo acepta (no suma stock); un
 * PERECIBLE pide su fecha de vencimiento (el campo «Vence» va debajo).
 */
export default function ConformidadDeLinea({
  id, control, fila, onChange,
}: {
  id: string;
  control: ControlDeLinea;
  fila: ConformidadServicio & { condition: string };
  onChange: (patch: ConformidadServicio) => void;
}) {
  if (control === "perecible") {
    return (
      <p className="basis-full text-sm font-semibold text-[var(--data-warning-ink)]">
        Perecible: anota cuándo vence para que salga en Por vencer.
      </p>
    );
  }
  if (control !== "servicio" || fila.condition !== "ok") return null;
  return (
    <div className="grid basis-full grid-cols-1 gap-2 sm:grid-cols-[2fr_1fr]">
      <p className="text-sm text-[var(--text-secondary)] sm:col-span-2">
        Es un servicio: no suma stock. Di qué se hizo y quién lo da por bueno.
      </p>
      <label className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-[var(--text-secondary)]">Alcance aceptado</span>
        <input
          id={`${id}-alcance`}
          value={fila.alcance ?? ""}
          onChange={(e) => onChange({ alcance: e.target.value })}
          maxLength={200}
          placeholder="Ej.: corte de 12 m³ de tornillo, sin rajaduras"
          className={CAMPO}
        />
      </label>
      <label className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-[var(--text-secondary)]">Quién lo acepta</span>
        <input
          id={`${id}-acepta`}
          value={fila.aceptaServicio ?? ""}
          onChange={(e) => onChange({ aceptaServicio: e.target.value })}
          maxLength={80}
          placeholder="Nombre"
          className={CAMPO}
        />
      </label>
    </div>
  );
}
