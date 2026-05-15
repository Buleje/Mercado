"use client";

/**
 * CategoryZonePicker — sección compuesta del TiendaTab admin marketplace.
 *
 * Reemplaza dos secciones legacy (Categoría principal + Zona de cobertura)
 * por una UI más rica:
 *
 *   1. Categoría principal: grid de cards con imagen (consume el catálogo
 *      del superadmin via /api/marketplace/categories).
 *   2. Subcategoría: dependiente de la categoría seleccionada.
 *   3. Categorías propias: el tenant puede crear las suyas con imagen — solo
 *      se muestran en su propio storefront.
 *   4. Zonas de cobertura: multi-select agrupado por ciudad (Pucallpa /
 *      Ciudad Constitución) + soporte para zonas custom escritas a mano.
 *      Se persisten en store-extras.json y se exponen como filtro en /tiendas.
 *
 * Toda la persistencia "extra" va al endpoint
 *   /api/admin/marketplace/store-extras
 * y el caller (TiendaTab) hace el PUT en su handleSave. Este componente solo
 * gestiona el estado.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Tag,
  MapPin,
  Plus,
  X,
  Check,
  Image as ImageIcon,
  Sparkles,
  Trash2,
  ChevronDown,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { CardTitle } from "@buleje/design-system";
import ImageUpload from "@/components/admin/ImageUpload";
import { MARKETPLACE_ZONES } from "@/lib/marketplace-zones";

// ── Tipos compartidos con el endpoint ─────────────────────────────────────

export interface CatalogSubcategory {
  id: string;
  label: string;
  description?: string;
  imageUrl?: string | null;
}

export interface CatalogCategory {
  id: string;
  label: string;
  description?: string;
  imageUrl: string | null;
  subcategories?: CatalogSubcategory[];
}

export interface CustomSubcategory {
  id: string;
  label: string;
  imageUrl: string | null;
}

export interface CustomCategory {
  id: string;
  label: string;
  imageUrl: string | null;
  subcategories: CustomSubcategory[];
}

export interface CategoryZoneValue {
  category: string;
  subcategory: string | null;
  coverageZones: string[];
  customCategories: CustomCategory[];
}

interface Props {
  value: CategoryZoneValue;
  onChange: (next: CategoryZoneValue) => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const ZONES_BY_CITY = (() => {
  const grouped = new Map<string, Array<{ id: string; label: string }>>();
  for (const z of MARKETPLACE_ZONES) {
    const list = grouped.get(z.city) ?? [];
    list.push({ id: z.id, label: z.label });
    grouped.set(z.city, list);
  }
  return Array.from(grouped.entries()).map(([city, zones]) => ({ city, zones }));
})();

const ALL_KNOWN_ZONE_IDS = new Set(MARKETPLACE_ZONES.map((z) => z.id));

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function randomId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

// ── Section wrapper (igual look que SectionCard del padre) ────────────────

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

// ── Card visual de categoría (selector grid) ──────────────────────────────

function CategoryCard({
  imageUrl,
  label,
  selected,
  onClick,
  badge,
}: {
  imageUrl: string | null;
  label: string;
  selected: boolean;
  onClick: () => void;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "group relative w-full text-left rounded-2xl overflow-hidden border-2 transition-all",
        selected
          ? "border-[var(--accent)] shadow-lg shadow-[var(--accent)]/20 ring-2 ring-[var(--accent)]/40"
          : "border-[var(--rule-base)] hover:border-[var(--accent)]/60 hover:shadow-md",
      )}
    >
      <div className="relative aspect-[4/3] w-full bg-[var(--surface-sunken)]">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={label}
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[var(--text-tertiary)]">
            <Tag className="h-8 w-8 opacity-40" />
          </div>
        )}
        {selected && (
          <div className="absolute inset-0 bg-[var(--accent)]/15 flex items-end justify-end p-2">
            <span className="h-7 w-7 rounded-full bg-[var(--accent)] text-white flex items-center justify-center shadow-md">
              <Check className="h-4 w-4" strokeWidth={3} />
            </span>
          </div>
        )}
        {badge && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 h-6 px-2 rounded-full bg-[var(--surface-canvas)]/95 backdrop-blur text-xs font-extrabold uppercase tracking-wider text-[var(--text-primary)]">
            {badge}
          </span>
        )}
      </div>
      <div className="px-3 py-2.5 bg-[var(--surface-raised)]">
        <p className="text-sm font-extrabold text-[var(--text-primary)] truncate">{label}</p>
      </div>
    </button>
  );
}

// ── Modal mínimo para crear/editar categoría custom ───────────────────────

function CustomCategoryEditor({
  initial,
  onClose,
  onSave,
}: {
  initial: CustomCategory | null;
  onClose: () => void;
  onSave: (cat: CustomCategory) => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [imageUrl, setImageUrl] = useState<string>(initial?.imageUrl ?? "");
  const [subs, setSubs] = useState<CustomSubcategory[]>(initial?.subcategories ?? []);
  const [newSub, setNewSub] = useState("");

  const canSave = label.trim().length >= 2;

  const addSub = () => {
    const trimmed = newSub.trim();
    if (trimmed.length < 2) return;
    setSubs((p) => [
      ...p,
      { id: slugify(trimmed) || randomId("sub"), label: trimmed, imageUrl: null },
    ]);
    setNewSub("");
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center px-4 py-6">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-black/55 backdrop-blur-sm"
      />
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-3xl bg-[var(--surface-canvas)] border-2 border-[var(--rule-base)] shadow-2xl">
        <header className="flex items-center justify-between px-6 py-4 border-b-2 border-[var(--rule-base)] sticky top-0 bg-[var(--surface-canvas)] z-10">
          <h3 className="text-lg font-extrabold text-[var(--text-primary)]">
            {initial ? "Editar categoría propia" : "Nueva categoría propia"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="h-9 w-9 rounded-xl border-2 border-[var(--rule-base)] flex items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-6 space-y-5">
          <div className="space-y-2">
            <label className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
              Nombre de la categoría
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ej: Pizzas, Postres, Repuestos"
              maxLength={60}
              className="w-full h-12 px-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-medium text-[var(--text-primary)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
              <ImageIcon className="h-4 w-4" /> Imagen de la categoría
            </label>
            <ImageUpload
              value={imageUrl}
              onChange={(url) => setImageUrl(url)}
              onClear={() => setImageUrl("")}
              folder="marketplace-store-extras"
              label=""
              hint="Cuadrada 400×400 — se muestra en /tiendas y en filtros."
              aspectRatio="square"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
              Subcategorías (opcional)
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {subs.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1.5 h-9 pl-3 pr-1.5 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] text-sm font-bold"
                >
                  {s.label}
                  <button
                    type="button"
                    aria-label={`Eliminar ${s.label}`}
                    onClick={() => setSubs((p) => p.filter((x) => x.id !== s.id))}
                    className="h-6 w-6 rounded-full bg-[var(--surface-canvas)]/60 hover:bg-[var(--surface-canvas)] flex items-center justify-center"
                  >
                    <X className="h-3 w-3" strokeWidth={2.5} />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={newSub}
                onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSub();
                  }
                }}
                placeholder="Ej: Pizza familiar"
                maxLength={40}
                className="flex-1 h-12 px-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
              <button
                type="button"
                onClick={addSub}
                disabled={newSub.trim().length < 2}
                className="h-12 px-4 rounded-2xl bg-[var(--accent)] text-white font-extrabold inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                <Plus className="h-4 w-4" /> Agregar
              </button>
            </div>
          </div>
        </div>
        <footer className="px-6 py-4 border-t-2 border-[var(--rule-base)] flex justify-end gap-3 sticky bottom-0 bg-[var(--surface-canvas)]">
          <button
            type="button"
            onClick={onClose}
            className="h-12 px-5 rounded-2xl border-2 border-[var(--rule-base)] text-base font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => {
              onSave({
                id: initial?.id ?? randomId("cat"),
                label: label.trim(),
                imageUrl: imageUrl || null,
                subcategories: subs,
              });
              onClose();
            }}
            className="h-12 px-6 rounded-2xl bg-[var(--accent)] text-white text-base font-extrabold inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Check className="h-4 w-4" strokeWidth={3} />
            Guardar categoría
          </button>
        </footer>
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────

export default function CategoryZonePicker({ value, onChange }: Props) {
  const [catalog, setCatalog] = useState<CatalogCategory[]>([]);
  // Empieza en true; el primer fetch (success o fail) lo pone false en finally.
  const [catalogLoading, setCatalogLoading] = useState<boolean>(true);
  const [editing, setEditing] = useState<CustomCategory | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [customZoneInput, setCustomZoneInput] = useState("");
  const [showAllCats, setShowAllCats] = useState(false);

  // Cargar catálogo del marketplace una sola vez. Mantenemos el setCatalogLoading
  // sincrono en el effect (warning aceptado) porque el loading inicia true y
  // necesitamos resetearlo si el componente se reusara con otro tenant.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/marketplace/categories")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const list: CatalogCategory[] = Array.isArray(data.categories) ? data.categories : [];
        setCatalog(list);
      })
      .catch((err) => {
        // Fallback silencioso: si el endpoint falla mostramos el grid vacío
        // + el botón "Crear propia". El admin sigue pudiendo guardar.
        if (typeof window !== "undefined") {
          window.console.warn("[CategoryZonePicker] catalog load failed", err);
        }
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Categoría seleccionada del catálogo (puede ser global o custom)
  const selectedCatalog = useMemo(
    () => catalog.find((c) => c.id === value.category || c.label === value.category),
    [catalog, value.category],
  );
  const selectedCustom = useMemo(
    () => value.customCategories.find((c) => c.id === value.category || c.label === value.category),
    [value.customCategories, value.category],
  );

  const subcategoriesAvailable: Array<{ id: string; label: string }> = useMemo(() => {
    if (selectedCatalog?.subcategories?.length) {
      return selectedCatalog.subcategories.map((s) => ({ id: s.id, label: s.label }));
    }
    if (selectedCustom?.subcategories?.length) {
      return selectedCustom.subcategories.map((s) => ({ id: s.id, label: s.label }));
    }
    return [];
  }, [selectedCatalog, selectedCustom]);

  const visibleCatalog = showAllCats ? catalog : catalog.slice(0, 8);

  // Helpers de actualización
  const setCategory = (id: string) => {
    onChange({ ...value, category: id, subcategory: null });
  };
  const setSubcategory = (id: string | null) => onChange({ ...value, subcategory: id });
  const toggleZone = (zoneId: string) => {
    const set = new Set(value.coverageZones);
    if (set.has(zoneId)) set.delete(zoneId);
    else set.add(zoneId);
    onChange({ ...value, coverageZones: Array.from(set) });
  };
  const removeZone = (zoneId: string) => {
    onChange({
      ...value,
      coverageZones: value.coverageZones.filter((z) => z !== zoneId),
    });
  };
  const addCustomZone = () => {
    const trimmed = customZoneInput.trim();
    if (trimmed.length < 2) return;
    if (value.coverageZones.includes(trimmed)) {
      setCustomZoneInput("");
      return;
    }
    onChange({ ...value, coverageZones: [...value.coverageZones, trimmed] });
    setCustomZoneInput("");
  };
  const upsertCustomCategory = (cat: CustomCategory) => {
    const existing = value.customCategories.findIndex((c) => c.id === cat.id);
    const next =
      existing >= 0
        ? value.customCategories.map((c, i) => (i === existing ? cat : c))
        : [...value.customCategories, cat];
    onChange({ ...value, customCategories: next });
  };
  const deleteCustomCategory = (id: string) => {
    onChange({
      ...value,
      customCategories: value.customCategories.filter((c) => c.id !== id),
      category: value.category === id ? "" : value.category,
    });
  };

  return (
    <>
      {/* ── Categoría principal ────────────────────────── */}
      <SectionCard
        icon={Tag}
        title="Categoría principal"
        hint="Elige cómo aparece tu tienda en filtros del marketplace y en /tiendas."
      >
        {catalogLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className="aspect-[4/3] rounded-2xl bg-[var(--surface-sunken)] animate-pulse"
              />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {visibleCatalog.map((c) => (
                <CategoryCard
                  key={c.id}
                  imageUrl={c.imageUrl}
                  label={c.label}
                  selected={value.category === c.id || value.category === c.label}
                  onClick={() => setCategory(c.id)}
                />
              ))}
              {value.customCategories.map((c) => (
                <div key={c.id} className="relative">
                  <CategoryCard
                    imageUrl={c.imageUrl}
                    label={c.label}
                    badge="Propia"
                    selected={value.category === c.id || value.category === c.label}
                    onClick={() => setCategory(c.id)}
                  />
                  <div className="absolute top-2 right-2 flex gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(c);
                        setShowEditor(true);
                      }}
                      aria-label={`Editar ${c.label}`}
                      title="Editar"
                      className="h-7 w-7 rounded-full bg-[var(--surface-canvas)]/95 backdrop-blur border border-[var(--rule-base)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      <ImageIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`¿Eliminar la categoría "${c.label}"?`)) deleteCustomCategory(c.id);
                      }}
                      aria-label={`Eliminar ${c.label}`}
                      title="Eliminar"
                      className="h-7 w-7 rounded-full bg-[var(--surface-canvas)]/95 backdrop-blur border border-[var(--rule-base)] flex items-center justify-center text-[var(--data-error-500)] hover:bg-[var(--data-error-50)]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setShowEditor(true);
                }}
                className="aspect-[4/3] rounded-2xl border-2 border-dashed border-[var(--rule-base)] hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/30 flex flex-col items-center justify-center gap-2 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors group"
              >
                <span className="h-12 w-12 rounded-full bg-[var(--surface-sunken)] group-hover:bg-[var(--accent-soft)] flex items-center justify-center">
                  <Plus className="h-6 w-6" strokeWidth={2.5} />
                </span>
                <span className="text-sm font-extrabold">Crear propia</span>
              </button>
            </div>
            {catalog.length > 8 && (
              <button
                type="button"
                onClick={() => setShowAllCats((p) => !p)}
                className="mt-4 inline-flex items-center gap-1.5 text-sm font-bold text-[var(--accent)] hover:underline"
              >
                {showAllCats ? "Mostrar menos" : `Ver ${catalog.length - 8} categorías más`}
                <ChevronDown
                  className={cn("h-4 w-4 transition-transform", showAllCats && "rotate-180")}
                />
              </button>
            )}
          </>
        )}
      </SectionCard>

      {/* ── Subcategoría ───────────────────────────────── */}
      {subcategoriesAvailable.length > 0 && (
        <SectionCard
          icon={Sparkles}
          title="Subcategoría"
          hint="Una subcategoría te ayuda a aparecer en búsquedas más específicas."
        >
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSubcategory(null)}
              className={cn(
                "h-11 px-4 rounded-full border-2 text-sm font-extrabold transition-colors",
                value.subcategory === null
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
              )}
            >
              Sin subcategoría
            </button>
            {subcategoriesAvailable.map((s) => {
              const active = value.subcategory === s.id || value.subcategory === s.label;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSubcategory(s.id)}
                  className={cn(
                    "h-11 px-4 rounded-full border-2 text-sm font-extrabold transition-colors",
                    active
                      ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                      : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          {selectedCustom && selectedCustom.subcategories.length === 0 && (
            <p className="mt-4 text-sm text-[var(--text-tertiary)]">
              Esta categoría propia aún no tiene subcategorías.{" "}
              <button
                type="button"
                onClick={() => {
                  setEditing(selectedCustom);
                  setShowEditor(true);
                }}
                className="font-bold text-[var(--accent)] hover:underline"
              >
                Agregar
              </button>
            </p>
          )}
        </SectionCard>
      )}

      {/* ── Zonas de cobertura ─────────────────────────── */}
      <SectionCard
        icon={MapPin}
        title="Zonas de cobertura"
        hint="Marca todas las zonas donde haces delivery. Aparece como filtro en /tiendas para los clientes."
      >
        {ZONES_BY_CITY.map(({ city, zones }) => {
          const cityZoneIds = zones.map((z) => z.id);
          const allOn = cityZoneIds.every((id) => value.coverageZones.includes(id));
          return (
            <div key={city} className="mb-5 last:mb-0">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-extrabold uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-[var(--accent)]" />
                  {city}
                </h4>
                <button
                  type="button"
                  onClick={() => {
                    if (allOn) {
                      onChange({
                        ...value,
                        coverageZones: value.coverageZones.filter((z) => !cityZoneIds.includes(z)),
                      });
                    } else {
                      const merged = new Set([...value.coverageZones, ...cityZoneIds]);
                      onChange({ ...value, coverageZones: Array.from(merged) });
                    }
                  }}
                  className="text-xs font-bold text-[var(--accent)] hover:underline"
                >
                  {allOn ? "Quitar todas" : "Marcar todas"}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {zones.map((z) => {
                  const active = value.coverageZones.includes(z.id);
                  return (
                    <button
                      key={z.id}
                      type="button"
                      onClick={() => toggleZone(z.id)}
                      aria-pressed={active}
                      className={cn(
                        "inline-flex items-center gap-2 h-11 px-4 rounded-full border-2 text-sm font-extrabold transition-colors",
                        active
                          ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                          : "border-[var(--rule-base)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
                      )}
                    >
                      {active && <Check className="h-4 w-4" strokeWidth={3} />}
                      {z.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Custom zones */}
        <div className="mt-5 pt-5 border-t-2 border-[var(--rule-base)]">
          <p className="text-sm font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-3">
            Otras zonas (escribir)
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {value.coverageZones
              .filter((z) => !ALL_KNOWN_ZONE_IDS.has(z))
              .map((z) => (
                <span
                  key={z}
                  className="inline-flex items-center gap-1.5 h-11 pl-4 pr-1.5 rounded-full border-2 border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)] text-sm font-extrabold"
                >
                  {z}
                  <button
                    type="button"
                    onClick={() => removeZone(z)}
                    aria-label={`Eliminar ${z}`}
                    className="h-7 w-7 rounded-full bg-[var(--surface-canvas)]/70 hover:bg-[var(--surface-canvas)] flex items-center justify-center"
                  >
                    <X className="h-3.5 w-3.5" strokeWidth={2.5} />
                  </button>
                </span>
              ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={customZoneInput}
              onChange={(e) => setCustomZoneInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomZone();
                }
              }}
              placeholder="Ej: Sector San Juan, AAHH Las Palmeras"
              maxLength={100}
              className="flex-1 h-12 px-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-medium outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
            <button
              type="button"
              onClick={addCustomZone}
              disabled={customZoneInput.trim().length < 2}
              className="h-12 px-4 rounded-2xl bg-[var(--accent)] text-white font-extrabold inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" /> Agregar
            </button>
          </div>
          <p className="mt-2 text-xs text-[var(--text-tertiary)]">
            Total marcadas: <span className="font-extrabold tabular-nums">{value.coverageZones.length}</span>
          </p>
        </div>
      </SectionCard>

      {/* Modal de edición de categoría custom */}
      {showEditor && (
        <CustomCategoryEditor
          initial={editing}
          onClose={() => {
            setShowEditor(false);
            setEditing(null);
          }}
          onSave={(cat) => upsertCustomCategory(cat)}
        />
      )}
    </>
  );
}
