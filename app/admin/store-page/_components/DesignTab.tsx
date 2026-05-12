"use client";

/**
 * DesignTab — editor de personalizacion completa de la pagina publica.
 * Tipo Wix/Wordpress: tipografia · colores · radios · sombras · botones ·
 * densidad. Mas plantillas pre-armadas y sugerencias IA contextuales.
 *
 * Persiste a /api/store-page/design (DB).
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import {
  Loader2, Save, Palette, Type, Sparkles, Wand2, Check,
  Layers, Box, Sun, Square, Circle,
  Layout, Eye,
} from "@buleje/design-system/icons";
import AdminTabShell from "../../_components/_shared/AdminTabShell";
import { ADMIN_TOKENS } from "../../_components/_shared/admin-tokens";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  DEFAULT_DESIGN_TOKENS,
  DESIGN_PRESETS,
  FONT_FAMILIES,
  suggestPresets,
  tokensToCssVars,
  type DesignTokens,
  type FontFamily,
  type BorderRadius,
  type ShadowStyle,
  type ButtonStyle,
  type Density,
  type HeadingSize,
  type DesignPreset,
} from "@/lib/store-design-tokens";

export default function DesignTab() {
  const [tokens, setTokens] = useState<DesignTokens>(DEFAULT_DESIGN_TOKENS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAI, setShowAI] = useState(false);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/store-page/design");
      if (res.ok) {
        const json = (await res.json()) as { design: DesignTokens };
        setTokens({ ...DEFAULT_DESIGN_TOKENS, ...json.design });
      }
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/store-page/design", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(tokens),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: unknown };
        setError(typeof j.error === "string" ? j.error : "Error al guardar");
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    } catch {
      setError("Error de red");
    } finally {
      setSaving(false);
    }
  }

  const update = useCallback(<K extends keyof DesignTokens>(key: K, value: DesignTokens[K]) => {
    setTokens((t) => ({ ...t, [key]: value, presetId: undefined }));
  }, []);

  const applyPreset = useCallback((preset: DesignPreset) => {
    setTokens(preset.tokens);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-[var(--text-tertiary)]">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <AdminTabShell
      title="Diseño de tu tienda pública"
      description="Personalizá tipografía, colores, radios, sombras y botones. Cambiás → ves preview a la derecha → guardás y aplica."
      icon={Palette}
    >
      {/* Acciones rápidas */}
      <section className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-sunken)] px-3 py-1.5 text-sm font-bold">
            {tokens.presetId ? (
              <>
                <Sparkles className="w-3.5 h-3.5 text-[var(--accent)]" strokeWidth={2.5} />
                Plantilla activa: <span className="text-[var(--accent)]">{DESIGN_PRESETS.find((p) => p.id === tokens.presetId)?.label ?? "—"}</span>
              </>
            ) : (
              <>
                <Wand2 className="w-3.5 h-3.5" strokeWidth={2.5} />
                Diseño custom
              </>
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setShowAI((s) => !s)}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white px-4 h-10 text-sm font-black hover:opacity-90 transition-all shadow-md"
        >
          <Sparkles className="w-4 h-4" strokeWidth={2.5} />
          Sugerencias con IA
        </button>
      </section>

      {/* Sugerencias IA (modal inline) */}
      {showAI && (
        <AISuggestions
          onApply={(preset) => { applyPreset(preset); setShowAI(false); }}
          onClose={() => setShowAI(false)}
        />
      )}

      {/* Grid 2-col: form + preview */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
        {/* ── Form ── */}
        <div className="space-y-4">
          {/* Plantillas pre-armadas */}
          <Section title="Plantillas listas" icon={<Layers className="w-4 h-4" />} description="6 estilos completos. Click → aplica todo de una.">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {DESIGN_PRESETS.map((preset) => {
                const active = tokens.presetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className={`group text-left rounded-xl border-2 p-3 transition-all hover:-translate-y-0.5 ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-md"
                        : "border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--accent)]/40 hover:shadow-md"
                    }`}
                  >
                    {/* Mini preview con los colores del preset */}
                    <div className="flex gap-1 mb-2.5">
                      <span className="h-6 flex-1 rounded-md" style={{ background: preset.tokens.primaryColor }} />
                      <span className="h-6 flex-1 rounded-md" style={{ background: preset.tokens.accentColor }} />
                      <span className="h-6 flex-1 rounded-md border border-[var(--rule-base)]" style={{ background: preset.tokens.backgroundColor }} />
                    </div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-base">{preset.emoji}</span>
                      {active && <Check className="w-4 h-4 text-[var(--accent)]" strokeWidth={3} />}
                    </div>
                    <p className="text-sm font-black text-[var(--text-primary)] leading-tight">{preset.label}</p>
                    <p className="mt-1 text-[10px] text-[var(--text-tertiary)] leading-snug line-clamp-2">{preset.description}</p>
                  </button>
                );
              })}
            </div>
          </Section>

          {/* Tipografía */}
          <Section title="Tipografía" icon={<Type className="w-4 h-4" />} description="Familia + tamaño de títulos.">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
              {(Object.keys(FONT_FAMILIES) as FontFamily[]).map((f) => {
                const meta = FONT_FAMILIES[f];
                const active = tokens.fontFamily === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => update("fontFamily", f)}
                    className={`rounded-lg border-2 p-3 text-left transition-all ${
                      active ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--rule-mid)]"
                    }`}
                  >
                    <p className="text-base font-black" style={{ fontFamily: meta.stack }}>
                      {meta.label}
                    </p>
                    <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5 truncate">{meta.vibe}</p>
                  </button>
                );
              })}
            </div>
            <PillGroup
              label="Tamaño de títulos"
              value={tokens.headingSize}
              options={[
                { id: "compact",  label: "Compacto" },
                { id: "regular",  label: "Regular" },
                { id: "large",    label: "Grande" },
                { id: "huge",     label: "Gigante" },
              ] as Array<{ id: HeadingSize; label: string }>}
              onChange={(v) => update("headingSize", v)}
            />
          </Section>

          {/* Colores */}
          <Section title="Paleta de colores" icon={<Palette className="w-4 h-4" />} description="5 colores que definen tu marca.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ColorPicker label="Primario"    value={tokens.primaryColor}    onChange={(v) => update("primaryColor", v)} hint="Botones, links, acentos" />
              <ColorPicker label="Secundario"  value={tokens.secondaryColor}  onChange={(v) => update("secondaryColor", v)} hint="Detalles, headers" />
              <ColorPicker label="Acento"      value={tokens.accentColor}     onChange={(v) => update("accentColor", v)} hint="Promos, badges, highlights" />
              <ColorPicker label="Fondo"       value={tokens.backgroundColor} onChange={(v) => update("backgroundColor", v)} hint="Color base del sitio" />
              <ColorPicker label="Texto"       value={tokens.textColor}       onChange={(v) => update("textColor", v)} hint="Color principal del texto" />
            </div>
          </Section>

          {/* Forma & sombras */}
          <Section title="Estilo visual" icon={<Box className="w-4 h-4" />} description="Cuán redondeado y con sombra se ve todo.">
            <PillGroup
              label="Bordes redondeados"
              value={tokens.borderRadius}
              options={[
                { id: "square",  label: "Cuadrado",  icon: <Square className="w-3 h-3" /> },
                { id: "soft",    label: "Suave" },
                { id: "rounded", label: "Redondo",   icon: <Circle className="w-3 h-3" /> },
                { id: "pill",    label: "Pill",      icon: <Circle className="w-3 h-3" /> },
              ] as Array<{ id: BorderRadius; label: string; icon?: React.ReactNode }>}
              onChange={(v) => update("borderRadius", v)}
            />
            <PillGroup
              label="Sombras"
              value={tokens.shadowStyle}
              options={[
                { id: "none",   label: "Ninguna" },
                { id: "soft",   label: "Suave" },
                { id: "medium", label: "Media" },
                { id: "strong", label: "Fuerte" },
              ] as Array<{ id: ShadowStyle; label: string }>}
              onChange={(v) => update("shadowStyle", v)}
            />
          </Section>

          {/* Botones */}
          <Section title="Botones" icon={<Sun className="w-4 h-4" />} description="Cómo se ven los CTAs de toda la página.">
            <PillGroup
              label="Estilo"
              value={tokens.buttonStyle}
              options={[
                { id: "solid",    label: "Sólido" },
                { id: "outline",  label: "Contorno" },
                { id: "gradient", label: "Gradiente" },
                { id: "minimal",  label: "Minimal" },
              ] as Array<{ id: ButtonStyle; label: string }>}
              onChange={(v) => update("buttonStyle", v)}
            />
            <div className="mt-3 p-4 rounded-xl bg-[var(--surface-sunken)] flex items-center justify-center">
              <button type="button" className="tenant-button inline-flex items-center gap-2 px-5 h-11 text-sm font-black" style={tokensToCssVars(tokens) as React.CSSProperties}>
                Botón ejemplo
              </button>
            </div>
          </Section>

          {/* Distribución */}
          <Section title="Distribución del contenido" icon={<Layout className="w-4 h-4" />} description="Cuánto aire entre secciones.">
            <PillGroup
              label="Densidad"
              value={tokens.density}
              options={[
                { id: "compact",  label: "Compacta" },
                { id: "regular",  label: "Regular" },
                { id: "spacious", label: "Espaciosa" },
              ] as Array<{ id: Density; label: string }>}
              onChange={(v) => update("density", v)}
            />
          </Section>
        </div>

        {/* ── Preview sticky ── */}
        <div className="lg:sticky lg:top-4 self-start">
          <DesignPreview tokens={tokens} />
        </div>
      </div>

      {/* Sticky Save bar */}
      <div className="sticky bottom-4 flex items-center justify-end gap-3 p-4 rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] shadow-lg">
        {error && <span className="text-sm text-[var(--data-error-500)]">{error}</span>}
        {saved && <span className="text-sm text-[var(--data-success-500)] font-semibold">Diseño guardado · refrescá /t/[slug]</span>}
        <button
          onClick={save}
          disabled={saving}
          className={ADMIN_TOKENS.btnPrimary}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Guardar diseño
        </button>
      </div>
    </AdminTabShell>
  );
}

// ── Sub-componente: Section ────────────────────────────────────────────
function Section({ title, icon, description, children }: { title: string; icon: React.ReactNode; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div className="flex items-start gap-3 mb-4">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-black text-[var(--text-primary)] leading-tight">{title}</h3>
          {description && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="space-y-3">
        {children}
      </div>
    </section>
  );
}

// ── ColorPicker ────────────────────────────────────────────────────────
function ColorPicker({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-[var(--text-primary)] mb-1.5">{label}</span>
      <div className="flex gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-14 rounded-lg border-2 border-[var(--rule-base)] cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            const v = e.target.value;
            if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
          }}
          maxLength={7}
          className="flex-1 h-11 px-3 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-mono text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
        />
      </div>
      {hint && <p className="text-[10px] text-[var(--text-tertiary)] mt-1">{hint}</p>}
    </label>
  );
}

// ── PillGroup (radio horizontal) ───────────────────────────────────────
function PillGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ id: T; label: string; icon?: React.ReactNode }>;
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="text-xs font-bold text-[var(--text-primary)] mb-2">{label}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        {options.map((opt) => {
          const active = value === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChange(opt.id)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 h-9 text-xs font-black border-2 transition-all ${
                active
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                  : "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:border-[var(--text-tertiary)]"
              }`}
            >
              {opt.icon}
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── DesignPreview (sticky right column) ────────────────────────────────
function DesignPreview({ tokens }: { tokens: DesignTokens }) {
  const style = useMemo(() => tokensToCssVars(tokens) as React.CSSProperties, [tokens]);
  const font = FONT_FAMILIES[tokens.fontFamily];

  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] overflow-hidden shadow-lg">
      <div className="px-4 py-2.5 bg-[var(--surface-raised)] border-b border-[var(--rule-base)] flex items-center gap-2">
        <Eye className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
        <span className="text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)]">Vista previa en vivo</span>
      </div>
      <div className="p-5 tenant-theme" style={{ ...style, fontFamily: font.stack, color: tokens.textColor, background: tokens.backgroundColor }}>
        {/* Mini hero */}
        <div className="mb-4">
          <p className="text-[10px] font-black uppercase tracking-wider mb-1.5" style={{ color: tokens.primaryColor }}>
            Tu negocio
          </p>
          <h1 className="font-black leading-tight tracking-tight" style={{ fontSize: "1.5rem", color: tokens.textColor }}>
            Mi tienda pública
          </h1>
          <p className="text-xs mt-1" style={{ color: `${tokens.textColor}aa` }}>
            Así se ve tu landing con esta combinación de estilo.
          </p>
        </div>
        {/* Card mock */}
        <div
          className="p-3 mb-3"
          style={{
            background: tokens.backgroundColor === "#ffffff" ? "#f8fafc" : `${tokens.primaryColor}10`,
            borderRadius: tokens.borderRadius === "square" ? "0" : tokens.borderRadius === "soft" ? "6px" : tokens.borderRadius === "rounded" ? "14px" : "9999px",
            boxShadow: tokens.shadowStyle === "none" ? "none" : tokens.shadowStyle === "soft" ? "0 1px 3px rgba(0,0,0,0.06)" : tokens.shadowStyle === "medium" ? "0 4px 12px rgba(0,0,0,0.10)" : "0 10px 24px rgba(0,0,0,0.18)",
          }}
        >
          <p className="text-xs font-black" style={{ color: tokens.textColor }}>Producto destacado</p>
          <p className="text-[10px] mt-0.5" style={{ color: `${tokens.textColor}99` }}>S/ 24.50</p>
        </div>
        {/* Button mocks (3 estilos) */}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            className="px-4 h-10 text-xs font-black inline-flex items-center justify-center"
            style={{
              borderRadius: tokens.borderRadius === "square" ? "0" : tokens.borderRadius === "soft" ? "6px" : tokens.borderRadius === "rounded" ? "14px" : "9999px",
              background: tokens.buttonStyle === "solid" ? tokens.primaryColor : tokens.buttonStyle === "gradient" ? `linear-gradient(135deg, ${tokens.primaryColor}, ${tokens.accentColor})` : "transparent",
              color: tokens.buttonStyle === "outline" || tokens.buttonStyle === "minimal" ? tokens.primaryColor : "#fff",
              border: tokens.buttonStyle === "outline" ? `2px solid ${tokens.primaryColor}` : tokens.buttonStyle === "minimal" ? `1px solid ${tokens.primaryColor}33` : "none",
              boxShadow: tokens.shadowStyle === "none" ? "none" : `0 4px 12px ${tokens.primaryColor}33`,
              fontFamily: font.stack,
            }}
          >
            Pedir ahora
          </button>
          <button
            type="button"
            className="px-4 h-10 text-xs font-bold inline-flex items-center justify-center"
            style={{
              borderRadius: tokens.borderRadius === "square" ? "0" : tokens.borderRadius === "soft" ? "6px" : tokens.borderRadius === "rounded" ? "14px" : "9999px",
              background: "transparent",
              color: tokens.textColor,
              border: `1px solid ${tokens.textColor}33`,
              fontFamily: font.stack,
            }}
          >
            Ver más
          </button>
        </div>
        {/* Color row */}
        <div className="mt-4 flex gap-1.5">
          <span className="h-6 flex-1 rounded" style={{ background: tokens.primaryColor }} />
          <span className="h-6 flex-1 rounded" style={{ background: tokens.secondaryColor }} />
          <span className="h-6 flex-1 rounded" style={{ background: tokens.accentColor }} />
        </div>
      </div>
    </div>
  );
}

// ── Sugerencias IA ─────────────────────────────────────────────────────
function AISuggestions({
  onApply,
  onClose,
}: {
  onApply: (preset: DesignPreset) => void;
  onClose: () => void;
}) {
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [suggestions, setSuggestions] = useState<DesignPreset[]>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const generate = () => {
    if (!businessName.trim()) return;
    const results = suggestPresets({ businessName, businessType });
    setSuggestions(results);
    setHasSearched(true);
  };

  return (
    <div className="rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-950/40 dark:to-fuchsia-950/40 p-5 space-y-4">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-600 text-white shadow-lg">
          <Wand2 className="w-5 h-5" strokeWidth={2.25} />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-black text-[var(--text-primary)]">Sugerencias con IA</h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Contanos qué vendés y armamos 3 estilos que matchean con tu marca.
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
          Cerrar
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <label className="block">
          <span className="block text-xs font-bold text-[var(--text-primary)] mb-1.5">Nombre del negocio</span>
          <input
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="Pizza Pucallpa"
            className="w-full h-10 px-3 rounded-lg border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] text-sm focus:outline-none focus:border-violet-500"
          />
        </label>
        <label className="block">
          <span className="block text-xs font-bold text-[var(--text-primary)] mb-1.5">Tipo de negocio</span>
          <input
            value={businessType}
            onChange={(e) => setBusinessType(e.target.value)}
            placeholder="pizzeria · bodega · pollería · café"
            className="w-full h-10 px-3 rounded-lg border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] text-sm focus:outline-none focus:border-violet-500"
          />
        </label>
      </div>
      <button
        type="button"
        onClick={generate}
        disabled={!businessName.trim()}
        className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white h-11 text-sm font-black shadow-md disabled:opacity-40 hover:opacity-90 transition-all"
      >
        <Sparkles className="w-4 h-4" strokeWidth={2.5} />
        Generar 3 sugerencias
      </button>

      {hasSearched && suggestions.length > 0 && (
        <div className="space-y-2 pt-2">
          <p className="text-[10px] font-black uppercase tracking-wider text-[var(--text-tertiary)]">
            Top 3 estilos para vos
          </p>
          <div className="grid grid-cols-1 gap-2">
            {suggestions.map((preset, idx) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => onApply(preset)}
                className="flex items-center gap-3 rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] p-3 hover:border-violet-500 hover:shadow-md transition-all text-left"
              >
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-lg text-2xl shrink-0" style={{ background: `${preset.tokens.primaryColor}15` }}>
                  {preset.emoji}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-black text-[var(--text-primary)] truncate">{preset.label}</p>
                    {idx === 0 && (
                      <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white">Top</span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] truncate">{preset.description}</p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <span className="h-7 w-7 rounded-md" style={{ background: preset.tokens.primaryColor }} />
                  <span className="h-7 w-7 rounded-md" style={{ background: preset.tokens.accentColor }} />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
