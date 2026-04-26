import type { Metadata } from "next";
import { buildTenantTitle } from "@/lib/store-metadata";
import SuscripcionesClient from "./SuscripcionesClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildTenantTitle(
    "Mis Suscripciones",
    "Gestiona tus suscripciones recurrentes. Ahorra en cada entrega, pausa o cancela cuando quieras.",
    { index: false, follow: false },
  );
}

export default function SuscripcionesPage() {
  return <SuscripcionesClient />;
}
