import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mi Cuenta — Panel del Cliente | Bodega San Martín",
  description:
    "Gestiona tus pedidos, listas de compras, puntos de lealtad y direcciones en Bodega San Martín, Pucallpa.",
  robots: { index: false, follow: false },
};

export default function CuentaLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
