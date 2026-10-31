import { ImageIcon } from "@buleje/design-system/icons";
import { CabeceraConPestanas } from "@/components/admin/shared/cabecera-con-pestanas";
import CategoryImagesClient from "./CategoryImagesClient";

/**
 * /superadmin/marketplace/category-images
 *
 * Gestor de imágenes estandarizadas globales por categoría.
 * Estas imágenes son el DEFAULT para todas las tiendas — si la tienda
 * no subió la suya, usamos esta.
 *
 * Categorías default propuestas: Pollo, Bebidas, Frutas y Verduras,
 * Carnes, Lácteos, Limpieza, Snacks, Cuidado Personal, Abarrotes.
 */
export default function CategoryImagesPage() {
  return (
    <div className="space-y-6">
      <CabeceraConPestanas
        icon={ImageIcon}
        title="Imágenes de categorías"
        kicker="Marketplace · Recursos"
        info={{
          title: "Imágenes de categorías",
          what: "Imagen por defecto de cada categoría para todas las tiendas del marketplace.",
          affects: "Si una tienda sube la suya, esa tiene prioridad. Si no hay ninguna, los filtros muestran solo texto.",
          example: "Subes la foto de «Bebidas» y todas las tiendas la usan hasta que una ponga la propia.",
        }}
      />
      <CategoryImagesClient />
    </div>
  );
}
