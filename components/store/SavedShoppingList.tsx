"use client";

import { useState, useEffect, useCallback } from "react";
import { List, Plus, Trash2, ShoppingCart, Edit3, Check, X, ChevronDown, ChevronRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ListItem {
  name: string;
  qty: number;
}

interface ShoppingList {
  id: string;
  name: string;
  items: ListItem[];
  createdAt: string;
}

interface SavedShoppingListProps {
  onApplyList: (items: ListItem[]) => void;
}

const STORAGE_KEY = "buleje_shopping_lists";

// ── Storage helpers ────────────────────────────────────────────────────────────

function loadLists(): ShoppingList[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ShoppingList[]) : [];
  } catch {
    return [];
  }
}

function saveLists(lists: ShoppingList[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SavedShoppingList({ onApplyList }: SavedShoppingListProps) {
  const [lists, setLists] = useState<ShoppingList[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newItems, setNewItems] = useState<ListItem[]>([{ name: "", qty: 1 }]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [appliedId, setAppliedId] = useState<string | null>(null);

  useEffect(() => {
    setLists(loadLists());
  }, []);

  const persist = useCallback((updated: ShoppingList[]) => {
    setLists(updated);
    saveLists(updated);
  }, []);

  // ── Create ────────────────────────────────────────────────────────────────

  const handleCreate = () => {
    const name = newName.trim();
    const validItems = newItems.filter((i) => i.name.trim());
    if (!name || validItems.length === 0) return;

    const newList: ShoppingList = {
      id: makeId(),
      name,
      items: validItems.map((i) => ({ name: i.name.trim(), qty: i.qty })),
      createdAt: new Date().toISOString(),
    };

    persist([newList, ...lists]);
    setCreating(false);
    setNewName("");
    setNewItems([{ name: "", qty: 1 }]);
  };

  const addItemRow = () => setNewItems((prev) => [...prev, { name: "", qty: 1 }]);

  const updateNewItem = (idx: number, field: keyof ListItem, value: string | number) => {
    setNewItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, [field]: value } : item
      )
    );
  };

  const removeNewItem = (idx: number) => {
    setNewItems((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const handleDelete = (id: string) => {
    persist(lists.filter((l) => l.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  // ── Rename ────────────────────────────────────────────────────────────────

  const startEdit = (list: ShoppingList) => {
    setEditingId(list.id);
    setEditName(list.name);
  };

  const saveEdit = (id: string) => {
    const name = editName.trim();
    if (!name) return;
    persist(lists.map((l) => (l.id === id ? { ...l, name } : l)));
    setEditingId(null);
  };

  // ── Apply ─────────────────────────────────────────────────────────────────

  const handleApply = (list: ShoppingList) => {
    onApplyList(list.items);
    setAppliedId(list.id);
    setTimeout(() => setAppliedId(null), 2000);
  };

  return (
    <div className="rounded-lg border border-border bg-card dark:bg-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <List className="h-4 w-4 text-[var(--accent)]" />
          <span className="text-sm font-semibold text-foreground dark:text-foreground">
            Mis listas de compra
          </span>
        </div>
        <button
          onClick={() => setCreating((v) => !v)}
          className={cn(
            "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
            creating
              ? "bg-muted dark:bg-muted/50 text-muted-foreground"
              : "bg-[var(--accent)] text-white hover:bg-[var(--accent-dark)]"
          )}
        >
          {creating ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {creating ? "Cancelar" : "Nueva lista"}
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="rounded-md border border-[var(--accent)]/30 bg-[var(--accent)]/5 dark:bg-[var(--accent)]/10 p-3 space-y-3">
          <input
            type="text"
            placeholder="Nombre de la lista (ej: Compra semanal)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className={cn(
              "w-full rounded-md border border-border bg-background dark:bg-background",
              "text-sm text-foreground dark:text-foreground placeholder:text-muted-foreground",
              "px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
            )}
          />

          <div className="space-y-1.5">
            {newItems.map((item, idx) => (
              <div key={idx} className="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="Producto"
                  value={item.name}
                  onChange={(e) => updateNewItem(idx, "name", e.target.value)}
                  className={cn(
                    "flex-1 rounded-md border border-border bg-background dark:bg-background",
                    "text-sm text-foreground dark:text-foreground placeholder:text-muted-foreground",
                    "px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                  )}
                />
                <input
                  type="number"
                  min={1}
                  value={item.qty}
                  onChange={(e) => updateNewItem(idx, "qty", Number(e.target.value))}
                  className={cn(
                    "w-16 rounded-md border border-border bg-background dark:bg-background",
                    "text-sm text-foreground dark:text-foreground text-center",
                    "px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/50"
                  )}
                />
                {newItems.length > 1 && (
                  <button
                    onClick={() => removeNewItem(idx)}
                    className="text-muted-foreground hover:text-[var(--data-error-500)] transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={addItemRow}
              className="text-xs text-[var(--accent)] hover:underline flex items-center gap-1"
            >
              <Plus className="h-3 w-3" /> Agregar producto
            </button>
            <div className="flex-1" />
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || newItems.every((i) => !i.name.trim())}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                "bg-[var(--accent)] text-white hover:bg-[var(--accent-dark)] disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              <Check className="h-3.5 w-3.5" /> Guardar lista
            </button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {lists.length === 0 && !creating && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No tienes listas guardadas. Crea una para agilizar tus pedidos.
        </p>
      )}

      {/* List items */}
      <ul className="space-y-2">
        {lists.map((list) => (
          <li key={list.id} className="rounded-md border border-border bg-background dark:bg-background overflow-hidden">
            {/* List header */}
            <div className="flex items-center gap-2 px-3 py-2">
              <button
                onClick={() => setExpandedId((id) => (id === list.id ? null : list.id))}
                className="flex-1 flex items-center gap-2 min-w-0 text-left"
              >
                {expandedId === list.id ? (
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                )}
                {editingId === list.id ? (
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit(list.id)}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      "flex-1 rounded border border-[var(--accent)]/40 bg-card dark:bg-card",
                      "text-sm text-foreground dark:text-foreground px-2 py-0.5 focus:outline-none"
                    )}
                    autoFocus
                  />
                ) : (
                  <span className="text-sm font-medium text-foreground dark:text-foreground truncate">
                    {list.name}
                  </span>
                )}
                <span className="text-xs text-muted-foreground shrink-0">
                  ({list.items.length} productos)
                </span>
              </button>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {editingId === list.id ? (
                  <>
                    <button
                      onClick={() => saveEdit(list.id)}
                      className="rounded p-1 text-[var(--accent)] hover:bg-[var(--accent)]/10 transition-colors"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => handleApply(list)}
                      title="Agregar al carrito"
                      className={cn(
                        "flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors",
                        appliedId === list.id
                          ? "bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                          : "bg-[var(--accent)]/10 text-[var(--accent)] hover:bg-[var(--accent)]/20 dark:bg-[var(--accent)]/20 dark:hover:bg-[var(--accent)]/30"
                      )}
                    >
                      {appliedId === list.id ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <ShoppingCart className="h-3 w-3" />
                      )}
                      {appliedId === list.id ? "Aplicada" : "Aplicar"}
                    </button>
                    <button
                      onClick={() => startEdit(list)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted dark:hover:bg-muted/50 transition-colors"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(list.id)}
                      className="rounded p-1 text-muted-foreground hover:text-[var(--data-error-500)] hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Expanded items */}
            {expandedId === list.id && (
              <ul className="border-t border-border divide-y divide-border/50">
                {list.items.map((item, idx) => (
                  <li
                    key={idx}
                    className="flex items-center justify-between px-4 py-1.5"
                  >
                    <span className="text-sm text-foreground dark:text-foreground">
                      {item.name}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      x{item.qty}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
