"use client";

/**
 * CookieConsentBanner — Banner de consentimiento de cookies (Ley 29733 PE).
 *
 * Brandon 2026-05-18 (audit Sprint 3 + ADR-115):
 * Cumple Art. 16-18 — consentimiento verificable + opción de rechazo
 * + categorías granulares.
 *
 * Storage transitorio: localStorage `buleje-cookie-consent` (JSON con
 * grants + policyVersion + grantedAt). Cuando Sprint 4 aplique la
 * migration Prisma, se migrará a `/api/consent` (DB persistido).
 *
 * Categorías:
 *   - necessary (siempre on, no opcional)
 *   - analytics (PostHog, GA — opt-in)
 *   - marketing (FB/IG ads pixels — opt-in)
 *
 * UX: bottom-sheet en mobile, bottom-right card en desktop.
 * NO bloquea contenido (lex 29733 permite navegar sin consent, solo
 * exige tracking opt-in para no-essencial).
 */

import { useEffect, useState } from "react";
import { Cookie, X, ShieldCheck, Settings as SettingsIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "buleje-cookie-consent";
const POLICY_VERSION = "v1.0.0";

interface ConsentState {
  policyVersion: string;
  grantedAt: string;
  necessary: true;
  analytics: boolean;
  marketing: boolean;
}

function readConsent(): ConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentState;
    // Si la versión cambió, re-pedimos consent
    if (parsed.policyVersion !== POLICY_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeConsent(state: ConsentState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    // TODO Sprint 4: POST /api/consent para persistir en DB con visitorId.
    window.dispatchEvent(new CustomEvent("buleje:consent-updated", { detail: state }));
  } catch {
    /* silent fail — localStorage lleno o modo privado */
  }
}

export default function CookieConsentBanner() {
  const [visible, setVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const existing = readConsent();
    if (!existing) setVisible(true);
  }, []);

  if (!visible) return null;

  const acceptAll = () => {
    writeConsent({
      policyVersion: POLICY_VERSION,
      grantedAt: new Date().toISOString(),
      necessary: true,
      analytics: true,
      marketing: true,
    });
    setVisible(false);
  };

  const rejectAll = () => {
    writeConsent({
      policyVersion: POLICY_VERSION,
      grantedAt: new Date().toISOString(),
      necessary: true,
      analytics: false,
      marketing: false,
    });
    setVisible(false);
  };

  const saveCustom = () => {
    writeConsent({
      policyVersion: POLICY_VERSION,
      grantedAt: new Date().toISOString(),
      necessary: true,
      analytics,
      marketing,
    });
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-consent-title"
      aria-modal="false"
      className={cn(
        "fixed z-[80]",
        // Mobile: bottom-sheet full-width
        "inset-x-3 bottom-3 sm:inset-x-auto sm:right-6 sm:left-auto sm:bottom-6 sm:max-w-md",
        "rounded-3xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] shadow-2xl",
        "animate-in slide-in-from-bottom-4 duration-300",
      )}
    >
      <div className="p-5">
        <div className="flex items-start gap-3 mb-3">
          <span aria-hidden className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)] shrink-0">
            <Cookie className="h-5 w-5" strokeWidth={2.25} />
          </span>
          <div className="flex-1 min-w-0">
            <p id="cookie-consent-title" className="text-base font-black tracking-tight text-[var(--text-primary)]">
              Usamos cookies
            </p>
            <p className="mt-0.5 text-[length:var(--ts-xs)] text-[var(--text-secondary)] leading-snug">
              Para que la app funcione + analizar uso. Podés elegir qué aceptás.{" "}
              <a href="/privacidad" className="font-bold text-[var(--accent)] underline">
                Política de privacidad
              </a>
            </p>
          </div>
          <button
            type="button"
            onClick={rejectAll}
            aria-label="Rechazar y cerrar"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] active:scale-95 transition-all shrink-0"
          >
            <X className="h-4 w-4" strokeWidth={2.25} />
          </button>
        </div>

        {showSettings && (
          <div className="space-y-2 mb-4 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)]/40 p-3">
            <ConsentToggle
              label="Necesarias"
              description="Sesión, carrito, login. Siempre activas."
              checked={true}
              disabled
            />
            <ConsentToggle
              label="Análisis"
              description="Vemos qué páginas funcionan mejor para mejorarlas."
              checked={analytics}
              onChange={setAnalytics}
            />
            <ConsentToggle
              label="Publicidad"
              description="Ofertas relevantes basadas en tu interés."
              checked={marketing}
              onChange={setMarketing}
            />
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          {showSettings ? (
            <button
              type="button"
              onClick={saveCustom}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] h-11 text-sm font-extrabold text-white hover:bg-[var(--accent)]/90 active:scale-95 transition-all shadow-sm"
            >
              <ShieldCheck className="h-4 w-4" strokeWidth={2.5} />
              Guardar preferencias
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={acceptAll}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--accent)] h-11 text-sm font-extrabold text-white hover:bg-[var(--accent)]/90 active:scale-95 transition-all shadow-sm"
              >
                Aceptar todo
              </button>
              <button
                type="button"
                onClick={() => setShowSettings(true)}
                className="inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-canvas)] h-11 px-4 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] active:scale-95 transition-all"
              >
                <SettingsIcon className="h-4 w-4" strokeWidth={2.25} />
                Personalizar
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ConsentToggle({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-start gap-3 cursor-pointer select-none rounded-xl p-2 hover:bg-[var(--surface-canvas)]/60",
        disabled && "cursor-default opacity-90",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="sr-only peer"
      />
      <span
        aria-hidden
        className={cn(
          "shrink-0 mt-0.5 inline-flex items-center w-9 h-5 rounded-full transition-colors",
          checked ? "bg-[var(--accent)]" : "bg-[var(--rule-base)]",
        )}
      >
        <span
          className={cn(
            "h-4 w-4 rounded-full bg-white shadow transform transition-transform",
            checked ? "translate-x-4.5" : "translate-x-0.5",
          )}
        />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[length:var(--ts-sm)] font-extrabold text-[var(--text-primary)] leading-tight">
          {label}
        </span>
        <span className="block text-[length:var(--ts-2xs)] text-[var(--text-secondary)] leading-tight mt-0.5">
          {description}
        </span>
      </span>
    </label>
  );
}
