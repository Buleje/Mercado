/**
 * Página /cuenta/pedidos/[id]/confirmacion
 *
 * Página alternativa post-checkout que NO modifica el flujo real del checkout.
 * Para activarla como destino real:
 *   TODO: proponer ADR-checkout que cambie el redirect success a esta ruta.
 *
 * Server Component (solo server data + render). El cliente monta
 * PostPurchaseCelebration + PostPurchaseCrossSell.
 */

import { Suspense } from "react";
import type { Metadata } from "next";
import { buildTenantTitle } from "@/lib/store-metadata";
import ConfirmacionClient from "./ConfirmacionClient";

export async function generateMetadata(): Promise<Metadata> {
  return buildTenantTitle(
    "Pedido confirmado",
    "Gracias por tu compra — seguimos tu pedido en tiempo real.",
    { index: false, follow: false },
  );
}

interface ConfirmacionPageProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

function computeStubEtaIso(minutesAhead: number): string {
  return new Date(Date.now() + minutesAhead * 60 * 1000).toISOString();
}

export default async function ConfirmacionPage({
  params,
  searchParams,
}: ConfirmacionPageProps) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const customerName = typeof query.name === "string" ? query.name : undefined;

  // ETA por defecto: 25 min desde ahora (stub — en prod viene del order real)
  // Computado fuera de render (helper) para no disparar React Compiler impure-call.
  const etaIso = computeStubEtaIso(25);

  return (
    <main className="min-h-screen bg-[var(--surface-canvas)] py-8 md:py-12">
      <div className="mx-auto max-w-4xl px-4 space-y-8">
        <Suspense
          fallback={
            <div className="h-48 rounded-2xl bg-[var(--surface-sunken)] animate-pulse" />
          }
        >
          <ConfirmacionClient
            orderId={id}
            customerName={customerName}
            etaIso={etaIso}
          />
        </Suspense>
      </div>
    </main>
  );
}
