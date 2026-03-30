"use client";

import { useState, useEffect, useCallback } from "react";
import { RotateCcw, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ThemeColors = {
  primary:    string;
  secondary:  string;
  background: string;
  text:       string;
};

type Preset = {
  id:     string;
  name:   string;
  colors: ThemeColors;
};

// ── Presets ───────────────────────────────────────────────────────────────────

const PRESETS: Preset[] = [
  {
    id:   "bodega",
    name: "Buleje",
    colors: { primary: "#0f766e", secondary: "#f97316", background: "#f9fafb", text: "#111827" },
  },
  {
    id:   "moderno",
    name: "Moderno",
    colors: { primary: "#2563eb", secondary: "#7c3aed", background: "#f8fafc", text: "#0f172a" },
  },
  {
    id:   "calido",
    name: "Calido",
    colors: { primary: "#c2410c", secondary: "#f59e0b", background: "#fffbeb", text: "#1c1917" },
  },
];

const DEFAULT_COLORS: ThemeColors = PRESETS[0].colors;
const STORAGE_KEY = "bsm_theme_colors";

const CSS_VAR_MAP: Record<keyof ThemeColors, string> = {
  primary:    "--color-primary",
  secondary:  "--color-secondary",
  background: "--color-bg",
  text:       "--color-text",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadColors(): ThemeColors {
  if (typeof window === "undefined") return DEFAULT_COLORS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_COLORS, ...(JSON.parse(raw) as Partial<ThemeColors>) } : DEFAULT_COLORS;
  } catch { return DEFAULT_COLORS; }
}

function applyToDOM(colors: ThemeColors) {
  const root = document.documentElement;
  (Object.entries(colors) as [keyof ThemeColors, string][]).forEach(([key, val]) => {
    root.style.setProperty(CSS_VAR_MAP[key], val);
  });
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

// ── Color swatch ──────────────────────────────────────────────────────────────

function ColorField({
  label,
  description,
  value,
  onChange,
}: {
  label:       string;
  description: string;
  value:       string;
  onChange:    (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="relative shrink-0">
        <div
          className="w-10 h-10 rounded-xl border-2 border-gray-200 dark:border-card-border shadow-sm cursor-pointer"
          style={{ backgroundColor: value }}
        />
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full rounded-xl"
          title={`Cambiar ${label}`}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</p>
        <p className="text-xs text-gray-400 dark:text-gray-500">{description}</p>
      </div>
      <input
        type="text"
        value={value}
        onChange={e => {
          const v = e.target.value;
          if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v);
        }}
        maxLength={7}
        className="w-24 px-2 py-1.5 rounded-lg border border-gray-200 dark:border-card-border bg-white dark:bg-card text-gray-900 dark:text-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#0f766e]/40"
      />
    </div>
  );
}

// ── Live preview ──────────────────────────────────────────────────────────────

function LivePreview({ colors }: { colors: ThemeColors }) {
  return (
    <div
      className="rounded-2xl overflow-hidden border border-gray-200 dark:border-card-border shadow-sm"
      style={{ backgroundColor: colors.background }}
    >
      {/* Fake navbar */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ backgroundColor: colors.primary }}
      >
        <span className="text-white text-sm font-semibold">Buleje</span>
        <div className="flex gap-2">
          <div className="w-2 h-2 rounded-full bg-white/40" />
          <div className="w-2 h-2 rounded-full bg-white/40" />
        </div>
      </div>

      {/* Fake content */}
      <div className="p-4 space-y-3">
        <p className="text-xs font-semibold" style={{ color: colors.text }}>
          Productos destacados
        </p>

        <div className="grid grid-cols-2 gap-2">
          {["Arroz 1kg", "Aceite 1L"].map(name => (
            <div
              key={name}
              className="rounded-xl p-3 border"
              style={{ borderColor: colors.primary + "40", backgroundColor: colors.background }}
            >
              <div
                className="w-full h-10 rounded-lg mb-2"
                style={{ backgroundColor: colors.primary + "20" }}
              />
              <p className="text-xs font-medium truncate" style={{ color: colors.text }}>{name}</p>
              <p className="text-xs" style={{ color: colors.primary }}>S/ 3.50</p>
              <div
                className="mt-2 px-2 py-1 rounded-lg text-center text-xs font-medium text-white"
                style={{ backgroundColor: colors.secondary }}
              >
                Agregar
              </div>
            </div>
          ))}
        </div>

        <div
          className="rounded-xl px-4 py-2 text-center text-xs font-semibold text-white"
          style={{ backgroundColor: colors.primary }}
        >
          Ver todos los productos
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ThemeCustomizer() {
  const [colors, setColors]     = useState<ThemeColors>(DEFAULT_COLORS);
  const [saved, setSaved]       = useState(false);
  const [activePreset, setActivePreset] = useState<string | null>("bodega");

  useEffect(() => {
    const loaded = loadColors();
    setColors(loaded);
    applyToDOM(loaded);
    const match = PRESETS.find(p =>
      Object.entries(p.colors).every(([k, v]) => v === loaded[k as keyof ThemeColors])
    );
    setActivePreset(match?.id ?? null);
  }, []);

  const updateColor = useCallback((key: keyof ThemeColors, value: string) => {
    setColors(prev => {
      const next = { ...prev, [key]: value };
      applyToDOM(next);
      return next;
    });
    setActivePreset(null);
  }, []);

  const applyPreset = (preset: Preset) => {
    setColors(preset.colors);
    applyToDOM(preset.colors);
    setActivePreset(preset.id);
  };

  const handleSave = () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(colors));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setColors(DEFAULT_COLORS);
    applyToDOM(DEFAULT_COLORS);
    setActivePreset("bodega");
  };

  const COLOR_FIELDS: { key: keyof ThemeColors; label: string; description: string }[] = [
    { key: "primary",    label: "Color primario",   description: "Botones, enlaces, navbar" },
    { key: "secondary",  label: "Color secundario",  description: "Destacados, badges, CTA" },
    { key: "background", label: "Fondo",             description: "Fondo principal de la tienda" },
    { key: "text",       label: "Texto",             description: "Color del texto principal" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Personalizacion de Colores</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Cambia los colores de la tienda y ve el resultado en tiempo real
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: controls */}
        <div className="space-y-5">
          {/* Presets */}
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-5 space-y-3">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Presets</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors",
                    activePreset === preset.id
                      ? "border-[#0f766e] bg-[#0f766e]/10 text-[#0f766e] dark:text-[#4a9e78]"
                      : "border-gray-200 dark:border-card-border text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                  )}
                >
                  <div
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: preset.colors.primary }}
                  />
                  {preset.name}
                  {activePreset === preset.id && <Check className="w-3 h-3" />}
                </button>
              ))}
            </div>
          </div>

          {/* Color pickers */}
          <div className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-5 space-y-4">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Colores personalizados</p>
            {COLOR_FIELDS.map(f => (
              <ColorField
                key={f.key}
                label={f.label}
                description={f.description}
                value={colors[f.key]}
                onChange={v => updateColor(f.key, v)}
              />
            ))}
          </div>

          {/* CSS variables info */}
          <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-card-border/50 rounded-xl p-4 space-y-1.5">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-500 uppercase tracking-wide">
              Variables CSS aplicadas
            </p>
            {(Object.entries(CSS_VAR_MAP) as [keyof ThemeColors, string][]).map(([key, varName]) => (
              <div key={key} className="flex items-center gap-2">
                <code className="text-xs text-gray-500 dark:text-gray-500 font-mono flex-1">{varName}</code>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full border border-gray-200" style={{ backgroundColor: colors[key] }} />
                  <code className="text-xs text-gray-600 dark:text-gray-400 font-mono">{colors[key]}</code>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 dark:border-card-border text-gray-600 dark:text-gray-400 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Restablecer
            </button>
            <button
              onClick={handleSave}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors",
                saved ? "bg-emerald-600" : "bg-[#0f766e] hover:bg-[#245a41]"
              )}
            >
              {saved ? <Check className="w-4 h-4" /> : null}
              {saved ? "Guardado" : "Guardar cambios"}
            </button>
          </div>
        </div>

        {/* Right: preview */}
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Vista previa</p>
          <LivePreview colors={colors} />
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
            Vista aproximada de como se vera la tienda
          </p>
        </div>
      </div>
    </div>
  );
}
