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
import Header from "@/components/Header";
import AnnouncementBar from "@/components/AnnouncementBar";
import CuentaSidebar from "@/components/customer/cuenta-layout/CuentaSidebar";
import CuentaMobileTabs from "@/components/customer/cuenta-layout/CuentaMobileTabs";

const CartSidebar = dynamic(() => import("@/components/CartSidebar"));
const MobileBottomNav = dynamic(() => import("@/components/MobileBottomNav"));

export interface CuentaLayoutShellProps {
  children: React.ReactNode;
}

export function CuentaLayoutShell({ children }: CuentaLayoutShellProps) {
  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <AnnouncementBar />
      <Header />

      <div className="pt-28 sm:pt-32 pb-28">
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
      <MobileBottomNav />
    </div>
  );
}

export default CuentaLayoutShell;
