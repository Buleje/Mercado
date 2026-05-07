"use client";

/**
 * CategoriesTab — Gestión de categorías + subcategorías del marketplace.
 *
 * Layout: cada categoría ocupa una fila completa.
 *   - Izquierda: card de la categoría (imagen, label, desc, toggle "ocultar")
 *   - Derecha: grid de subcategorías + botón "+"
 *
 * Subcategoría: imagen, label, desc, toggle activo, multiselect de tiendas.
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
  /** Override manual de zona por slug — se persiste vía PATCH categorías. */
  const [storeZones, setStoreZones] = useState<Record<string, string>>({});
  /** Drafts locales de zonas manuales (no guardados aún). */
  const [zoneDrafts, setZoneDrafts] = useState<Record<string, string>>({});
  // Edición pendiente: shape { [catId]: { ...partial CategoryConfig } }
  const [drafts, setDrafts] = useState<Record<string, Partial<CategoryConfig>>>({});
  const [statusByCat, setStatusByCat] = useState<Record<string, { status: SaveStatus; msg?: string }>>({});

  // ── Load categories ─────────────────────────────────────────────────────
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

  // ── Load stores for the linker selector ─────────────────────────────────
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
      // dedupe por slug
      const map = new Map<string, StoreOption>();
      for (const o of opts) if (!map.has(o.slug)) map.set(o.slug, o);
      setStores(Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)));
    } catch {
      // silent — el selector quedará vacío
    }
  }, []);

  useEffect(() => {
    void load();
    void loadStores();
  }, [load, loadStores]);

  // ── Helpers ─────────────────────────────────────────────────────────────
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
        // Slugs vinculados a la categoría principal + a TODAS las subcategorías,
        // para que un cambio de zona desde el linker de una subcategoría también
        // marque la categoría como dirty y se guarde al hacer "Guardar".
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

  // ── Save ────────────────────────────────────────────────────────────────
  const saveCategory = useCallback(
    async (catId: string) => {
      const cur = getCurrent(catId);
      if (!cur) return;
      setStatusByCat((p) => ({ ...p, [catId]: { status: "saving" } }));
      try {
        // Normalizar IDs de subcategorías (slug en base al label si están en blanco/duplicados)
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

        // Construir parche de zonas manuales sólo con drafts modificados.
        // Incluir slugs de la categoría principal + de cada subcategoría —
        // así el botón "Guardar" cubre cambios de zona desde cualquier linker.
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
        // Persistir en items locales y limpiar el draft
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
        }, 1500);
      } catch (e) {
        setStatusByCat((p) => ({ ...p, [catId]: { status: "error", msg: (e as Error).message } }));
      }
    },
    [getCurrent, zoneDrafts, storeZones],
  );

  const sortedItems = useMemo(() => items ?? [], [items]);

  // ── Auditoría de vínculos: detectar categorías/subcats sin tiendas ──
  // Sólo cuenta categorías ACTIVAS — las ocultas no afectan al marketplace
  // público, así que no son "errores" sino decisiones del admin.
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
    <div className="space-y-4">
      {/* ── Header explicativo ── */}
      <div className="rounded-xl border border-[var(--rule-base)] bg-linear-to-br from-[var(--accent-soft)]/40 to-[var(--surface-raised)] p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="shrink-0 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent)] text-white">
            <Sparkles className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-[var(--text-primary)]">
              Categorías y subcategorías del marketplace
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1 leading-snug">
              Cada categoría aparece en <code>/tiendas</code>. Ocultala con el botón
              <strong> ocultar</strong> y desaparece de la vista pública. Las{" "}
              <strong>subcategorías</strong> reemplazan los chips &quot;Tipo de producto&quot; y
              pueden vincularse a tiendas específicas para filtrar productos por
              tienda.
            </p>
          </div>
          <button
            type="button"
            onClick={() => load()}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 py-1.5 text-xs font-bold hover:bg-[var(--surface-sunken)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refrescar
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-[var(--data-error-500)]">
          {error}
        </div>
      )}

      {/* ── Aviso ROJO: categorías/subcats activas sin tienda vinculada ── */}
      {unlinkedReport && unlinkedReport.length > 0 && (
        <div className="rounded-xl border-2 border-rose-400 bg-rose-50 px-4 py-3 dark:border-rose-500 dark:bg-rose-950/40">
          <div className="flex items-start gap-3">
            <div className="shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-rose-500 text-white">
              <AlertTriangle className="h-5 w-5" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <p className="text-sm font-extrabold text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
                {unlinkedReport.length === 1
                  ? "1 elemento sin tienda vinculada"
                  : `${unlinkedReport.length} elementos sin tienda vinculada`}
              </p>
              <p className="text-xs text-[var(--data-error-500)]/80 dark:text-[var(--data-error-500)]/80 leading-snug">
                Estos no aparecen poblados en <code>/tiendas</code> porque no hay tienda asignada.
                Asigná al menos una tienda en el bloque &quot;Paso 1 · Categoría principal&quot;
                o &quot;Tiendas vinculadas&quot; (subcategoría).
              </p>
              <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto text-[length:var(--ts-xs)] text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">
                {unlinkedReport.map((it, i) =>
                  it.kind === "category" ? (
                    <li key={`cat-${it.catId}-${i}`} className="flex items-center gap-1.5">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-200/70 dark:bg-rose-800/40 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider">
                        Categoría
                      </span>
                      <span className="font-bold">{it.catLabel}</span>
                      <span className="text-[var(--data-error-500)]/70">· {it.catId}</span>
                    </li>
                  ) : (
                    <li key={`sub-${it.catId}-${it.subId}-${i}`} className="flex items-center gap-1.5">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-rose-200/70 dark:bg-rose-800/40 text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider">
                        Subcat
                      </span>
                      <span className="font-bold">{it.subLabel}</span>
                      <span className="text-[var(--data-error-500)]/70">en {it.catLabel}</span>
                    </li>
                  ),
                )}
              </ul>
            </div>
          </div>
        </div>
      )}

      {!items && !error && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-48 rounded-2xl bg-[var(--surface-sunken)] animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Lista de categorías (1 fila por categoría) ── */}
      {sortedItems.map((rawCat) => {
        const cat = getCurrent(rawCat.id) ?? rawCat;
        const dirty = isDirty(rawCat.id);
        const status = statusByCat[rawCat.id]?.status ?? "idle";
        const errMsg = statusByCat[rawCat.id]?.msg;
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
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CategoryRow — 1 fila completa: card de categoría + grid de subcategorías
// ─────────────────────────────────────────────────────────────────────────────
function CategoryRow({
  cat,
  stores,
  storeZones,
  zoneDrafts,
  dirty,
  status,
  errorMsg,
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
  onPatch: (patch: Partial<CategoryConfig>) => void;
  onUpdateSub: (subId: string, patch: Partial<SubCategory>) => void;
  onRemoveSub: (subId: string) => void;
  onAddSub: () => void;
  onZoneDraftChange: (slug: string, value: string) => void;
  onSave: () => void;
}) {
  const isHidden = !cat.active;
  return (
    <div
      className={
        "relative rounded-xl border bg-[var(--surface-raised)] overflow-hidden transition-colors " +
        (isHidden
          ? "border-[var(--rule-base)] opacity-70"
          : "border-[var(--rule-base)] hover:border-[var(--accent)]/40")
      }
    >
      {/* Banda overlay si está oculta */}
      {isHidden && (
        <div className="absolute top-0 right-0 z-10 inline-flex items-center gap-1.5 px-3 py-1 rounded-bl-lg bg-[var(--text-tertiary)] text-white text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider">
          <EyeOff className="h-3 w-3" />
          Oculto en /tiendas
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 p-4">
        {/* ── Card de categoría (left, lg:col-span-4) ── */}
        <div className="lg:col-span-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Categoría · {cat.id}
            </span>
            {dirty && (
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase text-[var(--data-warning-600)]">Sin guardar</span>
            )}
          </div>

          <ImageUploader
            value={cat.imageUrl ?? null}
            onChange={(url) => onPatch({ imageUrl: url })}
            folder="marketplace-categories"
            mode="square"
            aspectClass="aspect-[4/3]"
            alt={cat.label}
          />

          <input
            type="text"
            value={cat.label}
            onChange={(e) => onPatch({ label: e.target.value })}
            placeholder={cat.defaultLabel}
            className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 py-1.5 text-sm font-bold focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none"
          />
          <input
            type="text"
            value={cat.description}
            onChange={(e) => onPatch({ description: e.target.value })}
            placeholder={cat.defaultDescription}
            className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2.5 py-1.5 text-xs focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none"
          />

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              onClick={() => onPatch({ active: !cat.active })}
              className={
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors " +
                (isHidden
                  ? "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-500)]"
                  : "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]")
              }
            >
              {isHidden ? (
                <>
                  <EyeOff className="h-3.5 w-3.5" />
                  Ocultado
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5" />
                  Ocultar
                </>
              )}
            </button>

            <button
              type="button"
              onClick={onSave}
              disabled={!dirty || status === "saving"}
              className={
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors " +
                (status === "saved"
                  ? "bg-emerald-100 text-[var(--data-success-700)]"
                  : dirty && status !== "saving"
                    ? "bg-[var(--accent)] text-white hover:opacity-90"
                    : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)] cursor-not-allowed")
              }
            >
              {status === "saved" ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Listo
                </>
              ) : status === "saving" ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Guardando
                </>
              ) : (
                <>
                  <Save className="h-3.5 w-3.5" />
                  Guardar
                </>
              )}
            </button>
          </div>

          {status === "error" && errorMsg && (
            <div className="flex items-start gap-1.5 rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-1.5 text-[length:var(--ts-xs)] text-[var(--data-error-500)]">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* ── Subcategorías (right, lg:col-span-8) ── */}
        <div className="lg:col-span-8 space-y-4">
          {/* ── Bloque NUEVO: Vinculo de tiendas a la CATEGORÍA PRINCIPAL ── */}
          <PrimaryStoreLinker
            catLabel={cat.label}
            stores={stores}
            linkedSlugs={cat.linkedStoreSlugs ?? []}
            storeZones={storeZones}
            zoneDrafts={zoneDrafts}
            onChange={(linked) => onPatch({ linkedStoreSlugs: linked })}
            onZoneDraftChange={onZoneDraftChange}
          />

          <div className="flex items-center justify-between gap-2">
            <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
              Subcategorías ({cat.subcategories.length})
              <span className="ml-1.5 normal-case text-[length:var(--ts-2xs)] font-normal text-[var(--text-tertiary)]">
                · paso 2 del filtro (más específico)
              </span>
            </p>
            <button
              type="button"
              onClick={onAddSub}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--accent)]/50 bg-[var(--accent-soft)]/40 px-2.5 py-1 text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent-soft)]"
            >
              <Plus className="h-3.5 w-3.5" />
              Agregar subcategoría
            </button>
          </div>

          {cat.subcategories.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)]/60 p-6 text-center">
              <p className="text-xs text-[var(--text-tertiary)]">
                Sin subcategorías. Las subcategorías aparecen en{" "}
                <strong>/tiendas</strong> como filtros tipo &quot;Tipo de producto&quot; con
                imagen.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
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
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SubCategoryCard — imagen + label + desc + active + multi-store linker
// ─────────────────────────────────────────────────────────────────────────────
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
      className={
        "rounded-xl border bg-[var(--surface-canvas)] p-2.5 space-y-1.5 transition-colors " +
        (sub.active
          ? "border-[var(--rule-base)]"
          : "border-dashed border-[var(--rule-base)] opacity-70")
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)] truncate">
          {sub.id}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPatch({ active: !sub.active })}
            title={sub.active ? "Ocultar" : "Activar"}
            className={
              "inline-flex h-6 w-6 items-center justify-center rounded border transition-colors " +
              (sub.active
                ? "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                : "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-500)]")
            }
          >
            {sub.active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </button>
          <button
            type="button"
            onClick={onRemove}
            title="Eliminar"
            className="inline-flex h-6 w-6 items-center justify-center rounded border border-[var(--rule-base)] text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:border-rose-300"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      <ImageUploader
        value={sub.imageUrl ?? null}
        onChange={(url) => onPatch({ imageUrl: url })}
        folder="marketplace-categories"
        mode="square"
        aspectClass="aspect-[4/3]"
        alt={sub.label}
      />

      <input
        type="text"
        value={sub.label}
        onChange={(e) => onPatch({ label: e.target.value })}
        placeholder="Nombre de la subcategoría"
        className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 py-1 text-xs font-bold focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none"
      />
      <input
        type="text"
        value={sub.description}
        onChange={(e) => onPatch({ description: e.target.value })}
        placeholder="Descripción corta (opcional)"
        className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 py-1 text-[length:var(--ts-xs)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none"
      />

      {/* Vincular a tiendas (multiselect colapsable) */}
      <div className="space-y-1">
        <button
          type="button"
          onClick={() => setShowStores((v) => !v)}
          className="w-full inline-flex items-center justify-between gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 py-1 text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
        >
          <span className="inline-flex items-center gap-1.5">
            <StoreIcon className="h-3 w-3" />
            Tiendas vinculadas
          </span>
          <span className="font-extrabold tabular-nums text-[var(--accent)]">
            {linkedSet.size}/{stores.length}
          </span>
        </button>
        {showStores && (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1.5 space-y-0.5">
            {stores.length === 0 ? (
              <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] px-1.5 py-1">
                Sin tiendas. Crea tiendas en superadmin/tenants para vincular.
              </p>
            ) : (
              stores.map((s) => {
                const checked = linkedSet.has(s.slug);
                const ownZone = (s.ownZone ?? "").trim();
                return (
                  <label
                    key={s.slug}
                    className={
                      "flex items-center gap-2 rounded px-1.5 py-1 cursor-pointer text-[length:var(--ts-xs)] " +
                      (checked
                        ? "bg-[var(--accent-soft)]/60 text-[var(--accent)] font-semibold"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleStore(s.slug)}
                      className="h-3 w-3 accent-[var(--accent)]"
                    />
                    <span className="truncate flex-1">{s.name}</span>
                    {ownZone && (
                      <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--data-success-500)]">
                        <MapPin className="h-2.5 w-2.5" />
                        {ownZone}
                      </span>
                    )}
                    <span className="ml-auto text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate max-w-[80px]">
                      {s.slug}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        )}
      </div>

      {/* Zonas (ubicación) por tienda vinculada — paralelo al PrimaryStoreLinker */}
      {linkedStores.length > 0 && (
        <div className="rounded-lg border border-dashed border-[var(--accent)]/30 bg-[var(--accent-soft)]/15 p-1.5 space-y-1">
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--accent)] flex items-center gap-1">
            <MapPin className="h-2.5 w-2.5" /> Ubicación de cada tienda
          </p>
          <div className="space-y-1">
            {linkedStores.map((s) => {
              const ownZone = (s.ownZone ?? "").trim();
              const persisted = (storeZones[s.slug] ?? "").trim();
              const draftValue = zoneDrafts[s.slug] !== undefined ? zoneDrafts[s.slug] : persisted;
              const hasOwnZone = ownZone !== "";
              return (
                <div key={s.slug} className="flex items-center gap-1.5 text-[length:var(--ts-2xs)]">
                  <span className="truncate flex-1 font-semibold text-[var(--text-primary)]">
                    {s.name}
                  </span>
                  {hasOwnZone ? (
                    <span
                      className="inline-flex items-center gap-0.5 text-[var(--data-success-500)] font-bold"
                      title="Zona declarada por la propia tienda — autoritaria"
                    >
                      <MapPin className="h-2.5 w-2.5" />
                      {ownZone}
                    </span>
                  ) : (
                    <input
                      type="text"
                      value={draftValue}
                      onChange={(e) => onZoneDraftChange(s.slug, e.target.value)}
                      placeholder="Asignar zona…"
                      aria-label={`Zona manual para ${s.name}`}
                      className="w-[100px] rounded border border-[var(--rule-base)] bg-[var(--surface-raised)] px-1 py-0.5 text-[length:var(--ts-2xs)] focus:border-[var(--accent)] outline-none"
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PrimaryStoreLinker — vincular tiendas a la categoría PRINCIPAL
//   - Multi-select de tiendas (chips toggle)
//   - Por cada tienda vinculada: input de zona manual con fallback a la zona
//     declarada por la propia tienda (placeholder muestra la auto-zone)
// ─────────────────────────────────────────────────────────────────────────────
function PrimaryStoreLinker({
  catLabel,
  stores,
  linkedSlugs,
  storeZones,
  zoneDrafts,
  onChange,
  onZoneDraftChange,
}: {
  catLabel: string;
  stores: StoreOption[];
  linkedSlugs: string[];
  storeZones: Record<string, string>;
  zoneDrafts: Record<string, string>;
  onChange: (next: string[]) => void;
  onZoneDraftChange: (slug: string, value: string) => void;
}) {
  const linkedSet = useMemo(() => new Set(linkedSlugs), [linkedSlugs]);
  const [showAll, setShowAll] = useState(false);

  const toggle = (slug: string) => {
    const next = new Set(linkedSet);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    onChange(Array.from(next));
  };

  const linkedStores = stores.filter((s) => linkedSet.has(s.slug));
  const remainingStores = stores.filter((s) => !linkedSet.has(s.slug));

  return (
    <div className="rounded-xl border-2 border-[var(--accent)]/25 bg-[var(--accent-soft)]/15 p-3.5 sm:p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
            Paso 1 · Categoría principal
          </p>
          <p className="text-sm font-bold text-[var(--text-primary)] leading-tight">
            Vinculá las tiendas que aparecen al filtrar por <span className="text-[var(--accent)]">{catLabel}</span> en /tiendas
          </p>
          <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] mt-0.5 leading-snug">
            Una tienda puede estar en varias categorías principales. Después usás las subcategorías de abajo para precisión (ej. dentro de Restaurantes → Pizzería).
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-raised)] border border-[var(--rule-base)] px-3 py-1 text-xs font-extrabold text-[var(--accent)] tabular-nums shrink-0">
          <StoreIcon className="h-3.5 w-3.5" />
          {linkedSet.size} / {stores.length}
        </span>
      </div>

      {/* Tiendas YA vinculadas — chips con su zona inline */}
      {linkedStores.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Tiendas vinculadas ({linkedStores.length})
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {linkedStores.map((s) => {
              const ownZone = (s.ownZone ?? "").trim();
              const persisted = (storeZones[s.slug] ?? "").trim();
              const draftValue = zoneDrafts[s.slug] !== undefined ? zoneDrafts[s.slug] : persisted;
              const hasOwnZone = ownZone !== "";
              return (
                <div
                  key={s.slug}
                  className="flex items-center gap-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 py-2"
                >
                  <button
                    type="button"
                    onClick={() => toggle(s.slug)}
                    title="Desvincular tienda"
                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-[var(--rule-base)] text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:border-rose-300 shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-[var(--text-primary)] truncate leading-tight">
                      {s.name}
                    </p>
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate leading-tight">
                      /{s.slug}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 min-w-0">
                    <MapPin
                      className={`h-3.5 w-3.5 shrink-0 ${hasOwnZone ? "text-[var(--data-success-500)]" : "text-[var(--text-tertiary)]"}`}
                    />
                    {hasOwnZone ? (
                      <span
                        className="text-[length:var(--ts-xs)] font-bold text-[var(--data-success-500)] truncate max-w-[140px]"
                        title={`Zona auto: ${ownZone}`}
                      >
                        {ownZone}
                      </span>
                    ) : (
                      <input
                        type="text"
                        value={draftValue}
                        onChange={(e) => onZoneDraftChange(s.slug, e.target.value)}
                        placeholder="Asignar zona…"
                        aria-label={`Zona manual para ${s.name}`}
                        className="w-[120px] rounded-md border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-1.5 py-0.5 text-[length:var(--ts-xs)] font-semibold focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/30 outline-none"
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Picker de tiendas disponibles para vincular */}
      <div>
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="w-full inline-flex items-center justify-between gap-2 rounded-lg border border-dashed border-[var(--accent)]/40 bg-[var(--surface-raised)] px-2.5 py-1.5 text-xs font-bold text-[var(--accent)] hover:bg-[var(--accent-soft)]/50"
        >
          <span className="inline-flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            {linkedStores.length === 0
              ? "Vincular tiendas a esta categoría"
              : `Vincular ${remainingStores.length} tienda${remainingStores.length === 1 ? "" : "s"} más`}
          </span>
          <span className="text-[length:var(--ts-2xs)] uppercase tracking-wider text-[var(--text-tertiary)]">
            {showAll ? "ocultar" : "mostrar"}
          </span>
        </button>
        {showAll && (
          <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1.5 space-y-0.5">
            {stores.length === 0 ? (
              <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] px-1.5 py-1">
                Sin tiendas creadas todavía. Crea tiendas en superadmin/tenants.
              </p>
            ) : (
              stores.map((s) => {
                const checked = linkedSet.has(s.slug);
                const ownZone = (s.ownZone ?? "").trim();
                return (
                  <label
                    key={s.slug}
                    className={
                      "flex items-center gap-2 rounded px-1.5 py-1 cursor-pointer text-[length:var(--ts-xs)] " +
                      (checked
                        ? "bg-[var(--accent-soft)]/60 text-[var(--accent)] font-semibold"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(s.slug)}
                      className="h-3 w-3 accent-[var(--accent)]"
                    />
                    <span className="truncate flex-1">{s.name}</span>
                    {ownZone && (
                      <span className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--data-success-500)]">
                        <MapPin className="h-2.5 w-2.5" />
                        {ownZone}
                      </span>
                    )}
                    <span className="ml-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] truncate max-w-[100px]">
                      /{s.slug}
                    </span>
                  </label>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}
