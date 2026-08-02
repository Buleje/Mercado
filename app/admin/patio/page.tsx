import type { Metadata } from "next";
import PatioLoader from "./PatioLoader";

export const metadata: Metadata = {
  title: "Patio | Buleje",
  description: "Consultar una troza y recibir guías, desde el patio del aserradero",
  // Es una pantalla operativa detrás de login: no tiene por qué indexarse.
  robots: { index: false, follow: false },
};

export default function PatioPage() {
  return <PatioLoader />;
}
