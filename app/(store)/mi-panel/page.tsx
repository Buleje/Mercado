import dynamic from "next/dynamic";
import Header from "@/components/Header";
import AnnouncementBar from "@/components/AnnouncementBar";

const PanelClient = dynamic(() => import("./PanelClient"));
const CartSidebar = dynamic(() => import("@/components/CartSidebar"));
const MobileBottomNav = dynamic(() => import("@/components/MobileBottomNav"));

/**
 * /panel — Hub del cliente para una tienda individual (tenant-scoped).
 *
 * Diferente de `/cuenta` (que es del marketplace global). Esta ruta vive bajo
 * `(store)` así que también responde a `/t/<slug>/panel` con el chrome del
 * storefront del tenant.
 *
 * Muestra en una sola página: bienvenida + tier, stats, pedidos recientes,
 * progreso de puntos y accesos rápidos. Cada bloque enlaza a la ruta
 * profunda correspondiente.
 */
export default function PanelPage() {
  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "color-mix(in oklch, var(--color-primary, #00B4A6) 4%, var(--surface-canvas, #f9fafb))",
      }}
    >
      <AnnouncementBar />
      <Header />

      <main
        id="main-content"
        className="pt-36 sm:pt-44 pb-28 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8"
      >
        <PanelClient />
      </main>

      <CartSidebar />
      <MobileBottomNav />
    </div>
  );
}
