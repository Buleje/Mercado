"use client";

/**
 * TiendasMarcasStrip — Strip horizontal con las marcas/tiendas destacadas.
 * Inspirado en la fila de logos de PedidosYa (KFC, Bembos, etc) pero
 * adaptado a las bodegas locales: chip cuadrado pequeño con la inicial
 * del nombre de la tienda + nombre corto debajo.
 *
 * Cuando hayan logos reales en R2 reemplazar el placeholder por <Image>.
 */

import { useEffect, useState } from "react";
import Link from "next/link";

interface FeaturedStore {
  id: string;
  slug: string;
  name: string;
  logoUrl?: string | null;
}

const FALLBACK_TONES = [
  "var(--accent)", // teal
  "#F59E0B", // amber
  "#F43F5E", // rose
  "#8B5CF6", // violet
  "#10B981", // emerald
  "#0EA5E9", // sky
  "#EAB308", // yellow
  "#EC4899", // pink
];

function toneFor(idx: number): string {
  return FALLBACK_TONES[idx % FALLBACK_TONES.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default function TiendasMarcasStrip() {
  const [stores, setStores] = useState<FeaturedStore[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/marketplace/stores?limit=12&sort=relevance")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json) => {
        if (cancelled) return;
        const data = (json?.data ?? []) as Array<{
          id: string;
          slug: string;
          name: string;
          logoUrl?: string | null;
        }>;
        setStores(
          data.slice(0, 12).map((s) => ({
            id: s.id,
            slug: s.slug,
            name: s.name,
            logoUrl: s.logoUrl,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setStores([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loading && stores.length === 0) return null;

  return (
    <section
      aria-label="Tiendas destacadas"
      className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-6"
    >
      <div className="flex items-end justify-between mb-3">
        <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Marcas & bodegas que ya están acá
        </p>
        <Link
          href="/tiendas?cat=todos"
          className="text-xs font-bold text-[var(--accent)] hover:underline"
        >
          Ver todas
        </Link>
      </div>

      <div className="flex gap-2.5 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
        {loading
          ? Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="shrink-0 h-16 w-16 rounded-xl bg-[var(--surface-sunken)] animate-pulse"
              />
            ))
          : stores.map((s, idx) => (
              <Link
                key={s.id}
                href={`/tienda/${s.slug}`}
                className="group shrink-0 flex flex-col items-center gap-1.5 w-[68px]"
              >
                <div
                  className="h-16 w-16 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-hidden flex items-center justify-center transition-all group-hover:border-[var(--accent)]/40 group-hover:-translate-y-0.5 group-hover:shadow-md"
                  style={{
                    backgroundColor: s.logoUrl ? undefined : `${toneFor(idx)}1a`,
                  }}
                >
                  {s.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={s.logoUrl}
                      alt={s.name}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span
                      className="text-base font-black tracking-tight"
                      style={{ color: toneFor(idx) }}
                    >
                      {initials(s.name)}
                    </span>
                  )}
                </div>
                <span className="block w-full text-center text-[length:var(--ts-xs)] font-semibold text-[var(--text-secondary)] truncate leading-tight">
                  {s.name}
                </span>
              </Link>
            ))}
      </div>
    </section>
  );
}
