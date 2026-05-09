"use client";

/**
 * /marketplace/mi-cuenta/historial — Stub MVP.
 * Muestra el historial de productos vistos desde localStorage.
 * Sin DB. Sin Prisma. Solo useRecentViewed.
 */

import Link from "next/link";
import { Clock, ChevronRight, X } from "@buleje/design-system/icons";
import { useRecentViewed } from "@/hooks/use-recent-viewed";
import {
  VerduraFresca,
  CarniceriaFresca,
  LacteosRefresh,
  BebidasVarias,
  LimpiezaDomicilio,
} from "@/components/ui-system/illustrations";

const FALLBACK_ILL = [
  LacteosRefresh,
  VerduraFresca,
  BebidasVarias,
  LimpiezaDomicilio,
  CarniceriaFresca,
];

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora mismo";
  if (mins < 60) return `Hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Hace ${days}d`;
}

export default function HistorialPage() {
  const { items, clear } = useRecentViewed();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)]">
            Productos que viste
          </h2>
          <p className="mt-0.5 text-sm text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]">
            {items.length === 0
              ? "Aun no viste ningun producto"
              : `${items.length} producto${items.length !== 1 ? "s" : ""} en tu historial`}
          </p>
        </div>
        {items.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] transition-colors"
            aria-label="Limpiar historial"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Limpiar todo
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-gray-200 dark:text-[var(--text-secondary)] mb-4">
            <Clock className="h-12 w-12 mx-auto" strokeWidth={1.2} aria-hidden="true" />
          </div>
          <p className="text-sm font-medium text-[var(--text-secondary)] dark:text-[var(--text-tertiary)]">
            Tu historial esta vacio
          </p>
          <p className="mt-1 text-xs text-[var(--text-tertiary)]">
            Los productos que visites apareceran aqui.
          </p>
          <Link
            href="/marketplace/explorar"
            className="mt-5 inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
          >
            Explorar productos
            <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <ul
          className="divide-y divide-gray-100 dark:divide-gray-800 rounded-lg border border-gray-200 dark:border-[var(--rule-soft)] bg-white dark:bg-[var(--surface-canvas)] overflow-hidden"
          aria-label="Historial de productos vistos"
        >
          {items.map((item, idx) => {
            const Ill = FALLBACK_ILL[idx % FALLBACK_ILL.length];
            return (
              <li key={`${item.storeSlug}-${item.productId}`}>
                <Link
                  href={`/marketplace/${item.storeSlug}?p=${item.productId}`}
                  className="flex items-center gap-4 px-4 py-3.5 hover:bg-[var(--surface-sunken)] dark:hover:bg-gray-800 transition-colors group"
                >
                  {/* Miniatura con ilustracion */}
                  <div className="h-12 w-12 shrink-0 rounded-lg bg-[var(--surface-sunken)] dark:bg-[var(--surface-canvas)] border border-gray-100 dark:border-[var(--rule-soft)] flex items-center justify-center text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)] group-hover:text-primary transition-colors">
                    <Ill size={32} strokeWidth={1.5} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-white line-clamp-1">
                      {item.name}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--text-tertiary)] dark:text-[var(--text-tertiary)]">
                      {item.storeName}
                      <span aria-hidden="true" className="mx-1.5">&middot;</span>
                      <span className="tabular-nums">{formatRelativeTime(item.viewedAt)}</span>
                    </p>
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-sm font-extrabold text-[var(--text-primary)] dark:text-white">
                      S/{Number(item.price).toFixed(2)}
                    </p>
                    <span className="mt-0.5 inline-flex items-center gap-0.5 text-[length:var(--ts-2xs)] font-semibold text-primary">
                      Ver
                      <ChevronRight className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
