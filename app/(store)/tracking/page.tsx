import type { Metadata } from "next";
import { buildTenantTitle } from "@/lib/store-metadata";
import TrackingForm from "./TrackingForm";

export async function generateMetadata(): Promise<Metadata> {
  return buildTenantTitle(
    "Seguir mi pedido",
    "Rastrea el estado de tu pedido. Ingresa tu número de pedido y ve en tiempo real dónde está tu delivery.",
  );
}

export default function TrackingPage() {
  return (
    <main className="min-h-screen bg-background dark:bg-background">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-foreground dark:text-foreground">
            Seguir mi pedido
          </h1>
          <p className="mt-2 text-sm text-muted-foreground dark:text-muted">
            Ingresa tu número de pedido para ver el estado de tu delivery
          </p>
        </div>
        <TrackingForm />
      </div>
    </main>
  );
}
