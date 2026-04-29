"use client";

import { useEffect, useState } from "react";
import { Plus, Save, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import CategoryImageUploader from "@/components/admin/marketplace/CategoryImageUploader";

/** Categorías default propuestas — cubren ~90% de marketplace bodega/marketplace. */
const SUGGESTED_CATEGORIES = [
  "Abarrotes",
  "Bebidas",
  "Carnes",
  "Cuidado Personal",
  "Frutas y Verduras",
  "Lácteos",
  "Limpieza",
  "Pollo",
  "Snacks",
];

export default function CategoryImagesClient() {
  const [images, setImages] = useState<Record<string, string>>({});
  const [initialImages, setInitialImages] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [newCategoryInput, setNewCategoryInput] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/superadmin/marketplace/category-images", {
          credentials: "include",
        });
        if (!alive) return;
        if (!res.ok) {
          setError(`No se pudo cargar (${res.status})`);
          return;
        }
        const json = (await res.json()) as { images: Record<string, string> };
        setImages(json.images ?? {});
        setInitialImages(json.images ?? {});
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "error");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Mostrar todas las categorías sugeridas + las que ya tienen imagen
  // (puede haber custom como "Combos", "Helados", etc).
  const allCategories = Array.from(
    new Set([...SUGGESTED_CATEGORIES, ...Object.keys(images)]),
  ).sort();

  const dirty = (() => {
    const allKeys = new Set([
      ...Object.keys(images),
      ...Object.keys(initialImages),
    ]);
    for (const k of allKeys) {
      if (images[k] !== initialImages[k]) return true;
    }
    return false;
  })();

  const handleAddCategory = () => {
    const name = newCategoryInput.trim();
    if (!name) return;
    if (!images[name] && !allCategories.includes(name)) {
      setImages((prev) => ({ ...prev, [name]: "" }));
    }
    setNewCategoryInput("");
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    // Diff: incluir solo cambios
    const diff: Record<string, string | null> = {};
    const allKeys = new Set([
      ...Object.keys(images),
      ...Object.keys(initialImages),
    ]);
    for (const k of allKeys) {
      if (images[k] !== initialImages[k]) {
        diff[k] = images[k] || null;
      }
    }
    try {
      const res = await fetch("/api/superadmin/marketplace/category-images", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: diff }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { images: Record<string, string> };
      setImages(json.images);
      setInitialImages(json.images);
      setSuccess(
        `${Object.keys(diff).length} imagen${Object.keys(diff).length === 1 ? "" : "es"} actualizada(s) — afecta a TODAS las tiendas`,
      );
      setTimeout(() => setSuccess(null), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cargando imágenes globales…
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            {Object.keys(images).filter((k) => images[k]).length} imágenes globales activas
          </span>
          {dirty && (
            <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-bold">
              Cambios sin guardar
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-[var(--data-success-600)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save className="h-4 w-4" />
          {saving ? "Guardando…" : "Guardar"}
        </button>
      </div>

      {/* Banners */}
      {success && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--data-success-500)] bg-[var(--data-success-50)] p-3 text-[var(--data-success)]">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">{success}</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-[var(--data-error)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">{error}</span>
        </div>
      )}

      {/* Add custom category input */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
        <input
          type="text"
          value={newCategoryInput}
          onChange={(e) => setNewCategoryInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddCategory();
            }
          }}
          placeholder="Agregar categoría custom (ej: Combos, Helados, Pan)"
          className="min-w-[260px] flex-1 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm font-medium text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
        />
        <button
          type="button"
          onClick={handleAddCategory}
          disabled={!newCategoryInput.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] disabled:opacity-50"
        >
          <Plus className="h-4 w-4" />
          Agregar
        </button>
      </div>

      {/* Grid de categorías */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {allCategories.map((name) => (
          <div
            key={name}
            className="flex items-center gap-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3"
          >
            <CategoryImageUploader
              categoryName={name}
              value={images[name] ?? null}
              uploadEndpoint="/api/superadmin/upload"
              folder="superadmin-category-images"
              size={64}
              onChange={(url) =>
                setImages((prev) => {
                  const next = { ...prev };
                  if (url) next[name] = url;
                  else delete next[name];
                  return next;
                })
              }
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-[var(--text-primary)]">
                {name}
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">
                {images[name] ? "Imagen global activa" : "Sin imagen global"}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Info footer */}
      <div className="rounded-xl bg-[var(--surface-sunken)] p-4 text-xs text-[var(--text-tertiary)]">
        <p className="font-bold text-[var(--text-secondary)] mb-1">¿Cómo funciona?</p>
        <ol className="list-decimal pl-4 space-y-1">
          <li>Subí una imagen para cada categoría general (Pollo, Bebidas, etc).</li>
          <li>Cuando una tienda muestra esa categoría en sus filtros, usa esta imagen.</li>
          <li>El dueño de la tienda puede subir SU propia imagen, que tiene prioridad.</li>
          <li>Si nadie subió nada, los filtros muestran solo texto (default original).</li>
        </ol>
      </div>
    </div>
  );
}
