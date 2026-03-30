import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Buleje Delivery",
  description: "Portal de repartidores Buleje — Gestiona tus entregas",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,   // Bloquear zoom — optimizado para uso con una mano
  userScalable: false,
  themeColor: "#0d9488",
};

export default function DeliveryAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 font-sans">
      {/* Safe area para iOS notch / home indicator */}
      <div
        className="min-h-screen"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {children}
      </div>
    </div>
  );
}
