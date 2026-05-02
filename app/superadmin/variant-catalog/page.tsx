import VariantCatalogClient from "./VariantCatalogClient";

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
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <p className="text-xs uppercase tracking-widest text-[var(--text-tertiary)] font-bold">
          Marketplace · Personalización
        </p>
        <h1 className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
          Catálogo de variaciones
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-[var(--text-secondary)]">
          Plantillas globales de variaciones que los tenants pueden importar
          a sus productos. Ejemplo: una pollería importa &quot;Cremas&quot; con sus
          imágenes en lugar de tener que crearlas una por una.
        </p>
      </div>
      <VariantCatalogClient />
    </div>
  );
}
