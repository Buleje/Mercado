"use client";
import { useState } from "react";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────
export type DatePreset = "today" | "week" | "month" | "custom";

interface AdminDateFilterProps {
  value: DatePreset;
  onChange: (preset: DatePreset) => void;
  showTime?: boolean;
  showRefresh?: boolean;
  onRefresh?: () => void;
  className?: string;
}

// ── Presets ───────────────────────────────────────────────────────────────────
const PRESETS: { id: DatePreset; label: string }[] = [
  { id: "today",  label: "Hoy" },
  { id: "week",   label: "Semana" },
  { id: "month",  label: "Mes actual" },
];

// ── Component ────────────────────────────────────────────────────────────────
export default function AdminDateFilter({
  value,
  onChange,
  showTime = true,
  showRefresh,
  onRefresh,
  className,
}: AdminDateFilterProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const now = new Date();
  const timeStr = now.toLocaleTimeString("es-PE", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  const handlePreset = (preset: DatePreset) => {
    if (preset === "custom") {
      setShowCustom(true);
    } else {
      setShowCustom(false);
      onChange(preset);
    }
  };

  return (
    <div className={cn("flex items-center gap-2 flex-wrap", className)}>
      {/* Preset buttons */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => handlePreset(p.id)}
            className={cn(
              "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
              value === p.id && !showCustom
                ? "bg-white text-gray-900 "
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50",
            )}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => handlePreset("custom")}
          className={cn(
            "px-2 py-1.5 rounded-md text-xs font-medium transition-all",
            showCustom
              ? "bg-white text-gray-900 "
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-50",
          )}
          title="Rango personalizado"
        >
          <Calendar className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Custom date range */}
      {showCustom && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={customFrom}
            onChange={(e) => {
              setCustomFrom(e.target.value);
              onChange("custom");
            }}
            className="px-2 py-1 rounded-md border border-[var(--rule-base)] text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <span className="text-xs text-gray-400">—</span>
          <input
            type="date"
            value={customTo}
            onChange={(e) => {
              setCustomTo(e.target.value);
              onChange("custom");
            }}
            className="px-2 py-1 rounded-md border border-[var(--rule-base)] text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
      )}

      {/* Time display */}
      {showTime && (
        <span className="text-xs text-gray-400 tabular-nums">{timeStr}</span>
      )}

      {/* Refresh button */}
      {showRefresh && onRefresh && (
        <button
          onClick={onRefresh}
          className="p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          title="Actualizar"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
            <path d="M16 16h5v5" />
          </svg>
        </button>
      )}
    </div>
  );
}
