import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mis Pedidos — Historial y Seguimiento | Buleje",
  description:
    "Revisa el historial de tus pedidos, haz seguimiento en tiempo real y repite pedidos anteriores con un click.",
  robots: { index: false, follow: false },
};

export default function MisPedidosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
