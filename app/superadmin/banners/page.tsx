"use client";

/**
 * /superadmin/banners — Centro de Banners del Marketplace.
 *
 * Rediseño 2026-04-26:
 *   - Layout 2 columnas: sidebar de slots agrupados por página + panel principal
 *   - Header con stats globales (total / activos / con imagen)
 *   - Cada slot agrupado por página parent (Explorar / Bodegas / Tiendas / Ofertas / Recetas)
 *   - Banner cards con preview always-on (4:1) editable inline
 *   - Color presets brand-aligned (5 gradientes) + picker custom
 *   - Reorder up/down + duplicar + status toggle prominente
 *   - Sticky save bar con dirty state y "ver dónde aparece" inline
 *
 * Storage: lib/data/promo-banners.json (file system, MVP).
 * API: GET/PUT /api/superadmin/banners.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Save,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Copy,
  ExternalLink,
  Megaphone,
  Image as ImageIcon,
  Search,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ChevronRight,
  Monitor,
  Type as TypeIcon,
  Layout,
  ShoppingBag,
} from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";
import ImageUploader from "@/components/superadmin/_shared/ImageUploader";
import PromoBannerRenderer, { type PromoBanner } from "@/components/marketplace/PromoBannerRenderer";
import BannerPreviewStudio from "@/components/superadmin/banners/BannerPreviewStudio";
import type { ImageAdjust } from "@/lib/promo-banners";

// ─────────────────────────────────────────────────────────────────────────────
// Types & taxonomy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tipos de banner:
 *  - classic: texto + CTA hacia otra página (legacy, default)
 *  - image:   imagen pura (recomendada 1600×400 4:1) sin texto fuerte
 *  - promo:   combo/promo embebido — el cliente compra DESDE el banner
 */
type BannerType = "classic" | "image" | "promo";

type PromoEmbed = {
  productName: string;
  productImage: string | null;
  price: number | null;
  oldPrice: number | null;
  badge: string;
  buyHref: string;
  buyLabel: string;
};

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
  type?: BannerType;
  promo?: PromoEmbed;
  imageAdjust?: ImageAdjust;
};

const DEFAULT_PROMO: PromoEmbed = {
  productName: "",
  productImage: null,
  price: null,
  oldPrice: null,
  badge: "",
  buyHref: "",
  buyLabel: "Comprar ahora",
};

type Slot =
  | "explorar"
  | "explorar-mid"
  | "explorar-bottom"
  | "bodegas"
  | "recetas"
  | "ofertas"
  | "tiendas-hero"
  | "bento";

type SlotMeta = {
  id: Slot;
  label: string;
  /** Sub-label de posición dentro de la página parent. */
  position: string;
  /** Página pública donde aparece. */
  pageHref: string;
  /** Descripción de qué hace este slot. */
  description: string;
  /** Aspecto recomendado (para el preview). */
  aspect: "wide" | "bento" | "compact";
  /** Recomendación de cantidad de banners. */
  recommended: number;
};

type SlotGroup = {
  id: string;
  label: string;
  /** Color tag del grupo (preview en sidebar). */
  accent: string;
  slots: SlotMeta[];
};

const SLOT_GROUPS: SlotGroup[] = [
  {
    id: "explorar",
    label: "Marketplace · Explorar",
    accent: "var(--data-5)",
    slots: [
      {
        id: "explorar",
        label: "Hero superior",
        position: "Top de la página",
        pageHref: "/marketplace/explorar",
        description: "Banner principal arriba de todo. El primero que ve el cliente al entrar.",
        aspect: "wide",
        recommended: 3,
      },
      {
        id: "explorar-mid",
        label: "Banner intermedio",
        position: "Mitad de la página",
        pageHref: "/marketplace/explorar",
        description: "Refuerza promociones después del primer scroll. Ideal para cupones.",
        aspect: "wide",
        recommended: 2,
      },
      {
        id: "explorar-bottom",
        label: "Banner inferior",
        position: "Pie de la página",
        pageHref: "/marketplace/explorar",
        description: "Última oportunidad antes de salir. CTA fuerte recomendado.",
        aspect: "wide",
        recommended: 1,
      },
      {
        id: "bento",
        label: "Bento grid",
        position: "Bloque hero del Explorar",
        pageHref: "/marketplace/explorar",
        description: "Grid 4 cards visuales. Usa imágenes fuertes — son tarjetas grandes.",
        aspect: "bento",
        recommended: 4,
      },
    ],
  },
  {
    id: "bodegas",
    label: "Marketplace · Home",
    accent: "var(--data-6)",
    slots: [
      {
        id: "bodegas",
        label: "Hero de Bodegas",
        position: "Home del marketplace",
        pageHref: "/marketplace",
        description: "Presenta tu marca y promesa de servicio. Texto claro y CTA específico.",
        aspect: "wide",
        recommended: 3,
      },
    ],
  },
  {
    id: "tiendas",
    label: "Tiendas",
    accent: "var(--data-8)",
    slots: [
      {
        id: "tiendas-hero",
        label: "Hero de Inicio + Tiendas",
        position: "Banner principal del Inicio (/) y de /tiendas",
        pageHref: "/",
        description:
          "Banner rotativo FULL-WIDTH del Inicio (es el hero principal de la home) y también de /tiendas. Subí imágenes 1600×400 para que se vean profesionales. Rota cada 6s.",
        aspect: "wide",
        recommended: 4,
      },
    ],
  },
  {
    id: "ofertas",
    label: "Ofertas",
    accent: "var(--data-7)",
    slots: [
      {
        id: "ofertas",
        label: "Hero de Ofertas",
        position: "Top de /marketplace/ofertas",
        pageHref: "/marketplace/ofertas",
        description: "Comunicá descuentos y campañas activas. Color cálido recomendado.",
        aspect: "wide",
        recommended: 3,
      },
    ],
  },
  {
    id: "recetas",
    label: "Recetas",
    accent: "var(--data-success)",
    slots: [
      {
        id: "recetas",
        label: "Hero de Recetas",
        position: "Top de /recetas",
        pageHref: "/recetas",
        description: "Inspirá con ideas de cocina. Imagen apetitosa = más conversión.",
        aspect: "wide",
        recommended: 3,
      },
    ],
  },
];

/** Lookup ràpido id → SlotMeta. */
const ALL_SLOTS = SLOT_GROUPS.flatMap((g) => g.slots);
function getSlotMeta(id: Slot): SlotMeta | undefined {
  return ALL_SLOTS.find((s) => s.id === id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Color presets — gradientes brand-aligned (cohesión visual con el marketplace)
// ─────────────────────────────────────────────────────────────────────────────

const COLOR_PRESETS: Array<{ id: string; label: string; from: string; to: string }> = [
  { id: "teal",    label: "Buleje",     from: "#ccfbf1", to: "#5eead4" },
  { id: "sky",     label: "Cielo",      from: "#dbeafe", to: "#bfdbfe" },
  { id: "amber",   label: "Calidez",    from: "#fef3c7", to: "#fde68a" },
  { id: "rose",    label: "Promo",      from: "#fce7f3", to: "#fbcfe8" },
  { id: "emerald", label: "Frescura",   from: "#d1fae5", to: "#a7f3d0" },
  { id: "violet",  label: "Premium",    from: "#ede9fe", to: "#ddd6fe" },
  { id: "lime",    label: "Naturaleza", from: "#ecfccb", to: "#d9f99d" },
  { id: "slate",   label: "Editorial",  from: "#e2e8f0", to: "#cbd5e1" },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

// Brandon 2026-05-20 v13 audit superadmin responsive: el editor canvas
// (3090 LOC, herramientas tipo Photoshop) no es viable en mobile/tablet.
// DesktopOnlyGate detecta viewport <1024px y muestra warning UX claro.
import DesktopOnlyGate from "@/components/superadmin/banners/DesktopOnlyGate";

export default function SuperadminBannersPage() {
  return (
    <DesktopOnlyGate>
      <SuperadminBannersPageInner />
    </DesktopOnlyGate>
  );
}

function SuperadminBannersPageInner() {
  const [data, setData] = useState<Record<Slot, Banner[]> | null>(null);
  const [activeSlot, setActiveSlot] = useState<Slot>("explorar");
  const [loading, setLoading] = useState(true);
  const [savingSlot, setSavingSlot] = useState<Slot | null>(null);
  const [savedMsg, setSavedMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [dirtySlots, setDirtySlots] = useState<Set<Slot>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [studioOpen, setStudioOpen] = useState(false);

  useEffect(() => {
    fetch("/api/superadmin/banners", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        // Normalizar: garantizar que todos los slots existen (aunque vacíos)
        const normalized: Record<Slot, Banner[]> = {} as Record<Slot, Banner[]>;
        for (const meta of ALL_SLOTS) {
          normalized[meta.id] = Array.isArray(d?.[meta.id]) ? d[meta.id] : [];
        }
        setData(normalized);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const markDirty = (slot: Slot) =>
    setDirtySlots((prev) => {
      const next = new Set(prev);
      next.add(slot);
      return next;
    });

  const updateBanner = (slot: Slot, idx: number, patch: Partial<Banner>) => {
    if (!data) return;
    setData({
      ...data,
      [slot]: data[slot].map((b, i) => (i === idx ? { ...b, ...patch } : b)),
    });
    markDirty(slot);
  };

  const addBanner = (slot: Slot) => {
    if (!data) return;
    const ord = (data[slot]?.length ?? 0) + 1;
    const preset = COLOR_PRESETS[ord % COLOR_PRESETS.length];
    const newId = `${slot}-${Date.now()}`;
    setData({
      ...data,
      [slot]: [
        ...(data[slot] ?? []),
        {
          id: newId,
          title: "Nuevo banner",
          subtitle: "Subtítulo opcional",
          imageUrl: null,
          ctaHref: "/marketplace",
          ctaLabel: "Ver más",
          bgFrom: preset.from,
          bgTo: preset.to,
          active: true,
          order: ord,
        },
      ],
    });
    markDirty(slot);
    setExpanded((prev) => new Set(prev).add(newId));
  };

  const removeBanner = (slot: Slot, idx: number) => {
    if (!data) return;
    setData({ ...data, [slot]: data[slot].filter((_, i) => i !== idx) });
    markDirty(slot);
  };

  const duplicateBanner = (slot: Slot, idx: number) => {
    if (!data) return;
    const orig = data[slot][idx];
    if (!orig) return;
     
    const newId = `${slot}-${Date.now()}`;
    const copy: Banner = {
      ...orig,
      id: newId,
      title: `${orig.title} (copia)`,
      order: data[slot].length + 1,
    };
    setData({ ...data, [slot]: [...data[slot], copy] });
    markDirty(slot);
    setExpanded((prev) => new Set(prev).add(newId));
  };

  const moveBanner = (slot: Slot, idx: number, dir: -1 | 1) => {
    if (!data) return;
    const arr = [...data[slot]];
    const target = idx + dir;
    if (target < 0 || target >= arr.length) return;
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    // Re-numerar order
    arr.forEach((b, i) => (b.order = i + 1));
    setData({ ...data, [slot]: arr });
    markDirty(slot);
  };

  const save = async (slot: Slot) => {
    if (!data) return;
    setSavingSlot(slot);
    setSavedMsg(null);
    try {
      // Re-numerar order antes de guardar
      const banners = data[slot].map((b, i) => ({ ...b, order: i + 1 }));
      const res = await fetch("/api/superadmin/banners", {
        method: "PUT",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ slot, banners }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const issues = Array.isArray(err.issues) ? err.issues : [];
        const firstIssue = issues[0];
        const detail = firstIssue
          ? typeof firstIssue === "string"
            ? firstIssue
            : `${firstIssue.path || "?"}: ${firstIssue.message || firstIssue.code || "inválido"}`
          : "";
        const text = detail ? `${err.error ?? `Error ${res.status}`} — ${detail}` : err.error ?? `Error ${res.status}`;
        setSavedMsg({ kind: "err", text });
        if (process.env.NODE_ENV !== "production") {
           
          console.error("[banners save] 400 issues", issues);
        }
      } else {
        setSavedMsg({ kind: "ok", text: "Cambios guardados" });
        setDirtySlots((prev) => {
          const next = new Set(prev);
          next.delete(slot);
          return next;
        });
        setTimeout(() => setSavedMsg(null), 2500);
      }
    } catch (e) {
      setSavedMsg({ kind: "err", text: `Error de red: ${(e as Error).message}` });
    }
    setSavingSlot(null);
  };

  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Stats globales
  const stats = useMemo(() => {
    if (!data) return { total: 0, active: 0, withImage: 0, slots: 0 };
    let total = 0;
    let active = 0;
    let withImage = 0;
    let slots = 0;
    for (const arr of Object.values(data)) {
      if (arr.length > 0) slots++;
      total += arr.length;
      for (const b of arr) {
        if (b.active) active++;
        if (b.imageUrl) withImage++;
      }
    }
    return { total, active, withImage, slots };
  }, [data]);

  const meta = getSlotMeta(activeSlot);
  const banners = data?.[activeSlot] ?? [];
  const filteredBanners = search.trim()
    ? banners.filter(
        (b) =>
          b.title.toLowerCase().includes(search.toLowerCase()) ||
          (b.subtitle ?? "").toLowerCase().includes(search.toLowerCase()) ||
          b.ctaHref.toLowerCase().includes(search.toLowerCase()),
      )
    : banners;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--text-tertiary)]">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 animate-pulse" />
          Cargando banners…
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--data-error-500)]">
        No se pudieron cargar los banners.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      {/* ── Hero header ────────────────────────────────────────────────── */}
      <header className="border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="w-full">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3.5">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
                <Megaphone className="h-6 w-6" strokeWidth={1.75} aria-hidden />
              </span>
              <div>
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                  Centro de banners
                </p>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  Banners del Marketplace
                </h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
                  Editá los banners promocionales que aparecen rotativos en cada página.
                  Recomendamos imagen + 1 línea de texto + CTA claro para máxima conversión.
                </p>
              </div>
            </div>

            {/* Stats compactas */}
            <div className="flex items-stretch gap-2 flex-wrap">
              <StatPill label="Total" value={stats.total} />
              <StatPill label="Activos" value={stats.active} accent="success" />
              <StatPill label="Con imagen" value={stats.withImage} />
              <StatPill label="Slots usados" value={`${stats.slots}/${ALL_SLOTS.length}`} />
            </div>
          </div>
        </div>
      </header>

      {/* ── 2-column layout ────────────────────────────────────────────── */}
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Sidebar — slot navigator agrupado */}
          <aside className="lg:sticky lg:top-6 lg:self-start space-y-5">
            <div>
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-2 px-1">
                Páginas y slots
              </p>
              <div className="space-y-4">
                {SLOT_GROUPS.map((group) => (
                  <div key={group.id}>
                    <div className="flex items-center gap-2 mb-1.5 px-1">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: group.accent }}
                        aria-hidden
                      />
                      <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-[var(--text-secondary)] truncate">
                        {group.label}
                      </p>
                    </div>
                    <div className="space-y-1">
                      {group.slots.map((s) => {
                        const isActive = activeSlot === s.id;
                        const count = data[s.id]?.length ?? 0;
                        const activeCount = (data[s.id] ?? []).filter((b) => b.active).length;
                        const isDirty = dirtySlots.has(s.id);
                        return (
                          <button
                            key={s.id}
                            onClick={() => setActiveSlot(s.id)}
                            aria-pressed={isActive}
                            className={cn(
                              "w-full flex items-center gap-2 rounded-xl px-3 py-2.5 text-left transition-all border",
                              isActive
                                ? "bg-[var(--accent)]/10 border-[var(--accent)]/30 shadow-sm"
                                : "border-transparent hover:bg-[var(--surface-sunken)]",
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <p
                                  className={cn(
                                    "text-sm font-bold truncate",
                                    isActive
                                      ? "text-[var(--accent)]"
                                      : "text-[var(--text-primary)]",
                                  )}
                                >
                                  {s.label}
                                </p>
                                {isDirty && (
                                  <span
                                    className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--data-warning-500)] shrink-0"
                                    title="Cambios sin guardar"
                                    aria-label="Cambios sin guardar"
                                  />
                                )}
                              </div>
                              <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] truncate leading-tight mt-0.5">
                                {s.position}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold tabular-nums",
                                count === 0
                                  ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                                  : activeCount === count
                                    ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-500)]"
                                    : "bg-[var(--data-warning-500)]/15 text-[var(--data-warning-500)]",
                              )}
                            >
                              {activeCount}/{count}
                            </span>
                            <ChevronRight
                              className={cn(
                                "h-3.5 w-3.5 shrink-0 transition-transform",
                                isActive ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]",
                              )}
                              aria-hidden
                            />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Tip */}
            <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3.5">
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)] mb-1.5">
                Consejo
              </p>
              <p className="text-xs text-[var(--text-secondary)] leading-snug">
                Los banners rotan cada 8 segundos. Más de 5 por slot puede saturar al usuario.
                Usá <strong>imágenes 1600×400 (4:1)</strong> para que se vean nítidas.
              </p>
            </div>
          </aside>

          {/* Main panel — banners del slot activo */}
          <main className="space-y-4">
            {/* Slot header */}
            {meta && (
              <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                      Slot · {meta.id}
                    </p>
                    <h2 className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-[var(--text-primary)] mb-1">
                      {meta.label}
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)] max-w-2xl">{meta.description}</p>
                  </div>
                  <a
                    href={meta.pageHref}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 py-2 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                    Ver dónde aparece
                  </a>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-4">
                  <MetaChip label="Página" value={meta.pageHref} />
                  <MetaChip label="Posición" value={meta.position} />
                  <MetaChip label="Recomendado" value={`${meta.recommended} banners`} />
                </div>
              </div>
            )}

            {/* Toolbar: search + add */}
            <div
              role="toolbar"
              aria-label="Acciones del slot"
              className="flex items-center gap-2 flex-wrap rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="inline-flex items-center justify-center h-9 w-9 rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)] shrink-0">
                  <Search className="h-4 w-4" aria-hidden />
                </span>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Buscar en ${banners.length} banner${banners.length === 1 ? "" : "s"}…`}
                  className="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm font-semibold placeholder-[var(--text-tertiary)]"
                  aria-label="Buscar en este slot"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--accent)]"
                  >
                    Limpiar
                  </button>
                )}
              </div>
              <button
                onClick={() => setStudioOpen(true)}
                disabled={banners.length === 0}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3.5 py-2 text-sm font-bold text-[var(--text-primary)] hover:border-[var(--accent)]/40 hover:text-[var(--accent)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Abrir estudio de previsualización"
              >
                <Monitor className="h-3.5 w-3.5" aria-hidden />
                Estudio
              </button>
              <button
                onClick={() => addBanner(activeSlot)}
                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-4 py-2 text-sm font-bold hover:opacity-90 transition-opacity shadow-sm"
              >
                <Plus className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                Nuevo banner
              </button>
            </div>

            {studioOpen && (
              <BannerPreviewStudio
                banners={banners as PromoBanner[]}
                slotLabel={meta?.label}
                uploadFolder={`banners-${activeSlot}`}
                onPatchBanner={(i, p) => updateBanner(activeSlot, i, p as Partial<Banner>)}
                onMoveBanner={(i, d) => moveBanner(activeSlot, i, d)}
                onDuplicateBanner={(i) => duplicateBanner(activeSlot, i)}
                onRemoveBanner={(i) => removeBanner(activeSlot, i)}
                onAddBanner={() => addBanner(activeSlot)}
                colorPresets={COLOR_PRESETS}
                onClose={() => setStudioOpen(false)}
              />
            )}

            {/* Banner cards */}
            {filteredBanners.length === 0 ? (
              <EmptyState
                hasSearch={!!search.trim()}
                onAdd={() => addBanner(activeSlot)}
                onClearSearch={() => setSearch("")}
              />
            ) : (
              <div className="space-y-3">
                {filteredBanners.map((b, idx) => {
                  const realIdx = banners.indexOf(b);
                  const isExpanded = expanded.has(b.id);
                  return (
                    <BannerCard
                      key={b.id}
                      banner={b}
                      index={realIdx}
                      total={banners.length}
                      slotId={activeSlot}
                      expanded={isExpanded}
                      onToggleExpand={() => toggleExpand(b.id)}
                      onPatch={(patch) => updateBanner(activeSlot, realIdx, patch)}
                      onMove={(dir) => moveBanner(activeSlot, realIdx, dir)}
                      onDuplicate={() => duplicateBanner(activeSlot, realIdx)}
                      onRemove={() => removeBanner(activeSlot, realIdx)}
                    />
                  );
                })}
              </div>
            )}

            {/* Sticky save bar */}
            <div className="sticky bottom-4 z-10 mt-4">
              <div
                className={cn(
                  "flex items-center justify-between gap-3 rounded-2xl border bg-[var(--surface-raised)] px-5 py-3.5 shadow-lg",
                  dirtySlots.has(activeSlot)
                    ? "border-[var(--data-warning-500)]/40"
                    : "border-[var(--rule-base)]",
                )}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {dirtySlots.has(activeSlot) ? (
                    <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--data-warning-500)]">
                      <AlertCircle className="h-4 w-4" aria-hidden />
                      Cambios sin guardar
                    </span>
                  ) : savedMsg ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 text-sm font-bold",
                        savedMsg.kind === "ok"
                          ? "text-[var(--data-success-500)]"
                          : "text-[var(--data-error-500)]",
                      )}
                    >
                      {savedMsg.kind === "ok" ? (
                        <CheckCircle2 className="h-4 w-4" aria-hidden />
                      ) : (
                        <AlertCircle className="h-4 w-4" aria-hidden />
                      )}
                      {savedMsg.text}
                    </span>
                  ) : (
                    <span className="text-sm text-[var(--text-tertiary)]">
                      Editando <strong className="text-[var(--text-primary)]">{meta?.label}</strong> · {banners.length} banner{banners.length === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => save(activeSlot)}
                  disabled={savingSlot === activeSlot || !dirtySlots.has(activeSlot)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-bold transition-all",
                    dirtySlots.has(activeSlot)
                      ? "bg-[var(--accent-600,var(--accent))] text-white hover:opacity-90 shadow-sm"
                      : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed",
                  )}
                >
                  <Save className="h-4 w-4" strokeWidth={2} aria-hidden />
                  {savingSlot === activeSlot ? "Guardando…" : "Guardar cambios"}
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "success" | "default";
}) {
  const isSuccess = accent === "success";
  return (
    <div
      className={cn(
        "rounded-xl border px-3.5 py-2 min-w-[88px]",
        isSuccess
          ? "border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5"
          : "border-[var(--rule-base)] bg-[var(--surface-canvas)]",
      )}
    >
      <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
        {label}
      </p>
      <p
        className={cn(
          "font-display text-xl font-extrabold tabular-nums tracking-tight mt-1 leading-none",
          isSuccess ? "text-[var(--data-success-500)]" : "text-[var(--text-primary)]",
        )}
      >
        {value}
      </p>
    </div>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-2">
      <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
        {label}
      </p>
      <p className="text-xs font-bold text-[var(--text-primary)] truncate mt-1 leading-tight">
        {value}
      </p>
    </div>
  );
}

function EmptyState({
  hasSearch,
  onAdd,
  onClearSearch,
}: {
  hasSearch: boolean;
  onAdd: () => void;
  onClearSearch: () => void;
}) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] py-14 px-6 text-center">
      <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--accent-soft)]/40 text-[var(--accent)]">
        <ImageIcon className="h-7 w-7" strokeWidth={1.5} aria-hidden />
      </span>
      <p className="font-display text-lg font-bold text-[var(--text-primary)] mt-3">
        {hasSearch ? "Sin resultados para esta búsqueda" : "Sin banners en este slot"}
      </p>
      <p className="text-sm text-[var(--text-secondary)] mt-1.5 max-w-md mx-auto">
        {hasSearch
          ? "Probá con otro título o limpiá la búsqueda para ver todos los banners."
          : "Agregá tu primer banner para esta página. Recomendamos arrancar con uno y ver cómo performa."}
      </p>
      <div className="flex items-center justify-center gap-2 mt-4">
        {hasSearch && (
          <button
            onClick={onClearSearch}
            className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 py-2 text-sm font-bold hover:border-[var(--accent)]/40"
          >
            Limpiar búsqueda
          </button>
        )}
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-600,var(--accent))] text-white px-4 py-2 text-sm font-bold hover:opacity-90"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Crear primer banner
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BannerCard — card visual con preview always-on + form expandible
// ─────────────────────────────────────────────────────────────────────────────

function BannerCard({
  banner,
  index,
  total,
  slotId,
  expanded,
  onToggleExpand,
  onPatch,
  onMove,
  onDuplicate,
  onRemove,
}: {
  banner: Banner;
  index: number;
  total: number;
  slotId: Slot;
  expanded: boolean;
  onToggleExpand: () => void;
  onPatch: (patch: Partial<Banner>) => void;
  onMove: (dir: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const inactive = !banner.active;

  return (
    <article
      className={cn(
        "rounded-2xl border bg-[var(--surface-raised)] overflow-hidden transition-all",
        inactive
          ? "border-[var(--rule-base)] opacity-70"
          : expanded
            ? "border-[var(--accent)]/40 shadow-md"
            : "border-[var(--rule-base)] hover:border-[var(--accent)]/30",
      )}
    >
      {/* Top action bar */}
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
        <div className="flex items-center gap-2 min-w-0">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-xs font-extrabold tabular-nums text-[var(--text-secondary)] shrink-0">
            #{index + 1}
          </span>
          <button
            onClick={onToggleExpand}
            className="text-sm font-bold text-[var(--text-primary)] hover:text-[var(--accent)] truncate"
            aria-expanded={expanded}
          >
            {banner.title || "(sin título)"}
          </button>
          {inactive && (
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--data-warning-500)]/15 text-[var(--data-warning-500)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider shrink-0">
              <EyeOff className="h-3 w-3" aria-hidden />
              Oculto
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {/* Reorder */}
          <button
            onClick={() => onMove(-1)}
            disabled={index === 0}
            title="Subir"
            aria-label="Subir banner"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowUp className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            title="Bajar"
            aria-label="Bajar banner"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
          </button>

          <span aria-hidden className="h-5 w-px bg-[var(--rule-soft)] mx-1" />

          {/* Active toggle */}
          <button
            onClick={() => onPatch({ active: !banner.active })}
            title={banner.active ? "Ocultar" : "Mostrar"}
            aria-pressed={banner.active}
            className={cn(
              "inline-flex h-7 items-center gap-1 px-2 rounded-md text-xs font-bold transition-colors",
              banner.active
                ? "text-[var(--data-success-500)] hover:bg-[var(--data-success-500)]/10"
                : "text-[var(--data-warning-500)] hover:bg-[var(--data-warning-500)]/10",
            )}
          >
            {banner.active ? (
              <>
                <Eye className="h-3.5 w-3.5" aria-hidden />
                Activo
              </>
            ) : (
              <>
                <EyeOff className="h-3.5 w-3.5" aria-hidden />
                Oculto
              </>
            )}
          </button>

          <button
            onClick={onDuplicate}
            title="Duplicar"
            aria-label="Duplicar banner"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            onClick={onRemove}
            title="Eliminar"
            aria-label="Eliminar banner"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-500)]"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>

      {/* Live preview always-on — render varia según type */}
      <button
        onClick={onToggleExpand}
        className="block w-full text-left"
        aria-label={`Editar banner ${banner.title}`}
      >
        <BannerPreview banner={banner} />
      </button>

      {/* Expandable form */}
      {expanded && (
        <div className="border-t border-[var(--rule-soft)] p-5 sm:p-6 space-y-5 bg-[var(--surface-canvas)]">
          {/* ── Type switch — define qué campos se muestran abajo ── */}
          <Field
            label="Tipo de banner"
            hint="Definí cómo se ve y qué hace al hacer click"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {([
                { id: "classic", label: "Clásico", desc: "Texto + botón hacia otra página", Icon: TypeIcon },
                { id: "image",   label: "Imagen",  desc: "Solo imagen (1600×400 · 4:1)",     Icon: Layout },
                { id: "promo",   label: "Promo",   desc: "Producto/combo con compra directa", Icon: ShoppingBag },
              ] as Array<{ id: BannerType; label: string; desc: string; Icon: typeof TypeIcon }>).map((opt) => {
                const active = (banner.type ?? "classic") === opt.id;
                const Icon = opt.Icon;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onPatch({ type: opt.id, ...(opt.id === "promo" && !banner.promo ? { promo: DEFAULT_PROMO } : {}) })}
                    aria-pressed={active}
                    className={cn(
                      "rounded-xl border-2 p-3 text-left transition-all",
                      active
                        ? "border-[var(--accent)] bg-[var(--accent)]/10 shadow-sm"
                        : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/40",
                    )}
                  >
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span
                        className={cn(
                          "inline-flex h-5 w-5 items-center justify-center rounded-md",
                          active
                            ? "bg-[var(--accent-600,var(--accent))] text-white"
                            : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
                        )}
                      >
                        <Icon className="h-3 w-3" />
                      </span>
                      <p className={cn("text-sm font-extrabold", active ? "text-[var(--accent)]" : "text-[var(--text-primary)]")}>
                        {opt.label}
                      </p>
                      {active && <CheckCircle2 className="h-3.5 w-3.5 text-[var(--accent)] ml-auto" />}
                    </div>
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] leading-snug">{opt.desc}</p>
                  </button>
                );
              })}
            </div>
          </Field>

          {/* ── Tipo "promo": form de la promo embebida ── */}
          {banner.type === "promo" && (
            <PromoEmbedFields
              promo={banner.promo ?? DEFAULT_PROMO}
              slotId={slotId}
              onChange={(p) => onPatch({ promo: { ...(banner.promo ?? DEFAULT_PROMO), ...p } })}
            />
          )}

          {/* ── Texto (visible en classic + promo · oculto en image-puro) ── */}
          {banner.type !== "image" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Título principal" hint="1 línea · texto fuerte">
                <input
                  value={banner.title}
                  onChange={(e) => onPatch({ title: e.target.value })}
                  maxLength={120}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-semibold focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none"
                />
              </Field>
              <Field label="Subtítulo" hint="Opcional · descriptivo">
                <input
                  value={banner.subtitle ?? ""}
                  onChange={(e) => onPatch({ subtitle: e.target.value })}
                  maxLength={200}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none"
                />
              </Field>
            </div>
          )}

          {/* ── CTA (visible en classic + image · oculto en promo, que usa su propio buyHref) ── */}
          {banner.type !== "promo" && (
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
              <Field
                label="Link al hacer click"
                hint="Empezá con / (interno) o https:// (externo)"
              >
                <input
                  value={banner.ctaHref}
                  onChange={(e) => onPatch({ ctaHref: e.target.value })}
                  placeholder="/marketplace/ofertas"
                  className={cn(
                    "w-full px-3 py-2 rounded-lg border bg-[var(--surface-raised)] text-sm font-mono focus:ring-1 outline-none",
                    banner.ctaHref.startsWith("/") || banner.ctaHref.startsWith("http")
                      ? "border-[var(--rule-base)] focus:border-[var(--accent)] focus:ring-[var(--accent)]/30"
                      : "border-[var(--data-error-500)] focus:border-[var(--data-error-500)] focus:ring-[var(--data-error-500)]/30",
                  )}
                />
              </Field>
              <Field label="Texto del botón" hint="Verbo + acción">
                <input
                  value={banner.ctaLabel}
                  onChange={(e) => onPatch({ ctaLabel: e.target.value })}
                  maxLength={40}
                  className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none"
                />
              </Field>
            </div>
          )}

          {/* ── Imagen (visible en classic + image · oculta en promo, que usa productImage) ── */}
          {banner.type !== "promo" && (
            <Field
              label={banner.type === "image" ? "Imagen del banner (obligatoria)" : "Imagen del banner"}
              hint={
                banner.type === "image"
                  ? "Resolución recomendada: 1600×400 (4:1) · subí PNG/JPG/WebP de buena calidad"
                  : "Tamaño recomendado: 1600×400 (4:1) · si no hay imagen se usan los colores de abajo"
              }
            >
              <div className="flex items-start gap-3">
                <div className="w-32 sm:w-40 shrink-0">
                  <ImageUploader
                    value={banner.imageUrl}
                    onChange={(url) => onPatch({ imageUrl: url })}
                    folder={`banners-${slotId}`}
                    mode="wide"
                    aspectClass="aspect-[16/7]"
                  />
                </div>
                <div className="flex-1 space-y-2 min-w-0">
                  <input
                    value={banner.imageUrl ?? ""}
                    onChange={(e) => onPatch({ imageUrl: e.target.value || null })}
                    placeholder="O pegá una URL: https://…"
                    className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-xs font-mono focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none"
                  />
                  <div className="rounded-md bg-[var(--accent-soft)]/30 border border-[var(--rule-soft)] px-2.5 py-1.5">
                    <p className="text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)]">
                      <span className="text-[var(--accent)]">Recomendado:</span>{" "}
                      <span className="font-mono">1600 × 400 px</span> · 4:1 · &lt;200 KB
                    </p>
                  </div>
                  {banner.imageUrl && (
                    <button
                      onClick={() => onPatch({ imageUrl: null })}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--data-error-500)]"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden />
                      Quitar imagen
                    </button>
                  )}
                </div>
              </div>
            </Field>
          )}

          {/* ── Encuadre y previsualización avanzada ── */}
          {banner.type !== "promo" && banner.imageUrl && (
            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3 flex items-center gap-3">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)] shrink-0">
                <Monitor className="h-4 w-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-extrabold text-[var(--text-primary)]">Encuadre, recorte, color y previsualización</p>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] leading-snug">
                  Abrí el Estudio para reposicionar la imagen, hacer zoom, cambiar tipo, color y vista en presentación.
                </p>
              </div>
            </div>
          )}

          {/* ── Color presets (oculto en type=image puro, visible en classic+promo cuando NO hay imagen) ── */}
          {banner.type !== "image" && !banner.imageUrl && (
          <Field
            label="Colores de fondo"
            hint="Solo se usan cuando NO hay imagen. Elegí un preset o personalizá."
          >
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                {COLOR_PRESETS.map((p) => {
                  const active = banner.bgFrom === p.from && banner.bgTo === p.to;
                  return (
                    <button
                      key={p.id}
                      onClick={() => onPatch({ bgFrom: p.from, bgTo: p.to })}
                      title={p.label}
                      aria-pressed={active}
                      aria-label={`Preset de color: ${p.label}`}
                      className={cn(
                        "h-12 w-20 rounded-lg border-2 transition-all relative overflow-hidden",
                        active
                          ? "border-[var(--accent)] ring-2 ring-[var(--accent)]/30 scale-105"
                          : "border-[var(--rule-base)] hover:border-[var(--accent)]/50",
                      )}
                      style={{
                        background: `linear-gradient(135deg, ${p.from}, ${p.to})`,
                      }}
                    >
                      <span className="absolute bottom-0.5 left-1 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[#0c1015]/70">
                        {p.label}
                      </span>
                      {active && (
                        <CheckCircle2 className="absolute top-1 right-1 h-3.5 w-3.5 text-[var(--accent)]" aria-hidden />
                      )}
                    </button>
                  );
                })}
              </div>
              <details className="group">
                <summary className="text-xs font-bold text-[var(--text-secondary)] cursor-pointer hover:text-[var(--accent)] inline-flex items-center gap-1">
                  Personalizar
                  <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" aria-hidden />
                </summary>
                <div className="grid grid-cols-2 gap-2 mt-2 max-w-md">
                  <div>
                    <label className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                      Desde
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={banner.bgFrom}
                        onChange={(e) => onPatch({ bgFrom: e.target.value })}
                        className="h-9 w-12 rounded cursor-pointer border border-[var(--rule-base)]"
                      />
                      <input
                        type="text"
                        value={banner.bgFrom}
                        onChange={(e) => onPatch({ bgFrom: e.target.value })}
                        className="flex-1 px-2 py-1.5 rounded border border-[var(--rule-base)] bg-[var(--surface-raised)] text-xs font-mono uppercase"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                      Hasta
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={banner.bgTo}
                        onChange={(e) => onPatch({ bgTo: e.target.value })}
                        className="h-9 w-12 rounded cursor-pointer border border-[var(--rule-base)]"
                      />
                      <input
                        type="text"
                        value={banner.bgTo}
                        onChange={(e) => onPatch({ bgTo: e.target.value })}
                        className="flex-1 px-2 py-1.5 rounded border border-[var(--rule-base)] bg-[var(--surface-raised)] text-xs font-mono uppercase"
                      />
                    </div>
                  </div>
                </div>
              </details>
            </div>
          </Field>
          )}
        </div>
      )}
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BannerPreview — render según type. Compartido con el renderer público.
// ─────────────────────────────────────────────────────────────────────────────

function BannerPreview({ banner }: { banner: Banner }) {
  // Delegamos al renderer canónico para que el preview = producción exacta.
  // El borde redondeado lo aporta el card; desactivamos el del renderer interno.
  return (
    <div className="relative overflow-hidden">
      <PromoBannerRenderer banner={banner as PromoBanner} asLink={false} className="[&>div]:rounded-none [&>div]:border-0" />
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// PromoEmbedFields — form para promos embebidas (banner type=promo)
// ─────────────────────────────────────────────────────────────────────────────

function PromoEmbedFields({
  promo,
  slotId,
  onChange,
}: {
  promo: PromoEmbed;
  slotId: Slot;
  onChange: (patch: Partial<PromoEmbed>) => void;
}) {
  return (
    <div className="rounded-xl border-2 border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--data-success-500)] text-white">
          <ShoppingBag className="h-3.5 w-3.5" />
        </span>
        <div>
          <p className="text-sm font-extrabold text-[var(--text-primary)]">Datos de la promo embebida</p>
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] leading-snug">
            El cliente verá este combo dentro del banner y podrá comprar directamente
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-3">
        <Field label="Imagen del producto" hint="Cuadrada · 400×400">
          <ImageUploader
            value={promo.productImage}
            onChange={(url) => onChange({ productImage: url })}
            folder={`banners-promo-${slotId}`}
            mode="square"
            aspectClass="aspect-square"
          />
        </Field>
        <div className="space-y-3">
          <Field label="Nombre del producto / combo" hint="Ej. 'Combo familiar 4 personas'">
            <input
              value={promo.productName}
              onChange={(e) => onChange({ productName: e.target.value })}
              maxLength={120}
              className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-semibold focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none"
            />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Precio actual" hint="S/">
              <input
                type="number"
                step="0.10"
                min="0"
                value={promo.price ?? ""}
                onChange={(e) => onChange({ price: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold tabular-nums focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none"
              />
            </Field>
            <Field label="Precio anterior" hint="Tachado">
              <input
                type="number"
                step="0.10"
                min="0"
                value={promo.oldPrice ?? ""}
                onChange={(e) => onChange({ oldPrice: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder="0.00"
                className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm tabular-nums focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none"
              />
            </Field>
            <Field label="Badge" hint="Ej. -30%">
              <input
                value={promo.badge}
                onChange={(e) => onChange({ badge: e.target.value })}
                maxLength={40}
                placeholder="-30%"
                className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold uppercase focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-2">
            <Field label="Link de compra directa" hint="A producto, checkout o tienda">
              <input
                value={promo.buyHref}
                onChange={(e) => onChange({ buyHref: e.target.value })}
                placeholder="/tienda/mi-bodega/producto/combo-fam"
                className={cn(
                  "w-full px-3 py-2 rounded-lg border bg-[var(--surface-raised)] text-sm font-mono focus:ring-1 outline-none",
                  promo.buyHref.startsWith("/") || promo.buyHref.startsWith("http")
                    ? "border-[var(--rule-base)] focus:border-[var(--accent)] focus:ring-[var(--accent)]/30"
                    : "border-[var(--data-warning-500)] focus:border-[var(--data-warning-500)] focus:ring-[var(--data-warning-500)]/30",
                )}
              />
            </Field>
            <Field label="Texto del botón">
              <input
                value={promo.buyLabel}
                onChange={(e) => onChange({ buyLabel: e.target.value })}
                maxLength={40}
                className="w-full px-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm font-bold focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none"
              />
            </Field>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block mb-1.5">
        <span className="text-xs font-extrabold text-[var(--text-primary)]">{label}</span>
        {hint && <span className="block text-[length:var(--ts-xs)] font-medium text-[var(--text-tertiary)] mt-0.5">{hint}</span>}
      </label>
      {children}
    </div>
  );
}

