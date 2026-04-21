import { BulejeLoader } from "@/components/ui-system/BulejeLoader";

export default function MarketplaceLoading() {
  // Paiche grande (lg) — identidad amazónica visible mientras carga.
  return (
    <BulejeLoader
      variant="paiche"
      size="lg"
      label="Buscando en las bodegas"
    />
  );
}
