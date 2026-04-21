import { BulejeLoader } from "@/components/ui-system/BulejeLoader";

/**
 * Loading UI mostrado por Next.js mientras se renderiza la página `/tiendas`
 * (o cualquier sub-ruta). Paiche grande como identidad amazónica.
 */
export default function TiendasLoading() {
  return (
    <BulejeLoader
      variant="paiche"
      size="lg"
      label="Buscando tiendas en Pucallpa"
    />
  );
}
