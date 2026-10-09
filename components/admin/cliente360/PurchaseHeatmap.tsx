import { CardTitle } from "@buleje/design-system";
import { Clock } from "@buleje/design-system/icons";
import type { Order } from "@/components/admin/cliente360/cliente360-compartido";

// ── Mejora 10: Purchase Heatmap ─────────────────────────────────────────────

export const DAYS = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];
export const HOURS_DISPLAY = Array.from({ length: 9 }, (_, i) => {
  const h = i * 2 + 6; // 6, 8, 10, 12, 14, 16, 18, 20, 22
  return h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
});

export function PurchaseHeatmap({ orders }: { orders: Order[] }) {
  if (orders.length < 5) {
    return (
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
        <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4" style={{ color: "var(--accent)" }} /> Cuando compra?
        </CardTitle>
        <p className="text-xs text-[var(--text-tertiary)] dark:text-muted text-center py-4">
          Aun no hay suficientes datos (mínimo 5 compras)
        </p>
      </div>
    );
  }

  // Build heatmap: 7 days x 9 time slots (2-hour blocks from 6am to 10pm)
  const grid: number[][] = Array.from({ length: 7 }, () => Array(9).fill(0));
  let maxVal = 0;
  let peakDay = 0;
  let peakSlot = 0;

  for (const o of orders) {
    const d = new Date(o.createdAt);
    let day = d.getDay() - 1; // 0=Mon ... 6=Sun
    if (day < 0) day = 6; // Sunday
    const hour = d.getHours();
    const slot = Math.floor((hour - 6) / 2);
    if (slot >= 0 && slot < 9) {
      grid[day][slot]++;
      if (grid[day][slot] > maxVal) {
        maxVal = grid[day][slot];
        peakDay = day;
        peakSlot = slot;
      }
    }
  }

  // Color scale: #d8f3dc (lightest) → #007A72 (darkest)
  const getColor = (val: number): string => {
    if (val === 0) return "transparent";
    const intensity = val / Math.max(maxVal, 1);
    // Interpolate between light green and dark green
    const colors = ["#d8f3dc", "#b7e4c7", "#95d5b2", "#74c69d", "#14C2C2", "color-mix(in oklab, var(--accent) 70%, white)", "var(--accent)", "#007A72"];
    const idx = Math.min(Math.floor(intensity * (colors.length - 1)), colors.length - 1);
    return colors[idx];
  };

  const peakHour = peakSlot * 2 + 6;
  const peakHourStr = peakHour < 12 ? `${peakHour}am` : peakHour === 12 ? "12pm" : `${peakHour - 12}pm`;

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
      <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
        <Clock className="h-4 w-4" style={{ color: "var(--accent)" }} /> Cuando compra?
      </CardTitle>

      {/* Heatmap grid */}
      <div className="overflow-x-auto">
        <div className="inline-grid gap-[2px]" style={{ gridTemplateColumns: `40px repeat(9, 1fr)`, minWidth: 360 }}>
          {/* Header row */}
          <div />
          {HOURS_DISPLAY.map(h => (
            <div key={h} className="text-xs text-[var(--text-tertiary)] dark:text-muted text-center font-medium pb-1">{h}</div>
          ))}

          {/* Data rows */}
          {DAYS.map((day, dayIdx) => (
            <>
              <div key={`label-${day}`} className="text-xs text-[var(--text-secondary)] dark:text-muted font-bold flex items-center justify-end pr-2">{day}</div>
              {grid[dayIdx].map((val, slotIdx) => (
                <div
                  key={`${dayIdx}-${slotIdx}`}
                  className="rounded-sm cursor-default transition-colors"
                  style={{
                    backgroundColor: val > 0 ? getColor(val) : undefined,
                    width: 28, height: 20,
                    border: val === 0 ? "1px solid rgba(0,0,0,0.06)" : "none",
                  }}
                  title={`${day} ${HOURS_DISPLAY[slotIdx]}: ${val} compra${val !== 1 ? "s" : ""}`}
                />
              ))}
            </>
          ))}
        </div>
      </div>

      {/* Insight */}
      <p className="text-xs text-[var(--text-secondary)] dark:text-muted mt-3 pt-2 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
        Este cliente suele comprar los <strong className="text-[var(--text-primary)] dark:text-[var(--text-primary)]">{DAYS[peakDay]}</strong> a las <strong className="text-[var(--text-primary)] dark:text-[var(--text-primary)]">{peakHourStr}</strong>
      </p>
    </div>
  );
}
