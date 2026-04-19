import { BulejeLoader } from "@/components/ui-system/BulejeLoader";

export default function MarketplaceLoading() {
  // Variant paiche — usamos la mascota amazónica en el marketplace para
  // reforzar identidad regional mientras carga.
  return <BulejeLoader variant="paiche" label="Buscando en las bodegas" />;
}
