import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Comprobante de Pedido",
  description: "Comprobante imprimible de tu pedido en Buleje.",
  robots: { index: false, follow: false },
};

export default function ReciboLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
