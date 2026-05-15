"use client";

import { useState, useEffect, useMemo } from "react";
import {
  Store,
  CheckCircle,
  AlertCircle,
  Globe,
  Copy,
  ExternalLink,
  Tag,
  MapPin,
  Percent,
  Image as ImageIcon,
  Info,
  Power,
  Pause,
  EyeOff,
  Save,
  Calendar,
  XCircle,
  Wrench,
} from "@buleje/design-system/icons";
import { CardTitle, SectionTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";
import ImageUpload from "@/components/admin/ImageUpload";
import CategoryZonePicker from "../CategoryZonePicker";
import { Spinner, type StoreData, type DayKey, type StoreHours } from "../types";

// ── Constantes locales ──────────────────────────────────────────────────────

// Categorías globales del marketplace (con imagen) ahora se cargan desde
// /api/marketplace/categories y se renderizan en <CategoryZonePicker />.
// Las zonas también: multi-cobertura agrupada por ciudad + custom.

const DAY_LABELS: Array<{ key: DayKey; label: string; full: string }> = [
  { key: "mon", label: "Lun", full: "Lunes" },
  { key: "tue", label: "Mar", full: "Martes" },
  { key: "wed", label: "Mié", full: "Miércoles" },
  { key: "thu", label: "Jue", full: "Jueves" },
  { key: "fri", label: "Vie", full: "Viernes" },
  { key: "sat", label: "Sáb", full: "Sábado" },
  { key: "sun", label: "Dom", full: "Domingo" },
];

const DEFAULT_HOURS: Record<DayKey, StoreHours> = {
  mon: { open: "08:00", close: "20:00", closed: false },
  tue: { open: "08:00", close: "20:00", closed: false },
  wed: { open: "08:00", close: "20:00", closed: false },
  thu: { open: "08:00", close: "20:00", closed: false },
  fri: { open: "08:00", close: "20:00", closed: false },
  sat: { open: "08:00", close: "20:00", closed: false },
  sun: { open: "09:00", close: "14:00", closed: true },
};

const JS_DAY_TO_KEY: DayKey[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function isOpenNow(hours?: Record<DayKey, StoreHours>): boolean {
  if (!hours) return false;
  const now = new Date();
  const todayKey = JS_DAY_TO_KEY[now.getDay()];
  const day = hours[todayKey];
  if (!day || day.closed) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  const [oh, om] = day.open.split(":").map((n) => parseInt(n, 10));
  const [ch, cm] = day.close.split(":").map((n) => parseInt(n, 10));
  if ([oh, om, ch, cm].some((n) => Number.isNaN(n))) return false;
  return cur >= oh * 60 + om && cur <= ch * 60 + cm;
}

// ── Sub-componentes reutilizables (scope: TiendaTab) ────────────────────────

function SectionCard({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: React.ElementType;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] rounded-2xl overflow-hidden">
      <header className="flex items-start gap-3 px-6 pt-5 pb-4 border-b-2 border-[var(--rule-base)]">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-primary shrink-0">
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <CardTitle className="text-base font-bold">{title}</CardTitle>
          {hint && <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">{hint}</p>}
        </div>
      </header>
      <div className="p-6">{children}</div>
    </section>
  );
}

function ToggleRow({
  active,
  onToggle,
  title,
  desc,
  tone = "primary",
}: {
  active: boolean;
  onToggle: () => void;
  title: string;
  desc: string;
  tone?: "primary" | "warning";
}) {
  const onColor = tone === "warning" ? "bg-[var(--data-warning-500)]" : "bg-primary";
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-4 text-left rounded-2xl px-4 py-4 hover:bg-[var(--surface-sunken)] transition-colors"
    >
      <div className="min-w-0">
        <p className="text-base font-bold text-[var(--text-primary)]">{title}</p>
        <p className="text-sm text-[var(--text-secondary)] mt-0.5 leading-relaxed">{desc}</p>
      </div>
      <span
        className={cn(
          "relative inline-flex h-7 w-12 items-center rounded-full transition-colors shrink-0",
          active ? onColor : "bg-[var(--rule-strong)]",
        )}
        aria-pressed={active}
      >
        <span
          className={cn(
            "inline-block h-5 w-5 transform rounded-full bg-white dark:bg-[var(--color-card)] shadow-md transition-transform",
            active ? "translate-x-6" : "translate-x-1",
          )}
        />
      </span>
    </button>
  );
}

function StatusPill({ isActive, vacationMode }: { isActive: boolean; vacationMode?: boolean }) {
  if (vacationMode) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--data-warning-100)] text-[var(--data-warning-500)] text-sm font-bold">
        <Pause className="h-4 w-4" /> En vacaciones
      </span>
    );
  }
  if (isActive) {
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--data-success-500)] text-sm font-bold">
        <CheckCircle className="h-4 w-4" /> Publicada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] text-sm font-bold">
      <EyeOff className="h-4 w-4" /> Borrador
    </span>
  );
}

function StorePreviewCard({ store }: { store: StoreData }) {
  const initial = (store.name || "T").trim().charAt(0).toUpperCase();
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden hover:shadow-lg transition-shadow">
      <div className="h-28 bg-linear-to-br from-[var(--accent-soft)] via-[var(--surface-raised)] to-[var(--surface-sunken)] relative">
        {store.zone && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--surface-raised)]/95 backdrop-blur text-xs font-bold text-[var(--text-secondary)]">
            <MapPin className="h-3.5 w-3.5" /> {store.zone}
          </span>
        )}
      </div>
      <div className="px-5 pb-5 -mt-10">
        <div className="h-20 w-20 rounded-2xl border-4 border-[var(--surface-raised)] bg-[var(--surface-raised)] shadow-md overflow-hidden flex items-center justify-center">
          {store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={store.logoUrl}
              alt={store.name}
              className="h-full w-full object-cover"
              onError={(e) => ((e.currentTarget.style.display = "none"))}
            />
          ) : (
            <span className="text-3xl font-black text-primary">{initial}</span>
          )}
        </div>
        <h4 className="mt-3 text-lg font-bold text-[var(--text-primary)] truncate">
          {store.name || "Tu tienda"}
        </h4>
        <p className="mt-1 text-sm text-[var(--text-secondary)] line-clamp-2 min-h-[2.6em] leading-relaxed">
          {store.description || "Agrega una descripción atractiva para que los clientes te conozcan."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {store.category && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--surface-sunken)] text-xs font-bold text-[var(--text-primary)]">
              <Tag className="h-3.5 w-3.5" /> {store.category}
            </span>
          )}
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[var(--surface-sunken)] text-xs font-bold text-[var(--text-primary)]">
            <Percent className="h-3.5 w-3.5" /> {store.commissionRate}% comisión
          </span>
        </div>
      </div>
    </div>
  );
}

type SlugCheckState =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "valid"; isOwn: boolean }
  | { state: "invalid"; message: string }
  | { state: "taken"; suggestions: string[] };

function SlugLiveStatus({ slug, onPick }: { slug: string; onPick: (s: string) => void }) {
  const [check, setCheck] = useState<SlugCheckState>({ state: "idle" });

  useEffect(() => {
    if (!slug || slug.length < 3) { setCheck({ state: "idle" }); return; }
    setCheck({ state: "checking" });
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/marketplace/stores/check-slug?slug=${encodeURIComponent(slug)}`);
        if (!res.ok) { setCheck({ state: "idle" }); return; }
        const d = await res.json();
        if (!d.valid) setCheck({ state: "invalid", message: d.message ?? "Slug inválido" });
        else if (d.available) setCheck({ state: "valid", isOwn: !!d.isOwn });
        else setCheck({ state: "taken", suggestions: Array.isArray(d.suggestions) ? d.suggestions : [] });
      } catch { setCheck({ state: "idle" }); }
    }, 400);
    return () => clearTimeout(t);
  }, [slug]);

  if (check.state === "idle") return null;
  if (check.state === "checking") {
    return (
      <p className="text-sm text-[var(--text-tertiary)] flex items-center gap-2">
        <span className="h-4 w-4 border-2 border-[var(--text-tertiary)] border-t-transparent rounded-full animate-spin" />
        Verificando…
      </p>
    );
  }
  if (check.state === "valid") {
    return (
      <p className="text-sm flex items-center gap-2 font-bold text-[var(--data-success-500)]">
        <CheckCircle className="h-4 w-4" />
        {check.isOwn ? "Es tu slug actual" : "Disponible"}
      </p>
    );
  }
  if (check.state === "invalid") {
    return (
      <p className="text-sm flex items-center gap-2 font-bold text-[var(--data-error-500)]">
        <XCircle className="h-4 w-4" /> {check.message}
      </p>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-sm flex items-center gap-2 font-bold text-[var(--data-error-500)]">
        <XCircle className="h-4 w-4" /> Ya está ocupado
      </p>
      {check.suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-[var(--text-secondary)]">Prueba con:</span>
          {check.suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPick(s)}
              className="px-3 py-1.5 rounded-full text-sm font-bold bg-primary/10 text-primary hover:bg-primary/20 transition"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StoreHoursEditor({
  hours,
  onChange,
}: {
  hours: Record<DayKey, StoreHours>;
  onChange: (next: Record<DayKey, StoreHours>) => void;
}) {
  const setDay = (k: DayKey, patch: Partial<StoreHours>) => {
    onChange({ ...hours, [k]: { ...hours[k], ...patch } });
  };
  return (
    <div className="space-y-3">
      {DAY_LABELS.map(({ key, label, full }) => {
        const h = hours[key];
        const closed = h.closed;
        return (
          <div
            key={key}
            className={cn(
              "grid grid-cols-[72px_1fr_auto] sm:grid-cols-[100px_1fr_1fr_auto] items-center gap-3 rounded-2xl border-2 px-4 py-3 transition-colors",
              closed
                ? "border-[var(--rule-base)] bg-[var(--surface-sunken)]"
                : "border-[var(--rule-base)] bg-[var(--surface-raised)]",
            )}
          >
            <span
              className="text-base font-bold uppercase tracking-wider text-[var(--text-primary)]"
              title={full}
            >
              {label}
            </span>
            {closed ? (
              <span className="text-base font-medium text-[var(--text-tertiary)] sm:col-span-2">
                Cerrado todo el día
              </span>
            ) : (
              <>
                <input
                  type="time"
                  aria-label={`${full} — hora de apertura`}
                  value={h.open}
                  onChange={(e) => setDay(key, { open: e.target.value })}
                  className="h-12 px-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-medium text-[var(--text-primary)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                />
                <input
                  type="time"
                  aria-label={`${full} — hora de cierre`}
                  value={h.close}
                  onChange={(e) => setDay(key, { close: e.target.value })}
                  className="h-12 px-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-medium text-[var(--text-primary)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
                />
              </>
            )}
            <button
              type="button"
              onClick={() => setDay(key, { closed: !closed })}
              title={closed ? `Abrir el ${full.toLowerCase()}` : `Cerrar el ${full.toLowerCase()}`}
              className={cn(
                "ml-auto sm:ml-0 h-10 px-4 rounded-xl text-sm font-bold transition-colors",
                closed
                  ? "bg-[var(--accent-soft)] text-primary hover:bg-primary hover:text-white"
                  : "bg-[var(--data-error-100)] text-[var(--data-error-500)] hover:bg-[var(--data-error-500)] hover:text-white",
              )}
            >
              {closed ? "Abrir" : "Cerrar"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// TiendaTab principal
// ─────────────────────────────────────────────
interface ConstructionState {
  enabled: boolean;
  message: string;
}

const EMPTY_CONSTRUCTION: ConstructionState = { enabled: false, message: "" };

export default function TiendaTab() {
  const [store, setStore] = useState<StoreData>({
    slug: "", name: "", description: "", logoUrl: "",
    category: "", zone: "", commissionRate: 5, isActive: false,
    hours: DEFAULT_HOURS,
    subcategory: null,
    coverageZones: [],
    customCategories: [],
  });
  const [construction, setConstruction] = useState<ConstructionState>(EMPTY_CONSTRUCTION);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [saved, setSaved]     = useState(false);
  const [copied, setCopied]   = useState(false);
  const [initial, setInitial] = useState<StoreData | null>(null);
  const [initialConstruction, setInitialConstruction] = useState<ConstructionState>(EMPTY_CONSTRUCTION);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      // GET ?my=true ya incluye subcategory / coverageZones / customCategories
      // (lo extendimos en /api/marketplace/stores) — un solo viaje, sin race.
      fetch("/api/marketplace/stores?my=true").then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/admin/marketplace/store-construction").then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ])
      .then(([storeData, constructionData]) => {
        if (cancelled) return;
        if (storeData && (storeData.slug || storeData.name)) {
          const next: StoreData = {
            ...storeData,
            hours: storeData.hours ?? DEFAULT_HOURS,
            subcategory: storeData.subcategory ?? null,
            coverageZones: Array.isArray(storeData.coverageZones) ? storeData.coverageZones : [],
            customCategories: Array.isArray(storeData.customCategories)
              ? storeData.customCategories
              : [],
          };
          setStore(next);
          setInitial(next);
        }
        if (constructionData) {
          const c: ConstructionState = {
            enabled: !!constructionData.enabled,
            message: typeof constructionData.message === "string" ? constructionData.message : "",
          };
          setConstruction(c);
          setInitialConstruction(c);
        }
      })
      .catch(() => { if (!cancelled) setError("Error al cargar datos de la tienda."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const isDirty = useMemo(() => {
    if (!initial) return true;
    if (JSON.stringify(initial) !== JSON.stringify(store)) return true;
    return JSON.stringify(initialConstruction) !== JSON.stringify(construction);
  }, [initial, store, initialConstruction, construction]);

  const handleSave = async () => {
    if (!store.name?.trim()) { setError("El nombre de la tienda es obligatorio."); return; }
    setSaving(true);
    setError(null);
    try {
      // 1. Guardar datos de tienda (POST/PUT al stores endpoint)
      const res = await fetch("/api/marketplace/stores", {
        method: store.id ? "PUT" : "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(store),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Error al guardar");
      }
      const data = await res.json();
      const next = { ...data, hours: data.hours ?? store.hours ?? DEFAULT_HOURS } as StoreData;
      setStore(next);
      setInitial(next);

      // 2. Guardar extras (subcategory + coverageZones + customCategories) —
      //    storage paralelo en JSON file. Se hace siempre porque el endpoint
      //    POST/PUT de /api/marketplace/stores no acepta estos campos.
      try {
        const exRes = await fetch("/api/admin/marketplace/store-extras", {
          method: "PUT",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            subcategory: store.subcategory ?? null,
            coverageZones: store.coverageZones ?? [],
            customCategories: store.customCategories ?? [],
          }),
        });
        if (!exRes.ok) {
          const exErr = await exRes.json().catch(() => ({}));
          throw new Error(exErr.error || "Error al guardar zonas / categorías");
        }
      } catch (err) {
        // No es crítico para Store.category — registramos pero no bloqueamos.
        if (typeof window !== "undefined") {
          window.console.warn("[TiendaTab] store-extras save failed", err);
        }
      }

      // 3. Guardar flag "Tienda en construcción" SI cambió.
      //    Endpoint dedicado (storage en JSON file, no en DB).
      if (JSON.stringify(initialConstruction) !== JSON.stringify(construction)) {
        const cRes = await fetch("/api/admin/marketplace/store-construction", {
          method: "PUT",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            enabled: construction.enabled,
            message: construction.message?.trim() || undefined,
          }),
        });
        if (!cRes.ok) {
          const cErr = await cRes.json().catch(() => ({}));
          throw new Error(cErr.error || "Error al guardar el modo construcción");
        }
        setInitialConstruction(construction);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar la tienda. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  const handleCopyUrl = async () => {
    if (!store.slug) return;
    const base = typeof window !== "undefined" ? window.location.origin : (process.env.NEXT_PUBLIC_BASE_URL ?? "");
    const url = `${base}/marketplace/${store.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* noop */ }
  };

  if (loading) return <Spinner />;

  // Input base con tipografía blindada (skill bsm-typography-rules):
  // h-12 mín, border-2, rounded-2xl, text-base.
  const inputBase =
    "w-full h-12 px-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-medium text-[var(--text-primary)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all";

  return (
    <div className="space-y-6 pb-32">
      {/* Status banner */}
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-linear-to-r from-[var(--surface-raised)] via-[var(--surface-raised)] to-[var(--accent-soft)]/40 p-6 sm:p-7 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="h-16 w-16 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-sm overflow-hidden flex items-center justify-center shrink-0">
          {store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logoUrl} alt={store.name} className="h-full w-full object-cover" />
          ) : (
            <Store className="h-7 w-7 text-[var(--text-tertiary)]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <SectionTitle className="text-2xl font-bold truncate">{store.name || "Tu tienda en el marketplace"}</SectionTitle>
            <StatusPill isActive={store.isActive} vacationMode={store.vacationMode} />
          </div>
          {store.slug ? (
            <button
              type="button"
              onClick={handleCopyUrl}
              className="mt-2 inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-primary transition-colors"
            >
              <Globe className="h-4 w-4" />
              <span className="font-mono font-medium">marketplace.com/{store.slug}</span>
              {copied ? (
                <span className="text-[var(--data-success-500)] font-bold">¡Copiado!</span>
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          ) : (
            <p className="mt-2 text-sm text-[var(--text-tertiary)]">Configura el slug abajo para tener tu URL pública.</p>
          )}
        </div>
        {store.slug && (
          <a
            href={`/marketplace/${store.slug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 h-12 px-5 rounded-2xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors shrink-0"
          >
            <ExternalLink className="h-4 w-4" /> Ver en marketplace
          </a>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-3 p-4 bg-[var(--data-error-50)] border-2 border-[var(--data-error-500)] rounded-2xl text-base font-medium text-[var(--data-error-500)]">
          <AlertCircle className="h-5 w-5 shrink-0" /> {error}
        </div>
      )}

      {/* Layout 2 columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          {/* Identidad */}
          <SectionCard icon={Store} title="Identidad" hint="Cómo te encuentran y reconocen tus clientes.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2 sm:col-span-1">
                <label className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                  <Globe className="h-4 w-4" /> URL (slug)
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-[var(--text-tertiary)] pointer-events-none">
                    /
                  </span>
                  <input
                    type="text"
                    value={store.slug}
                    onChange={(e) => setStore((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))}
                    placeholder="mi-bodega"
                    className={cn(inputBase, "pl-8")}
                  />
                </div>
                <SlugLiveStatus slug={store.slug} onPick={(s) => setStore((p) => ({ ...p, slug: s }))} />
                <p className="text-sm text-[var(--text-tertiary)] leading-relaxed">
                  Solo minúsculas y guiones. No se puede cambiar fácilmente luego.
                </p>
              </div>
              <div className="space-y-2 sm:col-span-1">
                <label className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Nombre visible <span className="text-[var(--data-error-500)]">*</span>
                </label>
                <input
                  type="text"
                  value={store.name}
                  onChange={(e) => setStore((p) => ({ ...p, name: e.target.value }))}
                  placeholder="Mi Bodega"
                  maxLength={60}
                  className={inputBase}
                />
                <p className="text-sm text-[var(--text-tertiary)]">
                  <span className="font-bold tabular-nums">{store.name.length}</span>/60 caracteres
                </p>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <label className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Descripción
                </label>
                <textarea
                  rows={3}
                  value={store.description}
                  onChange={(e) => setStore((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Describe tu bodega: horarios, especialidades, qué te hace única…"
                  maxLength={180}
                  className={cn(
                    "w-full px-4 py-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-medium text-[var(--text-primary)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all resize-none leading-relaxed",
                  )}
                />
                <p className="text-sm text-[var(--text-tertiary)] leading-relaxed">
                  Aparece bajo el nombre en la tarjeta del marketplace (
                  <span className="font-bold tabular-nums">{store.description?.length ?? 0}</span>/180).
                </p>
              </div>
            </div>
          </SectionCard>

          {/* Categoría + subcategoría + zonas de cobertura (componente compuesto) */}
          <CategoryZonePicker
            value={{
              category: store.category ?? "",
              subcategory: store.subcategory ?? null,
              coverageZones: store.coverageZones ?? [],
              customCategories: store.customCategories ?? [],
            }}
            onChange={(next) => {
              setStore((p) => ({
                ...p,
                category: next.category,
                subcategory: next.subcategory,
                coverageZones: next.coverageZones,
                customCategories: next.customCategories,
                // Mantenemos `zone` legacy en sync con el primer coverageZone
                // marcado, para back-compat con clientes viejos que leen `zone`.
                zone: next.coverageZones[0] ?? p.zone,
              }));
            }}
          />

          {/* Comisión Buleje — campo de solo lectura aparte */}
          <SectionCard
            icon={Percent}
            title="Comisión Buleje"
            hint="Es lo que Buleje cobra por cada venta. La fija la plataforma — para revisarla, contáctanos por WhatsApp."
          >
            <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-5 py-4">
              <span className="text-3xl font-extrabold tabular-nums text-[var(--text-primary)]">
                {store.commissionRate}%
              </span>
              <span className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                Solo lectura
              </span>
            </div>
          </SectionCard>

          {/* Imagen */}
          <SectionCard icon={ImageIcon} title="Imagen de la tienda" hint="Logo cuadrado 200×200 — se muestra en la tarjeta del marketplace.">
            <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-6 items-start">
              <ImageUpload
                value={store.logoUrl}
                onChange={(url) => setStore((p) => ({ ...p, logoUrl: url }))}
                onClear={() => setStore((p) => ({ ...p, logoUrl: "" }))}
                folder="marketplace-logos"
                label=""
                hint=""
                aspectRatio="square"
              />
              <div className="space-y-3">
                <label className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  …o pega una URL de imagen
                </label>
                <input
                  type="url"
                  value={store.logoUrl}
                  onChange={(e) => setStore((p) => ({ ...p, logoUrl: e.target.value }))}
                  placeholder="https://..."
                  className={inputBase}
                />
                {store.logoUrl ? (
                  <div className="flex items-center gap-2 text-sm font-bold text-[var(--data-success-500)]">
                    <CheckCircle className="h-4 w-4" /> Logo configurado
                  </div>
                ) : (
                  <div className="flex items-start gap-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                    <Info className="h-4 w-4 mt-0.5 shrink-0" />
                    Sin logo, usaremos la inicial de tu tienda como avatar.
                  </div>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Horario */}
          <SectionCard
            icon={Calendar}
            title="Horario de atención"
            hint="Define los días y horas que tu tienda atiende pedidos."
          >
            <StoreHoursEditor hours={store.hours ?? DEFAULT_HOURS} onChange={(next) => setStore((p) => ({ ...p, hours: next }))} />
            <div className="mt-5 pt-5 border-t-2 border-[var(--rule-base)] flex items-center gap-3">
              {isOpenNow(store.hours ?? DEFAULT_HOURS) ? (
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--accent-soft)] text-[var(--data-success-500)] text-base font-bold">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--data-success-500)] animate-pulse" /> Abierto ahora
                </span>
              ) : (
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)] text-base font-bold">
                  <span className="h-2.5 w-2.5 rounded-full bg-[var(--text-tertiary)]" /> Cerrado en este momento
                </span>
              )}
              <span className="text-sm text-[var(--text-tertiary)]">según tu zona horaria</span>
            </div>
          </SectionCard>
        </div>

        {/* Columna derecha */}
        <aside className="lg:col-span-4 space-y-6 lg:sticky lg:top-4 self-start">
          <SectionCard icon={ImageIcon} title="Vista previa" hint="Así verán los clientes tu tienda en el listado.">
            <StorePreviewCard store={store} />
          </SectionCard>
          <SectionCard icon={Power} title="Estado de la tienda">
            <div className="space-y-1 -mx-2">
              <ToggleRow
                active={store.isActive}
                onToggle={() => setStore((p) => ({ ...p, isActive: !p.isActive }))}
                title="Publicada en marketplace"
                desc={store.isActive ? "Visible y aceptando pedidos." : "Borrador — solo tú la ves."}
                tone="primary"
              />
              <div className="border-t-2 border-[var(--rule-base)] mx-2" />
              <ToggleRow
                active={!!store.vacationMode}
                onToggle={() => setStore((p) => ({ ...p, vacationMode: !p.vacationMode }))}
                title="Modo vacaciones"
                desc="Pausa pedidos sin despublicar."
                tone="warning"
              />
              <div className="border-t-2 border-[var(--rule-base)] mx-2" />
              <ToggleRow
                active={construction.enabled}
                onToggle={() => setConstruction((p) => ({ ...p, enabled: !p.enabled }))}
                title="Tienda en construcción"
                desc="Cinta amarilla sobre la portada en /tiendas y /marketplace."
                tone="warning"
              />
            </div>
            {store.vacationMode && (
              <div className="mt-4 space-y-2 px-2">
                <label className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  Mensaje de vacaciones
                </label>
                <input
                  type="text"
                  value={store.vacationMessage ?? ""}
                  onChange={(e) => setStore((p) => ({ ...p, vacationMessage: e.target.value }))}
                  placeholder="Ej: Volvemos el lunes 15"
                  maxLength={500}
                  className={cn(
                    "w-full h-12 px-4 rounded-2xl border-2 text-base font-medium outline-none transition-all",
                    "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--text-primary)]",
                    "focus:ring-2 focus:ring-[var(--data-warning-500)]/30",
                  )}
                />
              </div>
            )}
            {construction.enabled && (
              <div className="mt-4 space-y-2 px-2">
                <label className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
                  <Wrench className="h-4 w-4" /> Mensaje del banner
                </label>
                <input
                  type="text"
                  value={construction.message}
                  onChange={(e) => setConstruction((p) => ({ ...p, message: e.target.value }))}
                  placeholder="Ej: Estamos armando el catálogo, vuelve pronto"
                  maxLength={120}
                  className={cn(
                    "w-full h-12 px-4 rounded-2xl border-2 text-base font-medium outline-none transition-all",
                    "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--text-primary)]",
                    "focus:ring-2 focus:ring-[var(--data-warning-500)]/30",
                  )}
                />
                <p className="text-sm text-[var(--text-tertiary)] leading-relaxed">
                  Aparece como cinta diagonal sobre la portada de tu tienda en el listado.
                </p>
              </div>
            )}
          </SectionCard>
        </aside>
      </div>

      {/* Action bar inferior */}
      <div className="sticky bottom-4 z-20 flex items-center justify-end gap-4 px-5 py-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]/95 backdrop-blur shadow-lg">
        {saved ? (
          <span className="text-base font-bold text-[var(--data-success-500)] flex items-center gap-2">
            <CheckCircle className="h-5 w-5" /> Guardado
          </span>
        ) : isDirty ? (
          <span className="text-sm font-medium text-[var(--text-secondary)]">Tienes cambios sin guardar</span>
        ) : null}
        <button
          onClick={handleSave}
          disabled={saving || !isDirty}
          className="inline-flex items-center gap-2 h-12 px-6 rounded-2xl bg-primary text-white text-base font-bold hover:bg-primary-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[var(--shadow-md)]"
        >
          {saving ? (
            <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <Save className="h-5 w-5" />
          )}
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
