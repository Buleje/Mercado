"use client";

/**
 * CuentaLayoutShell — wrapper client del area /cuenta/*.
 *
 * Compone:
 *   - Header + AnnouncementBar (store chrome)
 *   - CuentaMobileTabs (tabs horizontal en mobile)
 *   - CuentaSidebar (nav sticky en desktop lg+)
 *   - <main> con children (contenido de la ruta actual)
 *   - CartSidebar + MobileBottomNav (floating store widgets)
 */

import dynamic from "next/dynamic";
import CuentaSidebar from "@/components/customer/cuenta-layout/CuentaSidebar";
import CuentaMobileTabs from "@/components/customer/cuenta-layout/CuentaMobileTabs";

const CartSidebar = dynamic(() => import("@/components/CartSidebar"));

export interface CuentaLayoutShellProps {
  children: React.ReactNode;
}

export function CuentaLayoutShell({ children }: CuentaLayoutShellProps) {
  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "color-mix(in oklch, var(--color-primary, #00A0A0) 4%, var(--surface-canvas))",
      }}
    >

      {/* Sin padding-top propio: el layout de la tienda ya deja el sitio del
          encabezado fijo y de las migas. Antes había pt-28/32 (128 px) de más:
          ~150 px vacíos entre las migas y el panel (medido 02-10). */}
      <div className="pb-28">
        <CuentaMobileTabs className="sticky top-16 z-30" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <div className="flex gap-8">
            <CuentaSidebar />
            <main
              id="main-content"
              className="flex-1 min-w-0"
            >
              {children}
            </main>
          </div>
        </div>
      </div>

      <CartSidebar />
    </div>
  );
}

export default CuentaLayoutShell;
