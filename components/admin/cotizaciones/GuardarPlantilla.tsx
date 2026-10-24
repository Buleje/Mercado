"use client";

/**
 * Guardar la cotización abierta como plantilla (F28): se elige si queda para
 * la empresa (la ve todo el equipo) o sólo en este navegador. Si el nombre ya
 * existe no se pisa: se ofrece la versión siguiente (empresa) o reemplazarla
 * (navegador).
 */
import { useState } from "react";
import { Building2, Loader2, Monitor } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import type { DondePlantilla, Duplicada, ResultadoGuardar } from "./use-plantillas";

interface Props {
  onGuardar: (nombre: string, donde: DondePlantilla, reemplazarId?: string) => Promise<ResultadoGuardar>;
  onListo: (mensaje: string) => void;
  onCancelar: () => void;
}

const OPCIONES: { donde: DondePlantilla; rotulo: string; Icono: typeof Building2 }[] = [
  { donde: "empresa", rotulo: "Para la empresa", Icono: Building2 },
  { donde: "navegador", rotulo: "Sólo en este navegador", Icono: Monitor },
];

export function GuardarPlantilla({ onGuardar, onListo, onCancelar }: Props) {
  const [nombre, setNombre] = useState("");
  const [donde, setDonde] = useState<DondePlantilla>("empresa");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dup, setDup] = useState<Duplicada | null>(null);

  const guardar = async (reemplazarId?: string) => {
    if (!nombre.trim() || ocupado) return;
    setOcupado(true);
    const r = await onGuardar(nombre, donde, reemplazarId);
    setOcupado(false);
    if (r.ok) return onListo(r.mensaje);
    setError(r.error);
    setDup(r.duplicada ?? null);
  };
  const cambiar = (fn: () => void) => { fn(); setError(null); setDup(null); };

  return (
    <div className="space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">
      <label className="block text-sm font-semibold text-[var(--text-primary)]">
        Nombre de la plantilla
        <input
          type="text"
          value={nombre}
          onChange={(e) => cambiar(() => setNombre(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && void guardar()}
          placeholder="Ej. Pedido mensual del colegio"
          maxLength={60}
          autoFocus
          className="mt-1 h-12 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-normal text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
        />
      </label>
      <div role="radiogroup" aria-label="Dónde guardarla" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {OPCIONES.map(({ donde: d, rotulo, Icono }) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={donde === d}
            onClick={() => cambiar(() => setDonde(d))}
            className={cn(
              "flex min-h-12 items-center gap-2 rounded-xl border px-3 text-left text-sm font-semibold",
              donde === d ? "border-[var(--accent)] bg-[var(--surface-raised)] text-[var(--text-primary)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            <Icono className="h-4 w-4 shrink-0" aria-hidden /> {rotulo}
          </button>
        ))}
      </div>
      <p className="text-sm text-[var(--text-secondary)]">
        Guarda los ítems y las condiciones; no el cliente, la fecha ni el número.{donde === "empresa" ? " La verá todo el equipo, con tu nombre como dueño." : ""}
      </p>
      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          <span className="min-w-0 flex-1 text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">
            {error}
            {dup && donde === "empresa" ? ` Va por la v${dup.version} (de ${dup.propietario}).` : ""}
          </span>
          {dup && (
            <button type="button" onClick={() => void guardar(dup.id)} disabled={ocupado} className={button({ variant: "secondary", className: "rounded-xl px-4" })}>
              {donde === "empresa" ? `Guardar como v${dup.version + 1}` : "Reemplazarla"}
            </button>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onCancelar} className={button({ variant: "ghost", className: "flex-1 rounded-xl" })}>Cancelar</button>
        <button type="button" onClick={() => void guardar()} disabled={!nombre.trim() || ocupado} className={button({ variant: "primary", className: "flex-1 gap-1.5 rounded-xl" })}>
          {ocupado && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />} Guardar
        </button>
      </div>
    </div>
  );
}
