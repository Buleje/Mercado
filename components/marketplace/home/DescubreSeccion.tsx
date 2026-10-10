import { Reveal } from "@/components/landing/Reveal";
import HomeDiscoveryTabs from "@/components/marketplace/home/HomeDiscoveryTabs";
import { MarketplacePublicDB } from "@/lib/db/marketplace-public.db";
import { logger } from "@/lib/logger";
import { claveCategoria } from "@/lib/marketplace/familias-categoria";

/** «Combos» solo aparece con 3 productos o más (con 2, la fila queda coja). */
const MIN_COMBOS = 3;

/**
 * «Descubre» (home «Dosel»): `id="descubre"` es el destino del CTA del hero.
 * El servidor decide dos cosas antes de pintar, para que la pestaña no cambie
 * de nombre ni aparezca/desaparezca después de cargar:
 *  - si hay ranking de HOY («Lo más pedido» con puesto) o se cae a «Populares»;
 *  - si «Combos» tiene productos suficientes.
 */
export default async function DescubreSeccion() {
  const [top, categorias] = await Promise.all([
    MarketplacePublicDB.getTopToday(14).catch((err: unknown) => {
      logger.warn("[home/descubre] getTopToday falló", { error: String(err) });
      return { items: [] };
    }),
    MarketplacePublicDB.getProductCategories().catch((err: unknown) => {
      logger.warn("[home/descubre] getProductCategories falló", { error: String(err) });
      return [] as Array<{ id: string; count: number }>;
    }),
  ]);
  const combos = categorias
    .filter((c) => claveCategoria(c.id) === "promociones")
    .reduce((suma, c) => suma + c.count, 0);

  return (
    <section
      id="descubre"
      aria-labelledby="descubre-titulo"
      className="mx-auto w-full max-w-[1760px] scroll-mt-36 px-4 sm:px-6 lg:px-8"
    >
      <Reveal duration={400} offset={16}>
        <HomeDiscoveryTabs topInicial={top.items} conCombos={combos >= MIN_COMBOS} />
      </Reveal>
    </section>
  );
}
