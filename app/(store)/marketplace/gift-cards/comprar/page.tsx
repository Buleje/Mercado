import type { Metadata } from "next";
import { Suspense } from "react";
import ComprarClient from "@/components/marketplace/gift-cards/comprar/ComprarClient";

export const metadata: Metadata = {
  title: "Comprar Tarjeta de Regalo",
  description:
    "Elegi monto, disenio y dedicatoria. Enviamos la tarjeta por WhatsApp o email al instante.",
  robots: { index: false, follow: true },
};

function ComprarFallback() {
  return (
    <div className="min-h-screen bg-[var(--surface-sunken)]/60 dark:bg-[var(--surface-canvas)]">
      <div className="mx-auto max-w-6xl animate-pulse px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-6 h-4 w-40 rounded bg-[var(--rule-soft)] dark:bg-[var(--surface-sunken)]" />
        <div className="mb-8 h-12 w-full max-w-3xl rounded-xl bg-[var(--rule-soft)] dark:bg-[var(--surface-sunken)]" />
        <div className="h-96 w-full rounded-3xl bg-[var(--rule-soft)] dark:bg-[var(--surface-sunken)]" />
      </div>
    </div>
  );
}

export default function ComprarPage() {
  return (
    <Suspense fallback={<ComprarFallback />}>
      <ComprarClient />
    </Suspense>
  );
}
