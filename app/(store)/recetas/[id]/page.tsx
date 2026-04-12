import dynamic from "next/dynamic";
import RecetaDetalleClient from "@/components/store/RecetaDetalleClient";

const MarketplaceNavbar = dynamic(
  () => import("@/components/marketplace/MarketplaceNavbar"),
  { ssr: true }
);
const Footer = dynamic(() => import("@/components/Footer"), { ssr: true });

export default async function RecetaDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main id="main-content">
      <MarketplaceNavbar />
      <RecetaDetalleClient recetaId={id} />
      <Footer />
    </main>
  );
}
