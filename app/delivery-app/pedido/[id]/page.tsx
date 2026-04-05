import type { Metadata } from "next";
import DeliveryOrderDetail from "@/components/delivery/DeliveryOrderDetail";

export const metadata: Metadata = {
  title: "Detalle de pedido — Buleje Delivery",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DeliveryOrderPage({ params }: PageProps) {
  const { id } = await params;
  return <DeliveryOrderDetail orderId={id} />;
}
