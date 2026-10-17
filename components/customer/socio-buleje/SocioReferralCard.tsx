"use client";

/**
 * SocioReferralCard — "Invitá vecinos y ganá cashback".
 *
 * Muestra el link de referido del socio (con ?ref=<code>) + botones para
 * compartir por WhatsApp y copiar. Cuando un invitado se hace Socio, el referrer
 * gana S/{REFERRAL_REWARD_SOLES} de cashback (acreditado en el subscribe).
 */

import { useMemo, useState } from "react";
import { Gift, Copy, Check, MessageCircle } from "@buleje/design-system/icons";
import { SOCIO_CURRENT_USER_ID } from "@/contexts/socio-buleje-context";
import { encodeReferralCode, REFERRAL_REWARD_SOLES } from "@/lib/socio/referral";

export function SocioReferralCard() {
  const [copied, setCopied] = useState(false);

  const link = useMemo(() => {
    const code = encodeReferralCode(SOCIO_CURRENT_USER_ID);
    const origin =
      typeof window !== "undefined" ? window.location.origin : "https://www.buleje.pe";
    return `${origin}/socio-buleje?ref=${code}`;
  }, []);

  const waHref = `https://wa.me/?text=${encodeURIComponent(
    `¡Hazte Socio Buleje y ahorrá en tu bodega! 🛒 Delivery gratis + 5% cashback. Entrá con mi link: ${link}`,
  )}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard bloqueado — el usuario puede copiar manualmente el link visible */
    }
  };

  return (
    <section
      aria-labelledby="referral-heading"
      className="overflow-hidden rounded-2xl border border-[var(--accent)]/20 bg-[var(--surface-raised)]"
    >
      <div className="flex items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--accent)]/8 px-5 py-4">
        <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)] text-white">
          <Gift className="h-5 w-5" strokeWidth={2} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="referral-heading" className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
            Invitá vecinos y ganá S/ {REFERRAL_REWARD_SOLES}
          </h2>
          <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
            Por cada vecino que se haga Socio con tu link, sumás S/ {REFERRAL_REWARD_SOLES} de cashback.
          </p>
        </div>
      </div>

      <div className="p-5">
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Tu link de invitación
        </span>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            readOnly
            value={link}
            onFocus={(e) => e.currentTarget.select()}
            aria-label="Tu link de invitación"
            className="min-w-0 flex-1 truncate rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3.5 py-2.5 text-sm text-[var(--text-secondary)] focus:border-[var(--accent)] focus:outline-none"
          />
          <button
            type="button"
            onClick={copy}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[var(--rule-base)] px-4 py-2.5 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-[var(--data-success-500)]" strokeWidth={2.5} aria-hidden />
                Copiado
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                Copiar
              </>
            )}
          </button>
        </div>

        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-whatsapp)] px-5 py-2.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5 sm:w-auto"
        >
          <MessageCircle className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          Compartir por WhatsApp
        </a>
      </div>
    </section>
  );
}
