"use client";

/**
 * CategoriesTab — Gestión de categorías + subcategorías del marketplace.
 *
 * Rediseño 2026-05-11 — UI más clara y expandible:
 *  - Hero compacto con stats (categorías, subcategorías, activas, alertas)
 *  - Búsqueda por nombre/slug
 *  - Cada categoría es un row colapsable: vista compacta visible siempre,
 *    panel expandido con editor completo al hacer click
 *  - Subcategorías como cards visuales con menos crowding
 *  - PrimaryStoreLinker simplificado: chips de tiendas vinculadas + picker
 *
 * Storage: PageHero+JSON via /api/superadmin/marketplace/categories.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Eye,
  EyeOff,
  Plus,
  Save,
  Sparkles,
  Store as StoreIcon,
  MapPin,
  ChevronDown,
  ChevronRight,
  Search,
  Folder,
  Layers,
  Tag,
} from "@buleje/design-system/icons";
import ImageUploader from "@/components/superadmin/_shared/ImageUploader";

interface SubCategory {
  id: string;
  label: string;
  description: string;
  imageUrl: string | null;
  active: boolean;
  linkedStoreSlugs: string[];
}

interface CategoryConfig {
  id: string;
  label: string;
  description: string;
  imageUrl: string | null;
  active: boolean;
  /** Vínculo a tiendas para la categoría PRINCIPAL (paso 1 del filtro de /tiendas). */
  linkedStoreSlugs: string[];
  subcategories: SubCategory[];
  defaultLabel: string;
  defaultDescription: string;
}

interface StoreOption {
  slug: string;
  name: string;
  /** Zona declarada por la propia tienda (autoritaria si presente). */
  ownZone?: string;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function CategoriesTab() {
  const [items, setItems] = useState<CategoryConfig[] | null>(null);
  const [error, setError] = useState("");
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [storeZones, setStoreZones] = useState<Record<string, string>>({});
  const [zoneDrafts, setZoneDrafts] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, Partial<CategoryConfig>>>({});
  const [statusByCat, setStatusByCat] = useState<Record<string, { status: SaveStatus; msg?: string }>>({});
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/superadmin/marketplace/categories", {
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      const json = (await res.json()) as {
        categories: CategoryConfig[];
        storeZones?: Record<string, string>;
      };
      setItems(json.categories);
      setStoreZones(json.storeZones ?? {});
      setZoneDrafts({});
      setDrafts({});
    } catch {
      setError("Error cargando categorías");
    }
  }, []);

  const loadStores = useCallback(async () => {
    try {
      const res = await fetch("/api/superadmin/stores", { credentials: "include" });
      if (!res.ok) return;
      const json = (await res.json()) as {
        stores: Array<{
          slug?: string;
          zone?: string | null;
          tenant?: { slug: string; name: string };
        }>;
      };
      const opts: StoreOption[] = (json.stores ?? [])
        .map((s): StoreOption | null => {
          const slug = s.tenant?.slug ?? s.slug ?? "";
          const name = s.tenant?.name ?? slug;
          const ownZone = (s.zone ?? "").trim() || undefined;
          return slug ? { slug, name, ownZone } : null;
        })
        .filter((x): x is StoreOption => x !== null);
      const map = new Map<string, StoreOption>();
      for (const o of opts) if (!map.has(o.slug)) map.set(o.slug, o);
      setStores(Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    void load();
    void loadStores();
  }, [load, loadStores]);

  const getCurrent = useCallback(
    (catId: string): CategoryConfig | null => {
      const base = items?.find((c) => c.id === catId) ?? null;
      if (!base) return null;
      const draft = drafts[catId] ?? {};
      return {
        ...base,
        ...(draft.label !== undefined ? { label: draft.label } : {}),
        ...(draft.description !== undefined ? { description: draft.description } : {}),
        ...(draft.imageUrl !== undefined ? { imageUrl: draft.imageUrl } : {}),
        ...(draft.active !== undefined ? { active: draft.active } : {}),
        ...(draft.linkedStoreSlugs !== undefined
          ? { linkedStoreSlugs: draft.linkedStoreSlugs }
          : {}),
        ...(draft.subcategories !== undefined ? { subcategories: draft.subcategories } : {}),
      };
    },
    [items, drafts],
  );

  const isDirty = useCallback(
    (catId: string) => {
      const d = drafts[catId];
      const hasZoneDraft = (() => {
        const cur = items?.find((c) => c.id === catId);
        if (!cur) return false;
        const primarySlugs = (d?.linkedStoreSlugs ?? cur.linkedStoreSlugs) ?? [];
        const subSlugs = (d?.subcategories ?? cur.subcategories).flatMap(
          (s) => s.linkedStoreSlugs ?? [],
        );
        const slugs = Array.from(new Set([...primarySlugs, ...subSlugs]));
        return slugs.some(
          (slug) => zoneDrafts[slug] !== undefined && zoneDrafts[slug] !== (storeZones[slug] ?? ""),
        );
      })();
      if (!d && !hasZoneDraft) return false;
      return (
        hasZoneDraft ||
        d?.label !== undefined ||
        d?.description !== undefined ||
        d?.imageUrl !== undefined ||
        d?.active !== undefined ||
        d?.linkedStoreSlugs !== undefined ||
        d?.subcategories !== undefined
      );
    },
    [drafts, items, zoneDrafts, storeZones],
  );

  const patchDraft = useCallback((catId: string, patch: Partial<CategoryConfig>) => {
    setDrafts((prev) => ({ ...prev, [catId]: { ...prev[catId], ...patch } }));
  }, []);

  const updateSub = useCallback(
    (catId: string, subId: string, patch: Partial<SubCategory>) => {
      const cur = getCurrent(catId);
      if (!cur) return;
      const subcategories = cur.subcategories.map((s) => (s.id === subId ? { ...s, ...patch } : s));
      patchDraft(catId, { subcategories });
    },
    [getCurrent, patchDraft],
  );

  const removeSub = useCallback(
    (catId: string, subId: string) => {
      const cur = getCurrent(catId);
      if (!cur) return;
      patchDraft(catId, { subcategories: cur.subcategories.filter((s) => s.id !== subId) });
    },
    [getCurrent, patchDraft],
  );

  const addSub = useCallback(
    (catId: string) => {
      const cur = getCurrent(catId);
      if (!cur) return;
      const baseId = `${catId}-sub-${cur.subcategories.length + 1}`;
      const newSub: SubCategory = {
        id: baseId,
        label: "Nueva subcategoría",
        description: "",
        imageUrl: null,
        active: true,
        linkedStoreSlugs: [],
      };
      patchDraft(catId, { subcategories: [...cur.subcategories, newSub] });
    },
    [getCurrent, patchDraft],
  );

  const saveCategory = useCallback(
    async (catId: string) => {
      const cur = getCurrent(catId);
      if (!cur) return;
      setStatusByCat((p) => ({ ...p, [catId]: { status: "saving" } }));
      try {
        const seen = new Set<string>();
        const normalizedSubs = cur.subcategories.map((s, idx) => {
          let id = s.id?.trim() || slugify(s.label) || `${catId}-sub-${idx + 1}`;
          if (!id) id = `${catId}-sub-${idx + 1}`;
          while (seen.has(id)) id = `${id}-${idx + 1}`;
          seen.add(id);
          return {
            id,
            label: s.label.trim() || `Subcategoría ${idx + 1}`,
            description: s.description ?? "",
            imageUrl: s.imageUrl ?? null,
            active: s.active,
            linkedStoreSlugs: Array.from(new Set(s.linkedStoreSlugs ?? [])),
          };
        });

        const zonesPatch: Record<string, string> = {};
        const allSlugs = new Set<string>([
          ...(cur.linkedStoreSlugs ?? []),
          ...normalizedSubs.flatMap((s) => s.linkedStoreSlugs ?? []),
        ]);
        for (const slug of allSlugs) {
          if (zoneDrafts[slug] !== undefined && zoneDrafts[slug] !== (storeZones[slug] ?? "")) {
            zonesPatch[slug] = zoneDrafts[slug].trim();
          }
        }

        const body = {
          id: catId,
          label: cur.label,
          description: cur.description,
          imageUrl: cur.imageUrl ?? "",
          active: cur.active,
          linkedStoreSlugs: Array.from(new Set(cur.linkedStoreSlugs ?? [])),
          ...(Object.keys(zonesPatch).length > 0 ? { storeZones: zonesPatch } : {}),
          subcategories: normalizedSubs,
        };
        const res = await fetch("/api/superadmin/marketplace/categories", {
          method: "PATCH",
          credentials: "include",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}));
          throw new Error(payload?.error ?? `save_failed_${res.status}`);
        }
        const json = (await res.json().catch(() => ({}))) as {
          storeZones?: Record<string, string>;
        };
        setItems((prev) =>
          prev
            ? prev.map((c) =>
                c.id === catId
                  ? {
                      ...c,
                      label: cur.label,
                      description: cur.description,
                      imageUrl: cur.imageUrl,
                      active: cur.active,
                      linkedStoreSlugs: cur.linkedStoreSlugs,
                      subcategories: normalizedSubs,
                    }
                  : c,
              )
            : prev,
        );
        if (json.storeZones) setStoreZones(json.storeZones);
        setZoneDrafts((prev) => {
          const next = { ...prev };
          for (const slug of Object.keys(zonesPatch)) delete next[slug];
          return next;
        });
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[catId];
          return next;
        });
        setStatusByCat((p) => ({ ...p, [catId]: { status: "saved" } }));
        setTimeout(() => {
          setStatusByCat((p) => ({ ...p, [catId]: { status: "idle" } }));
        }, 1800);
      } catch (e) {
        setStatusByCat((p) => ({ ...p, [catId]: { status: "error", msg: (e as Error).message } }));
      }
    },
    [getCurrent, zoneDrafts, storeZones],
  );

  const toggleExpand = useCallback((catId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (!items) return;
    setExpandedIds(new Set(items.map((c) => c.id)));
  }, [items]);

  const collapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const filteredItems = useMemo(() => {
    if (!items) return [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q) ||
        c.description.toLowerCase().includes(q) ||
        c.subcategories.some((s) => s.label.toLowerCase().includes(q)),
    );
  }, [items, search]);

  const stats = useMemo(() => {
    if (!items) return { total: 0, subs: 0, hidden: 0, dirty: 0 };
    return {
      total: items.length,
      subs: items.reduce((acc, c) => acc + c.subcategories.length, 0),
      hidden: items.filter((c) => !c.active).length,
      dirty: Object.keys(drafts).length + (Object.keys(zoneDrafts).length > 0 ? 1 : 0),
    };
  }, [items, drafts, zoneDrafts]);

  const unlinkedReport = useMemo(() => {
    if (!items) return null;
    type Issue =
      | { kind: "category"; catId: string; catLabel: string }
      | { kind: "subcategory"; catId: string; catLabel: string; subId: string; subLabel: string };
    const issues: Issue[] = [];
    for (const c of items) {
      if (!c.active) continue;
      if (!c.linkedStoreSlugs || c.linkedStoreSlugs.length === 0) {
        issues.push({ kind: "category", catId: c.id, catLabel: c.label });
      }
      for (const sub of c.subcategories) {
        if (!sub.active) continue;
        if (!sub.linkedStoreSlugs || sub.linkedStoreSlugs.length === 0) {
          issues.push({
            kind: "subcategory",
            catId: c.id,
            catLabel: c.label,
            subId: sub.id,
            subLabel: sub.label,
          });
        }
      }
    }
    return issues;
  }, [items]);

  return (
    <div className="space-y-5">
      {/* ── Hero info + stats ─────────────────────────────────── */}
      <section className="rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:gap-5">
          <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)]">
            <Folder className="h-6 w-6" strokeWidth={1.75} aria-hidden />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
              Marketplace · Categorías
            </p>
            <h2 className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-[var(--text-primary)]">
              Categorías y subcategorías
            </h2>
            <p className="mt-1 text-sm text-[var(--text-secondary)] max-w-2xl">
              Cada <strong className="text-[var(--text-primary)]">categoría</strong> aparece en{" "}
              <code className="rounded bg-[var(--surface-sunken)] px-1 py-0.5 text-xs font-mono">/tiendas</code>.
              Las <strong className="text-[var(--text-primary)]">subcategorías</strong> filtran
              productos cuando ya seleccionaste una categoría — son el paso 2.
            </p>
          </div>
          <button
            type="button"
            onClick={() => load()}
            className="shrink-0 inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
          >
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={2.25} />
            Refrescar
          </button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-0 divide-y sm:divide-y-0 sm:divide-x divide-[var(--rule-soft)] border-t border-[var(--rule-soft)]">
          <StatCell icon={Folder} label="Categorías" value={stats.total} tone="accent" />
          <StatCell icon={Tag} label="Subcategorías" value={stats.subs} tone="neutral" />
          <StatCell
            icon={EyeOff}
            label="Ocultas"
            value={stats.hidden}
            tone={stats.hidden > 0 ? "warning" : "neutral"}
          />
          <StatCell
            icon={AlertTriangle}
            label="Sin guardar"
            value={stats.dirty}
            tone={stats.dirty > 0 ? "warning" : "neutral"}
          />
        </div>
      </section>

      {/* ── Error banner ───────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-300/60 bg-rose-50/40 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* ── Unlinked report ───────────────────────────────────── */}
      {unlinkedReport && unlinkedReport.length > 0 && (
        <section className="rounded-2xl border border-amber-300/60 bg-amber-50/30 overflow-hidden dark:border-amber-700/40 dark:bg-amber-950/20">
          <header className="flex items-center gap-3 border-b border-amber-200/60 dark:border-amber-700/40 px-5 py-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            </span>
            <div>
              <p className="font-display text-sm font-extrabold text-amber-800 dark:text-amber-200">
                {unlinkedReport.length === 1
                  ? "1 elemento sin tienda vinculada"
                  : `${unlinkedReport.length} elementos sin tienda vinculada`}
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-0.5">
                No aparecerán poblados en <code className="font-mono">/tiendas</code>. Asigná al
                menos una tienda.
              </p>
            </div>
          </header>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-3 max-h-44 overflow-y-auto">
            {unlinkedReport.map((it, i) => (
              <li
                key={`${it.kind}-${i}`}
                className="flex items-center gap-2 rounded-lg border border-amber-300/40 bg-[var(--surface-raised)] px-2.5 py-1.5 text-xs dark:border-amber-700/30"
              >
                <span
                  className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                    it.kind === "category"
                      ? "bg-amber-200/70 text-amber-800 dark:bg-amber-800/40 dark:text-amber-200"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                  }`}
                >
                  {it.kind === "category" ? "Cat" : "Sub"}
                </span>
                <span className="font-bold text-[var(--text-primary)] truncate">
                  {it.kind === "category" ? it.catLabel : it.subLabel}
                </span>
                {it.kind === "subcategory" && (
                  <span className="text-[var(--text-tertiary)] text-[10px] truncate">
                    en {it.catLabel}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Toolbar (búsqueda + expand/collapse) ──────────────── */}
      {items && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]"
              aria-hidden
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar categoría, subcategoría o slug…"
              className="w-full rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] py-2 pl-9 pr-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
            />
          </div>
          <button
            type="button"
            onClick={expandAll}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 text-xs font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
          >
            <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.25} />
            Expandir todo
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 text-xs font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)]"
          >
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2.25} />
            Colapsar todo
          </button>
        </div>
      )}

      {/* ── Loading skeleton ─────────────────────────────────── */}
      {!items && !error && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-20 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)] animate-pulse"
            />
          ))}
        </div>
      )}

      {/* ── Empty search ─────────────────────────────────────── */}
      {items && filteredItems.length === 0 && search && (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] py-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--surface-sunken)] mb-3">
            <Search className="h-5 w-5 text-[var(--text-tertiary)]" aria-hidden />
          </div>
          <p className="font-display text-sm font-extrabold text-[var(--text-primary)]">
            Sin resultados para &ldquo;{search}&rdquo;
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            Probá con otro término o limpiá el filtro.
          </p>
        </div>
      )}

      {/* ── Categories list ──────────────────────────────────── */}
      <div className="space-y-3">
        {filteredItems.map((rawCat) => {
          const cat = getCurrent(rawCat.id) ?? rawCat;
          const dirty = isDirty(rawCat.id);
          const status = statusByCat[rawCat.id]?.status ?? "idle";
          const errMsg = statusByCat[rawCat.id]?.msg;
          const expanded = expandedIds.has(rawCat.id);
          return (
            <CategoryRow
              key={rawCat.id}
              cat={cat}
              stores={stores}
              storeZones={storeZones}
              zoneDrafts={zoneDrafts}
              dirty={dirty}
              status={status}
              errorMsg={errMsg}
              expanded={expanded}
              onToggleExpand={() => toggleExpand(rawCat.id)}
              onPatch={(patch) => patchDraft(rawCat.id, patch)}
              onUpdateSub={(subId, patch) => updateSub(rawCat.id, subId, patch)}
              onRemoveSub={(subId) => removeSub(rawCat.id, subId)}
              onAddSub={() => addSub(rawCat.id)}
              onZoneDraftChange={(slug, value) =>
                setZoneDrafts((prev) => ({ ...prev, [slug]: value }))
              }
              onSave={() => saveCategory(rawCat.id)}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════ components ═══════════════════════════════ */

function StatCell({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof Folder;
  label: string;
  value: number;
  tone: "accent" | "warning" | "neutral";
}) {
  const iconBg = {
    accent: "bg-[var(--accent)]/10 text-[var(--accent)]",
    warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300",
    neutral: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
  }[tone];
  const valueTone =
    tone === "warning" && value > 0
      ? "text-amber-700 dark:text-amber-300"
      : "text-[var(--text-primary)]";
  return (
    <div className="flex items-center gap-3 p-4">
      <span className={`inline-flex h-9 w-9 items-center justify-center rounded-xl ${iconBg}`}>
        <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
      </span>
      <div className="min-w-0">
        <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
          {label}
        </p>
        <p
          className={`mt-1 font-display text-xl font-extrabold tabular-nums tracking-tight leading-none ${valueTone}`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

/* ─────────────────── CategoryRow (expandible) ─────────────────── */

function CategoryRow({
  cat,
  stores,
  storeZones,
  zoneDrafts,
  dirty,
  status,
  errorMsg,
  expanded,
  onToggleExpand,
  onPatch,
  onUpdateSub,
  onRemoveSub,
  onAddSub,
  onZoneDraftChange,
  onSave,
}: {
  cat: CategoryConfig;
  stores: StoreOption[];
  storeZones: Record<string, string>;
  zoneDrafts: Record<string, string>;
  dirty: boolean;
  status: SaveStatus;
  errorMsg?: string;
  expanded: boolean;
  onToggleExpand: () => void;
  onPatch: (patch: Partial<CategoryConfig>) => void;
  onUpdateSub: (subId: string, patch: Partial<SubCategory>) => void;
  onRemoveSub: (subId: string) => void;
  onAddSub: () => void;
  onZoneDraftChange: (slug: string, value: string) => void;
  onSave: () => void;
}) {
  const isHidden = !cat.active;
  const linkedCount = cat.linkedStoreSlugs?.length ?? 0;

  return (
    <article
      className={`rounded-2xl border bg-[var(--surface-raised)] overflow-hidden transition ${
        isHidden
          ? "border-[var(--rule-soft)] opacity-75"
          : expanded
            ? "border-[var(--accent)]/40 shadow-md"
            : "border-[var(--rule-soft)] hover:border-[var(--accent)]/30"
      }`}
    >
      {/* ─── Summary row (always visible) ─── */}
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full text-left transition hover:bg-[var(--surface-sunken)]/30"
      >
        <div className="flex items-center gap-4 p-4">
          {/* Image thumbnail */}
          <div
            className="h-16 w-16 shrink-0 rounded-xl bg-[var(--surface-sunken)] overflow-hidden border border-[var(--rule-soft)]"
            style={{
              backgroundImage: cat.imageUrl ? `url(${cat.imageUrl})` : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            {!cat.imageUrl && (
              <div className="flex h-full w-full items-center justify-center">
                <Folder
                  className="h-5 w-5 text-[var(--text-tertiary)]"
                  strokeWidth={1.75}
                  aria-hidden
                />
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-display text-base font-extrabold tracking-tight text-[var(--text-primary)] truncate">
                {cat.label}
              </h3>
              <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[10px] font-mono text-[var(--text-tertiary)]">
                {cat.id}
              </span>
              {dirty && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-300/60 bg-amber-50/60 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300">
                  <span className="h-1 w-1 rounded-full bg-amber-500" />
                  Sin guardar
                </span>
              )}
              {isHidden && (
                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                  <EyeOff className="h-2.5 w-2.5" />
                  Oculta
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-[var(--text-tertiary)] truncate">
              {cat.description || cat.defaultDescription || "Sin descripción"}
            </p>
            <div className="mt-1.5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              <span className="inline-flex items-center gap-1">
                <StoreIcon className="h-3 w-3" strokeWidth={2.25} />
                {linkedCount} tienda{linkedCount === 1 ? "" : "s"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Tag className="h-3 w-3" strokeWidth={2.25} />
                {cat.subcategories.length} subcategoría
                {cat.subcategories.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          {/* Chevron */}
          <ChevronDown
            className={`h-5 w-5 shrink-0 text-[var(--text-tertiary)] transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
            strokeWidth={2}
            aria-hidden
          />
        </div>
      </button>

      {/* ─── Expanded editor ─── */}
      {expanded && (
        <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)]/40 p-5 space-y-5">
          {/* Step 1 — Identidad */}
          <section>
            <SectionHeading
              step="1"
              icon={Sparkles}
              title="Identidad"
              subtitle="Imagen, nombre y descripción que aparecen en /tiendas"
            />
            <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-4 mt-3">
              <div>
                <ImageUploader
                  value={cat.imageUrl ?? null}
                  onChange={(url) => onPatch({ imageUrl: url })}
                  folder="marketplace-categories"
                  mode="square"
                  aspectClass="aspect-square"
                  alt={cat.label}
                />
              </div>
              <div className="space-y-2">
                <label className="block">
                  <span className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                    Nombre
                  </span>
                  <input
                    type="text"
                    value={cat.label}
                    onChange={(e) => onPatch({ label: e.target.value })}
                    placeholder={cat.defaultLabel}
                    className="w-full rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">
                    Descripción
                  </span>
                  <textarea
                    value={cat.description}
                    onChange={(e) => onPatch({ description: e.target.value })}
                    placeholder={cat.defaultDescription}
                    rows={2}
                    className="w-full rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 resize-none"
                  />
                </label>
                <div className="flex items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onPatch({ active: !cat.active })}
                    className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-3.5 text-xs font-bold transition ${
                      isHidden
                        ? "border-amber-300/60 bg-amber-50/60 text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300"
                        : "border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--accent)]/40"
                    }`}
                  >
                    {isHidden ? (
                      <>
                        <EyeOff className="h-3.5 w-3.5" strokeWidth={2.25} />
                        Mostrar en /tiendas
                      </>
                    ) : (
                      <>
                        <Eye className="h-3.5 w-3.5" strokeWidth={2.25} />
                        Ocultar de /tiendas
                      </>
                    )}
                  </button>
                  <SaveButton dirty={dirty} status={status} onClick={onSave} />
                </div>
              </div>
            </div>
            {status === "error" && errorMsg && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-300/60 bg-rose-50/40 px-3 py-2 text-xs font-bold text-rose-700 dark:border-rose-700/40 dark:bg-rose-950/30 dark:text-rose-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}
          </section>

          {/* Step 2 — Tiendas vinculadas */}
          <section>
            <SectionHeading
              step="2"
              icon={StoreIcon}
              title="Tiendas vinculadas"
              subtitle={`Tiendas que aparecen al filtrar por "${cat.label}" en /tiendas`}
            />
            <div className="mt-3">
              <PrimaryStoreLinker
                stores={stores}
                linkedSlugs={cat.linkedStoreSlugs ?? []}
                storeZones={storeZones}
                zoneDrafts={zoneDrafts}
                onChange={(linked) => onPatch({ linkedStoreSlugs: linked })}
                onZoneDraftChange={onZoneDraftChange}
              />
            </div>
          </section>

          {/* Step 3 — Subcategorías */}
          <section>
            <div className="flex items-center justify-between gap-2 mb-3">
              <SectionHeading
                step="3"
                icon={Tag}
                title="Subcategorías"
                subtitle="Filtros del paso 2 (más específicos)"
                inline
              />
              <button
                type="button"
                onClick={onAddSub}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-dashed border-[var(--accent)]/50 bg-[var(--accent)]/5 px-3.5 text-xs font-extrabold uppercase tracking-wider text-[var(--accent)] transition hover:bg-[var(--accent)]/10"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                Agregar
              </button>
            </div>

            {cat.subcategories.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)]/40 px-5 py-8 text-center">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-sunken)] mb-2">
                  <Tag
                    className="h-4 w-4 text-[var(--text-tertiary)]"
                    strokeWidth={1.75}
                    aria-hidden
                  />
                </div>
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  Sin subcategorías
                </p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1 max-w-sm mx-auto">
                  Las subcategorías refinan el filtro. Ej: dentro de Restaurantes →
                  Pizzería, Pollería, Sushi.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {cat.subcategories.map((sub) => (
                  <SubCategoryCard
                    key={sub.id}
                    sub={sub}
                    stores={stores}
                    storeZones={storeZones}
                    zoneDrafts={zoneDrafts}
                    onZoneDraftChange={onZoneDraftChange}
                    onPatch={(patch) => onUpdateSub(sub.id, patch)}
                    onRemove={() => onRemoveSub(sub.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </article>
  );
}

/* ─────────────────── Helpers UI ─────────────────── */

function SectionHeading({
  step,
  icon: Icon,
  title,
  subtitle,
  inline,
}: {
  step: string;
  icon: typeof Sparkles;
  title: string;
  subtitle: string;
  inline?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 ${inline ? "" : ""}`}>
      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/10 text-[var(--accent)]">
        <span className="font-display text-xs font-extrabold">{step}</span>
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={1.75} aria-hidden />
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)]">
            {title}
          </p>
        </div>
        <p className="text-xs text-[var(--text-tertiary)]">{subtitle}</p>
      </div>
    </div>
  );
}

function SaveButton({
  dirty,
  status,
  onClick,
}: {
  dirty: boolean;
  status: SaveStatus;
  onClick: () => void;
}) {
  if (status === "saved") {
    return (
      <span className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 px-3.5 text-xs font-extrabold uppercase tracking-wider text-[var(--data-success-500)]">
        <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2.5} />
        Guardado
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!dirty || status === "saving"}
      className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold uppercase tracking-wider transition ${
        dirty && status !== "saving"
          ? "bg-[var(--accent)] text-white shadow-md shadow-[var(--accent)]/25 hover:brightness-110"
          : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed"
      }`}
    >
      {status === "saving" ? (
        <>
          <RefreshCw className="h-3.5 w-3.5 animate-spin" strokeWidth={2.5} />
          Guardando
        </>
      ) : (
        <>
          <Save className="h-3.5 w-3.5" strokeWidth={2.5} />
          Guardar
        </>
      )}
    </button>
  );
}

/* ─────────────────── SubCategoryCard ─────────────────── */

function SubCategoryCard({
  sub,
  stores,
  storeZones,
  zoneDrafts,
  onZoneDraftChange,
  onPatch,
  onRemove,
}: {
  sub: SubCategory;
  stores: StoreOption[];
  storeZones: Record<string, string>;
  zoneDrafts: Record<string, string>;
  onZoneDraftChange: (slug: string, value: string) => void;
  onPatch: (patch: Partial<SubCategory>) => void;
  onRemove: () => void;
}) {
  const [showStores, setShowStores] = useState(false);
  const linkedSet = useMemo(() => new Set(sub.linkedStoreSlugs ?? []), [sub.linkedStoreSlugs]);
  const linkedStores = useMemo(
    () => stores.filter((s) => linkedSet.has(s.slug)),
    [stores, linkedSet],
  );

  const toggleStore = (slug: string) => {
    const next = new Set(linkedSet);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onPatch({ linkedStoreSlugs: Array.from(next) });
  };

  return (
    <div
      className={`rounded-2xl border bg-[var(--surface-raised)] overflow-hidden transition ${
        sub.active
          ? "border-[var(--rule-soft)] hover:border-[var(--accent)]/30"
          : "border-dashed border-[var(--rule-base)] opacity-70"
      }`}
    >
      {/* Image header */}
      <div className="relative h-28 bg-[var(--surface-sunken)]">
        <ImageUploader
          value={sub.imageUrl ?? null}
          onChange={(url) => onPatch({ imageUrl: url })}
          folder="marketplace-categories"
          mode="square"
          aspectClass="aspect-[16/7]"
          alt={sub.label}
        />
        <div className="absolute top-2 right-2 flex gap-1">
          <button
            type="button"
            onClick={() => onPatch({ active: !sub.active })}
            title={sub.active ? "Ocultar" : "Activar"}
            className={`inline-flex h-7 w-7 items-center justify-center rounded-lg backdrop-blur transition ${
              sub.active
                ? "bg-black/40 text-white hover:bg-black/60"
                : "bg-amber-500/90 text-white hover:bg-amber-600"
            }`}
          >
            {sub.active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="Eliminar subcategoría"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-black/40 text-white backdrop-blur transition hover:bg-rose-600"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-2">
        <input
          type="text"
          value={sub.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          placeholder="Nombre de la subcategoría"
          className="w-full rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-2.5 py-1.5 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
        />
        <input
          type="text"
          value={sub.description}
          onChange={(e) => onPatch({ description: e.target.value })}
          placeholder="Descripción corta (opcional)"
          className="w-full rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
        />

        {/* Linker collapsible */}
        <button
          type="button"
          onClick={() => setShowStores((v) => !v)}
          className="w-full inline-flex items-center justify-between gap-2 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40"
        >
          <span className="inline-flex items-center gap-1.5">
            <StoreIcon className="h-3 w-3" strokeWidth={2.25} />
            Tiendas
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold tabular-nums">
            <span
              className={
                linkedSet.size > 0 ? "text-[var(--accent)]" : "text-[var(--text-tertiary)]"
              }
            >
              {linkedSet.size}
            </span>
            <span className="text-[var(--text-tertiary)]">/ {stores.length}</span>
            <ChevronDown
              className={`h-3 w-3 text-[var(--text-tertiary)] transition-transform ${showStores ? "rotate-180" : ""}`}
            />
          </span>
        </button>

        {showStores && (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-1.5 space-y-0.5">
            {stores.length === 0 ? (
              <p className="text-xs text-[var(--text-tertiary)] px-2 py-1.5">
                Sin tiendas creadas.
              </p>
            ) : (
              stores.map((s) => {
                const checked = linkedSet.has(s.slug);
                const ownZone = (s.ownZone ?? "").trim();
                return (
                  <label
                    key={s.slug}
                    className={`flex items-center gap-2 rounded px-1.5 py-1 cursor-pointer text-xs transition ${
                      checked
                        ? "bg-[var(--accent)]/10 text-[var(--accent)] font-bold"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStore(s.slug)}
                      className="h-3 w-3 accent-[var(--accent)]"
                    />
                    <span className="truncate flex-1">{s.name}</span>
                    {ownZone && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-[var(--data-success-500)]">
                        <MapPin className="h-2.5 w-2.5" />
                        {ownZone}
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>
        )}

        {linkedStores.length > 0 && (
          <div className="rounded-lg border border-dashed border-[var(--accent)]/30 bg-[var(--accent)]/5 p-2 space-y-1">
            <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--accent)] flex items-center gap-1">
              <MapPin className="h-2.5 w-2.5" />
              Ubicación
            </p>
            {linkedStores.map((s) => {
              const ownZone = (s.ownZone ?? "").trim();
              const persisted = (storeZones[s.slug] ?? "").trim();
              const draftValue = zoneDrafts[s.slug] !== undefined ? zoneDrafts[s.slug] : persisted;
              const hasOwnZone = ownZone !== "";
              return (
                <div key={s.slug} className="flex items-center gap-1.5 text-xs">
                  <span className="truncate flex-1 font-semibold text-[var(--text-primary)]">
                    {s.name}
                  </span>
                  {hasOwnZone ? (
                    <span
                      className="inline-flex items-center gap-0.5 text-[var(--data-success-500)] font-bold text-[10px]"
                      title="Zona declarada por la tienda"
                    >
                      <MapPin className="h-2.5 w-2.5" />
                      {ownZone}
                    </span>
                  ) : (
                    <input
                      type="text"
                      value={draftValue}
                      onChange={(e) => onZoneDraftChange(s.slug, e.target.value)}
                      placeholder="Zona…"
                      aria-label={`Zona para ${s.name}`}
                      className="w-[100px] rounded border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-1.5 py-0.5 text-[10px] focus:border-[var(--accent)] outline-none"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────── PrimaryStoreLinker ─────────────────── */

function PrimaryStoreLinker({
  stores,
  linkedSlugs,
  storeZones,
  zoneDrafts,
  onChange,
  onZoneDraftChange,
}: {
  stores: StoreOption[];
  linkedSlugs: string[];
  storeZones: Record<string, string>;
  zoneDrafts: Record<string, string>;
  onChange: (next: string[]) => void;
  onZoneDraftChange: (slug: string, value: string) => void;
}) {
  const linkedSet = useMemo(() => new Set(linkedSlugs), [linkedSlugs]);
  const [showPicker, setShowPicker] = useState(false);

  const toggle = (slug: string) => {
    const next = new Set(linkedSet);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onChange(Array.from(next));
  };

  const linkedStores = stores.filter((s) => linkedSet.has(s.slug));
  const remainingStores = stores.filter((s) => !linkedSet.has(s.slug));

  return (
    <div className="space-y-3">
      {/* Linked stores grid */}
      {linkedStores.length === 0 ? (
        <div className="rounded-xl border border-dashed border-amber-300/60 bg-amber-50/30 px-4 py-4 dark:border-amber-700/40 dark:bg-amber-950/20">
          <div className="flex items-center gap-2.5">
            <AlertTriangle
              className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0"
              strokeWidth={1.75}
              aria-hidden
            />
            <p className="text-sm font-bold text-amber-800 dark:text-amber-200">
              Sin tiendas vinculadas
            </p>
          </div>
          <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-1 ml-7">
            Asigná al menos una tienda para que esta categoría aparezca poblada en /tiendas.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {linkedStores.map((s) => {
            const ownZone = (s.ownZone ?? "").trim();
            const persisted = (storeZones[s.slug] ?? "").trim();
            const draftValue = zoneDrafts[s.slug] !== undefined ? zoneDrafts[s.slug] : persisted;
            const hasOwnZone = ownZone !== "";
            return (
              <div
                key={s.slug}
                className="flex items-center gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-2 transition hover:border-[var(--accent)]/40"
              >
                <button
                  type="button"
                  onClick={() => toggle(s.slug)}
                  title="Desvincular tienda"
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-900/40 dark:hover:text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2.25} />
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[var(--text-primary)] truncate leading-tight">
                    {s.name}
                  </p>
                  <p className="text-[10px] font-mono text-[var(--text-tertiary)] truncate leading-tight">
                    /{s.slug}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <MapPin
                    className={`h-3.5 w-3.5 shrink-0 ${
                      hasOwnZone
                        ? "text-[var(--data-success-500)]"
                        : "text-[var(--text-tertiary)]"
                    }`}
                  />
                  {hasOwnZone ? (
                    <span
                      className="text-xs font-bold text-[var(--data-success-500)] truncate max-w-[110px]"
                      title={`Zona declarada por la tienda: ${ownZone}`}
                    >
                      {ownZone}
                    </span>
                  ) : (
                    <input
                      type="text"
                      value={draftValue}
                      onChange={(e) => onZoneDraftChange(s.slug, e.target.value)}
                      placeholder="Zona…"
                      aria-label={`Zona manual para ${s.name}`}
                      className="w-[110px] rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-2 py-0.5 text-xs font-semibold outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20"
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Picker */}
      <button
        type="button"
        onClick={() => setShowPicker((v) => !v)}
        className="w-full inline-flex items-center justify-between gap-2 rounded-xl border border-dashed border-[var(--accent)]/40 bg-[var(--accent)]/5 px-4 py-2.5 text-sm font-extrabold uppercase tracking-wider text-[var(--accent)] transition hover:bg-[var(--accent)]/10"
      >
        <span className="inline-flex items-center gap-1.5">
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
          {linkedStores.length === 0
            ? "Vincular tiendas"
            : `Vincular ${remainingStores.length} tienda${remainingStores.length === 1 ? "" : "s"} más`}
        </span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${showPicker ? "rotate-180" : ""}`}
        />
      </button>
      {showPicker && (
        <div className="max-h-56 overflow-y-auto rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-2 space-y-0.5">
          {stores.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)] px-2 py-2">
              Sin tiendas creadas. Crealas en{" "}
              <strong className="text-[var(--text-primary)]">/superadmin/tenants</strong>.
            </p>
          ) : (
            stores.map((s) => {
              const checked = linkedSet.has(s.slug);
              const ownZone = (s.ownZone ?? "").trim();
              return (
                <label
                  key={s.slug}
                  className={`flex items-center gap-2.5 rounded-lg px-2 py-2 cursor-pointer text-sm transition ${
                    checked
                      ? "bg-[var(--accent)]/10 text-[var(--accent)] font-bold"
                      : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(s.slug)}
                    className="h-3.5 w-3.5 accent-[var(--accent)]"
                  />
                  <span className="truncate flex-1">{s.name}</span>
                  {ownZone && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[var(--data-success-500)]">
                      <MapPin className="h-2.5 w-2.5" />
                      {ownZone}
                    </span>
                  )}
                  <span className="text-[10px] font-mono text-[var(--text-tertiary)] truncate max-w-[100px]">
                    /{s.slug}
                  </span>
                </label>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
