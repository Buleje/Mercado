import { BulejeLoader } from "@/components/ui-system/BulejeLoader";

/**
 * Loading UI de la página de categoría. Paiche grande (lg=360px) — el
 * cliente percibe identidad Buleje mientras el server fetchea productos.
 */
export default function CategoriaLoading() {
  return (
    <BulejeLoader
      variant="paiche"
      size="lg"
      label="Seleccionando lo fresco del día"
    />
  );
}
