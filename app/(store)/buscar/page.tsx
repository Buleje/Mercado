import type { Metadata } from "next";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import AnnouncementBar from "@/components/AnnouncementBar";
import BreadcrumbSchema from "@/components/BreadcrumbSchema";
import Footer from "@/components/Footer";
import { SearchTrigger } from "./SearchTrigger";

const ProductCatalog = dynamic(() => import("@/components/ProductCatalog"));
const CartSidebar = dynamic(() => import("@/components/CartSidebar"));
const CustomerModal = dynamic(() => import("@/components/CustomerModal"));
const MobileBottomNav = dynamic(() => import("@/components/MobileBottomNav"));
const UserAccountModal = dynamic(() => import("@/components/UserAccountModal"));

export const metadata: Metadata = {
  title: "Buscar productos — Buleje",
  description:
    "Busca entre todos nuestros productos de abarrotes, bebidas, carnes, snacks, limpieza y más. Delivery rápido.",
  robots: { index: false, follow: true },
};

export default function BuscarPage() {
  return (
    <>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.buleje.pe/" },
          { name: "Buscar", url: "https://www.buleje.pe/buscar" },
        ]}
      />
      <AnnouncementBar />
      <Header />
      {/* Spacer for fixed header */}
      <div className="h-[6.75rem] sm:h-[7.75rem]" />
      <main id="main-content" className="min-h-screen">
        <SearchTrigger />
        <ProductCatalog />
      </main>
      <Footer />
      <CartSidebar />
      <CustomerModal />
      <MobileBottomNav />
      <UserAccountModal />
    </>
  );
}
