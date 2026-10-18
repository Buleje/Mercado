import { Layers } from "@buleje/design-system/icons";
import VariantCatalogClient from "./VariantCatalogClient";
import { CabeceraConPestanas } from "@/components/admin/shared/cabecera-con-pestanas";
import { SUPERADMIN_PAGE, SUPERADMIN_CONTENT } from "@/lib/superadmin-layout";

/**
 * /superadmin/variant-catalog
 *
 * Catálogo global de plantillas de variaciones.
 * Cada plantilla representa un grupo de opciones que los tenants pueden
 * importar a sus productos (ej: "Cremas para pollo", "Presas", "Toppings").
 * Cada opción puede tener imagen, nombre y delta de precio.
 *
 * Los tenants ven este catálogo desde su panel admin (botón "Importar del
 * catálogo" en el editor de modifier-groups del producto) y al importar
 * se clona el template a las tablas del tenant.
 */
export default function SuperadminVariantCatalogPage() {
  return (
    <div className={SUPERADMIN_PAGE}>
      <CabeceraConPestanas
        icon={Layers}
        title="Catálogo de variaciones"
        kicker="Marketplace · Personalización"
        info={{
          title: "Catálogo de variaciones",
          what: "Plantillas de variaciones que las tiendas importan a sus productos (talla, color, sabor), sin crearlas una por una.",
          affects: "Las tiendas eligen estas variaciones al crear productos, sin escribirlas de cero.",
          example: "Una pollería importa «Cremas» con sus imágenes; defines tallas S/M/L/XL una vez y todas las tiendas de ropa las usan.",
        }}
      />

      <div className={SUPERADMIN_CONTENT}>
        <VariantCatalogClient />
      </div>
    </div>
  );
}
