/**
 * marketplace.db.ts — Punto de entrada público (backward compat).
 *
 * Este archivo es un re-export agregado. La lógica real vive en:
 *   lib/db/marketplace/stores.db.ts          — MarketplaceStoresDB
 *   lib/db/marketplace/store-products.db.ts  — MarketplaceStoreProductsDB
 *   lib/db/marketplace/orders.db.ts          — MarketplaceOrdersDB
 *   lib/db/marketplace/reviews.db.ts         — MarketplaceReviewsDB
 *   lib/db/marketplace/abandoned-carts.db.ts — MarketplaceAbandonedCartsDB
 *   lib/db/marketplace/types.ts              — Tipos compartidos
 *
 * TODOS los callers existentes (import { X } from "@/lib/db/marketplace.db")
 * siguen funcionando sin cambio — API pública preservada.
 */
export * from "./marketplace/index";
