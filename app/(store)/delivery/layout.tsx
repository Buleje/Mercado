import type { Metadata } from "next";
import { buildTenantTitle } from "@/lib/store-metadata";

export async function generateMetadata(): Promise<Metadata> {
  return buildTenantTitle(
    "Delivery — Seguimiento",
    "Rastrea tu pedido en tiempo real. Delivery rápido con seguimiento GPS.",
    { index: false, follow: false },
  );
}

export default function DeliveryLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
