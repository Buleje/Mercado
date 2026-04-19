"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import { useCustomer } from "@/contexts/customer-context";
import { EmptyState } from "@/components/ui-system/EmptyState";
import type { DbFavoriteProduct } from "@/lib/db/favorites.db";

// ── Page ──────────────────────────────────────────────────────────────────────

/**
 * Favoritos — muestra los productos guardados por el cliente.
 * El stub de FavoritesDB retorna [] hasta PR-2 (ADR-059).
 * La UI esta lista para recibir datos reales sin cambios.
 */
export default function FavoritosPage() {
  const { customer } = useCustomer();
  const [favorites, setFavorites] = useState<DbFavoriteProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFavorites = useCallback(async (phone: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ phone, tenantId: "main" });
      const res = await fetch(`/api/marketplace/mi-cuenta/favoritos?${params}`);
      if (!res.ok) throw new Error("Error al cargar favoritos");
      const data = (await res.json()) as { favorites: DbFavoriteProduct[] };
      setFavorites(Array.isArray(data.favorites) ? data.favorites : []);
    } catch {
      // Si el endpoint no existe aun (stub), mostrar vacio sin error
      setFavorites([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (customer?.phone) {
      fetchFavorites(customer.phone);
    } else {
      setLoading(false);
    }
  }, [customer?.phone, fetchFavorites]);

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div role="status" aria-live="polite" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800"
          />
        ))}
        <span className="sr-only">Cargando favoritos...</span>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
      >
        {error}
      </div>
    );
  }

  // ── Empty ─────────────────────────────────────────────────────────────────

  if (favorites.length === 0) {
    return (
      <EmptyState
        eyebrow="Favoritos"
        title="Aún no guardaste productos"
        description="Tocá el corazón sobre cualquier producto del marketplace y aparecerá acá para volver a comprarlo rápido."
        action={
          <Link
            href="/marketplace"
            className="inline-flex items-center rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            Explorar productos
          </Link>
        }
      />
    );
  }

  // ── Grid ──────────────────────────────────────────────────────────────────

  return (
    <div>
      <h2 className="mb-4 text-base font-medium text-gray-700 dark:text-gray-300">
        Favoritos ({favorites.length})
      </h2>

      <ul
        className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        aria-label="Productos favoritos"
      >
        {favorites.map((product) => (
          <li
            key={product.id}
            className="rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
          >
            <a
              href={`/marketplace/${product.storeSlug}`}
              className="block p-3 hover:bg-gray-50 dark:hover:bg-gray-800"
            >
              <div className="relative h-24 w-full overflow-hidden rounded-md">
                <Image
                  src={product.image || "/placeholder-product.png"}
                  alt={product.name}
                  fill
                  sizes="(max-width: 640px) 50vw, 33vw"
                  className="object-cover"
                  loading="lazy"
                />
              </div>
              <p className="mt-2 text-sm font-medium text-gray-900 line-clamp-2 dark:text-gray-100">
                {product.name}
              </p>
              <p className="mt-1 text-sm font-semibold text-[#2d6a4f] dark:text-[#52b788]">
                S/ {product.price.toFixed(2)}
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                {product.storeName}
              </p>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
