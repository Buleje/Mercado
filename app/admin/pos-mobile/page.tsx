import type { Metadata } from "next";
import MobilePOSLoader from "./MobilePOSLoader";

export const metadata: Metadata = {
  title: "POS Móvil | Buleje",
  description: "Punto de venta optimizado para celular",
};

export default function POSMobilePage() {
  return <MobilePOSLoader />;
}
