import type { Metadata } from "next";
import Link from "next/link";
import { OrderTrackingDB } from "@/lib/db/order-tracking.db";
import PublicTrackingClient from "./PublicTrackingClient";

interface PageProps {
  params: Promise<{ slug: string; token: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `Seguimiento — ${slug}`,
    description: "Revisa en tiempo real dónde está el pedido que te compartieron.",
    robots: { index: false, follow: false },
  };
}

export default async function PublicTrackingPage({ params }: PageProps) {
  const { slug, token } = await params;

  const verified = await OrderTrackingDB.verifyShareToken(token);

  if (!verified) {
    return (
      <div className="min-h-screen bg-[var(--surface-sunken)] dark:bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-100 dark:border-card-border bg-white dark:bg-card p-8 text-center">
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-muted">
            Seguimiento
          </span>
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground mt-2">
            Link no válido o expiró
          </h1>
          <p className="mt-3 text-sm text-muted leading-relaxed">
            Este link de seguimiento ya no es válido. Pide a tu contacto que te envíe
            uno nuevo, o busca directamente tu pedido en tu cuenta.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center justify-center h-11 px-5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
          >
            Ir al inicio
          </Link>
        </div>
      </div>
    );
  }

  const snapshot = await OrderTrackingDB.getSnapshot(
    verified.tenantId,
    verified.orderId,
  );

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-[var(--surface-sunken)] dark:bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-100 dark:border-card-border bg-white dark:bg-card p-8 text-center">
          <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
            Pedido no encontrado
          </h1>
          <p className="mt-3 text-sm text-muted">
            No pudimos encontrar el pedido asociado a este link.
          </p>
        </div>
      </div>
    );
  }

  // Versión "segura" del snapshot — sin phone del repartidor.
  const publicSnapshot = {
    ...snapshot,
    driver: snapshot.driver
      ? {
          ...snapshot.driver,
          phone: "", // ocultar phone en vista pública
        }
      : null,
  };

  return (
    <div className="min-h-screen bg-[var(--surface-sunken)] dark:bg-background">
      <header className="border-b border-gray-200 dark:border-[var(--rule-soft)] bg-[#060a0d]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-white">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 border border-primary/30 text-primary font-extrabold text-sm">
              B
            </span>
            <span className="text-sm font-extrabold tracking-tight">Buleje</span>
          </Link>
          <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-white/40">
            {slug} · Seguimiento público
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 pb-16">
        <PublicTrackingClient initialSnapshot={publicSnapshot} token={token} />
      </main>

      <footer className="border-t border-gray-100 dark:border-card-border mt-12 py-8">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 text-center text-[length:var(--ts-2xs)] text-muted">
          Este link vive 72 horas y permite ver el estado del pedido sin login.
          <br />
          Hecho con{" "}
          <Link href="/" className="text-foreground font-semibold hover:text-primary">
            Buleje
          </Link>
          .
        </div>
      </footer>
    </div>
  );
}
