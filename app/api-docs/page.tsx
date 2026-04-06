import type { Metadata } from "next";
import { ApiDocsPage } from "@/components/ApiDocsPage";

export const metadata: Metadata = {
  title: "API Docs — Buleje",
  description:
    "Documentación interactiva de la API REST de Buleje. Explora endpoints de productos, clientes, pedidos, inventario y autenticación.",
  robots: { index: true, follow: true },
};

export default function Page() {
  return <ApiDocsPage />;
}
