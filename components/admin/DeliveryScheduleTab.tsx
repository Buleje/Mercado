"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { Clock, MapPin, Save, Plus, Trash2, CheckCircle } from "@buleje/design-system/icons";
import * as Sentry from "@sentry/nextjs";
import { csrfHeaders } from "@/lib/csrf-client";

type DaySchedule = { day: string; open: string; close: string; enabled: boolean };
type Zone = { name: string; radius: number; price: number; enabled: boolean };
type DeliveryConfig = {
  hours: DaySchedule[];
  zones: Zone[];
  freeDeliveryMin: number;
};

const DEFAULT_DELIVERY: DeliveryConfig = {
  hours: [
    { day: "Lunes", open: "07:00", close: "21:00", enabled: true },
    { day: "Martes", open: "07:00", close: "21:00", enabled: true },
    { day: "Miércoles", open: "07:00", close: "21:00", enabled: true },
    { day: "Jueves", open: "07:00", close: "21:00", enabled: true },
    { day: "Viernes", open: "07:00", close: "21:00", enabled: true },
    { day: "Sábado", open: "07:00", close: "21:00", enabled: true },
    { day: "Domingo", open: "00:00", close: "00:00", enabled: false },
  ],
  zones: [
    { name: "Centro - Callería", radius: 3, price: 0, enabled: true },
    { name: "Yarinacocha", radius: 6, price: 3, enabled: true },
    { name: "Manantay", radius: 8, price: 5, enabled: true },
  ],
  freeDeliveryMin: 50,
};

export default function DeliveryScheduleTab() {
  const [config, setConfig] = useState<DeliveryConfig>(DEFAULT_DELIVERY);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.deliveryConfig) setConfig({ ...DEFAULT_DELIVERY, ...d.deliveryConfig });
      })
      .catch((err) => console.warn("[DeliveryScheduleTab] settings fetch failed:", err))
      .finally(() => setLoading(false));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ deliveryConfig: config }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setSaveError("Error al guardar configuración de delivery");
      Sentry.captureException(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setSaving(false);
    }
  }, [config]);

  const updateHour = (idx: number, field: keyof DaySchedule, value: string | boolean) => {
    setConfig((prev) => ({
      ...prev,
      hours: prev.hours.map((h, i) => (i === idx ? { ...h, [field]: value } : h)),
    }));
  };

  const updateZone = (idx: number, field: keyof Zone, value: string | number | boolean) => {
    setConfig((prev) => ({
      ...prev,
      zones: prev.zones.map((z, i) => (i === idx ? { ...z, [field]: value } : z)),
    }));
  };

  const addZone = () => {
    setConfig((prev) => ({
      ...prev,
      zones: [...prev.zones, { name: "Nueva zona", radius: 5, price: 3, enabled: true }],
    }));
  };

  const removeZone = (idx: number) => {
    setConfig((prev) => ({ ...prev, zones: prev.zones.filter((_, i) => i !== idx) }));
  };

  if (loading) return <div className="text-center py-20 text-[var(--text-secondary)]">Cargando...</div>;

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <SectionTitle className="text-base sm:text-xl font-bold text-white flex flex-wrap items-center gap-2">
          <Clock className="w-5 h-5 text-[var(--data-success-500)]" />
          Horarios y Zonas de Delivery
        </SectionTitle>
        <button
          onClick={save}
          disabled={saving}
          className={`flex items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-medium transition ${
            saved
              ? "bg-primary/10 text-white"
              : "bg-primary/10 hover:bg-primary/10 text-white"
          } disabled:opacity-50`}
        >
          {saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saving ? "Guardando..." : saved ? "¡Guardado!" : "Guardar"}
        </button>
      </div>

      {saveError && (
        <div className="flex items-center gap-2 bg-[var(--data-error-500)]/10 border border-[var(--data-error-500)]/20 rounded-xl p-3 text-sm text-[var(--data-error-500)]">
          <span>{saveError}</span>
          <button onClick={save} className="ml-auto text-xs font-bold hover:underline">Reintentar</button>
        </div>
      )}

      {/* Schedule */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <CardTitle className="text-sm font-semibold text-white mb-3 flex flex-wrap items-center gap-2">
          <Clock className="w-4 h-4 text-[var(--data-warning-500)]" />
          Horarios por día
        </CardTitle>
        <div className="space-y-2">
          {config.hours.map((h, i) => (
            <div
              key={h.day}
              className={`flex items-center gap-3 p-3 rounded-lg border transition ${
                h.enabled
                  ? "bg-white/5 border-white/10"
                  : "bg-white/[0.02] border-white/5 opacity-60"
              }`}
            >
              <label className="flex flex-wrap items-center gap-2 min-w-[140px]">
                <input
                  type="checkbox"
                  checked={h.enabled}
                  onChange={(e) => updateHour(i, "enabled", e.target.checked)}
                  className="accent-[var(--data-success)]"
                />
                <span className="text-sm text-white font-medium">{h.day}</span>
              </label>
              <input
                type="time"
                value={h.open}
                onChange={(e) => updateHour(i, "open", e.target.value)}
                disabled={!h.enabled}
                className="bg-white/10 border border-white/10 rounded px-2 py-1 text-sm text-white disabled:opacity-40"
              />
              <span className="text-[var(--text-secondary)] text-sm">a</span>
              <input
                type="time"
                value={h.close}
                onChange={(e) => updateHour(i, "close", e.target.value)}
                disabled={!h.enabled}
                className="bg-white/10 border border-white/10 rounded px-2 py-1 text-sm text-white disabled:opacity-40"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Zones */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <CardTitle className="text-sm font-semibold text-white flex flex-wrap items-center gap-2">
            <MapPin className="w-4 h-4 text-[var(--data-success-500)]" />
            Zonas de cobertura
          </CardTitle>
          <button
            onClick={addZone}
            className="flex items-center gap-1 px-3 py-1.5 text-xs bg-[var(--data-success-500)]/12 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] rounded-lg hover:bg-primary/10 transition"
          >
            <Plus className="w-3 h-3" /> Agregar zona
          </button>
        </div>
        <div className="space-y-2">
          {config.zones.map((z, i) => (
            <div
              key={i}
              className={`flex items-center gap-3 p-3 rounded-lg border transition ${
                z.enabled
                  ? "bg-white/5 border-white/10"
                  : "bg-white/[0.02] border-white/5 opacity-60"
              }`}
            >
              <input
                type="checkbox"
                checked={z.enabled}
                onChange={(e) => updateZone(i, "enabled", e.target.checked)}
                className="accent-[var(--data-success)]"
              />
              <input
                value={z.name}
                onChange={(e) => updateZone(i, "name", e.target.value)}
                className="flex-1 bg-white/10 border border-white/10 rounded px-2 py-1 text-sm text-white"
                placeholder="Nombre de zona"
              />
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={z.radius}
                  onChange={(e) => updateZone(i, "radius", Number(e.target.value))}
                  className="w-16 bg-white/10 border border-white/10 rounded px-2 py-1 text-sm text-white text-center"
                  min={0}
                />
                <span className="text-xs text-[var(--text-secondary)]">km</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-[var(--text-secondary)]">S/</span>
                <input
                  type="number"
                  value={z.price}
                  onChange={(e) => updateZone(i, "price", Number(e.target.value))}
                  className="w-16 bg-white/10 border border-white/10 rounded px-2 py-1 text-sm text-white text-center"
                  min={0}
                  step={0.5}
                />
              </div>
              <button
                onClick={() => removeZone(i)}
                className="p-1.5 text-[var(--data-error-500)] hover:bg-[var(--data-error-500)]/10 rounded transition"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Free delivery threshold */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4">
        <CardTitle className="text-sm font-semibold text-white mb-3">Delivery gratis</CardTitle>
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-[var(--text-tertiary)]">Monto mínimo para delivery gratis:</span>
          <div className="flex items-center gap-1">
            <span className="text-sm text-[var(--text-secondary)]">S/</span>
            <input
              type="number"
              value={config.freeDeliveryMin}
              onChange={(e) =>
                setConfig((prev) => ({ ...prev, freeDeliveryMin: Number(e.target.value) }))
              }
              className="w-20 bg-white/10 border border-white/10 rounded px-2 py-1 text-sm text-white text-center"
              min={0}
              step={5}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

