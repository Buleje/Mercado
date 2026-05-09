"use client";

import { MessageCircle, Mail, ArrowLeft } from "@buleje/design-system/icons";

type Props = {
  recipientName: string;
  recipientContact: string;
  contactMethod: "whatsapp" | "email";
  onChange: (next: {
    recipientName: string;
    recipientContact: string;
    contactMethod: "whatsapp" | "email";
  }) => void;
  onNext: () => void;
  onBack: () => void;
};

export default function StepDestinatario({
  recipientName,
  recipientContact,
  contactMethod,
  onChange,
  onNext,
  onBack,
}: Props) {
  const canContinue =
    recipientName.trim().length > 0 && recipientContact.trim().length > 2;

  const contactPlaceholder =
    contactMethod === "whatsapp" ? "+51 987 654 321" : "destinatario@correo.com";

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <header>
        <h2 className="text-xl font-bold text-[var(--text-primary)] dark:text-white">
          Para quien es la tarjeta?
        </h2>
        <p className="mt-1 text-sm text-[var(--text-secondary)] dark:text-gray-400">
          Le enviamos el codigo y la dedicatoria por el medio que elijas.
        </p>
      </header>

      <div className="space-y-5">
        <Field label="Nombre del destinatario" htmlFor="recipient-name" hint="Como aparecera en la tarjeta">
          <input
            id="recipient-name"
            type="text"
            maxLength={80}
            value={recipientName}
            onChange={(e) =>
              onChange({ recipientName: e.target.value, recipientContact, contactMethod })
            }
            placeholder="Ej: Ana Torres"
            className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-gray-900 focus:ring-1 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-[var(--text-secondary)] dark:focus:border-white dark:focus:ring-white"
          />
        </Field>

        <fieldset>
          <legend className="block text-sm font-semibold text-[var(--text-primary)] dark:text-white">
            Como la enviamos?
          </legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {[
              { id: "whatsapp" as const, label: "WhatsApp", icon: MessageCircle, hint: "Le llega al celular" },
              { id: "email" as const, label: "Email", icon: Mail, hint: "Correo electrónico" },
            ].map((opt) => {
              const isActive = contactMethod === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() =>
                    onChange({
                      recipientName,
                      recipientContact,
                      contactMethod: opt.id,
                    })
                  }
                  aria-pressed={isActive}
                  className={[
                    "flex items-start gap-3 rounded-xl border p-4 text-left transition-colors",
                    isActive
                      ? "border-gray-900 bg-[var(--surface-alt)] dark:border-white dark:bg-gray-800"
                      : "border-gray-200 bg-white hover:border-gray-400 dark:border-gray-800 dark:bg-gray-900 dark:hover:border-gray-600",
                  ].join(" ")}
                >
                  <opt.icon
                    className="mt-0.5 h-4 w-4 text-[var(--text-secondary)] dark:text-gray-400"
                    aria-hidden="true"
                  />
                  <div>
                    <div className="text-sm font-semibold text-[var(--text-primary)] dark:text-white">
                      {opt.label}
                    </div>
                    <div className="text-xs text-[var(--text-secondary)] dark:text-gray-400">{opt.hint}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </fieldset>

        <Field
          label={contactMethod === "whatsapp" ? "Número de celular" : "Email del destinatario"}
          htmlFor="recipient-contact"
        >
          <input
            id="recipient-contact"
            type={contactMethod === "email" ? "email" : "tel"}
            maxLength={120}
            value={recipientContact}
            onChange={(e) =>
              onChange({ recipientName, recipientContact: e.target.value, contactMethod })
            }
            placeholder={contactPlaceholder}
            inputMode={contactMethod === "whatsapp" ? "tel" : "email"}
            className="block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)] focus:border-gray-900 focus:ring-1 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:placeholder:text-[var(--text-secondary)] dark:focus:border-white dark:focus:ring-white"
          />
        </Field>
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:text-gray-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Volver
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canContinue}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-[var(--rule-base)] dark:bg-white dark:text-gray-900 dark:hover:bg-[var(--surface-sunken)] dark:disabled:bg-gray-700"
        >
          Continuar
        </button>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-semibold text-[var(--text-primary)] dark:text-white"
      >
        {label}
      </label>
      {hint && (
        <p className="mt-0.5 text-xs text-[var(--text-secondary)] dark:text-gray-400">{hint}</p>
      )}
      <div className="mt-2">{children}</div>
    </div>
  );
}
