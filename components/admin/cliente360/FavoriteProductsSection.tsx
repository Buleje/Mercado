"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect } from "react";
import { Award } from "@buleje/design-system/icons";

// ── Mejora 11: Productos favoritos del cliente ──────────────────────────────

export type FavoriteProduct = {
  productId: number;
  name: string;
  totalQty: number;
  totalSpent: number;
  purchaseCount: number;
  freqPerMonth: number;
};

export const MEDAL_ICONS = ["1.", "2.", "3.", "4.", "5."];

export function FavoriteProductsSection({ phone }: { phone: string }) {
  const [favorites, setFavorites] = useState<FavoriteProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/customers/${encodeURIComponent(phone)}/favorite-products`)
      .then(r => r.ok ? r.json() : [])
      .then((data: FavoriteProduct[]) => setFavorites(data))
      .catch((err) => console.warn("[Customer360Tab] favorites fetch failed:", err))
      .finally(() => setLoading(false));
  }, [phone]);

  if (loading) {
    return (
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
        <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <Award className="h-4 w-4 text-[var(--data-warning-500)]" /> Productos Favoritos
        </CardTitle>
        <div className="animate-pulse space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-6 bg-[var(--surface-sunken)] rounded" />)}
        </div>
      </div>
    );
  }

  const totalPurchases = favorites.reduce((s, f) => s + f.purchaseCount, 0);

  if (totalPurchases < 3) {
    return (
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
        <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
          <Award className="h-4 w-4 text-[var(--data-warning-500)]" /> Productos Favoritos
        </CardTitle>
        <p className="text-xs text-[var(--text-tertiary)] dark:text-muted py-2">Aun no hay suficiente historial</p>
      </div>
    );
  }

  const maxQty = favorites[0]?.totalQty ?? 1;

  function formatFreq(freq: number): string {
    if (freq >= 4) return `${(freq / 4).toFixed(1)}x/semana`;
    if (freq >= 1) return `${freq.toFixed(1)}x/mes`;
    return `${(freq * 4).toFixed(1)}x/mes`;
  }

  return (
    <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] dark:border-[var(--rule-base)] rounded-xl p-4 sm:p-5">
      <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-[var(--text-primary)] mb-3 flex items-center gap-2">
        <Award className="h-4 w-4 text-[var(--data-warning-500)]" /> Productos Favoritos
      </CardTitle>
      <div className="space-y-2.5">
        {favorites.map((p, i) => (
          <div key={p.productId} className="flex items-center gap-2.5">
            <span className="text-sm w-6 text-center shrink-0">{MEDAL_ICONS[i] ?? `${i + 1}.`}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-0.5">
                <span className="text-xs font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{p.name}</span>
                <span className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted shrink-0">
                  {p.totalQty} veces · S/{Number(p.totalSpent).toFixed(0)} · {formatFreq(p.freqPerMonth)}
                </span>
              </div>
              <div className="h-1.5 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-[var(--dur-slow)]"
                  style={{
                    width: `${Math.max(8, (p.totalQty / maxQty) * 100)}%`,
                    backgroundColor: i === 0 ? "var(--accent)" : i === 1 ? "#ff6b5b" : "#457b9d",
                  }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
