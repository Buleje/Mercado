"use client";

/**
 * RecentlyViewedDrawer — Drawer inferior con productos vistos recientemente.
 *
 * Se dispara al hover del link "Historial" en el header o automaticamente
 * cuando un user navega >5 productos sin comprar (nudge).
 *
 * Usa el hook useRecentlyViewed (localStorage-backed, TTL 7d).
 *
 * Uso:
 *   <RecentlyViewedDrawer
 *     open={drawerOpen}
 *     onClose={() => setDrawerOpen(false)}
 *   />
 */

import Link from "next/link";
import Image from "next/image";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { X, Clock, Package } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  className?: string;
}

export default function RecentlyViewedDrawer({ open, onClose, className }: Props) {
  const { items, remove, clear } = useRecentlyViewed();

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="recently-viewed-title"
      className="fixed inset-0 z-50 flex flex-col justify-end motion-safe:animate-[fadeIn_0.2s]"
    >
      <button
        type="button"
        aria-label="Cerrar"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 bg-[var(--text-primary)]/40 backdrop-blur-[1px]"
      />

      <div
        className={cn(
          "relative w-full bg-[var(--surface-raised)] rounded-t-3xl shadow-2xl max-h-[80vh] flex flex-col",
          "motion-safe:animate-[slideUp_0.3s_cubic-bezier(0.32,0.72,0,1)]",
          className,
        )}
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {/* Drag handle */}
        <div aria-hidden className="flex items-center justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-[var(--rule-base)]" />
        </div>

        {/* Header */}
        <div className="px-5 pt-2 pb-3 border-b border-[var(--rule-base)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[var(--text-tertiary)]" strokeWidth={2} aria-hidden />
            <h2 id="recently-viewed-title" className="text-base font-extrabold text-[var(--text-primary)] tracking-tight">
              Viste recientemente
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {items.length > 0 && (
              <button
                type="button"
                onClick={clear}
                className="text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--data-error,_#e11d48)] transition-colors"
              >
                Limpiar
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="p-1.5 -m-1.5 rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
            >
              <X className="h-4 w-4" strokeWidth={2} aria-hidden />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <div className="text-center py-12">
              <div className="mx-auto h-12 w-12 rounded-full bg-[var(--surface-sunken)] flex items-center justify-center mb-3">
                <Clock className="h-5 w-5 text-[var(--text-tertiary)]" strokeWidth={1.5} aria-hidden />
              </div>
              <p className="text-sm font-bold text-[var(--text-primary)]">Sin historial aún</p>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">
                Los productos que mires aparecerán acá por 7 días.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {items.map((item) => (
                <li key={item.id} className="relative group">
                  <Link
                    href={item.url}
                    onClick={onClose}
                    className="block rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden hover:border-[var(--accent)] transition-colors"
                  >
                    <div className="relative aspect-square bg-[var(--surface-sunken)]">
                      {item.image ? (
                        <Image
                          src={item.image}
                          alt={item.name}
                          fill
                          sizes="160px"
                          className="object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-[var(--text-tertiary)]">
                          <Package className="h-6 w-6" strokeWidth={1.5} aria-hidden />
                        </div>
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-xs font-bold text-[var(--text-primary)] line-clamp-2 leading-tight">
                        {item.name}
                      </p>
                      <p className="mt-1 text-sm font-extrabold text-[var(--text-primary)] tabular-nums">
                        S/{Number(item.price).toFixed(2)}
                      </p>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      remove(item.id);
                    }}
                    aria-label={`Quitar ${item.name} del historial`}
                    className="absolute top-1.5 right-1.5 h-6 w-6 rounded-full bg-[var(--surface-canvas)] text-[var(--text-tertiary)] hover:text-[var(--data-error,_#e11d48)] shadow-sm opacity-0 group-hover:opacity-100 transition-opacity inline-flex items-center justify-center"
                  >
                    <X className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
