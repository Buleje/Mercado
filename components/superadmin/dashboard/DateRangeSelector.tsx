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

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ranges.map((r) => (
        <Chip key={r} size="sm" active={value === r} onClick={() => onChange(r)}>
          {DATE_RANGE_LABELS[r]}
        </Chip>
      ))}
      {showCustom && (
        <CustomDateRangePicker
          active={value === "custom"}
          value={customRange ?? null}
          onActivate={() => onChange("custom")}
          onChange={onCustomRangeChange}
        />
      )}
    </div>
  );
}
