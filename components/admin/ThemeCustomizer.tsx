"use client";

import { LoadingState, SectionTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { RotateCcw, Check, Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

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
    colors: { primary: "var(--accent)", secondary: "#ff6b5b", background: "#f9fafb", text: "#111827" },
  },
  {
    id:   "moderno",
    name: "Moderno",
    colors: { primary: "#2563eb", secondary: "#7c3aed", background: "#f8fafc", text: "#0f172a" },
  },
  {
    id:   "calido",
    name: "Calido",
    colors: { primary: "#c2410c", secondary: "#ff6b5b", background: "#fffbeb", text: "#1c1917" },
  },
];

const DEFAULT_COLORS: ThemeColors = PRESETS[0].colors;

const CSS_VAR_MAP: Record<keyof ThemeColors, string> = {
  primary:    "--color-primary",
  secondary:  "--color-secondary",
  background: "--color-bg",
  text:       "--color-text",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function applyToDOM(colors: ThemeColors) {
  const root = document.documentElement;
  (Object.entries(colors) as [keyof ThemeColors, string][]).forEach(([key, val]) => {
    root.style.setProperty(CSS_VAR_MAP[key], val);
  });
}

// Carga colores desde la API /api/settings
async function loadColorsFromDB(): Promise<ThemeColors> {
  try {
    const res = await fetch("/api/settings", { cache: "no-store" });
    if (!res.ok) return DEFAULT_COLORS;
    const data = await res.json() as {
      storeTheme?: {
        primaryColor?: string;
        secondaryColor?: string;
        backgroundColor?: string;
        textColor?: string;
      };
    };
    const t = data.storeTheme ?? {};
    return {
      primary:    t.primaryColor    ?? DEFAULT_COLORS.primary,
      secondary:  t.secondaryColor  ?? DEFAULT_COLORS.secondary,
      background: t.backgroundColor ?? DEFAULT_COLORS.background,
      text:       t.textColor       ?? DEFAULT_COLORS.text,
    };
  } catch {
    return DEFAULT_COLORS;
  }
}

// Guarda colores en la DB via PUT /api/settings
async function saveColorsToDB(colors: ThemeColors): Promise<void> {
  await fetch("/api/settings", {
    method: "PUT",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({
      storeTheme: {
        primaryColor:    colors.primary,
        secondaryColor:  colors.secondary,
        backgroundColor: colors.background,
        textColor:       colors.text,
      },
    }),
  });
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
          className="w-10 h-10 rounded-lg border-2 border-[var(--rule-base)] dark:border-[var(--rule-base)]  cursor-pointer"
          style={{ backgroundColor: value }}
        />
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 cursor-pointer w-full h-full rounded-lg"
          title={`Cambiar ${label}`}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)]">{label}</p>
        <p className="text-xs text-[var(--text-tertiary)]">{description}</p>
      </div>
      <input
        type="text"
        value={value}
        onChange={e => {
          const v = e.target.value;
          if (/^#[0-9a-fA-F]{0,6}$/.test(v)) onChange(v);
        }}
        maxLength={7}
        className="w-24 px-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
      />
    </div>
  );
}

// ── Live preview ──────────────────────────────────────────────────────────────

function LivePreview({ colors }: { colors: ThemeColors }) {
  return (
    <div
      className="rounded-xl overflow-hidden border border-[var(--rule-base)] dark:border-[var(--rule-base)] "
      style={{ backgroundColor: colors.background }}
    >
      {/* Fake navbar */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{ backgroundColor: colors.primary }}
      >
        <span className="text-white text-sm font-semibold">Mi Tienda</span>
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
          className="rounded-lg px-4 py-2 text-center text-xs font-semibold text-white"
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
  const [colors, setColors]           = useState<ThemeColors>(DEFAULT_COLORS);
  const [saved, setSaved]             = useState(false);
  const [saving, setSaving]           = useState(false);
  const [loading, setLoading]         = useState(true);
  const [activePreset, setActivePreset] = useState<string | null>("bodega");

  // Cargar colores desde DB al montar
  useEffect(() => {
    loadColorsFromDB().then(loaded => {
      setColors(loaded);
      applyToDOM(loaded);
      const match = PRESETS.find(p =>
        Object.entries(p.colors).every(([k, v]) => v === loaded[k as keyof ThemeColors])
      );
      setActivePreset(match?.id ?? null);
      setLoading(false);
    });
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

  // Guarda en DB (aplica a todos los visitantes de la tienda)
  const handleSave = async () => {
    setSaving(true);
    try {
      await saveColorsToDB(colors);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } finally {
      setSaving(false);
    }
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

  if (loading) {
    return (
      <LoadingState />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <SectionTitle className="text-lg font-semibold text-[var(--text-primary)]">Personalización de Colores</SectionTitle>
        <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
          Los cambios se guardan en la base de datos y se aplican a todos los visitantes de tu tienda
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: controls */}
        <div className="space-y-5">
          {/* Presets */}
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-5 space-y-3">
            <p className="text-sm font-semibold text-[var(--text-secondary)]">Presets</p>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(preset => (
                <button
                  key={preset.id}
                  onClick={() => applyPreset(preset)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-colors",
                    activePreset === preset.id
                      ? "border-primary bg-primary/10 text-primary dark:text-[#4a9e78]"
                      : "border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
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
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-5 space-y-4">
            <p className="text-sm font-semibold text-[var(--text-secondary)]">Colores personalizados</p>
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
          <div className="bg-[var(--surface-canvas)]/50 border border-[var(--rule-soft)] dark:border-[var(--rule-base)]/50 rounded-xl p-4 space-y-1.5">
            <p className="text-xs font-semibold text-[var(--text-tertiary)]">
              Variables CSS aplicadas
            </p>
            {(Object.entries(CSS_VAR_MAP) as [keyof ThemeColors, string][]).map(([key, varName]) => (
              <div key={key} className="flex items-center gap-2">
                <code className="text-xs text-[var(--text-tertiary)] font-mono flex-1">{varName}</code>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full border border-[var(--rule-base)]" style={{ backgroundColor: colors[key] }} />
                  <code className="text-xs text-[var(--text-secondary)] font-mono">{colors[key]}</code>
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={handleReset}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-[var(--text-secondary)] text-sm hover:bg-[var(--surface-sunken)] transition-colors disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              Restablecer
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-70",
                saved ? "bg-[var(--accent-soft)]" : "bg-primary hover:bg-primary-dark"
              )}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : null}
              {saving ? "Guardando..." : saved ? "Guardado en tienda" : "Guardar en tienda"}
            </button>
          </div>

          {/* Aviso de persistencia */}
          <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-[var(--accent-soft)]" />
            Los colores guardados se aplican automáticamente a todos los visitantes de tu tienda
          </p>
        </div>

        {/* Right: preview */}
        <div className="space-y-3">
          <p className="text-sm font-semibold text-[var(--text-secondary)]">Vista previa</p>
          <LivePreview colors={colors} />
          <p className="text-xs text-[var(--text-tertiary)] text-center">
            Vista aproximada de como se verá la tienda
          </p>
        </div>
      </div>
    </div>
  );
}
