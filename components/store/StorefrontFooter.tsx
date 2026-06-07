"use client";

/**
 * StorefrontFooter — pie de la TIENDA INDIVIDUAL. Minimalista y aislado:
 * nombre de la tienda + WhatsApp + medios de pago + legales. SIN links del
 * marketplace (Explorar, Recetas, Gift Cards, otras tiendas, etc).
 * Brandon 2026-06-07.
 */

import { useState, useEffect } from "react";
import { ShieldCheck, CreditCard, Wallet, Truck, BookText, MessageCircle } from "lucide-react";
import { useSettingsSafe } from "@/contexts/settings-context";
import { extractWaNumber } from "@/lib/wa-number";
import { LEGAL, LEGAL_COMPLETO } from "@/lib/legal";

export default function StorefrontFooter({ name }: { name: string }) {
  const [year, setYear] = useState(2026);
  useEffect(() => { setYear(new Date().getFullYear()); }, []);

  const settingsCtx = useSettingsSafe();
  const storeTheme = settingsCtx?.storeTheme;
  const storeName = storeTheme?.name || name;
  const wa = extractWaNumber(storeTheme?.whatsapp || "");

  return (
    <footer className="border-t border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
      <div className="mx-auto max-w-[1280px] px-4 sm:px-6 lg:px-8 py-8 pb-[calc(72px+env(safe-area-inset-bottom))] sm:pb-8">
        {/* Identidad + WhatsApp */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-base font-extrabold text-[var(--text-primary)]">{storeName}</p>
            <p className="mt-0.5 text-sm">Pedí online · delivery con Yape, Plin o efectivo.</p>
          </div>
          {wa && (
            <a
              href={`https://wa.me/${wa}?text=${encodeURIComponent(`Hola ${storeName}, quiero hacer un pedido`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-extrabold text-white transition-opacity hover:opacity-90 sm:w-auto"
            >
              <MessageCircle className="h-4.5 w-4.5" strokeWidth={2.25} aria-hidden />
              Pedir por WhatsApp
            </a>
          )}
        </div>

        {/* Medios de pago / confianza */}
        <div className="mt-6 flex flex-wrap items-center gap-1.5">
          {([
            { Icon: ShieldCheck, label: "Sitio seguro" },
            { Icon: CreditCard, label: "Yape · Plin" },
            { Icon: Wallet, label: "Efectivo" },
            { Icon: Truck, label: "Delivery" },
          ] as const).map(({ Icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)]"
            >
              <Icon className="h-3.5 w-3.5 text-[var(--accent)]" strokeWidth={2.5} aria-hidden />
              {label}
            </span>
          ))}
        </div>

        {/* Copyright + legales (sin links de marketplace) */}
        <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--rule-base)] pt-4 text-xs text-[var(--text-tertiary)]">
          <span className="font-bold text-[var(--text-secondary)] tabular-nums">© {year} {storeName}</span>
          <span aria-hidden>·</span>
          <a href="/privacidad" className="font-semibold hover:text-[var(--text-primary)] transition-colors">Privacidad</a>
          <span aria-hidden>·</span>
          <a href="/terminos" className="font-semibold hover:text-[var(--text-primary)] transition-colors">Términos</a>
          <span aria-hidden>·</span>
          <a href="/libro-de-reclamaciones" className="inline-flex items-center gap-1 font-semibold text-[var(--accent)] hover:opacity-80 transition-opacity">
            <BookText className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            Libro de Reclamaciones
          </a>
        </div>
        {LEGAL_COMPLETO && (
          <p className="mt-3 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            {LEGAL.razonSocial} · RUC {LEGAL.ruc} · {LEGAL.domicilioFiscal}
          </p>
        )}
      </div>
    </footer>
  );
}
