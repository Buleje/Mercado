"use client";

/**
 * StoreLogosMarquee — banda animada con los logos de TODAS las tiendas
 * (Brandon 2026-06-12). Estilo "marquee" infinito que se desliza solo, tipo
 * carrusel de marcas. Cada logo linkea a su storefront. Pausa al hover.
 *
 * Datos: `/api/marketplace/featured-stores` (logos, sin productos). Se duplica
 * la lista para que el loop sea continuo (sin salto). El movimiento es CSS puro
 * (`@keyframes` inyectado), SSR-friendly y barato.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Store } from "@buleje/design-system/icons";

interface MarqueeStore {
  slug: string;
  name: string;
  logo: string | null;
}

export default function StoreLogosMarquee() {
  const [stores, setStores] = useState<MarqueeStore[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/marketplace/featured-stores?limit=20&productsPerStore=0", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))
      .then((j) => {
        if (cancelled) return;
        const list = ((j?.stores ?? []) as MarqueeStore[])
          .map((s) => ({ slug: s.slug, name: s.name, logo: s.logo ?? null }))
          .filter((s) => s.slug);
        setStores(list);
      })
      .catch(() => {/* no crítico: la banda se oculta */});
    return () => {
      cancelled = true;
    };
  }, []);

  // Con muy pocas tiendas el marquee no aporta (no hay qué desplazar).
  if (stores.length < 4) return null;

  // Duplicamos para el loop seamless: la animación traslada -50% (el ancho de
  // una copia), así al terminar la 1ª mitad la 2ª ya está en su lugar.
  const loop = [...stores, ...stores];
  // Velocidad proporcional a la cantidad (más tiendas → más largo → más lento).
  const durationS = Math.max(20, stores.length * 3);

  return (
    <section
      aria-label="Todas las tiendas"
      className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 py-2"
    >
      <style>{`@keyframes bsm-store-marquee{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
      <div className="group relative overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]">
        <div
          className="flex w-max items-start gap-5 sm:gap-7 will-change-transform group-hover:[animation-play-state:paused]"
          style={{ animation: `bsm-store-marquee ${durationS}s linear infinite` }}
        >
          {loop.map((s, i) => (
            <Link
              key={`${s.slug}-${i}`}
              href={`/marketplace/${s.slug}`}
              aria-label={`Ver tienda ${s.name}`}
              aria-hidden={i >= stores.length}
              tabIndex={i >= stores.length ? -1 : undefined}
              className="group/item flex shrink-0 flex-col items-center gap-1.5 w-[72px] sm:w-24"
            >
              <span className="relative h-16 w-16 sm:h-20 sm:w-20 overflow-hidden rounded-full ring-1 ring-[var(--rule-base)] bg-[var(--surface-raised)] transition-all duration-300 group-hover/item:scale-105 group-hover/item:ring-2 group-hover/item:ring-[var(--accent)]">
                {s.logo ? (
                  <Image src={s.logo} alt={s.name} fill sizes="80px" className="object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[var(--text-tertiary)]">
                    <Store className="h-7 w-7" strokeWidth={1.75} aria-hidden />
                  </span>
                )}
              </span>
              <span className="max-w-full truncate text-[length:var(--ts-2xs)] sm:text-xs font-bold text-[var(--text-secondary)] transition-colors group-hover/item:text-[var(--accent)]">
                {s.name}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
