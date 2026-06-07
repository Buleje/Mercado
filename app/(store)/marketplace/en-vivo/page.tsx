import type { Metadata } from "next";
import { EnVivoClient } from "./EnVivoClient";

export const metadata: Metadata = {
  title: "Buleje en Vivo — mira lo fresco del día",
  description:
    "Transmisiones de bodegas y tiendas de Ciudad Constitución. Mira qué llegó fresco, pregunta en el chat y compra sin salir del stream.",
  openGraph: {
    title: "Buleje en Vivo — mira lo fresco del día",
    description:
      "Transmisiones de bodegas y tiendas de Ciudad Constitución. Chat en vivo, productos destacados y delivery en el momento.",
    url: "https://www.buleje.pe/marketplace/en-vivo",
    siteName: "Buleje",
    locale: "es_PE",
    type: "website",
  },
  alternates: {
    canonical: "https://www.buleje.pe/marketplace/en-vivo",
  },
};

export default function EnVivoHubPage() {
  return <EnVivoClient />;
}
