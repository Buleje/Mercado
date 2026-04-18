"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, ArrowRight, Gift } from "lucide-react";

export default function ConfirmacionClient() {
  const search = useSearchParams();
  const amount = Number(search.get("amount") ?? 0);
  const recipient = search.get("recipient") ?? "tu destinatario";

  return (
    <main className="min-h-screen bg-white dark:bg-gray-900">
      <div className="mx-auto max-w-2xl px-4 py-16 text-center sm:py-24">
        <span className="inline-flex h-16 w-16 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-400">
          <CheckCircle2 className="h-8 w-8" aria-hidden="true" />
        </span>
        <h1 className="mt-6 text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">
          Tarjeta enviada
        </h1>
        <p className="mt-3 text-base text-gray-600 dark:text-gray-300">
          Tu tarjeta de{" "}
          <span className="font-semibold text-gray-900 dark:text-white">
            S/ {amount.toFixed(2)}
          </span>{" "}
          ya esta camino a{" "}
          <span className="font-semibold text-gray-900 dark:text-white">
            {recipient}
          </span>
          . Recibiras un email con el comprobante en unos segundos.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/cuenta/gift-cards"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
          >
            <Gift className="h-4 w-4" aria-hidden="true" />
            Ver mis tarjetas
          </Link>
          <Link
            href="/marketplace/gift-cards"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Enviar otra tarjeta
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>

        <p className="mt-10 text-xs text-gray-500 dark:text-gray-400">
          Si {recipient} no recibe la tarjeta, revisa el spam del email o el
          historial de WhatsApp. Podes reenviarla desde{" "}
          <Link
            href="/cuenta/gift-cards"
            className="font-semibold underline-offset-2 hover:underline"
          >
            Mis tarjetas
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
