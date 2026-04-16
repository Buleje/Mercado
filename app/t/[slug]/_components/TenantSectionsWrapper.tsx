"use client";

import { CartProvider } from "@/contexts/cart-context";
import { SettingsProvider } from "@/contexts/settings-context";
import { ToastProvider } from "@/contexts/toast-context";
import TiendaSections from "@/components/TiendaSections";
import type { SectionContentMap } from "@/components/TiendaSections";
import type { Product } from "@/data/products";

interface Props {
  tenantSlug: string;
  serverProducts: Product[];
  visibleSections: string[];
  sectionOrder: string[];
  sectionContent: SectionContentMap;
  showEmptyPlaceholders: boolean;
}

export default function TenantSectionsWrapper({
  tenantSlug,
  serverProducts,
  visibleSections,
  sectionOrder,
  sectionContent,
  showEmptyPlaceholders,
}: Props) {
  return (
    <SettingsProvider>
      <ToastProvider>
        <CartProvider tenantSlug={tenantSlug}>
          <TiendaSections
            serverProducts={serverProducts}
            visibleSections={new Set(visibleSections)}
            sectionOrder={sectionOrder}
            sectionContent={sectionContent}
            showEmptyPlaceholders={showEmptyPlaceholders}
          />
        </CartProvider>
      </ToastProvider>
    </SettingsProvider>
  );
}
