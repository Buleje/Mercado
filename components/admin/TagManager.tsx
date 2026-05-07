"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Tag as TagIcon, Package, Users, ShoppingCart, Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import TagBadge, { TAG_COLORS, type TagColor, type Tag } from "./TagBadge";
import { csrfHeaders } from "@/lib/csrf-client";

type Entity = "product" | "customer" | "order";

interface TagRecord extends Tag {
  entity: Entity;
  count: number; // uso estimado
}

const ENTITY_TABS: { id: Entity; label: string; icon: React.ReactNode }[] = [
  { id: "product",  label: "Productos", icon: <Package className="h-3.5 w-3.5" /> },
  { id: "customer", label: "Clientes",  icon: <Users className="h-3.5 w-3.5" /> },
  { id: "order",    label: "Pedidos",   icon: <ShoppingCart className="h-3.5 w-3.5" /> },
];

const COLOR_OPTS = Object.keys(TAG_COLORS) as TagColor[];

export default function TagManager() {
  const [entity, setEntity] = useState<Entity>("product");
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<TagColor>("teal");
  const [creating, setCreating] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tags?entity=${entity}`);
      if (!res.ok) throw new Error("Error al cargar etiquetas");
      const data: TagRecord[] = await res.json();
      setTags(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [entity]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || name.length < 1 || name.length > 30) return;
    if (tags.some(t => t.name.toLowerCase() === name.toLowerCase() && t.entity === entity)) return;

    setCreating(true);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ name, color: newColor, entity }),
      });
      if (!res.ok) throw new Error("Error al crear etiqueta");
      setNewName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al crear");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (tagName: string) => {
    setDeleteId(tagName);
    try {
      const res = await fetch(`/api/tags?name=${encodeURIComponent(tagName)}&entity=${entity}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Error al eliminar");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar");
    } finally {
      setDeleteId(null);
    }
  };

  const filtered = tags.filter(t => t.entity === entity);

  return (
    <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <TagIcon className="h-5 w-5 text-primary" />
        <CardTitle className="text-base font-bold text-foreground">Etiquetas personalizadas</CardTitle>
      </div>

      {/* Entity filter tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-surface rounded-xl p-1">
        {ENTITY_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setEntity(tab.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-xs font-semibold transition-colors min-h-[36px]",
              entity === tab.id
                ? "bg-white dark:bg-card text-primary "
                : "text-[var(--text-secondary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-tertiary)]"
            )}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* New tag form */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") handleCreate(); }}
          placeholder="Nueva etiqueta..."
          maxLength={30}
          className="flex-1 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        />
        {/* Color picker */}
        <div className="flex items-center gap-1 flex-wrap">
          {COLOR_OPTS.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setNewColor(c)}
              title={c}
              className={cn(
                "h-6 w-6 rounded-full border-2 transition-transform",
                TAG_COLORS[c].dot,
                newColor === c ? "border-gray-800 dark:border-white scale-110" : "border-transparent",
              )}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={creating || !newName.trim()}
          className="flex items-center gap-1.5 px-3 py-2 bg-primary text-white rounded-lg text-sm font-semibold hover:bg-primary-dark disabled:opacity-50 transition-colors min-h-[44px]"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Crear
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-[var(--data-error-500)] dark:text-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 rounded-lg px-3 py-2">{error}</p>
      )}

      {/* Tag list */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-[var(--text-tertiary)]" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8">
          <TagIcon className="h-8 w-8 mx-auto text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] mb-2" />
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted">Sin etiquetas para {ENTITY_TABS.find(t => t.id === entity)?.label.toLowerCase()}</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">Crea la primera etiqueta arriba</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(tag => (
            <div
              key={`${tag.entity}-${tag.name}`}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-surface/50 transition-colors group"
            >
              <TagBadge tag={{ name: tag.name, color: tag.color }} />
              <span className="flex-1 text-xs text-[var(--text-tertiary)] dark:text-muted">
                {tag.count > 0 ? `${tag.count} uso${tag.count !== 1 ? "s" : ""}` : "Sin usos"}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(tag.name)}
                disabled={deleteId === tag.name}
                className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/20 transition-all disabled:opacity-50 min-h-[32px] min-w-[32px] flex items-center justify-center"
                aria-label={`Eliminar etiqueta ${tag.name}`}
              >
                {deleteId === tag.name
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <Trash2 className="h-3.5 w-3.5" />
                }
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
