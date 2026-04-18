"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { Clock, Save, Check, RefreshCw, Minus, Plus } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface TimeSlot {
  id: string;
  label: string;   // "8:00 - 10:00 am"
  startHour: number;
  endHour: number;
  active: boolean;
  maxOrders: number;
}

// ── Defaults ───────────────────────────────────────────────────────────────────

const DEFAULT_SLOTS: TimeSlot[] = [
  { id: "s1", label: "8:00 - 10:00 am",  startHour: 8,  endHour: 10, active: true,  maxOrders: 5 },
  { id: "s2", label: "10:00 am - 12:00 pm", startHour: 10, endHour: 12, active: true,  maxOrders: 8 },
  { id: "s3", label: "12:00 - 2:00 pm",  startHour: 12, endHour: 14, active: true,  maxOrders: 6 },
  { id: "s4", label: "2:00 - 4:00 pm",   startHour: 14, endHour: 16, active: true,  maxOrders: 6 },
  { id: "s5", label: "4:00 - 6:00 pm",   startHour: 16, endHour: 18, active: true,  maxOrders: 8 },
  { id: "s6", label: "6:00 - 8:00 pm",   startHour: 18, endHour: 20, active: false, maxOrders: 5 },
];

const LS_KEY = "delivery_time_slots_v1";

// ── Helpers ────────────────────────────────────────────────────────────────────

function loadSlots(): TimeSlot[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as TimeSlot[];
  } catch { /* ignore */ }
  return DEFAULT_SLOTS;
}

function saveSlots(slots: TimeSlot[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(slots));
  } catch { /* ignore */ }
}

// ── Admin configurator component ──────────────────────────────────────────────

export default function DeliveryTimeSlots() {
  const [slots, setSlots] = useState<TimeSlot[]>(DEFAULT_SLOTS);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setSlots(loadSlots());
  }, []);

  const toggleSlot = useCallback((id: string) => {
    setSlots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, active: !s.active } : s))
    );
  }, []);

  const setMaxOrders = useCallback((id: string, delta: number) => {
    setSlots((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, maxOrders: Math.max(1, Math.min(50, s.maxOrders + delta)) } : s
      )
    );
  }, []);

  const setMaxOrdersDirect = useCallback((id: string, value: number) => {
    setSlots((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, maxOrders: Math.max(1, Math.min(50, value)) } : s
      )
    );
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    saveSlots(slots);
    try {
      await fetch("/api/admin/delivery-slots", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slots),
      });
    } catch { /* localStorage is the fallback */ }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [slots]);

  const activeCount = slots.filter((s) => s.active).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <CardTitle className="text-base font-semibold text-[var(--text-primary)]">Horarios de entrega</CardTitle>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
            {activeCount} de {slots.length} franjas activas
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-[var(--dur-fast)]",
            saved ? "bg-[var(--accent-soft)] text-white" : "bg-[#00B4A6] hover:bg-[#235c42] text-white",
            saving && "opacity-70 cursor-not-allowed"
          )}
        >
          {saving ? <RefreshCw size={14} className="animate-spin" /> : saved ? <Check size={14} /> : <Save size={14} />}
          {saved ? "Guardado" : "Guardar"}
        </button>
      </div>

      {/* Slot grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {slots.map((slot) => (
          <div
            key={slot.id}
            className={cn(
              "rounded-xl border p-4 transition-all duration-[var(--dur-fast)]",
              slot.active
                ? "border-[#00B4A6]/30 bg-[#00B4A6]/5 dark:bg-[#00B4A6]/10 dark:border-[#00B4A6]/40"
                : "border-[var(--rule-base)] bg-[var(--surface-raised)] opacity-60"
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Clock
                  size={15}
                  className={cn(slot.active ? "text-[#00B4A6]" : "text-[var(--text-tertiary)]")}
                />
                <span
                  className={cn(
                    "text-sm font-medium",
                    slot.active ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)]"
                  )}
                >
                  {slot.label}
                </span>
              </div>

              {/* Toggle */}
              <button
                onClick={() => toggleSlot(slot.id)}
                className={cn(
                  "relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-[var(--dur-base)]",
                  slot.active ? "bg-[#00B4A6]" : "bg-gray-300 dark:bg-gray-600"
                )}
                role="switch"
                aria-checked={slot.active}
                aria-label={`${slot.active ? "Desactivar" : "Activar"} franja ${slot.label}`}
              >
                <span
                  className={cn(
                    "inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-[var(--dur-base)]",
                    slot.active ? "translate-x-4" : "translate-x-1"
                  )}
                />
              </button>
            </div>

            {/* Max orders control */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-[var(--text-tertiary)]">Max. pedidos</span>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setMaxOrders(slot.id, -1)}
                  disabled={!slot.active || slot.maxOrders <= 1}
                  className="w-6 h-6 rounded-md bg-[var(--surface-sunken)] flex items-center justify-center text-[var(--text-secondary)] hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Reducir"
                >
                  <Minus size={11} />
                </button>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={slot.maxOrders}
                  disabled={!slot.active}
                  onChange={(e) => setMaxOrdersDirect(slot.id, parseInt(e.target.value) || 1)}
                  className="w-10 h-6 text-center text-sm font-semibold rounded-md border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] disabled:opacity-40 focus:outline-none focus:ring-1 focus:ring-[#00B4A6]"
                />
                <button
                  onClick={() => setMaxOrders(slot.id, 1)}
                  disabled={!slot.active || slot.maxOrders >= 50}
                  className="w-6 h-6 rounded-md bg-[var(--surface-sunken)] flex items-center justify-center text-[var(--text-secondary)] hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Aumentar"
                >
                  <Plus size={11} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DeliverySlotPicker — companion for checkout ───────────────────────────────

interface DeliverySlotPickerProps {
  value: string | null;
  onChange: (slotId: string) => void;
  className?: string;
}

export function DeliverySlotPicker({ value, onChange, className }: DeliverySlotPickerProps) {
  const [slots, setSlots] = useState<TimeSlot[]>([]);

  useEffect(() => {
    setSlots(loadSlots().filter((s) => s.active));
  }, []);

  if (slots.length === 0) {
    return (
      <p className="text-sm text-[var(--text-tertiary)] italic">
        No hay franjas de entrega disponibles
      </p>
    );
  }

  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      {slots.map((slot) => (
        <button
          key={slot.id}
          type="button"
          onClick={() => onChange(slot.id)}
          className={cn(
            "flex flex-col items-start px-3 py-2.5 rounded-xl border text-left transition-all duration-[var(--dur-fast)]",
            value === slot.id
              ? "border-[#00B4A6] bg-[#00B4A6]/10 dark:bg-[#00B4A6]/20 text-[#00B4A6] dark:text-[var(--data-success)]"
              : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[#00B4A6]/50 hover:bg-[#00B4A6]/5"
          )}
        >
          <span className="text-sm font-medium">{slot.label}</span>
          <span className="text-xs text-[var(--text-tertiary)] mt-0.5">
            Max {slot.maxOrders} pedidos
          </span>
        </button>
      ))}
    </div>
  );
}
