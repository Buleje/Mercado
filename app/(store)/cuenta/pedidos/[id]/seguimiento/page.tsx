import type { Metadata } from "next";
import { notFound } from "next/navigation";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import AnnouncementBar from "@/components/AnnouncementBar";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import { OrderTrackingDB } from "@/lib/db/order-tracking.db";
import SeguimientoClient from "./SeguimientoClient";

const CartSidebar = dynamic(() => import("@/components/CartSidebar"));
const MobileBottomNav = dynamic(() => import("@/components/MobileBottomNav"));

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const short = id.slice(-8).toUpperCase();
  const { buildTenantTitle } = await import("@/lib/store-metadata");
  return buildTenantTitle(
    `Seguimiento #${short}`,
    "Revisa en tiempo real dónde está tu pedido. ETA, ruta del repartidor y contacto directo.",
    { index: false, follow: false },
  );
}

export default async function SeguimientoPage({ params }: PageProps) {
  const { id } = await params;
  // Tenant resolution — default "main". TODO(ADR-XXX): tomar del cookie real.
  const tenantId = "main";

  const snapshot = await OrderTrackingDB.getSnapshot(tenantId, id);
  if (!snapshot) notFound();

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.buleje.pe/" },
          { name: "Mi cuenta", url: "https://www.buleje.pe/cuenta" },
          { name: "Pedidos", url: "https://www.buleje.pe/cuenta/pedidos" },
          { name: "Seguimiento", url: "https://www.buleje.pe/cuenta/pedidos/seguimiento" },
        ]}
      />
      <AnnouncementBar />
      <Header />

      <main id="main-content" className="max-w-5xl mx-auto px-4 sm:px-6 pt-32 sm:pt-36 pb-28">
        <SeguimientoClient initialSnapshot={snapshot} />
      </main>

      <CartSidebar />
      <MobileBottomNav />
    </div>
  );
}
