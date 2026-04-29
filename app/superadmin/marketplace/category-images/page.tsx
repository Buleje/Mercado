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
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">
          Imágenes estandarizadas
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[var(--text-tertiary)]">
          Estas imágenes se aplican como <strong>default global</strong> para
          todas las tiendas del marketplace. Si una tienda sube su propia
          imagen para una categoría, esa tiene prioridad. Si no hay nada, los
          filtros muestran solo texto.
        </p>
      </div>
      <CategoryImagesClient />
    </div>
  );
}
