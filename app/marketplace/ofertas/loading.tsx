import { BulejeLoader } from "@/components/ui-system/BulejeLoader";

export default function OfertasLoading() {
  return (
    <BulejeLoader
      variant="paiche"
      size="lg"
      label="Cargando ofertas del día"
    />
  );
}
