import type { Metadata } from "next";
import { SocioDashboardClient } from "./SocioDashboardClient";

/**
 * /cuenta/socio-buleje — Panel del usuario socio.
 *
 * Server component mínimo — delega toda la UI al cliente que usa el
 * contexto SocioBuleje persistido en localStorage.
 */

export const metadata: Metadata = {
  title: "Panel de Socio — Buleje",
  description:
    "Gestióná tu membresía Socio Buleje: cashback, envíos gratis, ahorro y ofertas exclusivas.",
  robots: { index: false, follow: false },
};

export default function SocioBulejeDashboardPage() {
  return <SocioDashboardClient />;
}
