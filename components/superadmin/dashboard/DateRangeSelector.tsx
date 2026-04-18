"use client";

import { Chip } from "@buleje/design-system";

export type DateRange = "7d" | "30d" | "90d" | "1y" | "all";

export const DATE_RANGE_LABELS: Record<DateRange, string> = {
  "7d": "7 días",
  "30d": "30 días",
  "90d": "90 días",
  "1y": "1 año",
  all: "Todo",
};

interface Props {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

/**
 * Selector de rango temporal para el dashboard ejecutivo.
 *
 * UI Chips canónicos del DS. Por ahora no filtra la data (mock-backed) —
 * marcado como MOCK hasta que los endpoints reales acepten `?window=`.
 */
export function DateRangeSelector({ value, onChange }: Props) {
  const ranges: DateRange[] = ["7d", "30d", "90d", "1y", "all"];
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {ranges.map((r) => (
        <Chip
          key={r}
          size="sm"
          active={value === r}
          onClick={() => onChange(r)}
        >
          {DATE_RANGE_LABELS[r]}
        </Chip>
      ))}
    </div>
  );
}
