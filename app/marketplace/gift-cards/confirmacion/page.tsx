import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import MarketplaceNavbar from "@/components/marketplace/MarketplaceNavbar";
import ConfirmacionClient from "@/components/marketplace/gift-cards/comprar/ConfirmacionClient";

export const metadata: Metadata = {
  title: "Tarjeta enviada — Buleje",
  description: "Tu tarjeta de regalo Buleje se envio correctamente.",
  robots: { index: false, follow: false },
};

function ConfirmacionFallback() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <div className="mx-auto h-12 w-48 animate-pulse rounded bg-gray-200 dark:bg-gray-800" />
      </div>
    </div>
  );
}

export default function ConfirmacionPage() {
  return (
    <>
      <MarketplaceNavbar />
      <Suspense fallback={<ConfirmacionFallback />}>
        <ConfirmacionClient />
      </Suspense>
    </>
  );
}
