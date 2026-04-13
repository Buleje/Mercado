"use client";

/**
 * ProductRecommendations — "Productos para ti" section.
 *
 * Fetches hybrid recommendations (vector + co-purchase) for a given product
 * and renders a horizontal scrollable card strip.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Recommendation {
  productId: number;
  name: string;
  price: number;
  score: number;
}

interface ProductRecommendationsProps {
  tenantSlug: string;
  productId: number;
  className?: string;
}

export function ProductRecommendations({
  tenantSlug,
  productId,
  className,
}: ProductRecommendationsProps) {
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    fetch(`/api/recommender/hybrid?productId=${productId}&limit=6`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!cancelled && data?.recommendations) {
          setRecs(data.recommendations);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [productId]);

  if (!loading && recs.length === 0) return null;

  return (
    <section className={cn("py-6", className)}>
      <div className="flex items-center gap-2 mb-4 px-1">
        <Sparkles className="h-5 w-5 text-amber-500" />
        <h3 className="text-lg font-bold text-gray-800 dark:text-foreground">
          Productos para ti
        </h3>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-thin scrollbar-thumb-gray-300">
          {recs.map((rec) => (
            <Link
              key={rec.productId}
              href={`/marketplace/${tenantSlug}/producto/${rec.productId}`}
              className="snap-start shrink-0 w-36 group"
            >
              <div className="rounded-xl border border-gray-200 dark:border-card-border bg-white dark:bg-card overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                <div className="aspect-square bg-gray-50 dark:bg-gray-800 relative">
                  <div className="absolute inset-0 flex items-center justify-center text-3xl text-gray-300">
                    📦
                  </div>
                </div>
                <div className="p-2.5">
                  <p className="text-xs font-medium text-gray-700 dark:text-foreground line-clamp-2 leading-tight mb-1">
                    {rec.name}
                  </p>
                  <p className="text-sm font-bold text-primary">
                    S/ {rec.price.toFixed(2)}
                  </p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
