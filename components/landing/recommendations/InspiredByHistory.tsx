"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { SectionHeader } from "@/components/ui-system";
import { SkeletonProductCard } from "@/components/ui-system";
import { ProductCard } from "@/components/ProductCard";
import {
  getViewedHistory,
  getDominantCategory,
  pickByCategory,
  pickRandom,
  type MockProduct,
} from "@/lib/recommendations/mock";
import { CanastaVacia } from "@/components/ui-system/illustrations/empty-states";
import { cn } from "@/lib/utils";

interface Props {
  initialProducts: MockProduct[];
  className?: string;
}

/**
 * InspiredByHistory — "Para ti / Inspirado en tu historial"
 *
 * Lee localStorage para detectar si el usuario ya navego productos.
 * - Con historial: filtra por categoria dominante.
 * - Sin historial (first-visit): copy alternativo + productos random.
 *
 * Patron: mount-hydration en useEffect para evitar mismatch SSR/CSR
 * con localStorage.
 */
export function InspiredByHistory({ initialProducts, className }: Props) {
  const [mounted, setMounted] = useState(false);
  const [hasHistory, setHasHistory] = useState(false);
  const [picks, setPicks] = useState<MockProduct[]>([]);

  useEffect(() => {
    const history = getViewedHistory();
    const domCat = getDominantCategory(history, initialProducts);

    if (history.length > 0 && domCat) {
      setHasHistory(true);
      const byCat = pickByCategory(initialProducts, domCat, 4);
      // Si hay menos de 4 en la categoria, completar con random
      if (byCat.length < 4) {
        const extra = pickRandom(
          initialProducts.filter((p) => !byCat.find((b) => b.id === p.id)),
          4 - byCat.length
        );
        setPicks([...byCat, ...extra]);
      } else {
        setPicks(byCat);
      }
    } else {
      setHasHistory(false);
      setPicks(pickRandom(initialProducts, 4));
    }

    setMounted(true);
  }, [initialProducts]);

  // Pre-mount: skeleton para evitar layout shift
  if (!mounted) {
    return (
      <section
        className={cn(
          "py-12 sm:py-16 border-t border-[var(--rule-soft)] bg-white dark:bg-gray-950",
          className
        )}
        aria-label="Cargando recomendaciones personales"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="h-8 w-64 bg-gray-100 dark:bg-gray-800 rounded-lg mb-8 animate-pulse" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonProductCard key={i} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  // Sin productos disponibles
  if (picks.length === 0) return null;

  return (
    <section
      className={cn(
        "py-12 sm:py-16 border-t border-[var(--rule-soft)] bg-white dark:bg-gray-950",
        className
      )}
      aria-labelledby="inspired-history-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow="Para ti"
          title={
            hasHistory
              ? "Inspirado en tu historial"
              : "Descubri tu primera bodega"
          }
          description={
            hasHistory
              ? "Productos de tu categoria favorita, disponibles en bodegas cercanas."
              : "Explora lo que tus vecinos piden cada dia en Pucallpa."
          }
          size="md"
          ruled
          className="mb-8"
          action={
            hasHistory ? (
              <Link
                href="/marketplace"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-primary)] hover:opacity-80 transition-opacity"
                aria-label="Ver mas productos"
              >
                Ver mas <ChevronRight className="h-3.5 w-3.5" strokeWidth={2} />
              </Link>
            ) : null
          }
        />

        {picks.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {picks.map((p) => (
              <ProductCard
                key={p.id}
                product={{
                  ...p,
                  image: p.image ?? "",
                  stock: p.stock,
                }}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-12 text-[var(--text-tertiary)]">
            <CanastaVacia size={100} strokeWidth={1.5} />
            <p className="text-sm">
              Todavia no encontramos recomendaciones para vos.
            </p>
            <Link
              href="/marketplace"
              className="text-xs font-semibold text-[var(--color-primary)] hover:opacity-80 transition-opacity"
            >
              Explorar marketplace
            </Link>
          </div>
        )}
      </div>
    </section>
  );
}
