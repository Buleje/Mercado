"use client";

import { useState } from "react";
import { ArrowLeft, Lock, CreditCard, ShieldCheck } from "lucide-react";
import type { GiftCardDesign } from "@/lib/mocks/gift-cards.mock";
import GiftCardPreview from "./GiftCardPreview";

type Props = {
  amount: number;
  design: GiftCardDesign;
  message: string;
  recipientName: string;
  recipientContact: string;
  contactMethod: "whatsapp" | "email";
  senderName: string;
  onBack: () => void;
  onSubmit: () => Promise<void>;
};

export default function StepPreviewPago({
  amount,
  design,
  message,
  recipientName,
  recipientContact,
  contactMethod,
  senderName,
  onBack,
  onSubmit,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Total simple — no fees en mock
  const total = amount;

  async function handlePay() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await onSubmit();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al procesar la compra");
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_minmax(0,360px)]">
      <section className="space-y-6">
        <header>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Revisa y paga
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Asi se vera la tarjeta que recibira {recipientName || "tu destinatario"}.
          </p>
        </header>

        <GiftCardPreview
          amount={amount}
          design={design}
          message={message}
          recipientName={recipientName}
          senderName={senderName}
          className="mx-auto max-w-md"
        />

        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Detalles del envio
          </h3>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label="Destinatario" value={recipientName || "—"} />
            <Row
              label={contactMethod === "whatsapp" ? "WhatsApp" : "Email"}
              value={recipientContact || "—"}
            />
            <Row
              label="De parte de"
              value={senderName || "—"}
            />
          </dl>
        </div>
      </section>

      <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Resumen
          </h3>
          <dl className="mt-4 space-y-2 text-sm">
            <Row label="Tarjeta de Regalo" value={`S/ ${amount.toFixed(2)}`} />
            <Row label="Envio digital" value="Gratis" />
          </dl>
          <div className="mt-4 flex items-baseline justify-between border-t border-gray-100 pt-4 dark:border-gray-800">
            <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">
              Total
            </span>
            <span className="text-2xl font-bold text-gray-900 dark:text-white">
              S/ {total.toFixed(2)}
            </span>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
            >
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={handlePay}
            disabled={submitting}
            className="mt-5 inline-flex w-full min-h-[48px] items-center justify-center gap-2 rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-400 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 dark:disabled:bg-gray-700"
          >
            <CreditCard className="h-4 w-4" aria-hidden="true" />
            {submitting ? "Procesando..." : "Pagar y enviar"}
          </button>

          <button
            type="button"
            onClick={onBack}
            disabled={submitting}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 py-2 text-xs font-semibold text-gray-600 transition-colors hover:text-gray-900 disabled:opacity-40 dark:text-gray-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Volver
          </button>
        </div>

        <ul className="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
          <li className="flex items-center gap-1.5">
            <Lock className="h-3 w-3" aria-hidden="true" />
            Pago seguro y encriptado
          </li>
          <li className="flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            Sin vencimiento ni cargos ocultos
          </li>
        </ul>
      </aside>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className="truncate text-right font-medium text-gray-900 dark:text-white">
        {value}
      </dd>
    </div>
  );
}
