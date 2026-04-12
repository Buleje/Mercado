import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Mi Credito — Score y Fiado Digital | Buleje",
  description:
    "Consulta tu score de credito, limite de fiado digital, historial de pagos y tips para mejorar tu puntaje.",
  robots: { index: false, follow: false },
};

export default function MiCreditoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
