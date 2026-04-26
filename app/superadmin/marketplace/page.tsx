import { redirect } from "next/navigation";

/**
 * /superadmin/marketplace — segmento padre sin UI propia.
 *
 * El segmento solo tiene la subruta /suppliers (gestión de proveedores
 * del marketplace). Sin este page.tsx el padre devolvia 404.
 *
 * Redirect a /superadmin/marketplace/suppliers que es la unica vista
 * funcional. Si en el futuro se agregan mas vistas (vendors, categorias,
 * comisiones), reemplazar este redirect por un dashboard del marketplace.
 */
export default function SuperadminMarketplaceIndexPage() {
  redirect("/superadmin/marketplace/suppliers");
}
