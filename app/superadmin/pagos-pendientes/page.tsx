import "server-only";
import type { Metadata } from "next";
import PagosPendientesClient from "./PagosPendientesClient";

export const metadata: Metadata = {
  title: "Pagos pendientes — Buleje SaaS",
  robots: "noindex, nofollow",
};

export default function PagosPendientesPage() {
  return <PagosPendientesClient />;
}
