import type { Metadata } from "next";
import MarketplaceNavbar from "@/components/marketplace/MarketplaceNavbar";

export const metadata: Metadata = {
  title: {
    default: "Marketplace | Buleje — Todas las bodegas en un solo lugar",
    template: "%s | Marketplace · Buleje",
  },
  description:
    "Encuentra todas las bodegas, minimarkets y distribuidores de Pucallpa en un solo lugar.",
};

export default function MarketplaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <MarketplaceNavbar />
      <main id="main-content">{children}</main>
    </div>
  );
}
