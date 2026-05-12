"use client";

/**
 * ImageBankPicker — modal para que tenant admins elijan una imagen del
 * banco global mantenido por superadmin. Read-only (solo selección).
 *
 * Flow:
 *   1. Carga categorías del banco vía /api/admin/image-bank
 *   2. Muestra grid agrupado por categoría
 *   3. Click en item → onPick(item.imageUrl) y cierra
 */

import { useState, useEffect, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  X, Search, Image as ImageIcon, Loader2, Check,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface BankItem { id: string; name: string; imageUrl: string }
interface BankCategory { id: string; name: string; description?: string; items: BankItem[] }

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Llamado con la URL de la imagen elegida. */
  onPick: (item: { name: string; imageUrl: string }) => void;
}

export default function ImageBankPicker({ open, onOpenChange, onPick }: Props) {
  const [categories, setCategories] = useState<BankCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/image-bank");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { categories: BankCategory[] };
      setCategories(data.categories ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (open) reload(); }, [open, reload]);

  const visibleCategories = categories
    .filter((c) => !activeCategoryId || c.id === activeCategoryId)
    .map((c) => ({
      ...c,
      items: c.items.filter((it) => {
        if (!search.trim()) return true;
        return it.name.toLowerCase().includes(search.toLowerCase());
      }),
    }))
    .filter((c) => c.items.length > 0);

  const totalItems = visibleCategories.reduce((s, c) => s + c.items.length, 0);

  const handlePick = (item: BankItem) => {
    onPick({ name: item.name, imageUrl: item.imageUrl });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[8500] bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-1/2 z-[8501] -translate-x-1/2 -translate-y-1/2 w-[95vw] max-w-4xl max-h-[90vh] flex flex-col rounded-2xl bg-[var(--surface-canvas)] shadow-2xl overflow-hidden"
        >
          {/* Header */}
          <div className="shrink-0 px-5 py-4 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)] flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <ImageIcon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <Dialog.Title className="text-base font-extrabold text-[var(--text-primary)]">
                Banco de Imágenes
              </Dialog.Title>
              <p className="text-xs text-[var(--text-secondary)]">
                Imágenes ya optimizadas. Click para usar en este producto.
              </p>
            </div>
            <button onClick={() => onOpenChange(false)} className="p-2 rounded-lg hover:bg-[var(--surface-sunken)]">
              <X className="h-5 w-5 text-[var(--text-tertiary)]" />
            </button>
          </div>

          {/* Search + categories filter */}
          <div className="shrink-0 px-5 py-3 border-b border-[var(--rule-soft)] space-y-2 bg-[var(--surface-raised)]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar item por nombre..."
                autoFocus
                className="w-full pl-10 pr-3 py-2 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setActiveCategoryId(null)}
                  className={cn(
                    "px-3 py-1 rounded-full text-xs font-bold border transition-colors",
                    !activeCategoryId
                      ? "border-primary bg-primary text-white"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-primary/40",
                  )}
                >
                  Todas
                </button>
                {categories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => setActiveCategoryId(c.id)}
                    className={cn(
                      "px-3 py-1 rounded-full text-xs font-bold border transition-colors",
                      activeCategoryId === c.id
                        ? "border-primary bg-primary text-white"
                        : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-primary/40",
                    )}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-5">
            {loading && (
              <div className="flex items-center justify-center py-10 gap-2 text-[var(--text-tertiary)]">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="text-sm">Cargando banco…</span>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/5 p-3 text-sm text-[var(--data-error-500)]">
                {error}
              </div>
            )}

            {!loading && totalItems === 0 && (
              <div className="text-center py-10">
                <ImageIcon className="h-10 w-10 text-[var(--text-tertiary)] mx-auto mb-3" />
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  {search ? `Sin resultados para "${search}"` : "El banco aún no tiene imágenes"}
                </p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">
                  El superadmin debe subir imágenes desde /superadmin/banco-imagenes.
                </p>
              </div>
            )}

            {!loading && visibleCategories.map((cat) => (
              <section key={cat.id} className="mb-6 last:mb-0">
                <h3 className="text-xs font-black uppercase tracking-wider text-[var(--text-tertiary)] mb-2 px-1">
                  {cat.name} <span className="text-[var(--text-tertiary)] font-medium">· {cat.items.length}</span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                  {cat.items.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => handlePick(item)}
                      className="group rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden hover:border-primary hover:shadow-md transition-all text-left"
                    >
                      <div className="aspect-square bg-[var(--surface-sunken)] relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.imageUrl}
                          alt={item.name}
                          className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform"
                        />
                        <div className="absolute inset-0 bg-primary/0 group-hover:bg-primary/15 transition-colors flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary text-white text-[length:var(--ts-2xs)] font-black uppercase tracking-wider">
                            <Check className="h-3 w-3" /> Usar
                          </span>
                        </div>
                      </div>
                      <div className="p-2">
                        <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-primary)] truncate" title={item.name}>
                          {item.name}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
