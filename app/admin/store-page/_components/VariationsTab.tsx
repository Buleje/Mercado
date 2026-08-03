"use client";

/**
 * VariationsTab — admin UI para configurar grupos de variaciones por producto.
 *
 * UX: lista de productos del tenant a la izquierda con resumen "N grupos · M
 * opciones"; al seleccionar uno, se abre un editor lateral donde el dueño
 * gestiona los grupos (Cremas, Talla, Presa…) y sus opciones.
 *
 * Aplica a cualquier categoria (polleria, ropa, farmacia, restaurante, bodega).
 */

import { useEffect, useMemo, useState } from "react";
import {
  Layers,
  Plus,
  Search,
  Trash2,
  X,
  ChevronRight,
  Loader2,
  Save,
  Sparkles,
  GripVertical,
} from "@buleje/design-system/icons";
import Image from "next/image";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import AdminTabShell from "../../_components/_shared/AdminTabShell";
import { ADMIN_TOKENS } from "../../_components/_shared/admin-tokens";

interface ProductSummary {
  id: number;
  name: string;
  category: string;
  image: string | null;
  price: number;
  groupCount: number;
  optionCount: number;
}

interface ModifierOption {
  id: string;
  groupId: string;
  name: string;
  priceDelta: number;
  position: number;
  isDefault: boolean;
  isActive: boolean;
  imageUrl: string | null;
  tenantId: string;
}

interface ModifierGroup {
  id: string;
  productId: number;
  name: string;
  description: string | null;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  position: number;
  isActive: boolean;
  tenantId: string;
  options: ModifierOption[];
}

const PRESETS: Array<{
  label: string;
  description: string;
  group: Partial<ModifierGroup> & { name: string };
  options: Array<{ name: string; priceDelta?: number }>;
}> = [
  {
    label: "Talla",
    description: "Ropa, calzado",
    group: { name: "Talla", required: true, minSelect: 1, maxSelect: 1 },
    options: [
      { name: "S" },
      { name: "M" },
      { name: "L" },
      { name: "XL" },
    ],
  },
  {
    label: "Presa",
    description: "Polleria, restaurante",
    group: { name: "Presa", required: true, minSelect: 1, maxSelect: 1 },
    options: [{ name: "Pierna" }, { name: "Pecho" }, { name: "Ala" }],
  },
  {
    label: "Cremas",
    description: "Polleria, comida criolla",
    group: { name: "Cremas", required: false, minSelect: 0, maxSelect: 3 },
    options: [
      { name: "Mayonesa" },
      { name: "Ketchup" },
      { name: "Mostaza" },
      { name: "Aji" },
      { name: "Huancaina" },
    ],
  },
  {
    label: "Extras",
    description: "Acompañantes con costo",
    group: { name: "Extras", required: false, minSelect: 0, maxSelect: 5 },
    options: [
      { name: "Papas extra", priceDelta: 3 },
      { name: "Ensalada", priceDelta: 4 },
      { name: "Inca Kola", priceDelta: 5 },
    ],
  },
  {
    label: "Sabor",
    description: "Heladeria, juguerias",
    group: { name: "Sabor", required: true, minSelect: 1, maxSelect: 1 },
    options: [{ name: "Chocolate" }, { name: "Vainilla" }, { name: "Fresa" }],
  },
  {
    label: "Presentacion",
    description: "Farmacia, abarrotes",
    group: { name: "Presentacion", required: true, minSelect: 1, maxSelect: 1 },
    options: [{ name: "500mg" }, { name: "1g" }],
  },
];

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

export default function VariationsTab() {
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    void loadProducts();
     
  }, [refreshKey]);

  async function loadProducts() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/products-with-modifiers-summary");
      if (!res.ok) throw new Error("No se pudo cargar productos");
      const json = await res.json();
      setProducts(json.products ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q),
    );
  }, [products, search]);

  const selected = products.find((p) => p.id === selectedProductId) ?? null;

  return (
    <AdminTabShell
      title="Variaciones de productos"
      description="Configura opciones que el cliente elige antes de agregar al carrito: cremas, presa, talla, color, sabor, extras. Funciona para pollería, ropa, farmacia, restaurante y cualquier negocio."
      icon={Layers}
      chip={{ label: "Universal", icon: Sparkles, tone: "accent" }}
    >
      {error && <div className={ADMIN_TOKENS.errorBanner}>{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
        {/* Lista de productos */}
        <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden flex flex-col max-h-[80vh]">
          <div className="p-3 border-b border-[var(--rule-soft)]">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]"
                aria-hidden
              />
              <input
                type="search"
                placeholder="Buscar producto…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-6 text-sm text-[var(--text-secondary)] inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando productos…
              </div>
            ) : filtered.length === 0 ? (
              <div className="p-6 text-sm text-[var(--text-tertiary)]">
                No hay productos {search ? "que coincidan" : "en tu tienda"}.
              </div>
            ) : (
              <ul className="divide-y divide-[var(--rule-soft)]">
                {filtered.map((p) => {
                  const isSel = p.id === selectedProductId;
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedProductId(p.id)}
                        className={`w-full text-left px-3 py-2.5 flex items-center gap-3 transition-colors ${
                          isSel
                            ? "bg-primary/10"
                            : "hover:bg-[var(--surface-sunken)]"
                        }`}
                      >
                        <div className="shrink-0 h-10 w-10 rounded-lg overflow-hidden bg-[var(--surface-sunken)] flex items-center justify-center text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
                          {p.image ? (
                            <Image
                              src={p.image}
                              alt={p.name}
                              width={40}
                              height={40}
                              className="object-cover w-full h-full"
                            />
                          ) : (
                            p.category.slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                            {p.name}
                          </p>
                          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                            {p.groupCount === 0
                              ? "Sin variaciones"
                              : `${p.groupCount} grupo${p.groupCount === 1 ? "" : "s"} · ${p.optionCount} opcion${p.optionCount === 1 ? "" : "es"}`}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] shrink-0" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
          {selected ? (
            <ProductModifierEditor
              product={selected}
              onChange={() => setRefreshKey((k) => k + 1)}
            />
          ) : (
            <div className="p-10 text-center text-sm text-[var(--text-tertiary)]">
              Selecciona un producto a la izquierda para configurar sus variaciones.
            </div>
          )}
        </div>
      </div>
    </AdminTabShell>
  );
}

/* ── ProductModifierEditor ───────────────────────────────────────────────── */

function ProductModifierEditor({
  product,
  onChange,
}: {
  product: ProductSummary;
  onChange: () => void;
}) {
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/products/${product.id}/modifier-groups`,
      );
      if (!res.ok) throw new Error("No se pudo cargar variaciones");
      const json = await res.json();
      setGroups(json.groups ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product.id]);

  async function addGroup(input: {
    name: string;
    required: boolean;
    minSelect: number;
    maxSelect: number;
    options: Array<{ name: string; priceDelta?: number }>;
  }) {
    const res = await fetch(
      `/api/admin/products/${product.id}/modifier-groups`,
      {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          name: input.name,
          required: input.required,
          minSelect: input.minSelect,
          maxSelect: input.maxSelect,
          position: groups.length,
        }),
      },
    );
    if (!res.ok) throw new Error("No se pudo crear el grupo");
    const group = (await res.json()) as ModifierGroup;
    // Crear opciones en cascada
    for (const [idx, opt] of input.options.entries()) {
      await fetch(`/api/admin/modifier-groups/${group.id}/options`, {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          name: opt.name,
          priceDelta: opt.priceDelta ?? 0,
          position: idx,
        }),
      });
    }
    await reload();
    onChange();
  }

  async function deleteGroup(groupId: string) {
    if (!confirm("¿Eliminar este grupo y todas sus opciones?")) return;
    const res = await fetch(
      `/api/admin/products/${product.id}/modifier-groups/${groupId}`,
      { method: "DELETE", headers: csrfHeaders() },
    );
    if (!res.ok) {
      alert("No se pudo eliminar");
      return;
    }
    await reload();
    onChange();
  }

  async function updateGroup(
    groupId: string,
    patch: Partial<Pick<ModifierGroup, "name" | "required" | "minSelect" | "maxSelect" | "isActive">>,
  ) {
    await fetch(
      `/api/admin/products/${product.id}/modifier-groups/${groupId}`,
      {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(patch),
      },
    );
    await reload();
    onChange();
  }

  async function addOption(groupId: string) {
    const name = prompt("Nombre de la opcion (ej: Mayonesa, Talla M, Pierna)");
    if (!name?.trim()) return;
    const priceDeltaStr = prompt("Costo adicional en S/ (0 si no cobra extra)", "0");
    const priceDelta = parseFloat(priceDeltaStr ?? "0") || 0;
    await fetch(`/api/admin/modifier-groups/${groupId}/options`, {
      method: "POST",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ name: name.trim(), priceDelta }),
    });
    await reload();
    onChange();
  }

  async function updateOption(
    optionId: string,
    patch: Partial<Pick<ModifierOption, "name" | "priceDelta" | "isDefault" | "isActive" | "imageUrl">>,
  ) {
    await fetch(`/api/admin/modifier-options/${optionId}`, {
      method: "PATCH",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(patch),
    });
    await reload();
    onChange();
  }

  async function deleteOption(optionId: string) {
    if (!confirm("¿Eliminar esta opcion?")) return;
    await fetch(`/api/admin/modifier-options/${optionId}`, {
      method: "DELETE",
      headers: csrfHeaders(),
    });
    await reload();
    onChange();
  }

  return (
    <div className="flex flex-col max-h-[80vh]">
      {/* Header del producto */}
      <div className="px-5 py-4 border-b border-[var(--rule-soft)] flex items-center gap-3">
        <div className="shrink-0 h-12 w-12 rounded-lg overflow-hidden bg-[var(--surface-sunken)]">
          {product.image && (
            <Image
              src={product.image}
              alt={product.name}
              width={48}
              height={48}
              className="object-cover w-full h-full"
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-[var(--text-primary)] truncate">
            {product.name}
          </h3>
          <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
            {product.category} · base {fmt(product.price)}
          </p>
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {error && (
          <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-rose-50/40 dark:bg-rose-950/20 px-4 py-2 text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm text-[var(--text-secondary)] inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando…
          </div>
        ) : (
          <>
            {groups.length === 0 && (
              <div className="rounded-xl border border-dashed border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-6 text-center">
                <p className="text-sm text-[var(--text-secondary)] mb-3">
                  Aún no tienes variaciones para este producto.
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  Empezá con un preset rápido (abajo) o creá uno custom.
                </p>
              </div>
            )}

            <SortableGroupList
              groups={groups}
              onReorder={async (ids) => {
                // Optimistic — actualizamos el orden en local primero
                const reordered = ids
                  .map((id) => groups.find((g) => g.id === id))
                  .filter((g): g is ModifierGroup => Boolean(g));
                setGroups(reordered);
                await fetch(
                  `/api/admin/products/${product.id}/modifier-groups/reorder`,
                  {
                    method: "POST",
                    headers: csrfHeaders({ "Content-Type": "application/json" }),
                    body: JSON.stringify({ ids }),
                  },
                ).catch((err) => {
                   
                  console.warn("[reorder-groups] silent fail", err);
                });
              }}
              renderGroup={(g) => (
                <GroupCard
                  group={g}
                  onUpdate={(patch) => updateGroup(g.id, patch)}
                  onDelete={() => deleteGroup(g.id)}
                  onAddOption={() => addOption(g.id)}
                  onUpdateOption={updateOption}
                  onDeleteOption={deleteOption}
                  onReorderOptions={async (optionIds) => {
                    await fetch(
                      `/api/admin/modifier-groups/${g.id}/options/reorder`,
                      {
                        method: "POST",
                        headers: csrfHeaders({ "Content-Type": "application/json" }),
                        body: JSON.stringify({ ids: optionIds }),
                      },
                    ).catch((err) => {
                       
                      console.warn("[reorder-options] silent fail", err);
                    });
                  }}
                />
              )}
            />

            {/* Presets */}
            <div className="border-t border-[var(--rule-soft)] pt-4 mt-4">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-3">
                Agregar grupo desde preset
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() =>
                      addGroup({
                        name: p.group.name,
                        required: p.group.required ?? false,
                        minSelect: p.group.minSelect ?? 0,
                        maxSelect: p.group.maxSelect ?? 1,
                        options: p.options,
                      })
                    }
                    className="rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3 text-left hover:border-[var(--accent)]/40 hover:bg-primary/10 transition-colors"
                  >
                    <p className="text-sm font-bold text-[var(--text-primary)] inline-flex items-center gap-1">
                      <Plus className="h-3.5 w-3.5 text-[var(--accent)]" aria-hidden />
                      {p.label}
                    </p>
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-0.5">
                      {p.description}
                    </p>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const name = prompt("Nombre del grupo (ej: Toppings)");
                    if (!name?.trim()) return;
                    void addGroup({
                      name: name.trim(),
                      required: false,
                      minSelect: 0,
                      maxSelect: 1,
                      options: [],
                    });
                  }}
                  className="rounded-lg border border-dashed border-[var(--accent)]/40 bg-primary/10 p-3 text-left hover:bg-primary/10 transition-colors"
                >
                  <p className="text-sm font-bold text-[var(--accent)] inline-flex items-center gap-1">
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Custom
                  </p>
                  <p className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] mt-0.5">
                    Crear grupo desde cero
                  </p>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ── GroupCard ───────────────────────────────────────────────────────────── */

function GroupCard({
  group,
  onUpdate,
  onDelete,
  onAddOption,
  onUpdateOption,
  onDeleteOption,
  onReorderOptions,
}: {
  group: ModifierGroup;
  onUpdate: (patch: Partial<Pick<ModifierGroup, "name" | "required" | "minSelect" | "maxSelect" | "isActive">>) => Promise<void> | void;
  onDelete: () => void;
  onAddOption: () => void;
  onUpdateOption: (id: string, patch: Partial<Pick<ModifierOption, "name" | "priceDelta" | "isDefault" | "isActive" | "imageUrl">>) => Promise<void> | void;
  onDeleteOption: (id: string) => void;
  onReorderOptions?: (ids: string[]) => Promise<void> | void;
}) {
  const [name, setName] = useState(group.name);
  const [required, setRequired] = useState(group.required);
  const [minSelect, setMinSelect] = useState(group.minSelect);
  const [maxSelect, setMaxSelect] = useState(group.maxSelect);
  const [savingMeta, setSavingMeta] = useState(false);

  // Sync cuando el grupo cambia desde el padre
  useEffect(() => {
    setName(group.name);
    setRequired(group.required);
    setMinSelect(group.minSelect);
    setMaxSelect(group.maxSelect);
  }, [group.id, group.name, group.required, group.minSelect, group.maxSelect]);

  const dirty =
    name !== group.name ||
    required !== group.required ||
    minSelect !== group.minSelect ||
    maxSelect !== group.maxSelect;

  async function saveMeta() {
    setSavingMeta(true);
    try {
      await onUpdate({ name, required, minSelect, maxSelect });
    } finally {
      setSavingMeta(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] overflow-hidden">
      {/* Header del grupo */}
      <div className="px-4 py-3 flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)]">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 bg-transparent text-base font-bold text-[var(--text-primary)] focus:outline-none"
        />
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Eliminar grupo ${group.name}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      </div>

      {/* Configuracion del grupo */}
      <div className="px-4 py-3 flex flex-wrap gap-3 text-sm border-b border-[var(--rule-soft)]">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="rounded border-[var(--rule-base)]"
          />
          <span className="text-[var(--text-secondary)]">Obligatorio</span>
        </label>
        <label className="inline-flex items-center gap-2">
          <span className="text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)]">
            Mínimo
          </span>
          <input
            type="number"
            min={0}
            max={20}
            value={minSelect}
            onChange={(e) => setMinSelect(parseInt(e.target.value, 10) || 0)}
            className="w-16 rounded border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-2 py-1 text-sm"
          />
        </label>
        <label className="inline-flex items-center gap-2">
          <span className="text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)]">
            Máximo
          </span>
          <input
            type="number"
            min={1}
            max={20}
            value={maxSelect}
            onChange={(e) => setMaxSelect(parseInt(e.target.value, 10) || 1)}
            className="w-16 rounded border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-2 py-1 text-sm"
          />
        </label>
      </div>

      {/* Opciones */}
      <div className="px-4 py-3 space-y-2">
        {group.options.length === 0 && (
          <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
            Sin opciones — agregá la primera con el botón de abajo.
          </p>
        )}
        {group.options.length > 0 && onReorderOptions ? (
          <SortableOptionList
            options={group.options}
            onReorder={onReorderOptions}
            renderOption={(o) => (
              <OptionRow
                option={o}
                onChange={(patch) => onUpdateOption(o.id, patch)}
                onDelete={() => onDeleteOption(o.id)}
              />
            )}
          />
        ) : (
          group.options.map((o) => (
            <OptionRow
              key={o.id}
              option={o}
              onChange={(patch) => onUpdateOption(o.id, patch)}
              onDelete={() => onDeleteOption(o.id)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 flex items-center justify-between gap-3 bg-[var(--surface-raised)] border-t border-[var(--rule-soft)]">
        <button
          type="button"
          onClick={onAddOption}
          className="inline-flex items-center gap-1 rounded-lg bg-[var(--accent-600,var(--accent))] text-white px-3 py-1.5 text-sm font-bold hover:bg-[var(--accent)]/90"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Opción
        </button>
        {dirty && (
          <button
            type="button"
            onClick={saveMeta}
            disabled={savingMeta}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-1.5 text-sm font-semibold text-[var(--text-primary)] hover:border-[var(--accent)]/40"
          >
            {savingMeta ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Save className="h-3.5 w-3.5" aria-hidden />
            )}
            Guardar grupo
          </button>
        )}
      </div>
    </div>
  );
}

/* ── OptionRow ───────────────────────────────────────────────────────────── */

function OptionRow({
  option,
  onChange,
  onDelete,
}: {
  option: ModifierOption;
  onChange: (patch: Partial<Pick<ModifierOption, "name" | "priceDelta" | "isDefault" | "isActive" | "imageUrl">>) => Promise<void> | void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(option.name);
  const [priceDelta, setPriceDelta] = useState(String(option.priceDelta));
  const [imageUrl, setImageUrl] = useState(option.imageUrl ?? "");
  const [isDefault, setIsDefault] = useState(option.isDefault);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(option.name);
    setPriceDelta(String(option.priceDelta));
    setImageUrl(option.imageUrl ?? "");
    setIsDefault(option.isDefault);
  }, [option.id, option.name, option.priceDelta, option.imageUrl, option.isDefault]);

  async function commit() {
    if (
      name.trim() === option.name &&
      parseFloat(priceDelta) === option.priceDelta &&
      imageUrl === (option.imageUrl ?? "") &&
      isDefault === option.isDefault
    ) {
      return;
    }
    setBusy(true);
    try {
      await onChange({
        name: name.trim(),
        priceDelta: parseFloat(priceDelta) || 0,
        imageUrl: imageUrl.trim() === "" ? null : imageUrl.trim(),
        isDefault,
      });
    } finally {
      setBusy(false);
    }
  }

  // Drop / file → dataURL (max 800KB para no hinchar la DB).
  const MAX_BYTES = 800 * 1024;
  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      alert("Solo imagenes (JPG, PNG, WebP)");
      return;
    }
    if (file.size > MAX_BYTES) {
      alert(`Imagen muy grande. Maximo 800KB; subiste ${(file.size / 1024).toFixed(0)}KB`);
      return;
    }
    setBusy(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      setImageUrl(dataUrl);
      await onChange({ imageUrl: dataUrl });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--rule-soft)] px-2 py-2 sm:grid sm:grid-cols-[44px_1fr_90px_auto]">
      <label
        className="relative h-10 w-10 rounded-md overflow-hidden bg-[var(--surface-sunken)] flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-[var(--accent)]/40 transition"
        title="Subir imagen"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (f) void handleFile(f);
        }}
      >
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={name}
            width={40}
            height={40}
            className="object-cover w-full h-full"
            onError={() => setImageUrl("")}
            unoptimized={imageUrl.startsWith("data:")}
          />
        ) : (
          <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">
            {name.slice(0, 2).toUpperCase()}
          </span>
        )}
        <input
          type="file"
          accept="image/*"
          className="absolute inset-0 opacity-0 cursor-pointer"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void handleFile(f);
          }}
        />
      </label>
      <div className="flex flex-col gap-1 min-w-0">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          className="text-sm font-semibold text-[var(--text-primary)] bg-transparent focus:outline-none"
        />
        <input
          value={imageUrl.startsWith("data:") ? "Imagen subida" : imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          onBlur={commit}
          readOnly={imageUrl.startsWith("data:")}
          placeholder="URL imagen o arrastrá un archivo"
          className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] bg-transparent focus:outline-none truncate"
        />
      </div>
      <div className="flex items-center gap-1 text-sm">
        <span className="text-[var(--text-tertiary)]">+S/</span>
        <input
          type="number"
          step="0.5"
          value={priceDelta}
          onChange={(e) => setPriceDelta(e.target.value)}
          onBlur={commit}
          className="w-14 rounded border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-1 py-0.5 text-sm text-right tabular-nums"
        />
      </div>
      <div className="flex items-center gap-1">
        <label
          className={`inline-flex h-7 w-7 items-center justify-center rounded-md cursor-pointer transition-colors ${
            isDefault
              ? "bg-[var(--accent-600,var(--accent))] text-white"
              : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
          }`}
          title="Pre-seleccionada"
        >
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => {
              setIsDefault(e.target.checked);
              void onChange({ isDefault: e.target.checked });
            }}
            className="hidden"
          />
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
        </label>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Eliminar ${option.name}`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-rose-50 dark:hover:bg-rose-950/30"
        >
          {busy ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <X className="h-3.5 w-3.5" aria-hidden />
          )}
        </button>
      </div>
    </div>
  );
}

/* ── SortableGroupList ───────────────────────────────────────────────────── */

function SortableGroupList({
  groups,
  onReorder,
  renderGroup,
}: {
  groups: ModifierGroup[];
  onReorder: (ids: string[]) => void;
  renderGroup: (g: ModifierGroup) => React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = groups.findIndex((g) => g.id === active.id);
    const newIndex = groups.findIndex((g) => g.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(groups, oldIndex, newIndex);
    onReorder(next.map((g) => g.id));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={groups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-3">
          {groups.map((g) => (
            <SortableGroupItem key={g.id} id={g.id}>
              {renderGroup(g)}
            </SortableGroupItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableGroupItem({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch gap-2">
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Arrastrar para reordenar"
        className="shrink-0 self-stretch flex items-center px-1 rounded-lg cursor-grab active:cursor-grabbing text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
      >
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

/* ── SortableOptionList ──────────────────────────────────────────────────── */

function SortableOptionList({
  options,
  onReorder,
  renderOption,
}: {
  options: ModifierOption[];
  onReorder: (ids: string[]) => void | Promise<void>;
  renderOption: (o: ModifierOption) => React.ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = options.findIndex((o) => o.id === active.id);
    const newIndex = options.findIndex((o) => o.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(options, oldIndex, newIndex);
    void onReorder(next.map((o) => o.id));
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={options.map((o) => o.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {options.map((o) => (
            <SortableOptionItem key={o.id} id={o.id}>
              {renderOption(o)}
            </SortableOptionItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableOptionItem({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <div ref={setNodeRef} style={style} className="flex items-stretch gap-1.5">
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Arrastrar opcion"
        className="shrink-0 self-stretch flex items-center px-0.5 rounded cursor-grab active:cursor-grabbing text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
      >
        <GripVertical className="h-3.5 w-3.5" aria-hidden />
      </button>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
