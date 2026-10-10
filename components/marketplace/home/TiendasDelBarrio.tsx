import { Reveal } from "@/components/landing/Reveal";
import HorizontalCarousel from "@/components/marketplace/HorizontalCarousel";
import HomeSeccionTitulo from "@/components/marketplace/home/HomeSeccionTitulo";
import { TiendaBarrioCard } from "@/components/marketplace/home/TiendaBarrioCard";
import {
  getFeaturedStoresWithProducts,
  type FeaturedStoreWithProducts,
} from "@/lib/db/marketplace-featured.db";
import { logger } from "@/lib/logger";

const LIMITE = 12;

/**
 * «Tiendas de tu barrio» (home «Dosel»): reemplaza al marquee de avatares por
 * tarjetas con portada, logo y 3 productos reales. Datos en el servidor
 * (getFeaturedStoresWithProducts ya cachea y ordena por reseñas REALES).
 * Sin tiendas → la sección no existe.
 *
 * Ancho del ítem: 1,3 visibles a 400 px (72vw), 280 px en sm y exactamente 4
 * en lg — `25% − 9px` = (4 × 25%) − 3 gaps de 12 px repartidos.
 * `scroll-ml-*`: HorizontalCarousel deja `scroll-px-4` fijo pero su relleno
 * crece a 24/32 px; sin el margen, el snap corría el carril 8/16 px al cargar
 * (aparecía la flecha «‹» y se asomaba la 5.ª tarjeta).
 */
const ANCHO_ITEM =
  "w-[72vw] shrink-0 snap-start pb-3 pt-1 sm:w-[280px] sm:scroll-ml-2 lg:w-[calc(25%-9px)] lg:scroll-ml-4";

export default async function TiendasDelBarrio() {
  const tiendas = await getFeaturedStoresWithProducts({
    limit: LIMITE,
    productsPerStore: 3,
  }).catch((err: unknown) => {
    logger.warn("[home/tiendas] getFeaturedStoresWithProducts falló", { error: String(err) });
    return [] as FeaturedStoreWithProducts[];
  });
  if (tiendas.length === 0) return null;

  const accion =
    tiendas.length < LIMITE
      ? `Ver las ${tiendas.length} tiendas`
      : "Ver todas las tiendas";

  return (
    <section
      aria-labelledby="tiendas-titulo"
      className="mx-auto w-full max-w-[1760px] px-4 sm:px-6 lg:px-8"
    >
      <Reveal duration={400} offset={16}>
        <HomeSeccionTitulo
          id="tiendas-titulo"
          titulo="Tiendas de tu barrio"
          accion={{ label: accion, href: "/tiendas" }}
        />
        <HorizontalCarousel
          ariaLabel="Tiendas de tu barrio"
          itemWidthClass={ANCHO_ITEM}
          scrollByFraction={1}
        >
          {tiendas.map((t) => (
            <TiendaBarrioCard key={t.id} tienda={t} />
          ))}
        </HorizontalCarousel>
      </Reveal>
    </section>
  );
}
