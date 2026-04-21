import type { Metadata } from "next";
import StoreRegistrationForm from "@/components/marketplace/StoreRegistrationForm";

const BASE_URL = "https://www.buleje.pe";

export const metadata: Metadata = {
  title: "Registra tu Tienda | Marketplace Buleje",
  description:
    "Abre tu tienda en el marketplace de Buleje. Vende tus productos online a toda Pucallpa con delivery incluido.",
  alternates: {
    canonical: `${BASE_URL}/marketplace/registrar`,
  },
  openGraph: {
    title: "Registra tu Tienda | Marketplace Buleje",
    description:
      "Abre tu tienda en el marketplace de Buleje. Vende tus productos online a toda Pucallpa con delivery incluido.",
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
