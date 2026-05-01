import type { Metadata } from "next";
import PartnerDashboard from "@/components/delivery/PartnerDashboard";

export const metadata: Metadata = {
  title: "Buleje Delivery — Repartidor",
  description: "Gestioná tus pedidos desde la app del repartidor.",
};

export default function DeliveryAppPage() {
  return <PartnerDashboard />;
}
