"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, ArrowRight, Gift, Copy, Check, ShieldAlert } from "lucide-react";

export default function ConfirmacionClient() {
  const search = useSearchParams();
  const amount = Number(search.get("amount") ?? 0);
  const recipient = search.get("recipient") ?? "tu destinatario";
  const plainCode = search.get("code") ?? "";

  const [copied, setCopied] = useState(false);

  // ADR-077: el plainCode solo deberia estar en la URL durante esta pantalla
  // de confirmacion. Lo limpiamos del query para que un refresh de la pagina
  // NO vuelva a exponerlo y tampoco quede en history/navegador.
  useEffect(() => {
    if (plainCode) {
      const url = new URL(window.location.href);
      url.searchParams.delete("code");
      window.history.replaceState({}, "", url.toString());
    }
  }, [plainCode]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(plainCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      /* noop */
    }
  }

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

        {/* ADR-077: Codigo plano — solo se muestra UNA vez aqui. */}
        {plainCode && (
          <div className="mx-auto mt-8 max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left dark:border-amber-900 dark:bg-amber-900/10">
            <div className="flex items-start gap-3">
              <ShieldAlert
                className="mt-0.5 h-5 w-5 flex-none text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              />
              <div className="flex-1">
                <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                  Guarda este codigo — solo se muestra una vez
                </p>
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">
                  Si lo perdes, no lo podemos recuperar. Tendras que cancelar la
                  tarjeta y emitir una nueva desde el admin.
                </p>
                <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 dark:bg-gray-900">
                  <code className="font-mono text-sm font-bold tracking-wider text-gray-900 dark:text-white">
                    {plainCode}
                  </code>
                  <button
                    type="button"
                    onClick={copyCode}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        Copiado
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        Copiar
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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
