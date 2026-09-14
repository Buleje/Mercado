"use client";

/**
 * GanadoView — lo ganado de referencia por período (ADR-414 §5, sólo nivel
 * completo). El copy de referencia va SIEMPRE al lado del monto: esto no
 * calcula CTS, gratificaciones, EsSalud, ONP/AFP ni horas extra.
 */

import { useMemo, useState } from "react";
import { Info } from "@buleje/design-system/icons";
import { DataTable, EmptyState, LoadingState } from "@buleje/design-system";
import { Wallet } from "@buleje/design-system/icons";
import { useRrhhGanado } from "@/hooks/use-rrhh-ganado";
import { diasDelMes, mesDe, semanaDe, sumarDias } from "@/lib/rrhh/fechas";
import { cn, limaDateKey } from "@/lib/utils";
import { COPY_REFERENCIA, formatearPEN } from "../rrhh-ui";
import FilaGanado from "./FilaGanado";

type Chip = "esta-semana" | "semana-pasada" | "este-mes" | "mes-pasado" | "rango";

function mesAnteriorDe(mesKey: string): string {
  const [y, m] = mesKey.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 2, 1));
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}`;
}

function rangoDelMes(mesKey: string): { desde: string; hasta: string } {
  const desde = `${mesKey}-01`;
  return { desde, hasta: `${mesKey}-${String(diasDelMes(desde)).padStart(2, "0")}` };
}

export default function GanadoView() {
  const hoy = limaDateKey();
  const semanaActual = semanaDe(hoy);
  const semanaPasada = semanaDe(sumarDias(semanaActual.desde, -1));
  const mesActual = mesDe(hoy);

  const [chip, setChip] = useState<Chip>("este-mes");
  const [rangoManual, setRangoManual] = useState({ desde: rangoDelMes(mesActual).desde, hasta: hoy });

  const { desde, hasta } = useMemo(() => {
    switch (chip) {
      case "esta-semana": return semanaActual;
      case "semana-pasada": return semanaPasada;
      case "este-mes": return rangoDelMes(mesActual);
      case "mes-pasado": return rangoDelMes(mesAnteriorDe(mesActual));
      case "rango": return rangoManual;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chip, rangoManual]);

  const { ganado, loading, error, recargar } = useRrhhGanado(desde, hasta);

  const CHIPS: { id: Chip; label: string }[] = [
    { id: "esta-semana", label: "Esta semana" },
    { id: "semana-pasada", label: "Semana pasada" },
    { id: "este-mes", label: "Este mes" },
    { id: "mes-pasado", label: "Mes pasado" },
    { id: "rango", label: "Rango" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-xl border border-[var(--data-info-500)]/30 bg-[var(--data-info-500)]/5 p-3 text-xs text-[var(--data-info-700)] dark:text-[var(--data-info-500)]">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{COPY_REFERENCIA}</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CHIPS.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setChip(c.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-bold transition-colors",
              chip === c.id ? "border-primary bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]",
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {chip === "rango" && (
        <div className="flex items-center gap-2">
          <input type="date" value={rangoManual.desde} onChange={(e) => setRangoManual((r) => ({ ...r, desde: e.target.value }))} className="h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)]" />
          <span className="text-[var(--text-tertiary)]">–</span>
          <input type="date" value={rangoManual.hasta} onChange={(e) => setRangoManual((r) => ({ ...r, hasta: e.target.value }))} className="h-9 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)]" />
        </div>
      )}

      {loading && <LoadingState message="Calculando lo ganado..." />}
      {error && !loading && (
        <div className="rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/5 p-4 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error} <button type="button" onClick={recargar} className="ml-2 font-bold underline">Reintentar</button>
        </div>
      )}

      {ganado && !loading && (
        ganado.personas.length === 0 ? (
          <EmptyState icon={Wallet} title="Sin personal activo en este período" />
        ) : (
          <DataTable zebra>
            <thead>
              <tr>
                <th>Persona</th>
                <th className="text-right">Días</th>
                <th className="text-right">Horas</th>
                <th>Tarifa</th>
                <th className="text-right">Ganado (referencia)</th>
                <th className="text-right">Adelantos abiertos</th>
                <th>Avisos</th>
              </tr>
            </thead>
            <tbody>
              {ganado.personas.map((p) => <FilaGanado key={p.colaboradorId} persona={p} />)}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={4} className="text-right">Total</th>
                <th className="text-right tabular-nums">{formatearPEN(ganado.total)}</th>
                <th colSpan={2} />
              </tr>
            </tfoot>
          </DataTable>
        )
      )}
    </div>
  );
}
