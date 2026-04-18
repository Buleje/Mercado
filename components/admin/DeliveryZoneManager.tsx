"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { MapPin, Save, RefreshCw, Plus, Trash2, Check, X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface DeliveryZone {
  id: string;
  name: string;
  radiusKm: number;
  fee: number;       // S/ delivery fee
  color: string;     // Tailwind class or hex
  active: boolean;
}

// ── Defaults ───────────────────────────────────────────────────────────────────

const DEFAULT_ZONES: DeliveryZone[] = [
  { id: "zone-a", name: "Zona A",  radiusKm: 1, fee: 0, color: "#00B4A6", active: true },
  { id: "zone-b", name: "Zona B",  radiusKm: 3, fee: 3, color: "#f97316", active: true },
  { id: "zone-c", name: "Zona C",  radiusKm: 5, fee: 5, color: "#e63946", active: true },
];

const LS_KEY = "delivery_zones_v2";

// ── Persistence helpers ───────────────────────────────────────────────────────

function loadZones(): DeliveryZone[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as DeliveryZone[];
  } catch { /* ignore */ }
  return DEFAULT_ZONES;
}

function saveZones(zones: DeliveryZone[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(zones));
  } catch { /* ignore */ }
}

// ── Distance calculation ──────────────────────────────────────────────────────

/**
 * Returns the delivery zone for a given distance from the store.
 * Exported so checkout can use it.
 */
export function getZoneForDistance(distanceKm: number, zones: DeliveryZone[]): DeliveryZone | null {
  const sorted = [...zones].filter((z) => z.active).sort((a, b) => a.radiusKm - b.radiusKm);
  return sorted.find((z) => distanceKm <= z.radiusKm) ?? null;
}

/**
 * Haversine distance in km between two lat/lng pairs.
 */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Visual circle map (pure CSS — no leaflet dependency) ─────────────────────

function ZoneMap({ zones }: { zones: DeliveryZone[] }) {
  const maxRadius = Math.max(...zones.map((z) => z.radiusKm), 1);

  return (
    <div className="relative w-full aspect-square max-w-xs mx-auto select-none">
      {/* Outer container */}
      <div className="absolute inset-0 rounded-full bg-[var(--surface-sunken)] border border-[var(--rule-base)]" />

      {/* Zone circles (largest first) */}
      {[...zones]
        .filter((z) => z.active)
        .sort((a, b) => b.radiusKm - a.radiusKm)
        .map((zone) => {
          const pct = (zone.radiusKm / maxRadius) * 100;
          const offset = (100 - pct) / 2;
          return (
            <div
              key={zone.id}
              className="absolute rounded-full border-2 flex items-center justify-center"
              style={{
                top: `${offset}%`,
                left: `${offset}%`,
                width: `${pct}%`,
                height: `${pct}%`,
                borderColor: zone.color,
                backgroundColor: zone.color + "18",
              }}
            >
              <span
                className="text-[length:var(--ts-2xs)] font-semibold px-1"
                style={{ color: zone.color }}
              >
                {zone.name}
              </span>
            </div>
          );
        })}

      {/* Store dot */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-5 h-5 rounded-full bg-[#00B4A6] border-2 border-white dark:border-[var(--rule-base)] flex items-center justify-center">
          <MapPin size={10} className="text-white" />
        </div>
      </div>
    </div>
  );
}

// ── Editable row ──────────────────────────────────────────────────────────────

interface ZoneRowProps {
  zone: DeliveryZone;
  onChange: (updated: DeliveryZone) => void;
  onDelete: (id: string) => void;
}

function ZoneRow({ zone, onChange, onDelete }: ZoneRowProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<DeliveryZone>(zone);

  const handleSave = () => {
    if (!draft.name.trim()) return;
    onChange(draft);
    setEditing(false);
  };

  const handleCancel = () => {
    setDraft(zone);
    setEditing(false);
  };

  if (editing) {
    return (
      <tr className="bg-[#00B4A6]/5 dark:bg-[#00B4A6]/10">
        <td className="px-3 py-2">
          <input
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            className="w-full px-2 py-1 text-sm rounded border border-[#00B4A6] bg-[var(--surface-raised)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[#00B4A6]"
          />
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0.1}
              max={50}
              step={0.5}
              value={draft.radiusKm}
              onChange={(e) => setDraft({ ...draft, radiusKm: parseFloat(e.target.value) || 0 })}
              className="w-20 px-2 py-1 text-sm rounded border border-[var(--rule-base)] dark:border-gray-600 bg-[var(--surface-raised)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[#00B4A6]"
            />
            <span className="text-xs text-[var(--text-secondary)]">km</span>
          </div>
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1">
            <span className="text-xs text-[var(--text-secondary)]">S/</span>
            <input
              type="number"
              min={0}
              step={0.5}
              value={draft.fee}
              onChange={(e) => setDraft({ ...draft, fee: parseFloat(e.target.value) || 0 })}
              className="w-20 px-2 py-1 text-sm rounded border border-[var(--rule-base)] dark:border-gray-600 bg-[var(--surface-raised)] text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-[#00B4A6]"
            />
          </div>
        </td>
        <td className="px-3 py-2">
          <input
            type="color"
            value={draft.color}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
            className="w-8 h-8 rounded cursor-pointer border border-[var(--rule-base)]"
          />
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-1">
            <button
              onClick={handleSave}
              className="p-1.5 rounded-lg bg-[#00B4A6] text-white hover:bg-[#235c42] transition-colors"
              aria-label="Guardar"
            >
              <Check size={13} />
            </button>
            <button
              onClick={handleCancel}
              className="p-1.5 rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              aria-label="Cancelar"
            >
              <X size={13} />
            </button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-[var(--surface-sunken)]/50 transition-colors">
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: zone.color }}
          />
          <span className="text-sm font-medium text-[var(--text-primary)]">{zone.name}</span>
        </div>
      </td>
      <td className="px-3 py-2.5 text-sm text-[var(--text-secondary)]">{zone.radiusKm} km</td>
      <td className="px-3 py-2.5 text-sm text-[var(--text-secondary)]">
        {zone.fee === 0 ? (
          <span className="text-[#00B4A6] dark:text-[var(--data-success)] font-medium">Gratis</span>
        ) : (
          `S/ ${zone.fee.toFixed(2)}`
        )}
      </td>
      <td className="px-3 py-2.5">
        <button
          onClick={() => onChange({ ...zone, active: !zone.active })}
          className={cn(
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-[var(--dur-base)]",
            zone.active ? "bg-[#00B4A6]" : "bg-gray-300 dark:bg-gray-600"
          )}
          role="switch"
          aria-checked={zone.active}
        >
          <span
            className={cn(
              "inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform duration-[var(--dur-base)]",
              zone.active ? "translate-x-4" : "translate-x-1"
            )}
          />
        </button>
      </td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setEditing(true)}
            className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[#00B4A6] hover:bg-[#00B4A6]/10 transition-colors"
            aria-label="Editar"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <button
            onClick={() => onDelete(zone.id)}
            className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error)] hover:bg-[var(--data-error-50)] dark:hover:bg-red-950/30 transition-colors"
            aria-label="Eliminar zona"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DeliveryZoneManager() {
  const [zones, setZones] = useState<DeliveryZone[]>(DEFAULT_ZONES);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    setZones(loadZones());
  }, []);

  const updateZone = useCallback((updated: DeliveryZone) => {
    setZones((prev) => prev.map((z) => (z.id === updated.id ? updated : z)));
  }, []);

  const deleteZone = useCallback((id: string) => {
    setZones((prev) => prev.filter((z) => z.id !== id));
  }, []);

  const addZone = useCallback(() => {
    const newZone: DeliveryZone = {
      id: `zone-${Date.now()}`,
      name: `Zona ${String.fromCharCode(65 + zones.length)}`,
      radiusKm: Math.max(...zones.map((z) => z.radiusKm)) + 2,
      fee: 5,
      color: "#6366f1",
      active: true,
    };
    setZones((prev) => [...prev, newZone]);
  }, [zones]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    saveZones(zones);

    // Try to persist to API as well
    try {
      await fetch("/api/admin/delivery-zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(zones),
      });
    } catch {
      // localStorage is the fallback, that's fine
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [zones]);

  const handleReset = useCallback(() => {
    setZones(DEFAULT_ZONES);
    saveZones(DEFAULT_ZONES);
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <CardTitle className="text-base font-semibold text-[var(--text-primary)]">Zonas de delivery</CardTitle>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
            Define los radios de cobertura y tarifas
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:hover:text-gray-200 hover:bg-[var(--surface-sunken)] rounded-lg transition-colors"
          >
            <RefreshCw size={14} />
            Restablecer
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-[var(--dur-fast)]",
              saved
                ? "bg-[var(--accent-soft)] text-white"
                : "bg-[#00B4A6] hover:bg-[#235c42] text-white",
              saving && "opacity-70 cursor-not-allowed"
            )}
          >
            {saving ? (
              <RefreshCw size={14} className="animate-spin" />
            ) : saved ? (
              <Check size={14} />
            ) : (
              <Save size={14} />
            )}
            {saved ? "Guardado" : "Guardar"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
        {/* Visual map */}
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
          <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-4 flex items-center gap-2">
            <MapPin size={14} className="text-[#00B4A6]" />
            Vista de cobertura
          </h4>
          <ZoneMap zones={zones} />
          <p className="text-xs text-[var(--text-tertiary)] text-center mt-3">
            Las zonas muestran el radio de cobertura desde la tienda
          </p>
        </div>

        {/* Zone table */}
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--rule-base)] flex items-center justify-between">
            <h4 className="text-sm font-medium text-[var(--text-secondary)]">Configuracion de zonas</h4>
            <button
              onClick={addZone}
              className="flex items-center gap-1 text-xs text-[#00B4A6] hover:text-[#235c42] font-medium"
            >
              <Plus size={13} />
              Agregar zona
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[var(--rule-base)]">
                  <th className="px-3 py-2 text-xs font-medium text-[var(--text-tertiary)]">Zona</th>
                  <th className="px-3 py-2 text-xs font-medium text-[var(--text-tertiary)]">Radio</th>
                  <th className="px-3 py-2 text-xs font-medium text-[var(--text-tertiary)]">Tarifa</th>
                  <th className="px-3 py-2 text-xs font-medium text-[var(--text-tertiary)]">Activa</th>
                  <th className="px-3 py-2 text-xs font-medium text-[var(--text-tertiary)]">Acc.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {zones.map((zone) => (
                  <ZoneRow
                    key={zone.id}
                    zone={zone}
                    onChange={updateZone}
                    onDelete={deleteZone}
                  />
                ))}
                {zones.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
                      No hay zonas configuradas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
