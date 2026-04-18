"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/purity */

import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp, ChevronDown, ChevronUp, DollarSign } from "@buleje/design-system/icons";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MarginItem {
  name: string;
  price: number;
  cost: number;
  qty: number;
}

interface Props {
  items: MarginItem[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `S/${n.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function pct(margin: number, revenue: number): number {
  if (revenue <= 0) return 0;
  return Math.round((margin / revenue) * 100);
}

type MarginLevel = "good" | "warning" | "danger";

function getLevel(marginPct: number): MarginLevel {
  if (marginPct >= 25) return "good";
  if (marginPct >= 15) return "warning";
  return "danger";
}

const LEVEL_STYLES: Record<MarginLevel, { bar: string; text: string; badge: string }> = {
  good: {
    bar: "bg-primary",
    text: "text-primary",
    badge: "bg-primary/10 text-primary",
  },
  warning: {
    bar: "bg-secondary",
    text: "text-secondary",
    badge: "bg-secondary/10 text-secondary",
  },
  danger: {
    bar: "bg-[var(--data-error)]",
    text: "text-[var(--data-error)]",
    badge: "bg-[var(--data-error-50)] text-[var(--data-error)]",
  },
};

// ── Product Row ───────────────────────────────────────────────────────────────

interface ProductRowProps {
  item: MarginItem;
}

function ProductRow({ item }: ProductRowProps) {
  const revenue = item.price * item.qty;
  const cost = item.cost * item.qty;
  const margin = revenue - cost;
  const marginPct = pct(margin, revenue);
  const level = getLevel(marginPct);
  const styles = LEVEL_STYLES[level];

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-[var(--rule-soft)] last:border-0">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)] truncate">
          {item.name}
        </p>
        <p className="text-xs text-[var(--text-tertiary)]">
          {item.qty} x {fmt(item.price)} — costo {fmt(item.cost)}
        </p>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <div className="w-24 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", styles.bar)}
            style={{ width: `${Math.min(100, marginPct)}%` }}
          />
        </div>
        <div className="text-right w-24">
          <p className={cn("text-sm font-bold", styles.text)}>
            {fmt(margin)}
          </p>
          <span
            className={cn(
              "text-xs font-bold px-1.5 py-0.5 rounded-full",
              styles.badge
            )}
          >
            {marginPct}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LiveMarginDisplay({ items }: Props) {
  const [expanded, setExpanded] = useState(false);

  const totals = useMemo(() => {
    const revenue = items.reduce((s, i) => s + i.price * i.qty, 0);
    const cost = items.reduce((s, i) => s + i.cost * i.qty, 0);
    const margin = revenue - cost;
    const marginPct = pct(margin, revenue);
    return { revenue, cost, margin, marginPct };
  }, [items]);

  const level = getLevel(totals.marginPct);
  const styles = LEVEL_STYLES[level];

  return (
    <div
      className={cn(
        "rounded-xl border-2 overflow-hidden transition-colors ",
        level === "good"
          ? "border-primary/30"
          : level === "warning"
            ? "border-secondary/30"
            : "border-[var(--data-error)]"
      )}
    >
      {/* Summary bar */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 bg-white hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "p-2 rounded-xl",
              level === "good"
                ? "bg-primary/10"
                : level === "warning"
                  ? "bg-secondary/10"
                  : "bg-[var(--data-error-50)]"
            )}
          >
            <TrendingUp
              className={cn(
                "w-5 h-5",
                level === "good"
                  ? "text-primary"
                  : level === "warning"
                    ? "text-secondary"
                    : "text-[var(--data-error)]"
              )}
            />
          </div>
          <div className="text-left">
            <p className="text-xs text-[var(--text-secondary)] font-semibold">
              Margen total
            </p>
            <p className={cn("text-xl font-extrabold", styles.text)}>
              {fmt(totals.margin)}{" "}
              <span className="text-base font-bold">({totals.marginPct}%)</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-xs text-[var(--text-tertiary)]">Ingreso</p>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {fmt(totals.revenue)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-[var(--text-tertiary)]">Costo</p>
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {fmt(totals.cost)}
            </p>
          </div>
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-[var(--text-tertiary)]" />
          ) : (
            <ChevronDown className="w-5 h-5 text-[var(--text-tertiary)]" />
          )}
        </div>
      </button>

      {/* Progress bar */}
      <div className="h-2 w-full bg-gray-100">
        <div
          className={cn("h-full transition-all duration-[var(--dur-slow)]", styles.bar)}
          style={{ width: `${Math.min(100, totals.marginPct)}%` }}
        />
      </div>

      {/* Breakdown */}
      {expanded && items.length > 0 && (
        <div className="bg-white px-5 py-3 border-t border-[var(--rule-soft)]">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-4 h-4 text-[var(--text-tertiary)]" />
            <p className="text-xs font-semibold text-[var(--text-secondary)]">
              Desglose por producto
            </p>
          </div>
          {items.map((item, i) => (
            <ProductRow key={i} item={item} />
          ))}
        </div>
      )}

      {expanded && items.length === 0 && (
        <div className="bg-white px-5 py-6 text-center">
          <p className="text-sm text-[var(--text-tertiary)]">
            No hay items en esta venta
          </p>
        </div>
      )}
    </div>
  );
}
