import type { Metadata } from "next";
import { EnVivoClient } from "./EnVivoClient";

export const metadata: Metadata = {
  title: "Buleje en Vivo — mirá lo fresco del día",
  description:
    "Transmisiones de bodegas y tiendas de Pucallpa. Mirá qué llegó fresco, preguntá en el chat y comprá sin salir del stream.",
  openGraph: {
    title: "Buleje en Vivo — mirá lo fresco del día",
    description:
      "Transmisiones de bodegas y tiendas de Pucallpa. Chat en vivo, productos destacados y delivery en el momento.",
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
