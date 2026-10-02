"use client";

/**
 * LothImportPlanPanel — «¿a qué permiso van estas líneas?» y, en Tala, qué saldo
 * dejaría la importación en cada especie (ADR-459).
 *
 * Cada línea importada viaja con el plan elegido: sólo así T6/T7 la revisan y
 * sólo descuenta de ESE plan (sin plan, cuenta en el saldo de todos a la vez).
 */

import { DataTable } from "@buleje/design-system";
import { AlertTriangle, Loader2 } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import type { PlanImportOpcion, SaldoImportEspecie } from "@/lib/forestal/loth-import-plan";

export default function LothImportPlanPanel({
  planes,
  planId,
  onElegir,
  rotuloDe,
  cargando,
  error,
  cargandoDetalle,
  detalleFallo,
  esPlantacion,
  saldos,
}: {
  planes: readonly PlanImportOpcion[];
  planId: string | null;
  onElegir: (id: string | null) => void;
  rotuloDe: (p: PlanImportOpcion) => string;
  cargando: boolean;
  error: string | null;
  cargandoDetalle: boolean;
  detalleFallo: boolean;
  esPlantacion: boolean;
  saldos: readonly SaldoImportEspecie[];
}) {
  if (error) {
    return (
      <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
        <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
      </p>
    );
  }
  if (cargando) {
    return (
      <p className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Leyendo tus permisos…
      </p>
    );
  }
  // Sin permisos cargados no hay a quién atarlas: el libro admite la línea sin plan.
  if (planes.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
        <label htmlFor="loth-import-plan" className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
          Permiso al que van las líneas
          <InfoTip
            title="Importar al permiso correcto"
            what="Cada línea queda atada a este permiso."
            affects="Sólo así se revisa contra su registro y sólo descuenta de su saldo. Una línea sin permiso cuenta en todos a la vez."
            example="Talas de Bolaina importadas a «Plantación QA-459»: bajan el saldo de esa plantación y no el de PO 12."
          />
        </label>
        <select
          id="loth-import-plan"
          value={planId ?? ""}
          onChange={(e) => onElegir(e.target.value || null)}
          aria-invalid={planId == null}
          className={`h-11 w-full min-w-0 rounded-xl border-2 sm:flex-1 bg-[var(--surface-canvas)] px-3 text-sm font-semibold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] ${
            planId == null ? "border-[var(--data-warning-500)]" : "border-[var(--rule-base)]"
          }`}
        >
          {planId == null && <option value="">Elige el permiso…</option>}
          {planes.map((p) => (
            <option key={p.id} value={p.id}>
              {rotuloDe(p)}
              {p.isActive ? " (activo)" : ""}
            </option>
          ))}
        </select>
      </div>

      {planId == null && (
        <p className="text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          Elige el permiso para poder asentar: hay más de uno y la importación no puede adivinar a cuál va.
        </p>
      )}
      {cargandoDetalle && (
        <p className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Leyendo el {esPlantacion ? "registro" : "plan"} del permiso…
        </p>
      )}
      {detalleFallo && (
        <p className="flex items-center gap-1.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> No se pudo leer el registro del permiso: las líneas se asientan igual y el servidor las revisa.
        </p>
      )}

      {saldos.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
          <DataTable className="w-full text-xs">
            <caption className="sr-only">Saldo que dejaría la importación, por especie</caption>
            <thead className="bg-[var(--surface-sunken)] text-left">
              <tr>
                <th scope="col" className="px-2 py-1.5 font-bold">Especie</th>
                <th scope="col" className="px-2 py-1.5 text-right font-bold">{esPlantacion ? "Registrado" : "Autorizado"}</th>
                <th scope="col" className="px-2 py-1.5 text-right font-bold">Ya talado</th>
                <th scope="col" className="px-2 py-1.5 text-right font-bold">Esta importación</th>
                <th scope="col" className="px-2 py-1.5 text-right font-bold">Quedaría</th>
              </tr>
            </thead>
            <tbody>
              {saldos.map((s) => (
                <tr key={s.species} className={`border-t border-[var(--rule-soft)] ${s.excede ? "bg-[var(--data-warning-500)]/10" : ""}`}>
                  <th scope="row" className="px-2 py-1.5 text-left font-semibold text-[var(--text-primary)]">{s.species}</th>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">{fmtM3(s.autorizadoM3)}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">{fmtM3(s.taladoM3)}</td>
                  <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">{fmtM3(s.importadoM3)}</td>
                  <td
                    className={`px-2 py-1.5 text-right font-mono font-bold tabular-nums ${
                      s.excede ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" : "text-[var(--text-primary)]"
                    }`}
                  >
                    {fmtM3(s.quedariaM3)} m³{s.excede ? " · se pasa" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      )}
    </div>
  );
}
