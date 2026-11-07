import type { Metadata } from "next";
import BulejeIaLoader from "@/components/admin/buleje-ia/BulejeIaLoader";

export const metadata: Metadata = {
  title: "Buleje IA | Buleje",
  description: "Anota, pregunta y pide papeles a tu negocio hablando con la IA que elijas",
  // Pantalla detrás del login del panel (proxy.ts › guardAdminPages): no se indexa.
  robots: { index: false, follow: false },
};

/** Buleje IA a pantalla completa (ADR-528), como el POS móvil y el modo patio. */
export default function BulejeIaPage() {
  return <BulejeIaLoader />;
}
