"use client";

/**
 * HomeDiscoveryTabs — «Descubre» de la home «Dosel». Pestañas en píldora
 * (Lo más pedido / Nuevos / Hasta S/ 10 / Combos) sobre una fila de 6
 * HomeProductCard: grilla en md+ y carril `snap-x` de 168 px en el celular.
 *
 * Honestidad de las etiquetas: «Lo más pedido» lleva puesto solo si el ranking
 * de hoy trae datos (lo decide el servidor); si no, la pestaña se llama
 * «Populares» y no numera. «Hasta S/ 10» (`maxPrice=10` incluye el 10.00,
 * por eso no dice «menos de») reemplaza a la vieja «Ofertas», que era un
 * `price_asc` sin ninguna rebaja. Los agotados no entran: es una fila para
 * comprar ya. Se piden 24-40 porque hoy 13 de los 14 «nuevos» están en 0.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Coins, Flame, Package, Sparkles, type LucideIcon } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import HomeProductCard from "@/components/marketplace/home/HomeProductCard";
import HomeSeccionTitulo from "@/components/marketplace/home/HomeSeccionTitulo";
import { aProductoDeCatalogo, type ProductoCrudo } from "@/components/marketplace/home/producto-crudo";
import type { UnifiedProductCardProduct } from "@/components/marketplace/UnifiedProductCard";

type TabKey = "top" | "nuevos" | "baratos" | "combos";

interface TabDef {
  key: TabKey;
  label: string;
  icon: LucideIcon;
  /** null = ya viene del servidor. */
  url: string | null;
  verTodo: { label: string; href: string };
  puesto?: boolean;
}

const MAX = 6;
type Estado = UnifiedProductCardProduct[] | "error";

function armarTabs(hayRanking: boolean, conCombos: boolean): TabDef[] {
  const tabs: TabDef[] = [
    hayRanking
      ? {
          key: "top",
          label: "Lo más pedido",
          icon: Flame,
          url: null,
          verTodo: { label: "Ver el catálogo", href: "/#catalogo" },
          puesto: true,
        }
      : {
          key: "top",
          label: "Populares",
          icon: Flame,
          url: "/api/marketplace/catalog?sort=popular&limit=24",
          verTodo: { label: "Ver el catálogo", href: "/#catalogo" },
        },
    {
      key: "nuevos",
      label: "Nuevos",
      icon: Sparkles,
      url: "/api/marketplace/catalog?sort=newest&limit=40",
      verTodo: { label: "Ver los nuevos", href: "/?sort=newest#catalogo" },
    },
    {
      key: "baratos",
      label: "Hasta S/ 10",
      icon: Coins,
      url: "/api/marketplace/catalog?maxPrice=10&limit=24",
      verTodo: { label: "Ver por precio", href: "/?sort=price_asc#catalogo" },
    },
  ];
  if (conCombos) {
    tabs.push({
      key: "combos",
      label: "Combos",
      icon: Package,
      url: "/api/marketplace/catalog?category=promociones&limit=24",
      verTodo: { label: "Ver los combos", href: "/?cat=promociones#catalogo" },
    });
  }
  return tabs;
}

/** Para comprar ya: con nombre, con id y sin agotar (stock desconocido entra). */
function paraComprar(lista: UnifiedProductCardProduct[]): UnifiedProductCardProduct[] {
  return lista.filter((p) => p.id && p.name && p.stock !== 0);
}

export default function HomeDiscoveryTabs({
  topInicial,
  conCombos,
}: {
  topInicial: ReadonlyArray<ProductoCrudo>;
  conCombos: boolean;
}) {
  const inicial = useMemo(() => paraComprar(topInicial.map(aProductoDeCatalogo)), [topInicial]);
  const hayRanking = inicial.length > 0;
  const tabs = useMemo(() => armarTabs(hayRanking, conCombos), [hayRanking, conCombos]);

  const [activa, setActiva] = useState<TabKey>("top");
  const [cache, setCache] = useState<Partial<Record<TabKey, Estado>>>(() =>
    hayRanking ? { top: inicial } : {},
  );
  const tab = tabs.find((t) => t.key === activa) ?? tabs[0];
  const estado = cache[tab.key];

  useEffect(() => {
    if (estado !== undefined || !tab.url) return;
    let vivo = true;
    fetch(tab.url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d: { data?: unknown; items?: unknown }) => {
        const crudos = Array.isArray(d?.data) ? d.data : Array.isArray(d?.items) ? d.items : [];
        const lista = paraComprar((crudos as ProductoCrudo[]).map(aProductoDeCatalogo));
        if (vivo) setCache((c) => ({ ...c, [tab.key]: lista }));
      })
      .catch((err: unknown) => {
        console.warn("[home/descubre] pestaña sin cargar", tab.key, err);
        if (vivo) setCache((c) => ({ ...c, [tab.key]: "error" }));
      });
    return () => {
      vivo = false;
    };
  }, [estado, tab.key, tab.url]);

  const reintentar = useCallback(() => {
    setCache((c) => {
      const resto = { ...c };
      delete resto[tab.key];
      return resto;
    });
  }, [tab.key]);

  // ── Indicador que se desliza entre píldoras (CSS, no Framer: el
  //    MotionProvider del storefront carga `domAnimation`, que no trae
  //    `layoutId`). Con reducir-movimiento, --dur-base vale 0 y salta.
  const listaRef = useRef<HTMLDivElement>(null);
  const botonesRef = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({});
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null);
  useLayoutEffect(() => {
    const lista = listaRef.current;
    if (!lista) return;
    const medir = () => {
      const b = botonesRef.current[activa];
      if (b) setInd({ x: b.offsetLeft, w: b.offsetWidth });
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(lista);
    return () => ro.disconnect();
  }, [activa, tabs.length]);

  const onTeclado = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.key === activa);
    const destino =
      e.key === "ArrowRight" ? (i + 1) % tabs.length
      : e.key === "ArrowLeft" ? (i - 1 + tabs.length) % tabs.length
      : e.key === "Home" ? 0
      : e.key === "End" ? tabs.length - 1
      : -1;
    if (destino < 0) return;
    e.preventDefault();
    const k = tabs[destino].key;
    setActiva(k);
    botonesRef.current[k]?.focus();
  };

  const items = Array.isArray(estado) ? estado.slice(0, MAX) : null;

  return (
    <div>
      <HomeSeccionTitulo id="descubre-titulo" titulo="Descubre" accion={tab.verTodo} />

      <div
        ref={listaRef}
        role="tablist"
        aria-label="Qué mostrar"
        onKeyDown={onTeclado}
        className="relative -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {ind && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-0 top-0 z-[1] h-11 rounded-full bg-[var(--text-primary)] transition-[transform,width] duration-[var(--dur-base)] ease-[var(--ease-editorial)]"
            style={{ width: ind.w, transform: `translateX(${ind.x}px)` }}
          />
        )}
        {tabs.map((t) => {
          const sel = t.key === activa;
          const Icono = t.icon;
          return (
            <button
              key={t.key}
              ref={(el) => {
                botonesRef.current[t.key] = el;
              }}
              type="button"
              role="tab"
              id={`descubre-tab-${t.key}`}
              aria-selected={sel}
              aria-controls="descubre-panel"
              tabIndex={sel ? 0 : -1}
              onClick={() => setActiva(t.key)}
              className={cn(
                "inline-flex h-11 shrink-0 items-center rounded-full px-4 text-sm font-bold outline-none transition-colors duration-[var(--dur-fast)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--surface-canvas)]",
                sel
                  ? ind
                    ? "bg-[var(--surface-sunken)]"
                    : "bg-[var(--text-primary)]"
                  : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              <span
                className={cn(
                  "relative z-[2] inline-flex items-center gap-1.5 whitespace-nowrap",
                  sel && "text-[var(--surface-canvas)]",
                )}
              >
                <Icono className="hidden h-4 w-4 sm:block" strokeWidth={2.25} aria-hidden />
                {t.label}
              </span>
            </button>
          );
        })}
      </div>

      <div id="descubre-panel" role="tabpanel" aria-labelledby={`descubre-tab-${tab.key}`}>
        {estado === "error" ? (
          <p className="flex flex-wrap items-center justify-center gap-3 py-10 text-sm text-[var(--text-secondary)]">
            No pudimos cargar esta lista.
            <button
              type="button"
              onClick={reintentar}
              className="inline-flex h-11 items-center rounded-full bg-[var(--surface-sunken)] px-4 font-bold text-[var(--text-primary)] hover:bg-[var(--rule-soft)]"
            >
              Reintentar
            </button>
          </p>
        ) : items && items.length === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--text-secondary)]">
            Nada por aquí todavía. Prueba otra pestaña.
          </p>
        ) : (
          <ul
            aria-label={tab.label}
            aria-busy={items === null}
            className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0 lg:grid-cols-6 [&::-webkit-scrollbar]:hidden"
          >
            {(items ?? Array.from({ length: MAX }, () => null)).map((p, i) => (
              <li
                key={p ? p.storeProductId || p.id : `esqueleto-${i}`}
                className={cn(
                  "w-[168px] shrink-0 snap-start md:w-auto",
                  // md = 4 columnas: la 5.ª y la 6.ª dejarían media fila vacía.
                  i >= 4 && "md:hidden lg:block",
                )}
              >
                {p ? (
                  <HomeProductCard
                    product={p}
                    href={`/marketplace/${p.storeSlug}?p=${p.id}`}
                    index={i}
                    puesto={tab.puesto ? i + 1 : undefined}
                  />
                ) : (
                  <div aria-hidden className="p-1.5">
                    <div className="aspect-square rounded-xl skeleton-shimmer" />
                    <div className="mt-2.5 h-5 w-16 rounded skeleton-shimmer" />
                    <div className="mt-2 h-4 w-full rounded skeleton-shimmer" />
                    <div className="mt-1 h-4 w-2/3 rounded skeleton-shimmer" />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
