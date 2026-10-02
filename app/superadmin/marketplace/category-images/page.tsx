import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
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
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="inline-flex items-center gap-2 text-2xl font-bold text-[var(--text-primary)]">
          Imágenes de categorías
          <InfoTip
            side="bottom"
            title="Imágenes de categorías"
            what="Imagen por defecto de cada categoría para todas las tiendas del marketplace."
            affects="Si una tienda sube la suya, esa tiene prioridad. Si no hay ninguna, los filtros muestran solo texto."
            example="Subes la foto de «Bebidas» y todas las tiendas la usan hasta que una ponga la propia."
          />
        </h1>
      </div>
      <CategoryImagesClient />
    </div>
  );
}
