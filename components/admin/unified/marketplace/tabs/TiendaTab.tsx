"use client";

import { useState, useEffect } from "react";
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
  ChevronDown,
} from "@buleje/design-system/icons";
import { CardTitle, SectionTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import ImageUpload from "@/components/admin/ImageUpload";
import { MARKETPLACE_ZONES } from "@/lib/marketplace-zones";
import { Spinner, type StoreData, type DayKey, type StoreHours } from "../types";

// ── Constantes locales ──────────────────────────────────────────────────────

const CATEGORIAS = [
  "Abarrotes", "Bebidas", "Lácteos", "Carnes", "Frutas y verduras",
  "Panadería", "Limpieza", "Higiene personal", "Electrónica", "Otros",
];

const ZONAS: string[] = (() => {
  const fromCatalog = MARKETPLACE_ZONES.map((z) => z.label);
  const extras = ["Coronel Portillo", "Ica Yanayacu", "Todos"];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of [...fromCatalog, ...extras]) {
    if (!seen.has(v)) { seen.add(v); out.push(v); }
  }
  return out;
})();

const DAY_LABELS: Array<{ key: DayKey; label: string }> = [
  { key: "mon", label: "Lun" },
  { key: "tue", label: "Mar" },
  { key: "wed", label: "Mié" },
  { key: "thu", label: "Jue" },
  { key: "fri", label: "Vie" },
  { key: "sat", label: "Sáb" },
  { key: "sun", label: "Dom" },
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
    <section className="bg-white border border-[var(--rule-base)] rounded-2xl overflow-hidden">
      <header className="flex items-start gap-3 px-5 pt-5 pb-3 border-b border-[var(--rule-base)]">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-primary shrink-0">
          <Icon className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0">
          <CardTitle className="text-sm">{title}</CardTitle>
          {hint && <p className="text-xs text-[var(--text-secondary)] mt-0.5">{hint}</p>}
        </div>
      </header>
      <div className="p-5">{children}</div>
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
  const onColor = tone === "warning" ? "bg-[var(--data-warning)]" : "bg-primary";
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between gap-4 text-left rounded-xl px-4 py-3 hover:bg-[var(--surface-sunken)] transition-colors"
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
        <p className="text-xs text-[var(--text-secondary)] mt-0.5">{desc}</p>
      </div>
      <span
        className={cn("relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0", active ? onColor : "bg-gray-300")}
        aria-pressed={active}
      >
        <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform", active ? "translate-x-6" : "translate-x-1")} />
      </span>
    </button>
  );
}

function StatusPill({ isActive, vacationMode }: { isActive: boolean; vacationMode?: boolean }) {
  if (vacationMode) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--data-warning-100)] text-[var(--data-warning)] text-xs font-semibold">
        <Pause className="h-3.5 w-3.5" /> En vacaciones
      </span>
    );
  }
  if (isActive) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--data-success)] text-xs font-semibold">
        <CheckCircle className="h-3.5 w-3.5" /> Publicada
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-[var(--text-secondary)] text-xs font-semibold">
      <EyeOff className="h-3.5 w-3.5" /> Borrador
    </span>
  );
}

function StorePreviewCard({ store }: { store: StoreData }) {
  const initial = (store.name || "T").trim().charAt(0).toUpperCase();
  return (
    <div className="rounded-2xl border border-[var(--rule-base)] bg-white overflow-hidden hover:shadow-lg transition-shadow">
      <div className="h-24 bg-linear-to-br from-[var(--accent-soft)] via-white to-[var(--surface-sunken)] relative">
        {store.zone && (
          <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/90 backdrop-blur text-[length:var(--ts-2xs)] font-semibold text-[var(--text-secondary)]">
            <MapPin className="h-3 w-3" /> {store.zone}
          </span>
        )}
      </div>
      <div className="px-4 pb-4 -mt-8">
        <div className="h-16 w-16 rounded-2xl border-4 border-white bg-white shadow-md overflow-hidden flex items-center justify-center">
          {store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logoUrl} alt={store.name} className="h-full w-full object-cover" onError={(e) => ((e.currentTarget.style.display = "none"))} />
          ) : (
            <span className="text-2xl font-bold text-primary">{initial}</span>
          )}
        </div>
        <h4 className="mt-2 text-base font-bold text-[var(--text-primary)] truncate">{store.name || "Tu tienda"}</h4>
        <p className="text-xs text-[var(--text-secondary)] line-clamp-2 min-h-[2.4em]">
          {store.description || "Agrega una descripción atractiva para que los clientes te conozcan."}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {store.category && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--surface-sunken)] text-[length:var(--ts-2xs)] font-semibold text-[var(--text-primary)]">
              <Tag className="h-3 w-3" /> {store.category}
            </span>
          )}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--surface-sunken)] text-[length:var(--ts-2xs)] font-semibold text-[var(--text-primary)]">
            <Percent className="h-3 w-3" /> {store.commissionRate}% comisión
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
      <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-1.5">
        <span className="h-3 w-3 border-2 border-[var(--text-tertiary)] border-t-transparent rounded-full animate-spin" />
        Verificando…
      </p>
    );
  }
  if (check.state === "valid") {
    return (
      <p className="text-xs flex items-center gap-1.5 font-semibold text-[var(--data-success)]">
        <CheckCircle className="h-3.5 w-3.5" />
        {check.isOwn ? "Es tu slug actual" : "Disponible"}
      </p>
    );
  }
  if (check.state === "invalid") {
    return (
      <p className="text-xs flex items-center gap-1.5 font-semibold text-[var(--data-error)]">
        <XCircle className="h-3.5 w-3.5" /> {check.message}
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      <p className="text-xs flex items-center gap-1.5 font-semibold text-[var(--data-error)]">
        <XCircle className="h-3.5 w-3.5" /> Ya está ocupado
      </p>
      {check.suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--text-secondary)]">Prueba con:</span>
          {check.suggestions.map((s) => (
            <button key={s} type="button" onClick={() => onPick(s)}
              className="px-2 py-0.5 rounded-full text-xs font-bold bg-primary/10 text-primary hover:bg-primary/20 transition">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StoreHoursEditor({ hours, onChange }: { hours: Record<DayKey, StoreHours>; onChange: (next: Record<DayKey, StoreHours>) => void }) {
  const setDay = (k: DayKey, patch: Partial<StoreHours>) => {
    onChange({ ...hours, [k]: { ...hours[k], ...patch } });
  };
  return (
    <div className="space-y-2">
      {DAY_LABELS.map(({ key, label }) => {
        const h = hours[key];
        return (
          <div key={key} className="grid grid-cols-[60px_1fr_auto] sm:grid-cols-[80px_1fr_1fr_auto] items-center gap-2">
            <span className="text-xs font-bold text-[var(--text-secondary)] uppercase">{label}</span>
            {h.closed ? (
              <span className="text-xs text-[var(--text-tertiary)] sm:col-span-2">Cerrado</span>
            ) : (
              <>
                <input type="time" value={h.open} onChange={(e) => setDay(key, { open: e.target.value })}
                  className="px-2 py-1 rounded-lg border border-[var(--rule-base)] bg-white text-xs" />
                <input type="time" value={h.close} onChange={(e) => setDay(key, { close: e.target.value })}
                  className="px-2 py-1 rounded-lg border border-[var(--rule-base)] bg-white text-xs" />
              </>
            )}
            <button type="button" onClick={() => setDay(key, { closed: !h.closed })}
              title={h.closed ? "Abrir este día" : "Cerrar este día"}
              className={cn("ml-auto sm:ml-0 px-2 py-1 rounded-md text-[length:var(--ts-2xs)] font-bold transition",
                h.closed ? "bg-[var(--data-error-100)] text-[var(--data-error)]" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-gray-200")}>
              {h.closed ? "Cerrado" : "Cerrar"}
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
export default function TiendaTab() {
  const [store, setStore] = useState<StoreData>({
    slug: "", name: "", description: "", logoUrl: "",
    category: "Abarrotes", zone: "Centro", commissionRate: 5, isActive: false,
    hours: DEFAULT_HOURS,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const [saved, setSaved]     = useState(false);
  const [copied, setCopied]   = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch("/api/marketplace/stores?my=true")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d && (d.slug || d.name)) setStore(d as StoreData); })
      .catch(() => setError("Error al cargar datos de la tienda."))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    if (!store.name?.trim()) { setError("El nombre de la tienda es obligatorio."); return; }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/marketplace/stores", {
        method: store.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(store),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Error al guardar");
      }
      const data = await res.json();
      setStore(data);
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
    const url = `marketplace.com/${store.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* noop */ }
  };

  if (loading) return <Spinner />;

  const inputBase = "w-full px-3 py-2.5 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-[var(--text-primary)] outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all";

  return (
    <div className="space-y-6 pb-24">
      {/* Status banner */}
      <div className="rounded-2xl border border-[var(--rule-base)] bg-linear-to-r from-white via-white to-[var(--accent-soft)]/40 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="h-14 w-14 rounded-2xl border border-[var(--rule-base)] bg-white shadow-sm overflow-hidden flex items-center justify-center shrink-0">
          {store.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={store.logoUrl} alt={store.name} className="h-full w-full object-cover" />
          ) : (
            <Store className="h-6 w-6 text-[var(--text-tertiary)]" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <SectionTitle className="text-lg truncate">{store.name || "Tu tienda en el marketplace"}</SectionTitle>
            <StatusPill isActive={store.isActive} vacationMode={store.vacationMode} />
          </div>
          {store.slug ? (
            <button type="button" onClick={handleCopyUrl}
              className="mt-1 inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-primary transition-colors">
              <Globe className="h-3.5 w-3.5" />
              <span className="font-mono">marketplace.com/{store.slug}</span>
              {copied ? <span className="text-[var(--data-success)] font-semibold">Copiado</span> : <Copy className="h-3 w-3" />}
            </button>
          ) : (
            <p className="mt-1 text-xs text-[var(--text-tertiary)]">Configura el slug abajo para tener tu URL pública.</p>
          )}
        </div>
        {store.slug && (
          <a href={`/${store.slug}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-[var(--rule-base)] text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors shrink-0">
            <ExternalLink className="h-3.5 w-3.5" /> Ver en marketplace
          </a>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-[var(--data-error-50)] border border-[var(--data-error)] rounded-xl text-sm text-[var(--data-error)]">
          <AlertCircle className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {/* Layout 2 columnas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          {/* Identidad */}
          <SectionCard icon={Store} title="Identidad" hint="Cómo te encuentran y reconocen tus clientes">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-1">
                <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1">
                  <Globe className="h-3 w-3" /> URL (slug)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-tertiary)] pointer-events-none">/</span>
                  <input type="text" value={store.slug}
                    onChange={(e) => setStore((p) => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))}
                    placeholder="mi-bodega" className={cn(inputBase, "pl-6")} />
                </div>
                <SlugLiveStatus slug={store.slug} onPick={(s) => setStore((p) => ({ ...p, slug: s }))} />
                <p className="text-xs text-[var(--text-tertiary)]">Solo minúsculas y guiones. No se puede cambiar fácilmente luego.</p>
              </div>
              <div className="space-y-1.5 sm:col-span-1">
                <label className="text-xs font-bold text-[var(--text-secondary)]">Nombre visible <span className="text-[var(--data-error)]">*</span></label>
                <input type="text" value={store.name} onChange={(e) => setStore((p) => ({ ...p, name: e.target.value }))} placeholder="Mi Bodega" className={inputBase} />
                <p className="text-xs text-[var(--text-tertiary)]">{store.name.length}/60 caracteres</p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-bold text-[var(--text-secondary)]">Descripción</label>
                <textarea rows={3} value={store.description} onChange={(e) => setStore((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Describe tu bodega: horarios, especialidades, qué te hace única…" className={cn(inputBase, "resize-none")} />
                <p className="text-xs text-[var(--text-tertiary)]">Aparece bajo el nombre en la tarjeta del marketplace ({store.description.length}/180).</p>
              </div>
            </div>
          </SectionCard>

          {/* Categorización */}
          <SectionCard icon={Tag} title="Categorización" hint="Aparece en filtros del marketplace y define tu comisión">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-secondary)]">Categoría principal</label>
                <div className="relative">
                  <select value={store.category} onChange={(e) => setStore((p) => ({ ...p, category: e.target.value }))}
                    className={cn(inputBase, "appearance-none pr-9")}>
                    {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1"><MapPin className="h-3 w-3" /> Zona de cobertura</label>
                <div className="relative">
                  <select value={store.zone} onChange={(e) => setStore((p) => ({ ...p, zone: e.target.value }))}
                    className={cn(inputBase, "appearance-none pr-9")}>
                    {ZONAS.map((z) => <option key={z} value={z}>{z}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-secondary)] flex items-center gap-1"><Percent className="h-3 w-3" /> Comisión acordada</label>
                <div className="relative">
                  <input type="number" min={0} max={30} step={0.5} value={store.commissionRate}
                    onChange={(e) => setStore((p) => ({ ...p, commissionRate: parseFloat(e.target.value) || 0 }))}
                    className={cn(inputBase, "pr-8")} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-tertiary)] pointer-events-none">%</span>
                </div>
              </div>
            </div>
          </SectionCard>

          {/* Imagen */}
          <SectionCard icon={ImageIcon} title="Imagen de la tienda" hint="Logo cuadrado 200×200 — se muestra en la tarjeta del marketplace">
            <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-5 items-start">
              <ImageUpload value={store.logoUrl} onChange={(url) => setStore((p) => ({ ...p, logoUrl: url }))}
                onClear={() => setStore((p) => ({ ...p, logoUrl: "" }))} folder="marketplace-logos" label="" hint="" aspectRatio="square" />
              <div className="space-y-2">
                <label className="text-xs font-bold text-[var(--text-secondary)]">…o pega una URL de imagen</label>
                <input type="url" value={store.logoUrl} onChange={(e) => setStore((p) => ({ ...p, logoUrl: e.target.value }))}
                  placeholder="https://..." className={inputBase} />
                {store.logoUrl ? (
                  <div className="flex items-center gap-1.5 text-xs text-[var(--data-success)]"><CheckCircle className="h-3.5 w-3.5" /> Logo configurado</div>
                ) : (
                  <div className="flex items-start gap-1.5 text-xs text-[var(--text-secondary)]"><Info className="h-3.5 w-3.5 mt-0.5 shrink-0" /> Sin logo, usaremos la inicial de tu tienda como avatar.</div>
                )}
              </div>
            </div>
          </SectionCard>

          {/* Horario */}
          <SectionCard icon={Calendar} title="Horario de atención" hint="Define los días y horas que tu tienda atiende pedidos">
            <StoreHoursEditor hours={store.hours ?? DEFAULT_HOURS} onChange={(next) => setStore((p) => ({ ...p, hours: next }))} />
            <div className="mt-3 pt-3 border-t border-[var(--rule-base)] flex items-center gap-2 text-xs">
              {isOpenNow(store.hours ?? DEFAULT_HOURS) ? (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--data-success)] font-bold">
                  <span className="h-2 w-2 rounded-full bg-[var(--data-success)] animate-pulse" /> Abierto ahora
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 text-[var(--text-secondary)] font-bold">
                  <span className="h-2 w-2 rounded-full bg-[var(--text-tertiary)]" /> Cerrado en este momento
                </span>
              )}
              <span className="text-[var(--text-tertiary)]">según tu zona horaria</span>
            </div>
          </SectionCard>
        </div>

        {/* Columna derecha */}
        <aside className="lg:col-span-4 space-y-6 lg:sticky lg:top-4 self-start">
          <SectionCard icon={ImageIcon} title="Vista previa" hint="Así verán los clientes tu tienda en el listado">
            <StorePreviewCard store={store} />
          </SectionCard>
          <SectionCard icon={Power} title="Estado de la tienda">
            <div className="space-y-1 -mx-2">
              <ToggleRow active={store.isActive} onToggle={() => setStore((p) => ({ ...p, isActive: !p.isActive }))}
                title="Publicada en marketplace" desc={store.isActive ? "Visible y aceptando pedidos." : "Borrador — solo tú la ves."} tone="primary" />
              <div className="border-t border-[var(--rule-base)] mx-2" />
              <ToggleRow active={!!store.vacationMode} onToggle={() => setStore((p) => ({ ...p, vacationMode: !p.vacationMode }))}
                title="Modo vacaciones" desc="Pausa pedidos sin despublicar." tone="warning" />
            </div>
            {store.vacationMode && (
              <div className="mt-3 space-y-1.5 px-2">
                <label className="text-xs font-bold text-[var(--text-secondary)]">Mensaje para tus clientes</label>
                <input type="text" value={store.vacationMessage ?? ""}
                  onChange={(e) => setStore((p) => ({ ...p, vacationMessage: e.target.value }))}
                  placeholder="Ej: Volvemos el lunes 15"
                  className={cn("w-full px-3 py-2 rounded-lg border text-sm outline-none transition-all",
                    "border-[var(--data-warning)] bg-[var(--data-warning-50)] text-[var(--text-primary)]",
                    "focus:ring-2 focus:ring-[var(--data-warning)]/30")} />
              </div>
            )}
          </SectionCard>
        </aside>
      </div>

      {/* Action bar inferior */}
      <div className="sticky bottom-4 z-10 flex items-center justify-end gap-3 px-4 py-3 rounded-2xl border border-[var(--rule-base)] bg-white/95 backdrop-blur shadow-lg">
        {saved && (
          <span className="text-sm text-[var(--data-success)] font-semibold flex items-center gap-1">
            <CheckCircle className="h-4 w-4" /> Guardado
          </span>
        )}
        <button onClick={handleSave} disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50">
          {saving ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>
    </div>
  );
}
