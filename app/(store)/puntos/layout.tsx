import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mis Puntos — Programa de Fidelidad | Buleje",
  description:
    "Acumula puntos con cada compra en Buleje y canjéalos por descuentos, delivery gratis y productos de regalo.",
  robots: { index: false, follow: false },
};

export default function PuntosLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
