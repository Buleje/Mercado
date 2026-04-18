import type { Metadata } from "next";
import SuscripcionesClient from "./SuscripcionesClient";

export const metadata: Metadata = {
  title: "Bodega al Mes — Mis Suscripciones | Buleje",
  description:
    "Gestiona tus suscripciones recurrentes. Ahorra 5% en cada entrega, pausa o cancela cuando quieras.",
  robots: { index: false, follow: false },
};

export default function SuscripcionesPage() {
  return <SuscripcionesClient />;
}
