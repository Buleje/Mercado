import { Layers } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import VariantCatalogClient from "./VariantCatalogClient";
import { SUPERADMIN_PAGE, SUPERADMIN_HERO } from "@/lib/superadmin-layout";

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
      <header className={SUPERADMIN_HERO}>
        <div className="w-full">
          <div className="flex items-start gap-3.5">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
              <Layers className="h-6 w-6" strokeWidth={1.75} aria-hidden />
            </span>
            <div>
              <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                Marketplace · Personalización
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)] inline-flex items-center gap-2 flex-wrap">
                Catálogo de variaciones
              
            <InfoTip side="bottom" title="Catálogo de variaciones" what="Variaciones estándar reutilizables (talla, color, sabor) para los productos." affects="Las tiendas eligen estas variaciones al crear productos, sin escribirlas de cero." example="Definís tallas S/M/L/XL una vez → todas las tiendas de ropa las usan en sus prendas." />
          </h1>
              <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
                Plantillas globales de variaciones que los tenants pueden importar a sus productos.
                Ejemplo: una pollería importa &quot;Cremas&quot; con sus imágenes en lugar de tener que
                crearlas una por una.
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <VariantCatalogClient />
      </div>
    </div>
  );
}
