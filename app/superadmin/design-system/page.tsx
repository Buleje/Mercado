"use client";

/**
 * /superadmin/design-system — Centro de Diseño Heredable
 *
 * 3 vistas:
 *   - Galería       → presets oficiales + presets propios. Click activa, click "Editar" abre editor.
 *   - Editor live   → controles (Identidad, Colores, Tipografía, Bordes, Sombras, Botones, Motion)
 *                     con preview en vivo del shell admin a la derecha.
 *   - Mis presets   → library de presets guardados.
 *
 * IMPORTANTE: Este page vive dentro del SUPERADMIN, así que usa la paleta
 * de plataforma (--accent, --ls-wider, font-black) y NO los tokens
 * de negocio que se editan acá. Los tokens del negocio aparecen solo en
 * el `<PreviewPane>` (sandbox visual) y se aplican al admin del negocio
 * vía `<DesignTokensProvider>` envolviendo `app/admin/layout.tsx`.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Check,
  Loader2,
  Sparkles,
  Eye,
  Palette,
  Pencil,
  Plus,
  Save,
  Trash2,
  Copy,
  RotateCcw,
  Zap,
  Type,
  Square,
  X,
  AlertTriangle,
} from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  DESIGN_PRESETS,
  type DesignTokens,
  tokensToCssVars,
  cloneTokens,
  blankCustomPreset,
  slugify,
  validateTokens,
} from "@/lib/design-presets";

interface ApiResponse {
  presets: DesignTokens[];
  savedPresets: DesignTokens[];
  active: {
    slug: string;
    customTokens: DesignTokens | null;
    updatedAt: string | null;
    updatedBy: string | null;
  };
}

type View = "gallery" | "editor" | "library";

export default function DesignSystemPage() {
  const [oficialPresets, setOficialPresets] = useState<DesignTokens[]>([...DESIGN_PRESETS]);
  const [savedPresets, setSavedPresets] = useState<DesignTokens[]>([]);
  const [activeSlug, setActiveSlug] = useState<string>(DESIGN_PRESETS[0].meta.slug);
  const [updatedBy, setUpdatedBy] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingSlug, setSavingSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);
  const [view, setView] = useState<View>("gallery");
  const [editorTokens, setEditorTokens] = useState<DesignTokens | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/superadmin/design-system", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) throw new Error("fetch failed");
      const d: ApiResponse = await res.json();
      setOficialPresets(d.presets ?? [...DESIGN_PRESETS]);
      setSavedPresets(d.savedPresets ?? []);
      setActiveSlug(d.active.slug);
      setUpdatedAt(d.active.updatedAt);
      setUpdatedBy(d.active.updatedBy);
    } catch {
      setError("No se pudo cargar la configuración.");
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    reload().finally(() => setLoading(false));
  }, [reload]);

  const flash = useCallback((msg: string) => {
    setSavedFlash(msg);
    setTimeout(() => setSavedFlash(null), 2500);
  }, []);

  const activate = useCallback(
    async (slug: string) => {
      setSavingSlug(slug);
      setError(null);
      try {
        const res = await fetch("/api/superadmin/design-system", {
          method: "PUT",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ slug }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error ?? "Error al activar el preset");
        }
        setActiveSlug(slug);
        flash("Aplicado al admin");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error inesperado");
      } finally {
        setSavingSlug(null);
      }
    },
    [flash],
  );

  const activateCustom = useCallback(
    async (tokens: DesignTokens) => {
      const errors = validateTokens(tokens);
      if (errors.length > 0) {
        setError(errors.join(" · "));
        return;
      }
      setSavingSlug(tokens.meta.slug);
      setError(null);
      try {
        const res = await fetch("/api/superadmin/design-system", {
          method: "PUT",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ customTokens: tokens }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error ?? "Error al activar");
        }
        setActiveSlug(tokens.meta.slug);
        flash(`Aplicado · ${tokens.meta.name}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error inesperado");
      } finally {
        setSavingSlug(null);
      }
    },
    [flash],
  );

  const savePreset = useCallback(
    async (tokens: DesignTokens) => {
      const errors = validateTokens(tokens);
      if (errors.length > 0) {
        setError(errors.join(" · "));
        return false;
      }
      setError(null);
      try {
        const res = await fetch("/api/superadmin/design-system", {
          method: "POST",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ mode: "save-preset", tokens }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error ?? "No se pudo guardar");
        }
        await reload();
        flash(`Guardado · ${tokens.meta.name}`);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error inesperado");
        return false;
      }
    },
    [flash, reload],
  );

  const deletePreset = useCallback(
    async (slug: string) => {
      if (!confirm("¿Eliminar este preset? No se puede deshacer.")) return;
      try {
        const res = await fetch("/api/superadmin/design-system", {
          method: "POST",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ mode: "delete-saved-preset", slug }),
        });
        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error ?? "No se pudo eliminar");
        }
        await reload();
        flash("Preset eliminado");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error inesperado");
      }
    },
    [flash, reload],
  );

  const openEditor = useCallback((base: DesignTokens) => {
    setEditorTokens(cloneTokens(base));
    setView("editor");
  }, []);

  const startNew = useCallback(() => {
    setEditorTokens(blankCustomPreset(`Mi preset ${savedPresets.length + 1}`));
    setView("editor");
  }, [savedPresets.length]);

  const allPresets = useMemo(
    () => [...oficialPresets, ...savedPresets],
    [oficialPresets, savedPresets],
  );
  const activePreset = useMemo(
    () => allPresets.find((p) => p.meta.slug === activeSlug) ?? oficialPresets[0],
    [allPresets, activeSlug, oficialPresets],
  );

  // Loading skeleton — match con el patrón superadmin
  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--surface-canvas)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)]">
      {/* ── Hero canónico ───────────────────────────────────────── */}
      <header className="border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3.5 min-w-0 flex-1">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
                <Palette className="h-6 w-6" strokeWidth={1.75} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                  Plataforma · Centro de diseño
                </p>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  Diseño heredable
                </h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
                  Personalizá colores, tipografía, bordes, sombras, botones y animaciones. Todo lo
                  que cambies se hereda en vivo al{" "}
                  <strong className="text-[var(--text-primary)]">panel admin de los negocios</strong>.
                </p>
                {activePreset && (
                  <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-1">
                    <span
                      className="inline-block h-2 w-2 rounded-full shrink-0"
                      style={{ background: activePreset.colors.accent }}
                    />
                    <span className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Activo
                    </span>
                    <span className="text-xs font-extrabold text-[var(--text-primary)]">
                      {activePreset.meta.name}
                    </span>
                    {updatedAt && (
                      <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                        ·{" "}
                        {new Date(updatedAt).toLocaleString("es-PE", {
                          dateStyle: "short",
                          timeStyle: "short",
                        })}
                        {updatedBy ? ` · ${updatedBy}` : ""}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-stretch gap-2 flex-wrap shrink-0">
              {/* StatPills canónicos */}
              <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 py-2 min-w-[88px]">
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
                  Oficiales
                </p>
                <p className="font-display text-xl font-extrabold tabular-nums tracking-tight mt-1 leading-none text-[var(--text-primary)]">
                  {oficialPresets.length}
                </p>
              </div>
              <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 py-2 min-w-[88px]">
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
                  Mis presets
                </p>
                <p className="font-display text-xl font-extrabold tabular-nums tracking-tight mt-1 leading-none text-[var(--accent)]">
                  {savedPresets.length}
                </p>
              </div>
              {savedFlash && (
                <span className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 px-3.5 py-2 text-xs font-extrabold uppercase tracking-wider text-[var(--data-success-500)]">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} /> {savedFlash}
                </span>
              )}
              <button
                type="button"
                onClick={startNew}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-extrabold uppercase tracking-wider text-white shadow-md shadow-[var(--accent)]/25 transition hover:brightness-110 active:scale-[0.99]"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                Crear preset
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">
        {/* Tabs */}
        <nav className="flex flex-wrap items-center gap-1 border-b-2 border-[var(--rule-base)]">
          {(
            [
              { key: "gallery", label: "Galería", icon: Palette, count: oficialPresets.length },
              { key: "editor", label: "Editor", icon: Pencil },
              { key: "library", label: "Mis presets", icon: Sparkles, count: savedPresets.length },
            ] as Array<{ key: View; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; count?: number }>
          ).map(({ key, label, icon: Icon, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={`inline-flex items-center gap-2 px-5 h-12 -mb-[2px] border-b-4 text-sm font-extrabold uppercase tracking-wider transition-colors ${
                view === key
                  ? "border-[var(--accent)] text-[var(--accent)]"
                  : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={2.5} />
              {label}
              {typeof count === "number" && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-extrabold normal-case tracking-normal ${
                    view === key
                      ? "bg-[var(--accent)]/10 text-[var(--accent)]"
                      : "bg-[var(--rule-base)] text-[var(--text-tertiary)]"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          ))}
        </nav>

        {error && (
          <div className="rounded-xl border-2 border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/10 px-4 py-3 text-sm font-bold text-[var(--data-error-700)] dark:text-red-300 inline-flex items-center gap-2 w-full">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span className="flex-1">{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-[var(--data-error-700)] dark:text-red-300 hover:opacity-70"
              aria-label="Cerrar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {view === "gallery" ? (
          <GalleryView
            oficialPresets={oficialPresets}
            savedPresets={savedPresets}
            activeSlug={activeSlug}
            savingSlug={savingSlug}
            onActivate={activate}
            onEdit={openEditor}
          />
        ) : view === "library" ? (
          <LibraryView
            savedPresets={savedPresets}
            activeSlug={activeSlug}
            savingSlug={savingSlug}
            onActivate={activate}
            onEdit={openEditor}
            onDuplicate={(t) =>
              openEditor({
                ...cloneTokens(t),
                meta: {
                  ...t.meta,
                  name: `${t.meta.name} copia`,
                  slug: slugify(`${t.meta.name} copia`),
                  author: "custom",
                },
              })
            }
            onDelete={deletePreset}
            onCreate={startNew}
          />
        ) : (
          <EditorView
            tokens={editorTokens ?? blankCustomPreset("Mi preset")}
            onChange={setEditorTokens}
            saving={!!savingSlug}
            onApply={() => editorTokens && activateCustom(editorTokens)}
            onSave={async () => {
              if (!editorTokens) return;
              const ok = await savePreset(editorTokens);
              if (ok) setView("library");
            }}
            onReset={() => setEditorTokens(cloneTokens(activePreset))}
          />
        )}
      </div>
    </main>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// SHARED CARD: PRESET (gallery + library lo reusan)
// ════════════════════════════════════════════════════════════════════════════

function PresetCard({
  preset,
  isActive,
  isSaving,
  onActivate,
  onEdit,
  extraActions,
}: {
  preset: DesignTokens;
  isActive: boolean;
  isSaving: boolean;
  onActivate: () => void;
  onEdit: () => void;
  extraActions?: React.ReactNode;
}) {
  const swatches = [
    preset.colors.accent,
    preset.colors.surfaceRaised,
    preset.colors.textPrimary,
    preset.colors.success,
    preset.colors.warning,
    preset.colors.error,
  ];

  return (
    <article
      className={`relative rounded-2xl overflow-hidden bg-white dark:bg-[var(--surface-raised)] transition-all ${
        isActive
          ? "border-2 border-[var(--accent)] shadow-lg shadow-[var(--accent)]/15"
          : "border-2 border-[var(--rule-base)] hover:border-[var(--rule-strong)] hover:shadow-md"
      }`}
    >
      {isActive && (
        <span className="absolute top-3 right-3 z-10 inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-[var(--accent)] text-white text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider shadow-md">
          <Check className="h-3 w-3" strokeWidth={3} /> En uso
        </span>
      )}

      {/* Banner con muestra del preset */}
      <div
        className="h-28 px-5 py-3 flex flex-col justify-end"
        style={{
          background: `linear-gradient(135deg, ${preset.colors.surface} 0%, ${preset.colors.accentSoft} 100%)`,
          fontFamily: preset.typography.fontHeading,
        }}
      >
        <span
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider w-fit"
          style={{ background: preset.colors.accent, color: "white" }}
        >
          <Palette className="h-3 w-3" strokeWidth={2.5} />
          {preset.meta.author === "buleje" ? "Oficial" : "Custom"}
        </span>
        <h3
          className="mt-1.5 text-xl font-black leading-tight tracking-[-0.01em]"
          style={{ color: preset.colors.textPrimary }}
        >
          {preset.meta.name}
        </h3>
      </div>

      {/* Cuerpo */}
      <div className="p-5 space-y-4">
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-2 min-h-[2.5em]">
          {preset.meta.description || "Sin descripción"}
        </p>

        <div className="flex items-center gap-1.5">
          {swatches.map((c, i) => (
            <span
              key={i}
              className="h-6 w-6 rounded-md border border-black/10"
              style={{ background: c }}
              title={c}
            />
          ))}
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <dt className="text-[var(--text-tertiary)] font-extrabold uppercase tracking-wider">Headings</dt>
          <dd
            className="text-[var(--text-primary)] truncate font-bold"
            style={{ fontFamily: preset.typography.fontHeading }}
          >
            {preset.typography.fontHeading.split(",")[0].replace(/"/g, "")}
          </dd>
          <dt className="text-[var(--text-tertiary)] font-extrabold uppercase tracking-wider">Body</dt>
          <dd
            className="text-[var(--text-primary)] truncate font-bold"
            style={{ fontFamily: preset.typography.fontBody }}
          >
            {preset.typography.fontBody.split(",")[0].replace(/"/g, "")}
          </dd>
          <dt className="text-[var(--text-tertiary)] font-extrabold uppercase tracking-wider">Densidad</dt>
          <dd className="text-[var(--text-primary)] capitalize font-bold">
            {preset.spacing.density}
          </dd>
          <dt className="text-[var(--text-tertiary)] font-extrabold uppercase tracking-wider">Botones</dt>
          <dd className="text-[var(--text-primary)] font-bold">
            {preset.buttons.height} · {preset.buttons.radius}
          </dd>
        </dl>

        {/* Acciones — patrón superadmin */}
        <div className="flex items-center gap-2 pt-1">
          {isActive ? (
            <span className="flex-1 inline-flex items-center justify-center gap-2 h-11 px-4 rounded-2xl bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-emerald-300 text-sm font-extrabold uppercase tracking-wider border-2 border-[var(--data-success-500)]/30">
              <Check className="h-4 w-4" strokeWidth={3} /> Activo
            </span>
          ) : (
            <button
              type="button"
              onClick={onActivate}
              disabled={isSaving}
              className="flex-1 inline-flex items-center justify-center gap-2 h-11 px-4 rounded-2xl bg-[var(--accent)] text-white text-sm font-extrabold uppercase tracking-wider shadow-md shadow-[var(--accent)]/25 hover:shadow-lg hover:shadow-[var(--accent)]/35 active:scale-[0.99] disabled:opacity-50 transition-all"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Activar</>}
            </button>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex items-center justify-center gap-1.5 h-11 px-3.5 rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-raised)] text-xs font-extrabold uppercase tracking-wider text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
            title="Abrir en editor"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2.5} /> Editar
          </button>
          {extraActions}
        </div>
      </div>
    </article>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// GALLERY VIEW
// ════════════════════════════════════════════════════════════════════════════

function GalleryView({
  oficialPresets,
  savedPresets,
  activeSlug,
  savingSlug,
  onActivate,
  onEdit,
}: {
  oficialPresets: DesignTokens[];
  savedPresets: DesignTokens[];
  activeSlug: string;
  savingSlug: string | null;
  onActivate: (slug: string) => void;
  onEdit: (preset: DesignTokens) => void;
}) {
  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <GallerySectionHeading
          icon={Palette}
          title="Presets oficiales"
          subtitle="Diseños curados por el equipo Buleje. Click para activar, lápiz para editar."
          count={oficialPresets.length}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {oficialPresets.map((preset) => (
            <PresetCard
              key={preset.meta.slug}
              preset={preset}
              isActive={activeSlug === preset.meta.slug}
              isSaving={savingSlug === preset.meta.slug}
              onActivate={() => onActivate(preset.meta.slug)}
              onEdit={() => onEdit(preset)}
            />
          ))}
        </div>
      </section>

      {savedPresets.length > 0 && (
        <section className="space-y-4">
          <GallerySectionHeading
            icon={Sparkles}
            title="Mis presets"
            subtitle="Tus diseños guardados. Reactivables en cualquier momento."
            count={savedPresets.length}
            muted
          />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {savedPresets.map((preset) => (
              <PresetCard
                key={preset.meta.slug}
                preset={preset}
                isActive={activeSlug === preset.meta.slug}
                isSaving={savingSlug === preset.meta.slug}
                onActivate={() => onActivate(preset.meta.slug)}
                onEdit={() => onEdit(preset)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LIBRARY VIEW
// ════════════════════════════════════════════════════════════════════════════

function LibraryView({
  savedPresets,
  activeSlug,
  savingSlug,
  onActivate,
  onEdit,
  onDuplicate,
  onDelete,
  onCreate,
}: {
  savedPresets: DesignTokens[];
  activeSlug: string;
  savingSlug: string | null;
  onActivate: (slug: string) => void;
  onEdit: (p: DesignTokens) => void;
  onDuplicate: (p: DesignTokens) => void;
  onDelete: (slug: string) => void;
  onCreate: () => void;
}) {
  if (savedPresets.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] p-12 text-center">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] mb-4">
          <Sparkles className="h-6 w-6" strokeWidth={1.75} aria-hidden />
        </div>
        <h3 className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text-primary)]">
          Sin presets propios todavía
        </h3>
        <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-md mx-auto leading-relaxed">
          Creá tu propio preset desde cero o duplicá uno oficial y modifícalo.
          Quedan guardados acá y los podés activar cuando quieras.
        </p>
        <button
          type="button"
          onClick={onCreate}
          className="mt-6 inline-flex items-center gap-2 h-11 px-5 rounded-2xl bg-[var(--accent)] text-white font-extrabold text-sm uppercase tracking-wider shadow-lg shadow-[var(--accent)]/30 hover:shadow-xl active:scale-[0.99] transition-all"
        >
          <Plus className="h-4 w-4" strokeWidth={2.5} />
          Crear desde cero
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {savedPresets.map((preset) => (
        <PresetCard
          key={preset.meta.slug}
          preset={preset}
          isActive={activeSlug === preset.meta.slug}
          isSaving={savingSlug === preset.meta.slug}
          onActivate={() => onActivate(preset.meta.slug)}
          onEdit={() => onEdit(preset)}
          extraActions={
            <>
              <button
                type="button"
                onClick={() => onDuplicate(preset)}
                className="inline-flex items-center justify-center h-11 w-11 rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                title="Duplicar"
                aria-label="Duplicar"
              >
                <Copy className="h-4 w-4" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onClick={() => onDelete(preset.meta.slug)}
                className="inline-flex items-center justify-center h-11 w-11 rounded-2xl border-2 border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/5 text-[var(--data-error-600)] hover:bg-[var(--data-error-500)]/10 transition-colors"
                title="Eliminar"
                aria-label="Eliminar"
              >
                <Trash2 className="h-4 w-4" strokeWidth={2.5} />
              </button>
            </>
          }
        />
      ))}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// EDITOR VIEW (split: controls | preview)
// ════════════════════════════════════════════════════════════════════════════

type EditorTab = "meta" | "colors" | "typography" | "spacing" | "shadows" | "buttons" | "motion";

function EditorView({
  tokens,
  onChange,
  saving,
  onApply,
  onSave,
  onReset,
}: {
  tokens: DesignTokens;
  onChange: (t: DesignTokens) => void;
  saving: boolean;
  onApply: () => void;
  onSave: () => void;
  onReset: () => void;
}) {
  const [tab, setTab] = useState<EditorTab>("colors");

  const setField = <K extends keyof DesignTokens, F extends keyof DesignTokens[K]>(
    section: K,
    field: F,
    value: DesignTokens[K][F],
  ) => {
    onChange({
      ...tokens,
      [section]: { ...tokens[section], [field]: value },
    });
  };

  const tabs: Array<{ key: EditorTab; label: string; icon: React.ComponentType<{ className?: string; strokeWidth?: number }> }> = [
    { key: "meta", label: "Identidad", icon: Sparkles },
    { key: "colors", label: "Colores", icon: Palette },
    { key: "typography", label: "Tipografía", icon: Type },
    { key: "spacing", label: "Bordes", icon: Square },
    { key: "shadows", label: "Sombras", icon: Eye },
    { key: "buttons", label: "Botones", icon: Square },
    { key: "motion", label: "Motion", icon: Zap },
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,400px)_minmax(0,1fr)] gap-6">
      {/* Controles */}
      <div className="space-y-4">
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-raised)] p-2 sticky top-4 z-10">
          <nav className="flex flex-wrap gap-1">
            {tabs.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-colors ${
                  tab === key
                    ? "bg-[var(--accent)] text-white shadow-sm"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
                {label}
              </button>
            ))}
          </nav>
        </div>

        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-raised)] p-5 space-y-5">
          {tab === "meta" && <MetaPanel tokens={tokens} setField={setField} onChange={onChange} />}
          {tab === "colors" && <ColorsPanel tokens={tokens} setField={setField} />}
          {tab === "typography" && <TypographyPanel tokens={tokens} setField={setField} />}
          {tab === "spacing" && <SpacingPanel tokens={tokens} setField={setField} />}
          {tab === "shadows" && <ShadowsPanel tokens={tokens} setField={setField} />}
          {tab === "buttons" && <ButtonsPanel tokens={tokens} setField={setField} />}
          {tab === "motion" && <MotionPanel tokens={tokens} setField={setField} />}
        </div>

        {/* Acciones — sticky bottom */}
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-raised)] p-4 space-y-3 sticky bottom-4 shadow-lg">
          <button
            type="button"
            onClick={onApply}
            disabled={saving}
            className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-[var(--accent)] text-white text-sm font-extrabold uppercase tracking-wider shadow-lg shadow-[var(--accent)]/30 hover:shadow-xl active:scale-[0.99] disabled:opacity-50 transition-all"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" strokeWidth={2.5} />}
            Aplicar al admin
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="inline-flex items-center justify-center gap-1.5 h-10 rounded-xl border-2 border-[var(--accent)]/40 text-[var(--accent)] text-xs font-extrabold uppercase tracking-wider hover:bg-[var(--accent)]/5 transition-colors"
            >
              <Save className="h-3.5 w-3.5" strokeWidth={2.5} /> Guardar
            </button>
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center justify-center gap-1.5 h-10 rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-secondary)] text-xs font-extrabold uppercase tracking-wider hover:bg-[var(--surface-sunken)] transition-colors"
            >
              <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.5} /> Reset
            </button>
          </div>
        </div>
      </div>

      {/* Preview */}
      <PreviewPane tokens={tokens} />
    </div>
  );
}

// ── Panels ───────────────────────────────────────────────────────────────────

type SetField = <K extends keyof DesignTokens, F extends keyof DesignTokens[K]>(
  section: K,
  field: F,
  value: DesignTokens[K][F],
) => void;

function MetaPanel({
  tokens,
  setField,
  onChange,
}: {
  tokens: DesignTokens;
  setField: SetField;
  onChange: (t: DesignTokens) => void;
}) {
  return (
    <div className="space-y-4">
      <FieldText
        label="Nombre del preset"
        value={tokens.meta.name}
        onChange={(name) =>
          onChange({
            ...tokens,
            meta: {
              ...tokens.meta,
              name,
              slug: tokens.meta.author === "custom" ? slugify(name) : tokens.meta.slug,
            },
          })
        }
        hint="Aparece en la galería y en el switch del admin."
      />
      <FieldText
        label="Slug"
        value={tokens.meta.slug}
        onChange={(slug) => setField("meta", "slug", slugify(slug))}
        hint="kebab-case · se genera automático del nombre."
        disabled={tokens.meta.author === "buleje"}
      />
      <div>
        <label className="block text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
          Descripción
        </label>
        <textarea
          value={tokens.meta.description}
          onChange={(e) => setField("meta", "description", e.target.value)}
          rows={3}
          className="w-full rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] px-3 py-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none transition-colors"
          placeholder="Para qué tipo de negocio funciona mejor…"
        />
      </div>
    </div>
  );
}

function ColorsPanel({ tokens, setField }: { tokens: DesignTokens; setField: SetField }) {
  const groups: Array<{ title: string; fields: Array<{ key: keyof DesignTokens["colors"]; label: string }> }> = [
    {
      title: "Acento",
      fields: [
        { key: "accent", label: "Accent" },
        { key: "accentDark", label: "Accent oscuro (hover)" },
        { key: "accentSoft", label: "Accent suave (fondos)" },
      ],
    },
    {
      title: "Superficies",
      fields: [
        { key: "surface", label: "Canvas (fondo)" },
        { key: "surfaceRaised", label: "Raised (cards)" },
        { key: "surfaceSunken", label: "Sunken (inputs)" },
      ],
    },
    {
      title: "Texto",
      fields: [
        { key: "textPrimary", label: "Primario" },
        { key: "textSecondary", label: "Secundario" },
        { key: "textTertiary", label: "Terciario" },
      ],
    },
    {
      title: "Bordes",
      fields: [
        { key: "ruleBase", label: "Base" },
        { key: "ruleStrong", label: "Fuerte" },
      ],
    },
    {
      title: "Estados",
      fields: [
        { key: "success", label: "Éxito" },
        { key: "warning", label: "Atención" },
        { key: "error", label: "Error" },
      ],
    },
  ];

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <fieldset key={g.title} className="space-y-2.5">
          <legend className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
            {g.title}
          </legend>
          <div className="space-y-2.5">
            {g.fields.map(({ key, label }) => (
              <FieldColor
                key={key}
                label={label}
                value={tokens.colors[key]}
                onChange={(v) => setField("colors", key, v)}
              />
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );
}

function TypographyPanel({ tokens, setField }: { tokens: DesignTokens; setField: SetField }) {
  const fontStacks = [
    { label: "Geist (oficial)", value: '"Geist", system-ui, sans-serif' },
    { label: "Instrument Serif", value: '"Instrument Serif", Georgia, serif' },
    { label: "Fraunces", value: '"Fraunces", Georgia, serif' },
    { label: "Quicksand", value: '"Quicksand", system-ui, sans-serif' },
    { label: "Nunito", value: '"Nunito", system-ui, sans-serif' },
    { label: "Inter", value: '"Inter", system-ui, sans-serif' },
    { label: "System UI", value: "system-ui, sans-serif" },
    { label: "Georgia", value: "Georgia, serif" },
  ];
  const monoStacks = [
    { label: "Geist Mono", value: '"Geist Mono", ui-monospace, monospace' },
    { label: "JetBrains Mono", value: '"JetBrains Mono", ui-monospace, monospace' },
    { label: "Fira Code", value: '"Fira Code", ui-monospace, monospace' },
  ];
  return (
    <div className="space-y-4">
      <FieldSelect
        label="Fuente headings"
        value={tokens.typography.fontHeading}
        options={fontStacks}
        onChange={(v) => setField("typography", "fontHeading", v)}
      />
      <FieldSelect
        label="Fuente body"
        value={tokens.typography.fontBody}
        options={fontStacks}
        onChange={(v) => setField("typography", "fontBody", v)}
      />
      <FieldSelect
        label="Fuente mono"
        value={tokens.typography.fontMono}
        options={monoStacks}
        onChange={(v) => setField("typography", "fontMono", v)}
      />
      <FieldRange
        label="Tamaño base"
        value={parseFloat(tokens.typography.sizeBase)}
        min={0.875}
        max={1.125}
        step={0.0625}
        unit="rem"
        onChange={(v) => setField("typography", "sizeBase", `${v}rem`)}
      />
      <FieldRange
        label="Escala tipográfica"
        value={tokens.typography.sizeScale}
        min={1.1}
        max={1.4}
        step={0.025}
        decimals={3}
        onChange={(v) => setField("typography", "sizeScale", v)}
        hint="1.125 = sutil · 1.25 = balanceado · 1.333 = dramático"
      />
      <div className="grid grid-cols-2 gap-3">
        <FieldNumber
          label="Peso bold"
          value={tokens.typography.weightBold}
          min={500}
          max={900}
          step={100}
          onChange={(v) => setField("typography", "weightBold", v)}
        />
        <FieldNumber
          label="Peso black"
          value={tokens.typography.weightBlack}
          min={600}
          max={950}
          step={50}
          onChange={(v) => setField("typography", "weightBlack", v)}
        />
      </div>
    </div>
  );
}

function SpacingPanel({ tokens, setField }: { tokens: DesignTokens; setField: SetField }) {
  return (
    <div className="space-y-4">
      <FieldSelect
        label="Densidad de componentes"
        value={tokens.spacing.density}
        options={[
          { label: "Compact (más info por pantalla)", value: "compact" },
          { label: "Comfortable (default)", value: "comfortable" },
          { label: "Spacious (mucho aire)", value: "spacious" },
        ]}
        onChange={(v) =>
          setField("spacing", "density", v as "compact" | "comfortable" | "spacious")
        }
      />
      <FieldRange
        label="Unidad base de espacio"
        value={parseFloat(tokens.spacing.base)}
        min={0.2}
        max={0.4}
        step={0.025}
        unit="rem"
        onChange={(v) => setField("spacing", "base", `${v}rem`)}
      />
      <fieldset className="space-y-2.5 pt-2">
        <legend className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
          Esquinas redondeadas
        </legend>
        {(["sm", "md", "lg", "xl"] as const).map((k) => (
          <FieldRange
            key={k}
            label={k.toUpperCase()}
            value={parseFloat(tokens.radius[k])}
            min={0}
            max={3}
            step={0.0625}
            unit="rem"
            onChange={(v) => setField("radius", k, `${v}rem`)}
          />
        ))}
      </fieldset>
    </div>
  );
}

function ShadowsPanel({ tokens, setField }: { tokens: DesignTokens; setField: SetField }) {
  return (
    <div className="space-y-4">
      {(["sm", "md", "lg", "accent"] as const).map((k) => (
        <div key={k}>
          <FieldText
            label={`Shadow ${k}`}
            value={tokens.shadows[k]}
            onChange={(v) => setField("shadows", k, v)}
            hint={k === "accent" ? "Halo tonalizado con el accent" : undefined}
            mono
          />
          <div
            className="mt-2 h-12 rounded-xl bg-white dark:bg-[var(--surface-raised)] border-2 border-[var(--rule-base)]"
            style={{ boxShadow: tokens.shadows[k] }}
          />
        </div>
      ))}
    </div>
  );
}

function ButtonsPanel({ tokens, setField }: { tokens: DesignTokens; setField: SetField }) {
  return (
    <div className="space-y-4">
      <FieldRange
        label="Alto del botón"
        value={parseFloat(tokens.buttons.height)}
        min={2.25}
        max={4}
        step={0.125}
        unit="rem"
        onChange={(v) => setField("buttons", "height", `${v}rem`)}
      />
      <FieldRange
        label="Padding horizontal"
        value={parseFloat(tokens.buttons.paddingX)}
        min={0.75}
        max={2.5}
        step={0.125}
        unit="rem"
        onChange={(v) => setField("buttons", "paddingX", `${v}rem`)}
      />
      <FieldSelect
        label="Tamaño de radius"
        value={tokens.buttons.radius}
        options={[
          { label: "SM (cuadrado)", value: "sm" },
          { label: "MD (sutil)", value: "md" },
          { label: "LG (oficial)", value: "lg" },
          { label: "XL (muy redondo)", value: "xl" },
          { label: "FULL (pill)", value: "full" },
        ]}
        onChange={(v) =>
          setField("buttons", "radius", v as keyof DesignTokens["radius"])
        }
      />
      <FieldNumber
        label="Peso de fuente"
        value={tokens.buttons.fontWeight}
        min={400}
        max={900}
        step={100}
        onChange={(v) => setField("buttons", "fontWeight", v)}
      />
      <FieldToggle
        label="Sombra accent al hover"
        value={tokens.buttons.accentShadow}
        onChange={(v) => setField("buttons", "accentShadow", v)}
        hint="Halo brillante con color del accent debajo del botón"
      />
    </div>
  );
}

function MotionPanel({ tokens, setField }: { tokens: DesignTokens; setField: SetField }) {
  return (
    <div className="space-y-4">
      <FieldRange
        label="Duración rápida (hover)"
        value={parseInt(tokens.motion.durFast, 10)}
        min={50}
        max={300}
        step={10}
        unit="ms"
        onChange={(v) => setField("motion", "durFast", `${v}ms`)}
      />
      <FieldRange
        label="Duración base"
        value={parseInt(tokens.motion.durBase, 10)}
        min={120}
        max={500}
        step={20}
        unit="ms"
        onChange={(v) => setField("motion", "durBase", `${v}ms`)}
      />
      <FieldRange
        label="Duración lenta (modales)"
        value={parseInt(tokens.motion.durSlow, 10)}
        min={250}
        max={800}
        step={20}
        unit="ms"
        onChange={(v) => setField("motion", "durSlow", `${v}ms`)}
      />
      <FieldSelect
        label="Curva de aceleración"
        value={tokens.motion.easing}
        options={[
          { label: "Standard (oficial)", value: "cubic-bezier(0.22, 1, 0.36, 1)" },
          { label: "Material", value: "cubic-bezier(0.4, 0, 0.2, 1)" },
          { label: "Bounce sutil", value: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
          { label: "Ease in-out", value: "cubic-bezier(0.65, 0, 0.35, 1)" },
          { label: "Linear", value: "linear" },
        ]}
        onChange={(v) => setField("motion", "easing", v)}
      />
    </div>
  );
}

// ── Field primitives ─────────────────────────────────────────────────────────

function FieldText({
  label,
  value,
  onChange,
  hint,
  disabled,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  disabled?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
        {label}
      </label>
      <input
        type="text"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full h-11 rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none transition-colors disabled:opacity-50 ${
          mono ? "font-mono text-xs" : ""
        }`}
      />
      {hint && <p className="mt-1 text-xs text-[var(--text-tertiary)]">{hint}</p>}
    </div>
  );
}

function FieldColor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="h-10 w-10 rounded-xl border-2 border-[var(--rule-base)] shrink-0"
        style={{ background: value }}
        aria-hidden
      />
      <div className="flex-1 min-w-0">
        <label className="block text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
          {label}
        </label>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full h-8 rounded-md border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] px-2 text-xs font-mono text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
          placeholder="oklch(...) / #hex / rgb(...)"
        />
      </div>
    </div>
  );
}

function FieldRange({
  label,
  value,
  min,
  max,
  step,
  unit,
  decimals = 3,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  decimals?: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  const display =
    unit === "ms"
      ? `${value}${unit}`
      : `${value.toFixed(decimals).replace(/\.?0+$/, "")}${unit ?? ""}`;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)]">
          {label}
        </label>
        <span className="text-xs font-mono text-[var(--text-secondary)]">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[var(--accent)]"
      />
      {hint && <p className="mt-1 text-xs text-[var(--text-tertiary)]">{hint}</p>}
    </div>
  );
}

function FieldNumber({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className="block text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
        {label}
      </label>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full h-11 rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
      />
    </div>
  );
}

function FieldSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ label: string; value: string }>;
  onChange: (v: string) => void;
}) {
  const hasValue = options.some((o) => o.value === value);
  const allOptions = hasValue
    ? options
    : [{ label: `Custom: ${value.slice(0, 30)}`, value }, ...options];
  return (
    <div>
      <label className="block text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-11 rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none transition-colors"
      >
        {allOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function FieldToggle({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={() => onChange(!value)}
        className="w-full inline-flex items-center justify-between gap-3 h-11 rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-canvas)] px-3 text-xs font-extrabold uppercase tracking-wider text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
      >
        <span>{label}</span>
        <span
          className={`inline-flex items-center h-6 w-11 rounded-full px-0.5 transition-colors ${
            value
              ? "bg-[var(--accent)] justify-end"
              : "bg-[var(--rule-strong)] justify-start"
          }`}
        >
          <span className="h-5 w-5 rounded-full bg-white shadow-sm" />
        </span>
      </button>
      {hint && <p className="mt-1 text-xs text-[var(--text-tertiary)]">{hint}</p>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PREVIEW PANE — sandbox que aplica los tokens del editor
// ════════════════════════════════════════════════════════════════════════════

function PreviewPane({ tokens }: { tokens: DesignTokens }) {
  const styleObj = useMemo(
    () => tokensToCssVars(tokens) as React.CSSProperties,
    [tokens],
  );
  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Vista previa
          </p>
          <p className="text-sm text-[var(--text-secondary)]">
            Así se va a ver el admin del negocio con este preset.
          </p>
        </div>
        <div className="inline-flex rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-raised)] p-0.5">
          {(["desktop", "mobile"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDevice(d)}
              className={`h-8 px-3 rounded-lg text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider transition-colors ${
                device === d
                  ? "bg-[var(--accent)] text-white"
                  : "text-[var(--text-secondary)]"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      <div
        className={`mx-auto rounded-2xl border-2 border-[var(--rule-base)] overflow-hidden shadow-xl transition-all ${
          device === "mobile" ? "max-w-[380px]" : "w-full"
        }`}
        style={{
          ...styleObj,
          fontFamily: tokens.typography.fontBody,
          background: tokens.colors.surface,
          color: tokens.colors.textPrimary,
        }}
      >
        <PreviewShell tokens={tokens} mobile={device === "mobile"} />
      </div>
    </div>
  );
}

function PreviewShell({ tokens, mobile }: { tokens: DesignTokens; mobile: boolean }) {
  const radius = tokens.radius;
  const colors = tokens.colors;
  const typo = tokens.typography;
  const btn = tokens.buttons;
  const btnRadius = radius[btn.radius];

  const filledBtn: React.CSSProperties = {
    height: btn.height,
    paddingLeft: btn.paddingX,
    paddingRight: btn.paddingX,
    background: colors.accent,
    color: "white",
    fontWeight: btn.fontWeight,
    borderRadius: btnRadius,
    boxShadow: btn.accentShadow ? tokens.shadows.accent : "none",
    transition: `all ${tokens.motion.durBase} ${tokens.motion.easing}`,
  };
  const outlineBtn: React.CSSProperties = {
    height: btn.height,
    paddingLeft: btn.paddingX,
    paddingRight: btn.paddingX,
    border: `2px solid ${colors.accent}`,
    color: colors.accent,
    fontWeight: btn.fontWeight,
    borderRadius: btnRadius,
    background: "transparent",
  };

  return (
    <div className="grid" style={{ gridTemplateColumns: mobile ? "1fr" : "200px 1fr" }}>
      {!mobile && (
        <aside
          className="p-4 space-y-1.5"
          style={{
            background: colors.surfaceRaised,
            borderRight: `1px solid ${colors.ruleBase}`,
            minHeight: "640px",
          }}
        >
          <div
            className="flex items-center gap-2 mb-4 pb-3"
            style={{ borderBottom: `1px solid ${colors.ruleBase}` }}
          >
            <span
              className="h-8 w-8 flex items-center justify-center text-white font-bold"
              style={{ background: colors.accent, borderRadius: radius.md }}
            >
              B
            </span>
            <span
              className="font-bold"
              style={{ fontFamily: typo.fontHeading, color: colors.textPrimary }}
            >
              Bodega Buleje
            </span>
          </div>
          {[
            { label: "Dashboard", active: true },
            { label: "Pedidos", count: 12 },
            { label: "Productos" },
            { label: "Clientes" },
            { label: "Pagos" },
            { label: "Reportes" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between px-3 py-2 text-sm font-bold"
              style={{
                borderRadius: radius.md,
                background: item.active ? colors.accentSoft : "transparent",
                color: item.active ? colors.accent : colors.textSecondary,
                transition: `all ${tokens.motion.durFast} ${tokens.motion.easing}`,
              }}
            >
              <span>{item.label}</span>
              {item.count && (
                <span
                  className="px-2 py-0.5 text-xs font-bold"
                  style={{
                    background: item.active ? "white" : colors.surfaceSunken,
                    color: item.active ? colors.accent : colors.textTertiary,
                    borderRadius: radius.full,
                  }}
                >
                  {item.count}
                </span>
              )}
            </div>
          ))}
        </aside>
      )}

      <main className="p-5 space-y-5" style={{ background: colors.surface }}>
        <header
          className="flex items-center justify-between pb-4"
          style={{ borderBottom: `1px solid ${colors.ruleBase}` }}
        >
          <div>
            <p
              className="text-xs font-bold uppercase tracking-wider"
              style={{ color: colors.textTertiary }}
            >
              Dashboard
            </p>
            <h1
              className="text-2xl font-bold mt-0.5"
              style={{ fontFamily: typo.fontHeading, color: colors.textPrimary }}
            >
              Hola, Brandon 👋
            </h1>
          </div>
          {!mobile && (
            <button type="button" style={filledBtn} className="inline-flex items-center gap-2">
              + Nuevo pedido
            </button>
          )}
        </header>

        <div className={`grid gap-3 ${mobile ? "grid-cols-2" : "grid-cols-3"}`}>
          {[
            { label: "Ventas hoy", value: "S/2,840", delta: "+12%", positive: true },
            { label: "Pedidos", value: "47", delta: "+3", positive: true },
            { label: "Stock bajo", value: "8", delta: "atención", positive: false },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="p-4"
              style={{
                background: colors.surfaceRaised,
                borderRadius: radius.lg,
                border: `1px solid ${colors.ruleBase}`,
                boxShadow: tokens.shadows.sm,
              }}
            >
              <p
                className="text-xs font-bold uppercase tracking-wider"
                style={{ color: colors.textTertiary }}
              >
                {kpi.label}
              </p>
              <p
                className="text-2xl font-bold mt-1"
                style={{ fontFamily: typo.fontMono, color: colors.textPrimary }}
              >
                {kpi.value}
              </p>
              <p
                className="text-xs font-bold mt-1"
                style={{ color: kpi.positive ? colors.success : colors.warning }}
              >
                {kpi.delta}
              </p>
            </div>
          ))}
        </div>

        <div
          className="overflow-hidden"
          style={{
            background: colors.surfaceRaised,
            borderRadius: radius.lg,
            border: `1px solid ${colors.ruleBase}`,
          }}
        >
          <header
            className="flex items-center justify-between px-5 py-4"
            style={{ borderBottom: `1px solid ${colors.ruleBase}` }}
          >
            <h2
              className="font-bold"
              style={{ fontFamily: typo.fontHeading, color: colors.textPrimary }}
            >
              Pedidos recientes
            </h2>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-sm font-bold"
              style={{ color: colors.accent }}
            >
              Ver todos →
            </button>
          </header>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: colors.surfaceSunken }}>
                {["Cliente", "Total", "Estado"].map((h) => (
                  <th
                    key={h}
                    className="text-left px-5 py-2.5 text-xs font-bold uppercase tracking-wider"
                    style={{ color: colors.textTertiary }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { name: "María L.", total: "S/45.20", status: "Pagado", color: colors.success },
                { name: "Juan P.", total: "S/128.00", status: "Preparando", color: colors.warning },
                { name: "Ana R.", total: "S/22.50", status: "Pendiente", color: colors.error },
              ].map((row, i, arr) => (
                <tr
                  key={row.name}
                  style={{
                    borderBottom: i < arr.length - 1 ? `1px solid ${colors.ruleBase}` : "none",
                  }}
                >
                  <td className="px-5 py-3 font-bold" style={{ color: colors.textPrimary }}>
                    {row.name}
                  </td>
                  <td
                    className="px-5 py-3 font-mono"
                    style={{ color: colors.textPrimary, fontFamily: typo.fontMono }}
                  >
                    {row.total}
                  </td>
                  <td className="px-5 py-3">
                    <span
                      className="inline-flex items-center px-2.5 py-1 text-xs font-bold text-white"
                      style={{ background: row.color, borderRadius: radius.full }}
                    >
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          className="p-4 space-y-3"
          style={{
            background: colors.surfaceRaised,
            borderRadius: radius.lg,
            border: `1px solid ${colors.ruleBase}`,
          }}
        >
          <p
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color: colors.textTertiary }}
          >
            Botones
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" style={filledBtn}>
              Comprar
            </button>
            <button type="button" style={outlineBtn}>
              Outline
            </button>
            <button
              type="button"
              style={{
                height: btn.height,
                paddingLeft: btn.paddingX,
                paddingRight: btn.paddingX,
                color: colors.accent,
                fontWeight: btn.fontWeight,
              }}
            >
              Ghost
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            {[
              { label: "Éxito", color: colors.success },
              { label: "Atención", color: colors.warning },
              { label: "Error", color: colors.error },
            ].map(({ label, color }) => (
              <span
                key={label}
                className="inline-flex items-center px-3 py-1.5 text-xs font-bold text-white"
                style={{ background: color, borderRadius: radius.full }}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}


function GallerySectionHeading({
  icon: Icon,
  title,
  subtitle,
  count,
  muted,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  subtitle: string;
  count: number;
  muted?: boolean;
}) {
  return (
    <div className="flex items-end justify-between gap-4 border-b border-[var(--rule-soft)] pb-3">
      <div className="flex items-start gap-3">
        <span
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            muted
              ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
              : "bg-[var(--accent)]/10 text-[var(--accent)]"
          }`}
        >
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <div>
          <h2 className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
            {title}
          </h2>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">{subtitle}</p>
        </div>
      </div>
      <span
        className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold tabular-nums ${
          muted
            ? "border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-tertiary)]"
            : "bg-[var(--accent)]/10 text-[var(--accent)]"
        }`}
      >
        {count}
      </span>
    </div>
  );
}
