import type { Metadata } from "next";
import { buildTenantTitle } from "@/lib/store-metadata";
import { SocioDashboardClient } from "./SocioDashboardClient";

/**
 * /cuenta/socio-buleje — Panel del usuario socio.
 *
 * Server component mínimo — delega toda la UI al cliente que usa el
 * contexto SocioBuleje persistido en localStorage.
 */

export async function generateMetadata(): Promise<Metadata> {
  return buildTenantTitle(
    "Panel de Socio",
    "Gestiona tu membresía: cashback, envíos gratis, ahorro y ofertas exclusivas.",
    { index: false, follow: false },
  );
}

export default function SocioBulejeDashboardPage() {
  return <SocioDashboardClient />;
}
