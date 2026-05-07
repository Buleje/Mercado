import type { Metadata, Viewport } from "next";
import DeliveryAppShell from "@/components/delivery/DeliveryAppShell";

export const metadata: Metadata = {
  title: "Buleje Delivery",
  description: "Portal de repartidores Buleje — Gestiona tus entregas",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "var(--accent)",
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
