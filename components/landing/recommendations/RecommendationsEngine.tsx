"use client";

/**
 * RecommendationsEngine.tsx
 *
 * Orchestrator que recibe los datos iniciales del Server Component (page.tsx)
 * y renderiza las 5 secciones de recomendaciones en el orden correcto.
 *
 * Patron: Client Component wrapper con datos SSR-pasados como props.
 * Ningun fetch en client — cumple "Totales en backend, client solo preview UI".
 */

import { InspiredByHistory } from "./InspiredByHistory";
import { TopSellersToday } from "./TopSellersToday";
import { NewInYourArea } from "./NewInYourArea";
import { FlashDealsOfTheDay } from "./FlashDealsOfTheDay";
import { CustomersLikeYou } from "./CustomersLikeYou";
import type { MockProduct, MockStore } from "@/lib/recommendations/mock";

export interface RecommendationsEngineProps {
  initialProducts: MockProduct[];
  initialStores: MockStore[];
}

export function RecommendationsEngine({
  initialProducts,
  initialStores,
}: RecommendationsEngineProps) {
  // Sin productos no renderizamos nada — evita secciones vacias en first-deploy
  if (initialProducts.length === 0 && initialStores.length === 0) return null;

  return (
    <>
      {/* Slot 1: Inspirado en tu historial — lee localStorage en client */}
      {initialProducts.length > 0 && (
        <InspiredByHistory initialProducts={initialProducts} />
      )}

      {/* Slot 2: Top sellers con chips de categoria */}
      {initialProducts.length > 0 && (
        <TopSellersToday initialProducts={initialProducts} />
      )}

      {/* Slot 3: Bodegas nuevas en tu zona */}
      {initialStores.length > 0 && (
        <NewInYourArea initialStores={initialStores} />
      )}

      {/* Slot 4: Ofertas flash del dia con countdown */}
      {initialProducts.length > 0 && (
        <FlashDealsOfTheDay initialProducts={initialProducts} />
      )}

      {/* Slot 5: Clientes como vos compran (social proof) */}
      {initialProducts.length > 0 && (
        <CustomersLikeYou initialProducts={initialProducts} />
      )}
    </>
  );
}
