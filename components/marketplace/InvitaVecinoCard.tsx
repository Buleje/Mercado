"use client";

/**
 * InvitaVecinoCard — referido por WhatsApp para /tiendas (Brandon 2026-06-02).
 *
 * Crecimiento viral barato en el canal #1 del vecino (WhatsApp). Reusa la infra
 * de referidos existente:
 *   - GET /api/marketplace/referral?phone=  → { code, referredCount, shareUrl }
 *     (auth por customer-session; el código es el real de la DB, no uno falso).
 *   - El shareUrl (`/marketplace?ref=CODE`) ya lo captura el flujo de referidos
 *     → al primer pedido del invitado, ambos ganan 50 puntos de lealtad.
 *
 * Logueado  → link personal + "ambos ganan 50 puntos".
 * Anónimo   → comparte un link genérico de Buleje (igual trae tráfico) +
 *             invita a iniciar sesión para ganar puntos.
 *
 * Reemplaza al viejo `components/ReferralBanner.tsx` (encoding roto + generaba
 * el código client-side sin tocar la DB + share genérico, no WhatsApp).
 */

import { useState, useEffect, useCallback } from "react";
import { useCustomer } from "@/contexts/customer-context";
import { Gift, Copy, Check, Users } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

const REWARD_POINTS = 50;
const BASE = process.env.NEXT_PUBLIC_BASE_URL || "https://buleje.pe";

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.477-.911zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01a1.1 1.1 0 00-.792.372c-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413z" />
    </svg>
  );
}

export default function InvitaVecinoCard() {
  const { customer } = useCustomer();
  const phone = customer?.phone;
  const [code, setCode] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [shareUrl, setShareUrl] = useState<string>(`${BASE}/tiendas`);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!phone) {
      setCode(null);
      setShareUrl(`${BASE}/tiendas`);
      return;
    }
    let cancelled = false;
    fetch(`/api/marketplace/referral?phone=${encodeURIComponent(phone)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancelled || !j?.code) return;
        setCode(j.code as string);
        setCount(typeof j.referredCount === "number" ? j.referredCount : 0);
        if (typeof j.shareUrl === "string") setShareUrl(j.shareUrl);
      })
      .catch(() => {
        /* fire-and-forget: si falla, queda el share genérico */
      });
    return () => {
      cancelled = true;
    };
  }, [phone]);

  const message = code
    ? `¡Pedí en Buleje, el delivery de tu barrio en Ciudad Constitución! 🛒 Usá mi link y los dos ganamos ${REWARD_POINTS} puntos: ${shareUrl}`
    : `¡Pedí en Buleje, el delivery de tu barrio en Ciudad Constitución! 🛒 Mirá las tiendas con delivery: ${shareUrl}`;

  const waUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;

  const copy = useCallback(() => {
    navigator.clipboard
      .writeText(message)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      })
      .catch(() => setCopied(false));
  }, [message]);

  return (
    <section className="max-w-[1760px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
      <div className="relative overflow-hidden rounded-3xl bg-linear-to-br from-[var(--accent-600,var(--accent))] to-[var(--accent)] text-white shadow-[var(--shadow-lg)]">
        {/* Decoración */}
        <div aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full bg-white/12 blur-2xl" />
        <div
          aria-hidden
          className="pointer-events-none absolute right-10 top-6 hidden h-20 w-20 opacity-30 sm:block"
          style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.7) 1.5px, transparent 1.5px)", backgroundSize: "10px 10px" }}
        />

        <div className="relative flex flex-col gap-5 p-6 sm:p-8 lg:flex-row lg:items-center lg:gap-8">
          <div className="min-w-0 flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[length:var(--ts-2xs)] font-black uppercase tracking-wider backdrop-blur">
              <Gift className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
              Invitá vecinos
            </span>
            <h2 className="mt-3 text-2xl font-extrabold leading-tight tracking-tight sm:text-3xl">
              {code ? "Invitá a un vecino y ganen los dos" : "Invitá a un vecino a Buleje"}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-snug text-white/85 sm:text-base">
              {code ? (
                <>
                  Por cada vecino que haga su <strong className="text-white">primer pedido</strong>, ambos ganan{" "}
                  <strong className="text-white">{REWARD_POINTS} puntos</strong> de lealtad. Mandá tu link por WhatsApp.
                </>
              ) : (
                <>
                  Compartí Buleje con tus vecinos por WhatsApp.{" "}
                  <span className="text-white">Iniciá sesión</span> para ganar puntos por cada uno que pida.
                </>
              )}
            </p>
            {code && count > 0 && (
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-white/90">
                <Users className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                Ya invitaste a {count} {count === 1 ? "vecino" : "vecinos"}
              </p>
            )}
          </div>

          <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:w-[240px] lg:flex-col">
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center justify-center gap-2.5 rounded-2xl bg-white px-5 text-sm font-extrabold text-[#128C7E] shadow-md transition-all hover:-translate-y-0.5 hover:shadow-lg active:scale-95"
            >
              <WhatsAppIcon className="h-5 w-5" />
              Invitar por WhatsApp
            </a>
            <button
              type="button"
              onClick={copy}
              className={cn(
                "inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/15 px-5 text-sm font-bold text-white backdrop-blur transition-colors hover:bg-white/25",
              )}
            >
              {copied ? <Check className="h-4 w-4" strokeWidth={2.5} /> : <Copy className="h-4 w-4" strokeWidth={2.25} />}
              {copied ? "¡Copiado!" : "Copiar link"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
