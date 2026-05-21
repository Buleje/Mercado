"use client";

import { Chip } from "@buleje/design-system";
import CustomDateRangePicker from "@/components/superadmin/_shared/CustomDateRangePicker";

export type DateRange = "7d" | "30d" | "90d" | "1y" | "all" | "custom";

export const DATE_RANGE_LABELS: Record<DateRange, string> = {
  "7d": "7 días",
  "30d": "30 días",
  "90d": "90 días",
  "1y": "1 año",
  all: "Todo",
  custom: "Personalizado",
};

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
  /** Opcional: rango custom seleccionado (start/end) para mostrar en el pill */
  customRange?: { start: Date; end: Date } | null;
  onCustomRangeChange?: (start: Date, end: Date) => void;
}

/**
 * Selector de rango temporal para el dashboard ejecutivo.
 *
 * UI Chips canónicos del DS + popover de rango personalizado opcional.
 */
export function DateRangeSelector({
  value,
  onChange,
  customRange,
  onCustomRangeChange,
}: Props) {
  const ranges: DateRange[] = ["7d", "30d", "90d", "1y", "all"];
  const showCustom = typeof onCustomRangeChange === "function";

  // Brandon 2026-05-21 FIX bug overflow mobile:
  // antes `flex flex-wrap` con 6 chips (~641px combined) NO wrappeaba
  // porque el parent AdminTabShell aún tenía `shrink-0`, dejando los
  // chips fuera del viewport mobile. Ahora:
  //   · mobile (<sm): scroll horizontal contenido con scroll-snap
  //     (UX clara: el user ve un edge gradiente que indica "swipe para
  //     más"). `-mx-*` + `px-*` para extender al edge del padre y dar
  //     padding interno consistente con safe-area.
  //   · desktop (sm+): wrap normal como antes
  return (
    <div className="-mx-1 px-1 sm:mx-0 sm:px-0 flex sm:flex-wrap items-center gap-1.5 overflow-x-auto sm:overflow-visible scrollbar-thin [scroll-snap-type:x_mandatory] sm:[scroll-snap-type:none]">
      {ranges.map((r) => (
        <div key={r} className="shrink-0 [scroll-snap-align:start]">
          <Chip size="sm" active={value === r} onClick={() => onChange(r)}>
            {DATE_RANGE_LABELS[r]}
          </Chip>
        </div>
      ))}
      {showCustom && (
        <div className="shrink-0 [scroll-snap-align:start]">
          <CustomDateRangePicker
            active={value === "custom"}
            value={customRange ?? null}
            onActivate={() => onChange("custom")}
            onChange={onCustomRangeChange}
          />
        </div>
      )}
    </div>
  );
}
