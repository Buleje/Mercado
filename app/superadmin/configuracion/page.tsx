import "server-only";
import type { Metadata } from "next";
import ConfiguracionClient from "./ConfiguracionClient";

export const metadata: Metadata = {
  title: "Configuración de plataforma",
  robots: "noindex, nofollow",
};

// AdminTabShell + Settings icon viven dentro del Client Component porque el
// icon de lucide es un ReactComponent ($$typeof) que no se puede serializar
// desde un Server Component (Next 16 RSC boundary).
export default function ConfiguracionPage() {
  return <ConfiguracionClient />;
}
