import type { Metadata } from "next";
import { Suspense } from "react";
import ComprarClient from "@/components/marketplace/gift-cards/comprar/ComprarClient";
import MarketplaceNavbar from "@/components/marketplace/MarketplaceNavbar";

export const metadata: Metadata = {
  title: "Comprar Tarjeta de Regalo — Buleje",
  description:
    "Elegi monto, disenio y dedicatoria. Enviamos la tarjeta por WhatsApp o email al instante.",
  robots: { index: false, follow: true },
};

function ComprarFallback() {
  return (
    <div className="min-h-screen bg-gray-50/60 dark:bg-gray-950">
      <div className="mx-auto max-w-6xl animate-pulse px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-6 h-4 w-40 rounded bg-gray-200 dark:bg-gray-800" />
        <div className="mb-8 h-12 w-full max-w-3xl rounded-xl bg-gray-200 dark:bg-gray-800" />
        <div className="h-96 w-full rounded-3xl bg-gray-200 dark:bg-gray-800" />
      </div>
    </div>
  );
}

export default function ComprarPage() {
  return (
    <>
      <MarketplaceNavbar />
      <Suspense fallback={<ComprarFallback />}>
        <ComprarClient />
      </Suspense>
    </>
  );
}
