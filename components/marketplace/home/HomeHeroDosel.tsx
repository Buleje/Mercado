/**
 * HomeHeroDosel — portada de la home del marketplace (rediseño «Dosel»,
 * 2026-10-10). Server: composición, H1 VISIBLE (reemplaza al `sr-only`),
 * CTAs y fila de confianza con datos verdaderos.
 *
 * ≥1280: tile del dosel (8 col) + columna de tickets (4 col).
 * 768-1279: tile a lo ancho (≥360 px) + 3 tickets en fila (a 1024 el 8/4
 *      dejaba un tile de 578 px: el H1 de 44 px no convivía con el bodegón).
 * 400: tile de alto automático, 1 CTA a todo el ancho, 1 plato asomando y los
 *      tickets en carril. El hero NO se anima al cargar (es el LCP).
 */
import { Suspense } from "react";
import Link from "next/link";
import { PageTitle } from "@buleje/design-system";
import { ArrowRight, Clock, MapPin, Store } from "@buleje/design-system/icons";
import { PaymentMethodIcon } from "@/components/marketplace/PaymentIcons";
import { BRAND_GEO } from "@/lib/geo";
import HeroDoselFondo, { HeroDoselHojaFrente } from "./HeroDoselFondo";
import HeroBodegon from "./HeroBodegon";
import HomePromoTickets, { type TicketPromoDatos } from "./HomePromoTickets";

interface Props {
  banners: TicketPromoDatos[];
  /** Minutos promedio de entrega (`getLiveStats().avgDeliveryMin`). */
  minutos: number;
  /** Tiendas publicadas; con menos de 2 no se muestra (no luce). */
  tiendas: number | null;
}

/** Aro de foco visible sobre el dosel (el global es teal y se pierde acá). */
const FOCO_CLARO = "focus-visible:outline-white! focus-visible:outline-offset-2!";

export default function HomeHeroDosel({ banners, minutos, tiendas }: Props) {
  return (
    <section
      aria-labelledby="home-h1"
      className="mx-auto w-full max-w-[1760px] px-4 pt-3 sm:px-6 sm:pt-4 lg:px-8 lg:pt-6"
    >
      <div className="grid gap-3 md:gap-4 xl:grid-cols-12">
        <div className="noise-texture-bg relative isolate flex flex-col overflow-clip rounded-[var(--radius-xl)] text-white md:min-h-[360px] xl:col-span-8 xl:min-h-[400px]">
          <HeroDoselFondo />
          <div className="relative z-10 flex flex-1 flex-col justify-between gap-4 p-5 sm:gap-5 sm:p-8 xl:py-7">
            <div className="flex flex-col items-start">
              <span className="inline-flex h-8 items-center gap-1.5 rounded-full bg-white/12 px-3 text-sm font-semibold text-white ring-1 ring-white/20">
                <MapPin aria-hidden className="size-4" strokeWidth={2} />
                {BRAND_GEO.city}, {BRAND_GEO.region}
              </span>
              <PageTitle
                id="home-h1"
                className="mt-3 max-w-[19rem] text-balance text-[length:var(--ts-hero)] font-extrabold leading-[1.02] tracking-[-0.035em] text-white sm:max-w-[26rem] sm:text-[length:var(--ts-hero)] lg:max-w-[31rem]"
              >
                Tu mercado de {BRAND_GEO.city},{" "}
                <span className="whitespace-nowrap text-amber-300">a tu puerta</span>
              </PageTitle>
              <p className="mt-3 hidden max-w-[24rem] text-lg text-white/85 md:block">
                Pollerías, bodegas y mercados del barrio.
              </p>
              <div className="mt-4 flex w-full gap-3 md:mt-6 md:w-auto">
                <a
                  href="#descubre"
                  className={`inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-amber-500 px-6 text-base font-extrabold text-[var(--brand-ink)] shadow-[var(--shadow-md)] transition-[background-color,transform] duration-[var(--dur-fast)] hover:bg-amber-400 active:scale-[.98] md:flex-none ${FOCO_CLARO}`}
                >
                  Pedir ahora
                  <ArrowRight aria-hidden className="size-5" strokeWidth={2.25} />
                </a>
                <Link
                  href="/tiendas"
                  className={`hidden h-12 items-center rounded-xl bg-white/10 px-5 text-base font-bold text-white ring-1 ring-white/25 transition-colors duration-[var(--dur-fast)] hover:bg-white/15 md:inline-flex ${FOCO_CLARO}`}
                >
                  Ver tiendas
                </Link>
              </div>
            </div>

            <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold text-white">
              <li className="inline-flex items-center gap-1.5">
                <Clock aria-hidden className="size-4" strokeWidth={2} />
                <span>
                  Llega en <span className="tabular-nums">~{minutos} min</span>
                </span>
              </li>
              {tiendas !== null && tiendas >= 2 && (
                <li className="hidden items-center gap-1.5 sm:inline-flex">
                  <Store aria-hidden className="size-4" strokeWidth={2} />
                  <span>
                    <span className="tabular-nums">{tiendas}</span> tiendas del barrio
                  </span>
                </li>
              )}
              <li className="inline-flex items-center gap-2">
                <span role="img" aria-label="Pagas con Yape, Plin o efectivo" className="flex -space-x-1">
                  <PaymentMethodIcon method="yape" size="sm" />
                  <PaymentMethodIcon method="plin" size="sm" />
                  <PaymentMethodIcon method="efectivo" size="sm" />
                </span>
                <span aria-hidden className="hidden sm:inline">
                  Yape · Plin · efectivo
                </span>
              </li>
            </ul>
          </div>
          <Suspense fallback={null}>
            <HeroBodegon />
          </Suspense>
          <HeroDoselHojaFrente />
        </div>
        <HomePromoTickets banners={banners} />
      </div>
    </section>
  );
}
