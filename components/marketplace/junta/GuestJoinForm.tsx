"use client";

/**
 * GuestJoinForm — campo inline para que un vecino SIN cuenta se sume a la junta
 * con solo su WhatsApp. Se revela cuando el server pide el número (la junta es
 * de barrio: sumarse no debe exigir registro). El número se valida en el server.
 */

import { useId } from "react";
import { MessageCircle } from "@buleje/design-system/icons";

interface Props {
  phone: string;
  onPhoneChange: (value: string) => void;
  onSubmit: () => void;
  joining: boolean;
}

export function GuestJoinForm({
  phone,
  onPhoneChange,
  onSubmit,
  joining,
}: Props) {
  const id = useId();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-2 border-2 border-[var(--accent)] bg-[var(--accent-soft)] p-4"
    >
      <label
        htmlFor={id}
        className="block text-sm font-bold text-[var(--text-primary)]"
      >
        Tu WhatsApp para sumarte
      </label>
      <p className="text-sm text-[var(--text-secondary)]">
        Sin crear cuenta. Te avisamos por aquí cuando la junta se complete.
      </p>
      <div className="flex gap-2">
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          value={phone}
          onChange={(e) => onPhoneChange(e.target.value)}
          placeholder="9XX XXX XXX"
          className="h-12 min-w-0 flex-1 border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-base font-semibold text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none"
        />
        <button
          type="submit"
          disabled={joining}
          className="inline-flex shrink-0 items-center gap-1.5 bg-[var(--accent)] px-5 text-base font-bold text-white transition hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
        >
          <MessageCircle className="h-4 w-4" strokeWidth={2} aria-hidden />
          {joining ? "Sumando…" : "Sumarme"}
        </button>
      </div>
    </form>
  );
}
