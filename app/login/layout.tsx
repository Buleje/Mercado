/**
 * Layout de /login — provee CustomerProvider (vía MarketplaceStoreProviders)
 * SIN el chrome del marketplace (nav/rail/footer). Mismo patrón que el layout
 * de checkout: página limpia y aislada para el login dedicado (Brandon
 * 2026-06-14). tenantSlug="main" igual que checkout.
 */
import MarketplaceStoreProviders from "@/components/MarketplaceStoreProviders";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarketplaceStoreProviders tenantSlug="main">
      {children}
    </MarketplaceStoreProviders>
  );
}
