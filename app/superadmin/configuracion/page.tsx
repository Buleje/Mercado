import "server-only";
import type { Metadata } from "next";
import ConfiguracionClient from "./ConfiguracionClient";

export const metadata: Metadata = {
  title: "Configuración de plataforma",
  robots: "noindex, nofollow",
};

export default function ConfiguracionPage() {
  return <ConfiguracionClient />;
}
