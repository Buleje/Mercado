import type { Metadata } from "next";
import StoreRegistrationForm from "@/components/marketplace/StoreRegistrationForm";

const BASE_URL = "https://www.buleje.pe";

export const metadata: Metadata = {
  title: "Registra tu Tienda",
  description:
    "Abrí tu tienda en Buleje. Vendé online en tu ciudad con delivery, Yape y panel completo. Primer mes sin cargo.",
  alternates: {
    canonical: `${BASE_URL}/marketplace/registrar`,
  },
  openGraph: {
    title: "Registra tu Tienda",
    description:
      "Abrí tu tienda en Buleje. Vendé online en tu ciudad con delivery, Yape y panel completo. Primer mes sin cargo.",
    url: `${BASE_URL}/marketplace/registrar`,
    siteName: "Buleje",
    locale: "es_PE",
    type: "website",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RegistrarTiendaPage() {
  return <StoreRegistrationForm />;
}
