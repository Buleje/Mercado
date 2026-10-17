"use client";

/**
 * HomeEstantes — los 3 pasillos de «Todo el mercado» (home «Dosel»).
 *
 * Reemplaza los 6 carriles de CatalogCategorySections (que queda sin montar):
 * las 3 categorías con más productos (≥ 4) y, si empatan, la que tenga más
 * fotos. Cada pasillo = rótulo colgado (EstanteRotulo) + 10 tarjetas.
 * Solo en el estado por defecto: con un orden u otro filtro manda la grilla.
 *
 * Datos: 2 GET cacheados (categorías con su conteo + 1 página de 100 del
 * catálogo) en vez de 1 + N; la misma página da la bajada «N productos de M
 * tiendas» (`ConteoMercado`).
 */

import { useEffect, useMemo, useState } from "react";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import EstanteRotulo from "@/components/marketplace/home/EstanteRotulo";
import HomeProductCard from "@/components/marketplace/home/HomeProductCard";
import { useCatalogFilter } from "@/components/marketplace/catalog-filter-context";
import {
  agotadosAlFondo,
  hrefDeProducto,
  toCatalogCardProduct,
  type CatalogProduct,
} from "@/components/marketplace/catalogo-producto";
import { cachedJson } from "@/lib/client-cache-fetch";
import { claveCategoria, etiquetaCategoria } from "@/lib/marketplace/familias-categoria";
import { URL_MUESTRA_POPULAR, VIGENCIA_MUESTRA_MS } from "@/components/marketplace/home/muestra-popular";

const URL_CATEGORIAS = "/api/marketplace/product-categories";
const PASILLOS = 3;
const MINIMO = 4;
const POR_PASILLO = 10;

interface Categorias {
  categories?: { id: string; count: number }[];
}
interface Muestra {
  data?: CatalogProduct[];
  hasMore?: boolean;
}

export interface Pasillo {
  id: string;
  etiqueta: string;
  total: number;
  productos: CatalogProduct[];
}

/** Elige los pasillos: más productos primero; empate → más fotos. */
export function elegirPasillos(categorias: Categorias["categories"], muestra: CatalogProduct[]): Pasillo[] {
  const porClave = new Map<string, CatalogProduct[]>();
  for (const p of muestra) {
    if (!p.category) continue;
    const k = claveCategoria(p.category);
    porClave.set(k, [...(porClave.get(k) ?? []), p]);
  }
  // «Bebidas» y «bebidas» suman juntas; gana la escritura con más productos.
  const unidas = new Map<string, { id: string; total: number; mayor: number }>();
  for (const c of categorias ?? []) {
    if (!c.id || c.count <= 0) continue;
    const k = claveCategoria(c.id);
    const prev = unidas.get(k);
    if (!prev) unidas.set(k, { id: c.id, total: c.count, mayor: c.count });
    else unidas.set(k, { id: c.count > prev.mayor ? c.id : prev.id, total: prev.total + c.count, mayor: Math.max(prev.mayor, c.count) });
  }
  const fotos = (k: string) => (porClave.get(k) ?? []).filter((p) => p.image).length;
  return [...unidas.entries()]
    .filter(([, c]) => c.total >= MINIMO)
    .sort(([ka, a], [kb, b]) => b.total - a.total || fotos(kb) - fotos(ka))
    .slice(0, PASILLOS)
    .map(([k, c]) => ({
      id: c.id,
      etiqueta: etiquetaCategoria(c.id),
      total: c.total,
      productos: agotadosAlFondo(porClave.get(k) ?? []).slice(0, POR_PASILLO),
    }))
    .filter((p) => p.productos.length > 0);
}

/** Muestra del catálogo compartida (dedupe en vuelo + caché de 2 min). */
function useMuestra() {
  // undefined = cargando · null = falló. Sin leer la caché en el 1.er render:
  // el HTML del servidor no la tiene y la hidratación tiene que coincidir.
  const [muestra, setMuestra] = useState<Muestra | null | undefined>(undefined);
  const [categorias, setCategorias] = useState<Categorias | null | undefined>(undefined);
  useEffect(() => {
    let vivo = true;
    void cachedJson<Muestra>(URL_MUESTRA_POPULAR, VIGENCIA_MUESTRA_MS).then((m) => vivo && setMuestra(m));
    void cachedJson<Categorias>(URL_CATEGORIAS, 300_000).then((c) => vivo && setCategorias(c));
    return () => {
      vivo = false;
    };
  }, []);
  return { muestra, categorias };
}

/** «82 productos de 4 tiendas» — la bajada de «Todo el mercado». */
export function ConteoMercado() {
  const { muestra, categorias } = useMuestra();
  const datos = muestra?.data;
  if (!datos || datos.length === 0) return <span aria-hidden>&nbsp;</span>;
  const total = Math.max(datos.length, (categorias?.categories ?? []).reduce((n, c) => n + (c.count > 0 ? c.count : 0), 0));
  const tiendas = new Set(datos.map((p) => p.storeSlug)).size;
  return (
    <span className="tabular-nums">
      {total} productos de {tiendas} {tiendas === 1 ? "tienda" : "tiendas"}
    </span>
  );
}

// Mismo ancho que una columna de la grilla de abajo (3 → 4 → 5 → 6); en
// celular 40vw: 2 tarjetas y la 3.ª asomando (invita a deslizar).
const CELDA =
  "w-[40vw] shrink-0 snap-start sm:w-[calc((100%-1.5rem)/3)] md:w-[calc((100%-2.25rem)/4)] lg:w-[calc((100%-3rem)/5)] xl:w-[calc((100%-3.75rem)/6)]";

export default function HomeEstantes() {
  const filtro = useCatalogFilter();
  const enReposo =
    !filtro ||
    (filtro.category === "todos" && !filtro.vertical && !filtro.priceKey && !filtro.storeSlug && filtro.sort === "popular");
  const { muestra, categorias } = useMuestra();
  const pasillos = useMemo(
    () => (muestra?.data && categorias ? elegirPasillos(categorias.categories, muestra.data) : null),
    [muestra, categorias],
  );

  if (!enReposo) return null;
  // Cargando: reserva el alto de los 3 pasillos (sin salto al llegar).
  if (muestra === undefined || categorias === undefined) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Cargando pasillos">
        {Array.from({ length: PASILLOS }).map((_, i) => (
          <div key={i} className="h-[19rem] rounded-xl skeleton-shimmer sm:h-[20rem]" aria-hidden />
        ))}
      </div>
    );
  }
  // Error o sin categorías con ≥ 4 productos: la grilla de abajo alcanza.
  if (!pasillos || pasillos.length === 0) return null;

  return (
    <div className="space-y-6">
      {pasillos.map((p, i) => (
        <section key={p.id} aria-label={`Pasillo ${i + 1}: ${p.etiqueta}`}>
          <div className="md:hidden">
            <EstanteRotulo id={p.id} etiqueta={p.etiqueta} total={p.total} pasillo={i + 1} variante="cabecera" />
          </div>
          <HorizontalCarousel
            ariaLabel={p.etiqueta}
            itemWidthClass={CELDA}
            showBar={false}
            // El snap usa el mismo margen que el contenido (sin esto, a lg el
            // carril arranca corrido 16 px y la flecha «‹» aparece de entrada).
            // A < md la celda del rótulo se esconde: manda la cabecera de arriba.
            className="max-md:[&_[data-carousel-item]:has(>[data-rotulo])]:hidden sm:[&>[role=region]]:scroll-px-6 lg:[&>[role=region]]:scroll-px-8"
          >
            {[
              <EstanteRotulo key="rotulo" id={p.id} etiqueta={p.etiqueta} total={p.total} pasillo={i + 1} variante="celda" />,
              ...p.productos.map((prod) => (
                <HomeProductCard key={prod.storeProductId} product={toCatalogCardProduct(prod)} href={hrefDeProducto(prod)} />
              )),
            ]}
          </HorizontalCarousel>
        </section>
      ))}
    </div>
  );
}
