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
import { Field } from "@/components/admin/shared/Field";

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
  rightSlot,
  children,
}: {
  icon: React.ElementType;
  title: string;
  hint?: string;
  rightSlot?: React.ReactNode;
  children: React.ReactNode;
}) {
  // Brandon mayo 2026 v7: header más compacto. Icono 36px (era 44), padding
  // px-4 py-3 (era px-6 pt-5 pb-4). Inner padding p-4 (era p-6). Optional
  // rightSlot para badges tipo "12 marcadas".
  return (
    <section className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl overflow-hidden">
      <header className="flex items-center gap-3 px-4 sm:px-5 py-3.5 border-b border-[var(--rule-soft)]">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] shrink-0">
          <Icon className="h-4 w-4" strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <CardTitle className="text-sm sm:text-base font-extrabold leading-tight">{title}</CardTitle>
          {hint && <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-snug">{hint}</p>}
        </div>
        {rightSlot && <div className="shrink-0">{rightSlot}</div>}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
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
  // Brandon mayo 2026 v7: rediseño compacto. Antes: aspect 4/3 con imagen
  // enorme tipo banner. Ahora: card horizontal con thumb cuadrado 56x56 +
  // label inline. Ocupa ~3x menos espacio vertical. Selected = borde +
  // tick mini en esquina.
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "group relative w-full text-left rounded-xl overflow-hidden border-2 transition-colors flex items-center gap-3 p-2.5",
        selected
          ? "border-[var(--accent)] bg-primary/10"
          : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)]/50 hover:bg-primary/10",
      )}
    >
      <div className="relative h-12 w-12 shrink-0 rounded-lg overflow-hidden bg-[var(--surface-sunken)]">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
            alt={label}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-[var(--text-tertiary)]">
            <Tag className="h-5 w-5 opacity-40" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-extrabold truncate leading-tight",
            selected ? "text-[var(--accent)]" : "text-[var(--text-primary)]",
          )}
        >
          {label}
        </p>
        {badge && (
          <span className="inline-flex items-center mt-0.5 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
            {badge}
          </span>
        )}
      </div>
      {selected ? (
        <span className="shrink-0 h-6 w-6 rounded-full bg-[var(--accent)] text-white flex items-center justify-center">
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        </span>
      ) : (
        <span className="shrink-0 h-6 w-6 rounded-full border-2 border-[var(--rule-base)]" aria-hidden />
      )}
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
          <Field label="Nombre de la categoría" labelClassName="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]" className="space-y-2">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ej: Pizzas, Postres, Repuestos"
              maxLength={60}
              className="w-full h-12 px-4 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-base font-medium text-[var(--text-primary)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </Field>

          <div className="space-y-2">
            <span className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
              <ImageIcon className="h-4 w-4" /> Imagen de la categoría
            </span>
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
            <span className="text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-1.5">
              Subcategorías (opcional)
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {subs.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1.5 h-9 pl-3 pr-1.5 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] text-sm font-bold"
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
        hint="Elige cómo aparece tu tienda en filtros del marketplace."
        rightSlot={
          value.category ? (
            <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] text-xs font-extrabold">
              <Check className="h-3 w-3" strokeWidth={3} />
              Elegida
            </span>
          ) : (
            <span className="inline-flex items-center h-7 px-2.5 rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)] text-xs font-bold">
              Sin elegir
            </span>
          )
        }
      >
        {catalogLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div
                key={i}
                className="h-[68px] rounded-xl bg-[var(--surface-sunken)] animate-pulse"
              />
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
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
                <div key={c.id} className="relative group">
                  <CategoryCard
                    imageUrl={c.imageUrl}
                    label={c.label}
                    badge="Propia"
                    selected={value.category === c.id || value.category === c.label}
                    onClick={() => setCategory(c.id)}
                  />
                  <div className="absolute top-1.5 right-9 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditing(c);
                        setShowEditor(true);
                      }}
                      aria-label={`Editar ${c.label}`}
                      title="Editar"
                      className="h-6 w-6 rounded-full bg-[var(--surface-canvas)]/95 backdrop-blur border border-[var(--rule-base)] flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    >
                      <ImageIcon className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm(`¿Eliminar la categoría "${c.label}"?`)) deleteCustomCategory(c.id);
                      }}
                      aria-label={`Eliminar ${c.label}`}
                      title="Eliminar"
                      className="h-6 w-6 rounded-full bg-[var(--surface-canvas)]/95 backdrop-blur border border-[var(--rule-base)] flex items-center justify-center text-[var(--data-error-500)] hover:bg-[var(--data-error-50)]"
                    >
                      <Trash2 className="h-3 w-3" />
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
                className="h-[68px] rounded-xl border-2 border-dashed border-[var(--rule-base)] hover:border-[var(--accent)] hover:bg-primary/10 flex items-center justify-center gap-2 text-[var(--text-secondary)] hover:text-[var(--accent)] transition-colors"
              >
                <Plus className="h-4 w-4" strokeWidth={2.5} />
                <span className="text-sm font-extrabold">Crear propia</span>
              </button>
            </div>
            {catalog.length > 8 && (
              <button
                type="button"
                onClick={() => setShowAllCats((p) => !p)}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent)] hover:underline"
              >
                {showAllCats ? "Mostrar menos" : `Ver ${catalog.length - 8} categorías más`}
                <ChevronDown
                  className={cn("h-3.5 w-3.5 transition-transform", showAllCats && "rotate-180")}
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
          hint="Te ayuda a aparecer en búsquedas más específicas."
        >
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSubcategory(null)}
              className={cn(
                "h-9 px-3.5 rounded-full border-2 text-xs font-extrabold transition-colors",
                value.subcategory === null
                  ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
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
                    "h-9 px-3.5 rounded-full border-2 text-xs font-extrabold transition-colors",
                    active
                      ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          {selectedCustom && selectedCustom.subcategories.length === 0 && (
            <p className="mt-3 text-xs text-[var(--text-tertiary)]">
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
        hint="Marca dónde hacés delivery."
        rightSlot={
          <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] text-xs font-extrabold tabular-nums">
            {value.coverageZones.length}
            <span className="text-[length:var(--ts-2xs)] uppercase tracking-wider opacity-75">marcadas</span>
          </span>
        }
      >
        {ZONES_BY_CITY.map(({ city, zones }, cityIdx) => {
          const cityZoneIds = zones.map((z) => z.id);
          const allOn = cityZoneIds.every((id) => value.coverageZones.includes(id));
          const countOn = cityZoneIds.filter((id) => value.coverageZones.includes(id)).length;
          return (
            <div key={city} className={cn(cityIdx > 0 && "mt-4 pt-4 border-t border-[var(--rule-soft)]")}>
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="h-3.5 w-3.5 text-[var(--accent)] shrink-0" aria-hidden />
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-primary)]">
                  {city}
                </h4>
                <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] tabular-nums">
                  {countOn}/{zones.length}
                </span>
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
                  className="ml-auto text-xs font-bold text-[var(--accent)] hover:underline shrink-0"
                >
                  {allOn ? "Quitar todas" : "Marcar todas"}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {zones.map((z) => {
                  const active = value.coverageZones.includes(z.id);
                  return (
                    <button
                      key={z.id}
                      type="button"
                      onClick={() => toggleZone(z.id)}
                      aria-pressed={active}
                      className={cn(
                        "inline-flex items-center gap-1.5 h-9 px-3 rounded-full border-2 text-xs font-extrabold transition-colors",
                        active
                          ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                          : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]",
                      )}
                    >
                      {active && <Check className="h-3 w-3" strokeWidth={3} />}
                      {z.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Custom zones */}
        <div className="mt-4 pt-4 border-t border-[var(--rule-soft)]">
          <p className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-2">
            Otra zona (escribir)
          </p>
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
              className="flex-1 h-10 px-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-medium outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              onClick={addCustomZone}
              disabled={customZoneInput.trim().length < 2}
              className="h-10 px-3.5 rounded-xl bg-[var(--accent)] text-white font-extrabold inline-flex items-center gap-1.5 text-sm disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar
            </button>
          </div>
          {value.coverageZones.filter((z) => !ALL_KNOWN_ZONE_IDS.has(z)).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {value.coverageZones
                .filter((z) => !ALL_KNOWN_ZONE_IDS.has(z))
                .map((z) => (
                  <span
                    key={z}
                    className="inline-flex items-center gap-1 h-9 pl-3 pr-1 rounded-full border-2 border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] text-xs font-extrabold"
                  >
                    {z}
                    <button
                      type="button"
                      onClick={() => removeZone(z)}
                      aria-label={`Eliminar ${z}`}
                      className="h-6 w-6 rounded-full bg-[var(--surface-canvas)]/70 hover:bg-[var(--surface-canvas)] flex items-center justify-center"
                    >
                      <X className="h-3 w-3" strokeWidth={2.5} />
                    </button>
                  </span>
                ))}
            </div>
          )}
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
