"use client";

/**
 * «Se acaban hoy» (home «Dosel»): reemplaza a OfertasDelDiaHero y a «Últimas
 * unidades» del catálogo. Único bloque con fondo coral (familia «comida»).
 *
 * Urgencia HONESTA. De `/catalog/sections` (featured + flashDeals +
 * liquidations, sin repetir ni agotados) solo entra lo que de verdad apura:
 *  - quedan ≤ 5 unidades («Quedan 3» en la tarjeta), o
 *  - tiene un descuento declarado.
 * `flashDeals` hoy son «los 8 más nuevos con stock» (sin descuento) y 6 de
 * ellos tienen stock 999, el centinela de «sin límite»: ponerlos bajo «Se
 * acaban» sería mentir. La cuenta regresiva a medianoche sale solo si hay un
 * descuento (es lo único que «cierra» a fin de día).
 *
 * n ≥ 3 → grilla de tickets (2 filas máx.) · n ≤ 2 → modo «pocos»: título y
 * tickets en UNA fila, nunca una tarjeta sola en una grilla ancha · n = 0 → nada.
 */

import { useEffect, useState } from "react";
import { Clock, Timer } from "@buleje/design-system/icons";
import { Reveal } from "@/components/landing/Reveal";
import HomeProductCard from "@/components/marketplace/home/HomeProductCard";
import HomeSeccionTitulo from "@/components/marketplace/home/HomeSeccionTitulo";
import { aProductoDeCatalogo, type ProductoCrudo } from "@/components/marketplace/home/producto-crudo";
import type { UnifiedProductCardProduct } from "@/components/marketplace/UnifiedProductCard";
import { useCuentaMedianoche } from "@/hooks/use-cuenta-medianoche";
import { cn } from "@/lib/utils";
import { cachedJson } from "@/lib/client-cache-fetch";

const POCAS_UNIDADES = 5;
const MAX = 6;
const FUENTES = ["featured", "flashDeals", "liquidations"] as const;
const BAJADA = "Quedan pocas. Llévatelas antes de que se agoten.";

function conDescuento(p: UnifiedProductCardProduct): boolean {
  return (p.discount ?? 0) > 0 || (p.originalPrice ?? 0) > p.price;
}

function elegir(secciones: Record<string, unknown>): UnifiedProductCardProduct[] {
  const vistos = new Set<string>();
  const fuera: UnifiedProductCardProduct[] = [];
  for (const k of FUENTES) {
    const lista = Array.isArray(secciones[k]) ? (secciones[k] as ProductoCrudo[]) : [];
    for (const crudo of lista) {
      const p = aProductoDeCatalogo(crudo);
      const clave = p.storeProductId || String(p.id);
      if (!p.id || vistos.has(clave)) continue;
      vistos.add(clave);
      const stock = p.stock ?? 0;
      if (stock <= 0) continue; // agotado
      if (stock <= POCAS_UNIDADES || conDescuento(p)) fuera.push(p);
    }
  }
  // Primero lo que menos queda; a igual stock, los que tienen descuento.
  return fuera.sort(
    (a, b) => (a.stock ?? 0) - (b.stock ?? 0) || Number(conDescuento(b)) - Number(conDescuento(a)),
  );
}

function Cuenta({ activa }: { activa: boolean }) {
  const cuenta = useCuentaMedianoche(activa);
  if (!cuenta) return null;
  return (
    <span className="inline-flex h-10 items-center gap-2 rounded-full bg-[var(--surface-raised)] px-3.5 text-sm font-bold text-[var(--tinte-ink)] shadow-[var(--shadow-sm)]">
      <Clock aria-hidden className="h-4 w-4" strokeWidth={2.25} />
      <span>Cierra en</span>
      {/* Cada dígito con su key: solo el que cambia vuelve a entrar (num-flip-in). */}
      <span aria-hidden className="inline-flex tabular-nums text-[var(--text-primary)]">
        {cuenta.texto.split("").map((ch, i) =>
          ch === ":" ? (
            <span key={i}>:</span>
          ) : (
            <span key={`${i}-${ch}`} className="anim-num-flip inline-block">
              {ch}
            </span>
          ),
        )}
      </span>
      <span className="sr-only">{cuenta.resumen}</span>
    </span>
  );
}

export default function UrgenciaHoy() {
  const [items, setItems] = useState<UnifiedProductCardProduct[] | null>(null);

  useEffect(() => {
    let vivo = true;
    // cachedJson: volver a la home dentro del minuto no re-pide (16-10, velocidad).
    cachedJson<{ data?: Record<string, unknown> }>("/api/marketplace/catalog/sections", 60_000)
      .then((d) => {
        if (!d) throw new Error("sin respuesta");
        if (vivo) setItems(elegir(d.data ?? {}));
      })
      .catch((err: unknown) => {
        // Sección no crítica: si falla, no se muestra.
        console.warn("[home/urgencia] sin datos", err);
        if (vivo) setItems([]);
      });
    return () => {
      vivo = false;
    };
  }, []);

  if (!items || items.length === 0) return null;

  const pocos = items.length <= 2;
  const reloj = items.some(conDescuento);
  const lista = items.slice(0, MAX);

  return (
    <section
      aria-labelledby="urgencia-titulo"
      className="mx-auto w-full max-w-[1760px] px-4 sm:px-6 lg:px-8"
    >
      <Reveal duration={400} offset={16}>
        <div
          data-familia="comida"
          className="relative isolate rounded-[var(--radius-xl)] bg-[var(--tinte-comida-bg)] p-4 sm:p-6"
        >
          <span className="patron-familia rounded-[inherit]" aria-hidden />
          <div className={cn("relative", pocos && "lg:flex lg:items-center lg:gap-6")}>
            <div className={cn(pocos && "lg:w-[22rem] lg:shrink-0 lg:[&>div]:mb-0")}>
              <HomeSeccionTitulo
                id="urgencia-titulo"
                titulo="Se acaban hoy"
                bajada={BAJADA}
                accion={pocos ? undefined : { label: "Ver todas", href: "/#catalogo" }}
                extra={!pocos && reloj ? <Cuenta activa /> : undefined}
              />
              {pocos && reloj && (
                <div className="-mt-1 mb-4 lg:mb-0 lg:mt-3">
                  <Cuenta activa />
                </div>
              )}
            </div>
            <ul
              className={cn(
                "grid gap-3",
                pocos
                  ? cn("lg:flex lg:flex-1 lg:items-stretch", lista.length === 2 && "sm:grid-cols-2")
                  : cn("sm:grid-cols-2", lista.length === 4 ? "lg:grid-cols-4" : "lg:grid-cols-3"),
              )}
            >
              {lista.map((p, i) => (
                <li
                  key={p.storeProductId || p.id}
                  className={cn(
                    pocos
                      ? "sm:max-w-xl lg:w-[26rem] lg:max-w-none lg:shrink"
                      : // Impar en 2 columnas: la última ocupa la fila entera, sin hueco.
                        "sm:last:odd:col-span-2 lg:last:odd:col-span-1",
                  )}
                >
                  <HomeProductCard
                    product={p}
                    href={`/marketplace/${p.storeSlug}?p=${p.id}`}
                    index={i}
                    forma="fila"
                  />
                </li>
              ))}
            </ul>
            {/* Un solo ticket: el cronómetro ocupa el aire que queda a la derecha. */}
            {lista.length === 1 && (
              <Timer
                aria-hidden
                strokeWidth={1.25}
                className="pointer-events-none absolute -right-2 top-1/2 hidden h-28 w-28 -translate-y-1/2 rotate-12 text-[var(--tinte-ink)] opacity-15 lg:block"
              />
            )}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
