import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ticket de Venta",
  description: "Ticket imprimible de venta POS — Bodega San Martín.",
  robots: { index: false, follow: false },
};

export default function ReciboVentaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
