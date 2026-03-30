import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Seguimiento de Pedido en Vivo",
  description:
    "Sigue el estado de tu pedido en tiempo real. Buleje, delivery de abarrotes en Pucallpa.",
  robots: { index: false, follow: false },
};

export default function PedidoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
