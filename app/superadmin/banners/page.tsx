"use client";

/**
 * /superadmin/banners — CRUD de banners promocionales por slot.
 *
 * Slots: explorar, bodegas, recetas, ofertas.
 * Cada slot tiene N banners (recomendado 3 para rotacion).
 *
 * Campos editables por banner:
 *   - title, subtitle
 *   - imageUrl (URL externa o data:url)
 *   - ctaHref + ctaLabel
 *   - bgFrom + bgTo (gradient cuando no hay imagen)
 *   - active, order
 */

import { useEffect, useState } from "react";
import { Save, Plus, Trash2, ImageIcon, ChevronDown } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";

type Banner = {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl: string | null;
  ctaHref: string;
  ctaLabel: string;
  bgFrom: string;
  bgTo: string;
  active: boolean;
  order: number;
};

type Slot =
  | "explorar"
  | "explorar-mid"
  | "explorar-bottom"
  | "bodegas"
  | "recetas"
  | "ofertas";

const SLOTS: { id: Slot; label: string; pageHref: string }[] = [
  { id: "explorar", label: "Explorar · Top", pageHref: "/marketplace/explorar" },
  { id: "explorar-mid", label: "Explorar · Intermedio", pageHref: "/marketplace/explorar" },
  { id: "explorar-bottom", label: "Explorar · Inferior", pageHref: "/marketplace/explorar" },
  { id: "bodegas", label: "Bodegas (home)", pageHref: "/marketplace" },
  { id: "recetas", label: "Recetas", pageHref: "/recetas" },
  { id: "ofertas", label: "Ofertas", pageHref: "/marketplace/ofertas" },
];

export default function SuperadminBannersPage() {
  const [data, setData] = useState<Record<Slot, Banner[]> | null>(null);
  const [activeSlot, setActiveSlot] = useState<Slot>("explorar");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/superadmin/banners", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const updateBanner = (idx: number, patch: Partial<Banner>) => {
    if (!data) return;
    const next = { ...data };
    next[activeSlot] = next[activeSlot].map((b, i) => (i === idx ? { ...b, ...patch } : b));
    setData(next);
  };

  const addBanner = () => {
    if (!data) return;
    const next = { ...data };
    const ord = (next[activeSlot]?.length ?? 0) + 1;
    next[activeSlot] = [
      ...(next[activeSlot] ?? []),
      {
        id: `${activeSlot}-${Date.now()}`,
        title: "Nuevo banner",
        subtitle: "Subtítulo opcional",
        imageUrl: null,
        ctaHref: "/marketplace",
        ctaLabel: "Ver más",
        bgFrom: "#dbeafe",
        bgTo: "#bfdbfe",
        active: true,
        order: ord,
      },
    ];
    setData(next);
  };

  const removeBanner = (idx: number) => {
    if (!data) return;
    const next = { ...data };
    next[activeSlot] = next[activeSlot].filter((_, i) => i !== idx);
    setData(next);
  };

  const save = async () => {
    if (!data) return;
    setSaving(true);
    setSavedMsg(null);
    try {
      const res = await fetch("/api/superadmin/banners", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ slot: activeSlot, banners: data[activeSlot] }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setSavedMsg(`Error: ${err.error ?? res.status}`);
      } else {
        setSavedMsg("Guardado correctamente");
        setTimeout(() => setSavedMsg(null), 3000);
      }
    } catch (e) {
      setSavedMsg(`Error de red: ${(e as Error).message}`);
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--text-tertiary)]">
        Cargando banners...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--data-error)]">
        No se pudieron cargar los banners.
      </div>
    );
  }

  const banners = data[activeSlot] ?? [];

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] py-8">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
        <header className="space-y-2">
          <h1 className="text-3xl font-black text-[var(--text-primary)]">
            Banners promocionales
          </h1>
          <p className="text-[length:var(--ts-sm)] text-[var(--text-tertiary)]">
            Configurá los banners que aparecen rotativos en cada página del marketplace.
            Recomendamos 3 banners por slot.
          </p>
        </header>

        {/* Slot selector */}
        <div className="flex flex-wrap gap-2">
          {SLOTS.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSlot(s.id)}
              className={cn(
                "px-4 py-2 rounded-lg text-[length:var(--ts-sm)] font-semibold border transition-colors",
                activeSlot === s.id
                  ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] border-[var(--text-primary)]"
                  : "bg-[var(--surface-raised)] text-[var(--text-secondary)] border-[var(--rule-base)] hover:border-[var(--text-primary)]",
              )}
            >
              {s.label}
              <span className="ml-2 text-[length:var(--ts-2xs)] opacity-70">
                ({data[s.id]?.length ?? 0})
              </span>
            </button>
          ))}
        </div>

        {/* Banner cards */}
        <div className="space-y-4">
          {banners.map((b, idx) => (
            <article
              key={b.id}
              className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-5 space-y-4"
            >
              {/* Preview */}
              <div
                className="relative overflow-hidden rounded-lg aspect-[4/1] flex items-center justify-between px-6"
                style={{
                  background: b.imageUrl
                    ? `url(${b.imageUrl}) center/cover`
                    : `linear-gradient(135deg, ${b.bgFrom}, ${b.bgTo})`,
                }}
              >
                {!b.imageUrl && (
                  <>
                    <div className="flex-1">
                      <h3 className="text-xl font-black text-[#0c1015]">{b.title}</h3>
                      {b.subtitle && (
                        <p className="text-sm text-[#0c1015]/70 mt-1">{b.subtitle}</p>
                      )}
                    </div>
                    <ImageIcon className="h-12 w-12 text-[#0c1015]/30" strokeWidth={1.25} aria-hidden />
                  </>
                )}
              </div>

              {/* Form */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] mb-1">
                    Título
                  </label>
                  <input
                    value={b.title}
                    onChange={(e) => updateBanner(idx, { title: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[length:var(--ts-sm)]"
                  />
                </div>
                <div>
                  <label className="block text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] mb-1">
                    Subtítulo
                  </label>
                  <input
                    value={b.subtitle ?? ""}
                    onChange={(e) => updateBanner(idx, { subtitle: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[length:var(--ts-sm)]"
                  />
                </div>
                <div>
                  <label className="block text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] mb-1">
                    URL de imagen (opcional)
                  </label>
                  <input
                    value={b.imageUrl ?? ""}
                    onChange={(e) => updateBanner(idx, { imageUrl: e.target.value || null })}
                    placeholder="https://..."
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[length:var(--ts-sm)]"
                  />
                </div>
                <div>
                  <label className="block text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] mb-1">
                    Link al hacer click
                  </label>
                  <input
                    value={b.ctaHref}
                    onChange={(e) => updateBanner(idx, { ctaHref: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[length:var(--ts-sm)]"
                  />
                </div>
                <div>
                  <label className="block text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] mb-1">
                    Texto del botón
                  </label>
                  <input
                    value={b.ctaLabel}
                    onChange={(e) => updateBanner(idx, { ctaLabel: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[length:var(--ts-sm)]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] mb-1">
                      Color desde
                    </label>
                    <input
                      type="color"
                      value={b.bgFrom}
                      onChange={(e) => updateBanner(idx, { bgFrom: e.target.value })}
                      className="w-full h-10 rounded-lg border border-[var(--rule-base)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] mb-1">
                      Color hasta
                    </label>
                    <input
                      type="color"
                      value={b.bgTo}
                      onChange={(e) => updateBanner(idx, { bgTo: e.target.value })}
                      className="w-full h-10 rounded-lg border border-[var(--rule-base)]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-3 border-t border-[var(--rule-soft)]">
                <label className="inline-flex items-center gap-2 text-[length:var(--ts-sm)]">
                  <input
                    type="checkbox"
                    checked={b.active}
                    onChange={(e) => updateBanner(idx, { active: e.target.checked })}
                    className="rounded border-[var(--rule-base)]"
                  />
                  <span>Activo</span>
                </label>
                <button
                  onClick={() => removeBanner(idx)}
                  className="inline-flex items-center gap-1 text-[length:var(--ts-xs)] font-semibold text-[var(--data-error)] hover:underline"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden />
                  Eliminar banner
                </button>
              </div>
            </article>
          ))}
        </div>

        {/* Footer actions */}
        <div className="sticky bottom-4 flex items-center justify-between gap-3 bg-[var(--surface-raised)] border border-[var(--rule-soft)] rounded-xl px-5 py-3 shadow-md">
          <button
            onClick={addBanner}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[length:var(--ts-sm)] font-semibold hover:border-[var(--text-primary)]"
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden />
            Agregar banner
          </button>
          <div className="flex items-center gap-3">
            {savedMsg && (
              <span
                className={cn(
                  "text-[length:var(--ts-xs)]",
                  savedMsg.startsWith("Error")
                    ? "text-[var(--data-error)]"
                    : "text-[var(--accent)]",
                )}
              >
                {savedMsg}
              </span>
            )}
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-[var(--accent)] text-white text-[length:var(--ts-sm)] font-semibold hover:bg-[var(--accent)]/90 disabled:opacity-60"
            >
              <Save className="h-4 w-4" strokeWidth={2} aria-hidden />
              {saving ? "Guardando..." : "Guardar cambios"}
            </button>
          </div>
        </div>

        <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] text-center pt-4">
          Los banners aparecen en{" "}
          <a
            href={SLOTS.find((s) => s.id === activeSlot)?.pageHref ?? "/"}
            target="_blank"
            rel="noreferrer"
            className="font-semibold text-[var(--accent)] hover:underline"
          >
            {SLOTS.find((s) => s.id === activeSlot)?.pageHref}
            <ChevronDown className="inline-block h-3 w-3 -rotate-90 ml-0.5" aria-hidden />
          </a>{" "}
          rotando cada 8 segundos.
        </p>
      </div>
    </div>
  );
}
