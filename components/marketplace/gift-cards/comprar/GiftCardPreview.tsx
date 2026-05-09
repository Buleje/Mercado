"use client";

import type { GiftCardDesign } from "@/lib/mocks/gift-cards.mock";
import GiftCardArtwork from "../shared/GiftCardArtwork";

type Props = {
  amount: number;
  design: GiftCardDesign;
  message: string;
  recipientName: string;
  senderName: string;
  className?: string;
};

/**
 * GiftCardPreview — tarjeta visual preview 3D-subtle.
 * Muestra monto grande, disenio, dedicatoria y firma del remitente.
 */
export default function GiftCardPreview({
  amount,
  design,
  message,
  recipientName,
  senderName,
  className,
}: Props) {
  const formattedAmount = new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 0,
  }).format(amount);

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-2xl bg-white shadow-md ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-gray-800">
        <div className="relative aspect-[16/10]">
          <GiftCardArtwork design={design} className="absolute inset-0 h-full w-full" />
          <div className="absolute inset-0 flex flex-col justify-between p-5">
            <header className="flex items-start justify-between">
              <span className="rounded-full bg-white/80 px-2.5 py-1 text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wider text-[var(--text-primary)] backdrop-blur-sm">
                Buleje
              </span>
              <span className="text-right text-2xl font-bold text-[var(--text-primary)]">
                {formattedAmount}
              </span>
            </header>
            <footer className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-[var(--ls-wider)] text-[var(--text-primary)]">
              Tarjeta de regalo
            </footer>
          </div>
        </div>

        <div className="space-y-4 border-t border-gray-100 p-5 dark:border-gray-800">
          <div>
            <div className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] dark:text-gray-500">
              Para
            </div>
            <div className="mt-0.5 text-sm font-semibold text-[var(--text-primary)] dark:text-white">
              {recipientName || "El destinatario"}
            </div>
          </div>

          <div>
            <div className="text-[length:var(--ts-2xs)] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] dark:text-gray-500">
              Mensaje
            </div>
            <div className="mt-0.5 min-h-[3rem] whitespace-pre-line text-sm italic text-[var(--text-primary)] dark:text-gray-300">
              {message.trim() || "Tu mensaje aparecera aqui..."}
            </div>
          </div>

          <div className="flex items-center justify-between border-t border-gray-100 pt-4 text-xs dark:border-gray-800">
            <span className="text-[var(--text-secondary)] dark:text-gray-400">De</span>
            <span className="font-semibold text-[var(--text-primary)] dark:text-white">
              {senderName || "Tu nombre"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
