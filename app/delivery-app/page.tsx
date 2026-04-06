import type { Metadata } from "next";
import DeliveryAppDashboard from "@/components/delivery/DeliveryAppDashboard";

export const metadata: Metadata = {
  title: "Buleje Delivery",
  description: "Portal de repartidores — gestiona pedidos asignados",
};

export default function DeliveryAppPage() {
  return <DeliveryAppDashboard />;
}
