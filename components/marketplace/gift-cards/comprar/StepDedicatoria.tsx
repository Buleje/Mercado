"use client";

import { ArrowLeft, Sparkles } from "lucide-react";

type Props = {
  message: string;
  senderName: string;
  onChange: (next: { message: string; senderName: string }) => void;
  onNext: () => void;
  onBack: () => void;
};

const SUGGESTIONS = [
  "Feliz cumple! Que la pases genial.",
  "Gracias por todo lo que haces por nosotros.",
  "Por todos los anios que vienen juntos.",
  "Te mereces lo mejor, disfrutalo.",
  "Bienvenida al barrio, vecina!",
];

export default function StepDedicatoria({
  message,
  senderName,
  onChange,
  onNext,
  onBack,
}: Props) {
  const maxLen = 200;
  const remaining = maxLen - message.length;
  const canContinue = senderName.trim().length > 0;

  function useSuggestion(s: string) {
    onChange({ message: s, senderName });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Escribi una dedicatoria
        </h2>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          El mensaje aparece en la tarjeta cuando el destinatario la abre.
        </p>
      </header>

      <div className="space-y-5">
        <div>
          <label
            htmlFor="message"
            className="flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-white"
          >
            <span>Mensaje (opcional)</span>
            <span
              className={[
                "text-xs font-normal",
                remaining < 20 ? "text-amber-600" : "text-gray-500 dark:text-gray-400",
              ].join(" ")}
            >
              {remaining} caracteres
            </span>
          </label>
          <textarea
            id="message"
            rows={5}
            maxLength={maxLen}
            value={message}
            onChange={(e) => onChange({ message: e.target.value, senderName })}
            placeholder="Escribi algo especial..."
            className="mt-2 block w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-600 dark:focus:border-white dark:focus:ring-white"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="flex items-center gap-1 text-xs font-semibold text-gray-500 dark:text-gray-400">
              <Sparkles className="h-3 w-3" aria-hidden="true" /> Sugerencias:
            </span>
            {SUGGESTIONS.map((s, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => useSuggestion(s)}
                className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:border-gray-500 dark:hover:bg-gray-800"
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label
            htmlFor="sender"
            className="block text-sm font-semibold text-gray-900 dark:text-white"
          >
            De parte de
          </label>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Como firmas la tarjeta.
          </p>
          <input
            id="sender"
            type="text"
            maxLength={80}
            value={senderName}
            onChange={(e) => onChange({ message, senderName: e.target.value })}
            placeholder="Tu nombre"
            className="mt-2 block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-gray-900 focus:ring-1 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-gray-600 dark:focus:border-white dark:focus:ring-white"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canContinue}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100 dark:disabled:bg-gray-700"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}
