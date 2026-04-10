import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Delivery — Seguimiento de Entrega | Buleje",
  description:
    "Rastrea tu pedido en tiempo real. Delivery rapido con seguimiento GPS.",
  robots: { index: false, follow: false },
};

export default function DeliveryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
