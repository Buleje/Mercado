"use client";

/**
 * ExplorarAmazonBoxes — bento grid de cajas tematicas estilo Amazon home.
 *
 * Layout bento (lg+):
 *   - 1 caja "hero" grande (col-span-2 row-span-2) con 4 imagenes 2x2 grandes
 *   - 5 cajas chicas con 2 imagenes (1x2 horizontal)
 *
 * En mobile/tablet → grid simple 1/2 columns.
 *
 * Cada caja tiene:
 *   - Kicker uppercase
 *   - Titulo + subtitulo
 *   - Mini-imagenes preview con cross-fade rotation on hover
 *   - Badge accent on featured
 *   - Link "Ver mas" → ruta filtrada
 *
 * Cajas tematicas (data-driven, sin endpoints nuevos):
 *   1. Sigue comprando      (featured grande)
 *   2. Hasta -40% descuento
 *   3. Para mama
 *   4. Envio gratis cerca tuyo
 *   5. Equipate fit
 *   6. Cocina amazonica
 */

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, useRef } from "react";
import { ArrowRight, Package } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import ExplorarSectionHeader from "./ExplorarSectionHeader";

type PreviewProduct = {
  storeProductId: string;
  productId: number;
  name: string;
  image: string | null;
};

type Box = {
  id: string;
  kicker: string;
  title: string;
  subtitle: string;
  href: string;
  query: string;
  featured?: boolean;
};

const BOXES: Box[] = [
  {
    id: "sigue-comprando",
    kicker: "Para ti",
    title: "Volve a tu lista",
    subtitle: "Lo que viste y los que mas pediste — todo a un toque",
    href: "/marketplace?sort=popular",
    query: "sort=popular&limit=4",
    featured: true,
  },
  {
    id: "descuentos",
    kicker: "Hasta -40%",
    title: "Ofertas que cierran hoy",
    subtitle: "Precios bajos por tiempo limitado",
    href: "/marketplace/ofertas",
    query: "sort=popular&category=ofertas&limit=4",
  },
  {
    id: "envio-gratis",
    kicker: "Envio gratis",
    title: "Cerca tuyo en 25 min",
    subtitle: "Pucallpa centro y Yarinacocha",
    href: "/marketplace/explorar?delivery=free",
    query: "limit=4",
  },
  {
    id: "para-mama",
    kicker: "Cuidado",
    title: "Para mama y casa",
    subtitle: "Cuidado personal, hogar y regalos",
    href: "/marketplace?vista=catalogo&q=regalo",
    query: "category=cuidado&limit=4",
  },
  {
    id: "equipate-fit",
    kicker: "Saludable",
    title: "Equipate fit",
    subtitle: "Snacks, proteinas y suplementos",
    href: "/marketplace?vista=catalogo&q=fit",
    query: "category=salud&limit=4",
  },
];

// ── Componente principal ─────────────────────────────────────────────────────

export default function ExplorarAmazonBoxes() {
  const [data, setData] = useState<Record<string, { products: PreviewProduct[]; loading: boolean }>>(
    () => Object.fromEntries(BOXES.map((b) => [b.id, { products: [], loading: true }])),
  );

  useEffect(() => {
    let cancelled = false;
    const fetchBox = async (box: Box) => {
      try {
        const res = await fetch(`/api/marketplace/catalog?${box.query}`, { cache: "no-store" });
        if (!res.ok) return [];
        const json = await res.json();
        const items = (json.items ?? json.data ?? []) as Array<{
          storeProductId: string;
          productId: number;
          name: string;
          image: string | null;
        }>;
        return items.slice(0, 4);
      } catch {
        return [];
      }
    };

    Promise.all(
      BOXES.map(async (box) => {
        const products = await fetchBox(box);
        return [box.id, { products, loading: false }] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setData(Object.fromEntries(entries));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section
      aria-label="Cajas tematicas de exploracion"
      className="w-full py-6 sm:py-8"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8">
        <ExplorarSectionHeader
          kicker="Tu hub"
          title="Donde quieres empezar"
          subtitle="Atajos pensados para cómo comprás. Sin filtros, sin pestañas."
        />

        {/* Grid uniforme: todos los boxes del mismo tamaño */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {BOXES.map((box) => (
            <CompactBox key={box.id} box={box} entry={data[box.id]} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ── CompactBox: boxes uniformes con 2 imagenes preview ────────────────────

function CompactBox({
  box,
  entry,
}: {
  box: Box;
  entry?: { products: PreviewProduct[]; loading: boolean };
}) {
  const data = entry ?? { products: [], loading: true };
  const [hovered, setHovered] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!hovered || data.products.length <= 1) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    intervalRef.current = setInterval(() => {
      setActiveIdx((i) => (i + 1) % data.products.length);
    }, 1200);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [hovered, data.products.length]);

  // Mostrar 2 tiles preview (siempre 2 visibles en compact)
  const baseTiles = data.loading
    ? Array.from({ length: 2 }, () => null)
    : [...data.products, null, null].slice(0, 2);
  const tiles = baseTiles.map((tile, i) => {
    if (!hovered || data.products.length === 0) return tile;
    // En hover, rotamos cada slot a un producto del catalogo
    return data.products[(activeIdx + i) % data.products.length] ?? tile;
  });

  return (
    <Link
      href={box.href}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setActiveIdx(0);
      }}
      className={cn(
        "group block rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)]",
        "p-5 sm:p-6 transition-all duration-300",
        "hover:border-[var(--accent)]/50 hover:-translate-y-0.5",
        "hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/40",
        "motion-reduce:hover:translate-y-0",
      )}
    >
      <header className="mb-4">
        <p className="text-[length:var(--ts-xs)] font-bold uppercase tracking-[var(--ls-wide)] text-[var(--text-tertiary)] mb-2">
          {box.kicker}
        </p>
        <h3 className="text-lg sm:text-xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-tight group-hover:text-[var(--accent)] transition-colors">
          {box.title}
        </h3>
        <p className="mt-2 text-sm text-[var(--text-secondary)] leading-snug line-clamp-2">
          {box.subtitle}
        </p>
      </header>

      {/* 2 imagenes horizontal con cross-fade rotation */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        {tiles.map((p, i) => (
          <div
            key={`${box.id}-tile-${i}`}
            className="relative aspect-square rounded-lg overflow-hidden bg-[var(--surface-sunken)] border border-[var(--rule-soft)]"
          >
            {data.loading ? (
              <div className="h-full w-full skeleton-shimmer" />
            ) : p?.image ? (
              <Image
                key={`${i}-${p.storeProductId}`}
                src={p.image}
                alt={p.name}
                fill
                sizes="160px"
                className={cn(
                  "object-cover transition-all duration-500 ease-out",
                  "motion-reduce:transition-none",
                  hovered ? "scale-105" : "scale-100",
                )}
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-[var(--text-tertiary)]">
                <Package className="h-7 w-7" strokeWidth={1.25} aria-hidden />
              </div>
            )}
          </div>
        ))}
      </div>

      <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--accent)] group-hover:gap-2.5 transition-all">
        Ver más
        <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
      </span>
    </Link>
  );
}
