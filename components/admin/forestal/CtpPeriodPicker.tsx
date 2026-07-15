"use client";

/**
 * CtpPeriodPicker — selector de período del Libro CTP (ADR-124/127).
 * El período es del MÓDULO, no de una pestaña: las 4 vistas y el export leen el
 * mismo rango, así los números de una hablan del mismo lapso que los de las otras.
 */

import { CalendarDays } from "@buleje/design-system/icons";
import {
  CTP_PERIOD_OPTIONS,
  type CtpPeriod,
  type CtpPeriodKey,
} from "@/lib/forestal/ctp-period";

export interface CtpCustomRange {
  from: string;
  to: string;
}

interface CtpPeriodPickerProps {
  periodKey: CtpPeriodKey;
  custom: CtpCustomRange;
  period: CtpPeriod;
  onKeyChange: (key: CtpPeriodKey) => void;
  onCustomChange: (range: CtpCustomRange) => void;
}

const CONTROL =
  "h-12 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-base font-medium text-[var(--text-primary)] outline-none focus:border-[var(--brand-ink)]";

export default function CtpPeriodPicker({
  periodKey,
  custom,
  period,
  onKeyChange,
  onCustomChange,
}: CtpPeriodPickerProps) {
  const incompleteCustom = periodKey === "custom" && (!custom.from || !custom.to);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className={`flex items-center gap-2 ${CONTROL} px-3`}>
          <CalendarDays className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
          <label htmlFor="ctp-period" className="sr-only">
            Período del libro
          </label>
          <select
            id="ctp-period"
            value={periodKey}
            onChange={(e) => onKeyChange(e.target.value as CtpPeriodKey)}
            className="bg-transparent text-base font-bold text-[var(--text-primary)] outline-none"
          >
            {CTP_PERIOD_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {periodKey === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="ctp-from" className="sr-only">
              Desde
            </label>
            <input
              id="ctp-from"
              type="date"
              value={custom.from}
              max={custom.to || undefined}
              onChange={(e) => onCustomChange({ ...custom, from: e.target.value })}
              className={CONTROL}
            />
            <span className="text-sm font-bold text-[var(--text-tertiary)]">—</span>
            <label htmlFor="ctp-to" className="sr-only">
              Hasta
            </label>
            <input
              id="ctp-to"
              type="date"
              value={custom.to}
              min={custom.from || undefined}
              onChange={(e) => onCustomChange({ ...custom, to: e.target.value })}
              className={CONTROL}
            />
          </div>
        )}

        <span className="text-sm text-[var(--text-tertiary)]">
          Mostrando: <strong className="text-[var(--text-secondary)]">{period.label}</strong>
        </span>
      </div>

      {incompleteCustom && (
        <p className="text-sm text-[var(--data-warning-700)]">
          Elegí las dos fechas para acotar el período. Mientras tanto se muestra todo el histórico.
        </p>
      )}
    </div>
  );
}
