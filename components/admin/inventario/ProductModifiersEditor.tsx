"use client";

/**
 * ProductModifiersEditor — modal CRUD para los modifier groups de un producto.
 *
 * Carga groups + options vía GET /api/products/{id}/modifiers, permite editar
 * inline y persiste todo con un PUT (replace-all). Diseño minimal estilo
 * Holded — un grupo por bloque, opciones en lista plana.
 *
 * Uso:
 *   <ProductModifiersEditor
 *     productId={123}
 *     productName="1/8 Pollo a la Brasa"
 *     onClose={() => setOpen(false)}
 *   />
 */

import { useEffect, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { X, Plus, Trash2, BookOpen } from "@buleje/design-system/icons";
import VariantCatalogPicker from "./VariantCatalogPicker";

type Option = {
  id?: string;
  name: string;
  priceDelta: number;
  isDefault?: boolean;
};
type Group = {
  id?: string;
  name: string;
  description?: string | null;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: Option[];
};

interface Props {
  productId: number;
  productName: string;
  onClose: () => void;
  onSaved?: () => void;
}

export default function ProductModifiersEditor({ productId, productName, onClose, onSaved }: Props) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);

  const reloadGroups = () => {
    fetch(`/api/products/${productId}/modifiers`)
      .then((r) => (r.ok ? r.json() : { groups: [] }))
      .then((d) => setGroups(d.groups ?? []))
      .catch(() => setError("No se pudieron cargar los modificadores"));
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/products/${productId}/modifiers`)
      .then((r) => (r.ok ? r.json() : { groups: [] }))
      .then((d) => {
        if (cancelled) return;
        setGroups(d.groups ?? []);
      })
      .catch(() => setError("No se pudieron cargar los modificadores"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const addGroup = () => {
    setGroups((g) => [
      ...g,
      {
        name: "Nuevo grupo",
        description: "",
        required: false,
        minSelect: 0,
        maxSelect: 1,
        options: [],
      },
    ]);
  };
  const removeGroup = (idx: number) => setGroups((g) => g.filter((_, i) => i !== idx));
  const updateGroup = (idx: number, patch: Partial<Group>) =>
    setGroups((g) => g.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const addOption = (gIdx: number) =>
    setGroups((g) =>
      g.map((it, i) =>
        i === gIdx
          ? { ...it, options: [...it.options, { name: "Nueva opcion", priceDelta: 0 }] }
          : it,
      ),
    );
  const removeOption = (gIdx: number, oIdx: number) =>
    setGroups((g) =>
      g.map((it, i) =>
        i === gIdx ? { ...it, options: it.options.filter((_, j) => j !== oIdx) } : it,
      ),
    );
  const updateOption = (gIdx: number, oIdx: number, patch: Partial<Option>) =>
    setGroups((g) =>
      g.map((it, i) =>
        i === gIdx
          ? {
              ...it,
              options: it.options.map((op, j) => (j === oIdx ? { ...op, ...patch } : op)),
            }
          : it,
      ),
    );

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const body = {
      groups: groups.map((g, i) => ({
        name: g.name.trim(),
        description: g.description?.trim() || null,
        required: g.required,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        position: i,
        options: g.options.map((o, j) => ({
          name: o.name.trim(),
          priceDelta: Number(o.priceDelta) || 0,
          isDefault: !!o.isDefault,
          position: j,
        })),
      })),
    };
    const res = await fetch(`/api/products/${productId}/modifiers`, {
      method: "PUT",
      headers: csrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Error al guardar. Verifica que tengas permisos de admin.");
      return;
    }
    onSaved?.();
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Modificadores de ${productName}`}
      className="fixed inset-0 z-[8000] flex items-end sm:items-center justify-center bg-black/55 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl bg-white dark:bg-card border border-[var(--rule-base)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--rule-soft)] px-5 py-3.5">
          <div>
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Modificadores</h2>
            <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)] truncate">
              {productName}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {loading && (
            <div className="text-sm text-[var(--text-tertiary)]">Cargando…</div>
          )}

          {!loading && groups.length === 0 && (
            <p className="text-sm text-[var(--text-tertiary)]">
              Aun no hay modificadores. Agrega un grupo para empezar
              (ej. &ldquo;Crema adicional&rdquo;, &ldquo;Tamano&rdquo;, &ldquo;Adicional&rdquo;).
            </p>
          )}

          {!loading &&
            groups.map((g, gIdx) => (
              <div
                key={gIdx}
                className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)]"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 border-b border-[var(--rule-soft)]">
                  <label className="flex flex-col gap-1">
                    <span className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)]">
                      Nombre del grupo
                    </span>
                    <input
                      value={g.name}
                      onChange={(e) => updateGroup(gIdx, { name: e.target.value })}
                      className="rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-sm"
                      placeholder="Crema adicional"
                    />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)]">
                      Descripcion (opcional)
                    </span>
                    <input
                      value={g.description ?? ""}
                      onChange={(e) => updateGroup(gIdx, { description: e.target.value })}
                      className="rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-sm"
                      placeholder="Elige una crema"
                    />
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={g.required}
                      onChange={(e) => updateGroup(gIdx, { required: e.target.checked })}
                      className="h-4 w-4 accent-[var(--accent)]"
                    />
                    <span className="text-sm text-[var(--text-primary)]">Obligatorio</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <span className="text-sm text-[var(--text-secondary)]">Max selecciones</span>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={g.maxSelect}
                      onChange={(e) =>
                        updateGroup(gIdx, { maxSelect: Math.max(1, Number(e.target.value) || 1) })
                      }
                      className="w-16 rounded-lg border border-[var(--rule-base)] px-2 py-1 text-sm"
                    />
                  </label>
                </div>

                <div className="p-4 space-y-2">
                  <div className="text-[length:var(--ts-xs)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                    Opciones
                  </div>
                  {g.options.map((o, oIdx) => (
                    <div key={oIdx} className="flex items-center gap-2">
                      <input
                        value={o.name}
                        onChange={(e) => updateOption(gIdx, oIdx, { name: e.target.value })}
                        placeholder="Nombre"
                        className="flex-1 rounded-lg border border-[var(--rule-base)] px-3 py-1.5 text-sm"
                      />
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-[var(--text-tertiary)]">+S/</span>
                        <input
                          type="number"
                          min={0}
                          step={0.5}
                          value={o.priceDelta}
                          onChange={(e) =>
                            updateOption(gIdx, oIdx, { priceDelta: Number(e.target.value) || 0 })
                          }
                          className="w-20 rounded-lg border border-[var(--rule-base)] px-2 py-1.5 text-sm"
                        />
                      </div>
                      <button
                        onClick={() => removeOption(gIdx, oIdx)}
                        aria-label="Eliminar opcion"
                        className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => addOption(gIdx)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[length:var(--ts-xs)] font-semibold text-[var(--accent)] hover:bg-[var(--accent-soft)]"
                  >
                    <Plus className="h-3.5 w-3.5" /> Agregar opcion
                  </button>
                </div>

                <div className="flex justify-end px-4 pb-3">
                  <button
                    onClick={() => removeGroup(gIdx)}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Eliminar grupo
                  </button>
                </div>
              </div>
            ))}

          {!loading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={addGroup}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-3 text-sm font-semibold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                <Plus className="h-4 w-4" /> Agregar grupo
              </button>
              <button
                onClick={() => setShowCatalog(true)}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary hover:bg-primary/10"
                title="Importar una plantilla de variaciones del catálogo global"
              >
                <BookOpen className="h-4 w-4" /> Importar del catálogo
              </button>
            </div>
          )}

          {showCatalog && (
            <VariantCatalogPicker
              productId={productId}
              onClose={() => setShowCatalog(false)}
              onImported={() => { setShowCatalog(false); reloadGroups(); }}
            />
          )}

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-[var(--text-primary)]">
              {error}
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-[var(--rule-soft)] px-5 py-3.5 flex items-center justify-end gap-2 bg-[var(--surface-canvas)]">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white hover:bg-[var(--accent-600)] disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
