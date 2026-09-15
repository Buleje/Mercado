"use client";

/**
 * La unión de la persona de Adelantos con su parte del directorio forestal
 * (ADR-412 §5). Vive aparte de la fila porque tiene su propio estado (elegir /
 * guardando) y tres pantallas posibles: ya vinculada explícitamente
 * (Desvincular), unida por documento (nada que hacer acá), o suelta con
 * candidatas para ofrecer.
 */

import { useState } from "react";
import { Link2, Link2Off } from "@buleje/design-system/icons";
import type { CuentaPersona } from "@/lib/adelantos/cuenta-unificada";

export default function ControlVinculo({
  persona,
  candidatos,
  onVincular,
}: {
  persona: CuentaPersona;
  /** Partes sueltas (sin persona en Adelantos) que podrían ser esta misma. */
  candidatos: CuentaPersona[];
  onVincular: (beneficiarioId: string, forestPartyId: string | null) => Promise<boolean>;
}) {
  const [eligiendo, setEligiendo] = useState(false);
  const [seleccion, setSeleccion] = useState("");
  const [guardando, setGuardando] = useState(false);

  // La acción vive en `AdelantoBeneficiario`: sin ficha en Adelantos no hay
  // qué actualizar desde acá (la fila de la parte suelta no tiene botón propio).
  if (!persona.beneficiarioId) return null;

  if (persona.vinculo === "id") {
    return (
      <button
        type="button"
        disabled={guardando}
        onClick={async () => {
          setGuardando(true);
          await onVincular(persona.beneficiarioId as string, null);
          setGuardando(false);
        }}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--data-error-700)] disabled:opacity-50 dark:hover:text-[var(--data-error-500)]"
      >
        <Link2Off className="h-3.5 w-3.5" aria-hidden /> {guardando ? "Desvinculando…" : "Desvincular de la parte forestal"}
      </button>
    );
  }

  // Unida por documento (automática) o sin nada que ofrecer: no hay acción.
  if (persona.parteId || candidatos.length === 0) return null;

  if (!eligiendo) {
    return (
      <button
        type="button"
        onClick={() => setEligiendo(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold text-primary hover:underline"
      >
        <Link2 className="h-3.5 w-3.5" aria-hidden /> ¿Es la misma persona que…?
      </button>
    );
  }

  return (
    <div role="group" aria-label={`Vincular a ${persona.nombre} con una parte del directorio`} className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--surface-sunken)] p-2">
      {/* min-w-* es clase muerta acá (memoria min-width-utilities-muertas) — inline style. */}
      <select
        value={seleccion}
        onChange={(e) => setSeleccion(e.target.value)}
        style={{ minWidth: 220 }}
        className="h-9 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
      >
        <option value="">Elige la parte del directorio…</option>
        {candidatos.map((c) => (
          <option key={c.parteId} value={c.parteId ?? ""}>
            {c.nombre}
            {c.documento ? ` · ${c.documento}` : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={!seleccion || guardando}
        onClick={async () => {
          setGuardando(true);
          const ok = await onVincular(persona.beneficiarioId as string, seleccion);
          setGuardando(false);
          if (ok) setEligiendo(false);
        }}
        className="h-9 rounded-lg bg-primary px-3 text-sm font-bold text-white transition-colors hover:bg-primary-dark disabled:opacity-50"
      >
        {guardando ? "Vinculando…" : "Vincular"}
      </button>
      <button
        type="button"
        onClick={() => setEligiendo(false)}
        className="h-9 rounded-lg px-2 text-sm font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
      >
        Cancelar
      </button>
    </div>
  );
}
