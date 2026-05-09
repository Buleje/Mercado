import type { Metadata, Viewport } from "next";
import DeliveryAppShell from "@/components/delivery/DeliveryAppShell";

export const metadata: Metadata = {
  title: "Buleje Delivery",
  description: "Portal de repartidores Buleje — Gestiona tus entregas",
  robots: { index: false, follow: false },
  // PWA manifest con start_url y scope acotados a /delivery-app
  manifest: "/delivery-manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Round 28 P0 fix (Mobile audit + WCAG 1.4.4 AA):
  // antes maximumScale=1 + userScalable=false bloqueaban zoom completamente.
  // Repartidores con baja visión no podían ampliar la UI. Plus en Capacitor
  // Android causaba shifts inesperados al abrir teclado virtual.
  maximumScale: 5,
  userScalable: true,
  // Hex literal obligatorio — Next.js serializa themeColor como meta tag en
  // <head> en build time; var(--accent) no resuelve en ese contexto y el
  // navegador ignora el valor. #00B4A6 = token --accent resuelto en Buleje DS.
  themeColor: "#00B4A6",
};

export default function DeliveryAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--surface-canvas)] font-sans">
      <DeliveryAppShell>{children}</DeliveryAppShell>
    </div>
  );
}
