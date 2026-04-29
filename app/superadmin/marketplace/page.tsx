import Link from "next/link";
import { ImageIcon, Truck, ShoppingBag, Percent, Users, ArrowRight } from "lucide-react";

/**
 * /superadmin/marketplace — Hub del marketplace multi-vendor.
 *
 * Antes era un redirect a /suppliers; ahora es un índice real con tarjetas
 * para cada sub-vista (suppliers, category images, futuro: vendors,
 * comisiones). Resuelve el item huérfano /marketplace/category-images que
 * antes solo era accesible vía URL directa.
 */
export default function SuperadminMarketplaceHubPage() {
  const sections = [
    {
      href: "/superadmin/marketplace/suppliers",
      title: "Proveedores",
      desc: "Aprueba o rechaza solicitudes de proveedores que quieren listar productos en el marketplace cross-vendor.",
      icon: Truck,
      status: "live" as const,
      ariaLabel: "Ir a la cola de proveedores",
    },
    {
      href: "/superadmin/marketplace/category-images",
      title: "Imágenes de categorías",
      desc: "Define la imagen visible para cada categoría en el grid público del marketplace (Abarrotes, Bebidas, Carnes…).",
      icon: ImageIcon,
      status: "live" as const,
      ariaLabel: "Editar imágenes de categorías",
    },
    {
      href: "/superadmin/stores",
      title: "Tiendas publicadas",
      desc: "Listado de las tiendas (vendors) publicadas en el marketplace. Activar o pausar su visibilidad pública.",
      icon: ShoppingBag,
      status: "live" as const,
      ariaLabel: "Ir a tiendas publicadas",
    },
    {
      href: "/superadmin/marketplace/commissions",
      title: "Comisiones",
      desc: "Configura porcentajes de comisión por categoría, por plan o por vendor. (Próximamente)",
      icon: Percent,
      status: "soon" as const,
      ariaLabel: "Comisiones — próximamente",
    },
    {
      href: "/superadmin/marketplace/vendors",
      title: "Vendors",
      desc: "Gestión completa de vendors aprobados: payouts, contratos, rating. (Próximamente)",
      icon: Users,
      status: "soon" as const,
      ariaLabel: "Vendors — próximamente",
    },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Marketplace</h1>
        <p className="mt-2 text-base text-muted-foreground">
          Hub del marketplace multi-vendor. Gestiona proveedores, imágenes de categorías, tiendas
          publicadas y comisiones desde un solo lugar.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sections.map((s) => {
          const Icon = s.icon;
          const isSoon = s.status === "soon";
          const baseClasses =
            "group flex h-full flex-col gap-3 rounded-2xl border-2 border-border bg-card p-5 transition";
          const liveClasses =
            "hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5";
          const soonClasses = "opacity-60 cursor-not-allowed";

          const card = (
            <div className={`${baseClasses} ${isSoon ? soonClasses : liveClasses}`}>
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                {isSoon ? (
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    Próximamente
                  </span>
                ) : (
                  <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                )}
              </div>
              <div>
                <h2 className="text-lg font-semibold">{s.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{s.desc}</p>
              </div>
            </div>
          );

          if (isSoon) {
            return (
              <div key={s.href} aria-label={s.ariaLabel} aria-disabled="true">
                {card}
              </div>
            );
          }

          return (
            <Link key={s.href} href={s.href} aria-label={s.ariaLabel}>
              {card}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
