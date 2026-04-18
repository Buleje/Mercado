import type { Metadata } from "next";
import Link from "next/link";
import RegistroSuccess from "@/components/vender/registro/RegistroSuccess";
import { BulejeWordmark } from "@/components/ui-system/illustrations";

export const metadata: Metadata = {
  title: "Solicitud recibida — Vender en Buleje",
  description:
    "Recibimos tu solicitud para vender en Buleje. Te contactamos en 24 horas con los próximos pasos.",
  robots: { index: false, follow: false },
};

interface PageProps {
  searchParams?: Promise<{ id?: string; nombre?: string }>;
}

/**
 * /vender/registro/completo — success page tras submit exitoso del wizard.
 * Lee `id` y `nombre` de los query params (Next.js 16 async searchParams).
 */
export default async function RegistroCompletoPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const registrationId = params.id?.trim() || "BSL-PEND";
  const nombreNegocio = params.nombre?.trim() || undefined;

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      <header className="border-b border-[var(--rule-base)] bg-[var(--surface-canvas)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <Link
            href="/vender"
            className="flex items-center gap-2 text-[var(--text-primary)]"
            aria-label="Ir al inicio de Vender en Buleje"
          >
            <BulejeWordmark size={28} strokeWidth={1.75} textSize={16} />
            <span className="hidden text-xs font-bold uppercase tracking-[0.2em] text-[var(--text-tertiary)] sm:inline">
              Seller
            </span>
          </Link>
          <Link
            href="/"
            className="text-xs font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Ir al marketplace
          </Link>
        </div>
      </header>

      <main>
        <RegistroSuccess
          registrationId={registrationId}
          nombreNegocio={nombreNegocio}
        />
      </main>
    </div>
  );
}
