import type { Metadata } from "next";
import StoreRegistrationForm from "@/components/marketplace/StoreRegistrationForm";

export const metadata: Metadata = {
  title: "Registra tu Tienda | Marketplace Buleje",
  description:
    "Abre tu tienda en el marketplace de Buleje. Vende tus productos online a toda Pucallpa con delivery incluido.",
};

export default function RegistrarTiendaPage() {
  return <StoreRegistrationForm />;
}
