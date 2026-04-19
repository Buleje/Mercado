"use client";

import { useState, useEffect } from "react";
import { Shield, X } from "@buleje/design-system/icons";

const CONSENT_KEY = "buleje-cookie-consent";

export default function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(CONSENT_KEY);
    if (!consent) {
      const t = setTimeout(() => setShow(true), 2000);
      return () => clearTimeout(t);
    }
  }, []);

  const accept = () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    setShow(false);
  };

  const decline = () => {
    localStorage.setItem(CONSENT_KEY, "declined");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cookie-consent-title"
      className="fixed bottom-0 left-0 right-0 z-60 p-4 sm:p-6 animate-[fadeUp_0.4s_ease-out]"
    >
      <div className="mx-auto max-w-2xl bg-[var(--surface-canvas)] rounded-lg shadow-[var(--shadow-md)] border border-[var(--rule-base)] p-4">
        <div className="flex items-start gap-3">
          <div className="shrink-0 flex items-center justify-center h-9 w-9 rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
            <Shield className="h-4 w-4" strokeWidth={1.75} />
          </div>
          <div className="flex-1">
            <h3 id="cookie-consent-title" className="text-sm font-semibold text-[var(--text-primary)] mb-1">Usamos cookies</h3>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
              Utilizamos cookies y almacenamiento local para mejorar tu experiencia de compra,
              recordar tu carrito y preferencias. No compartimos tu información con terceros.
            </p>
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={accept}
                className="px-4 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-600,var(--accent))] transition-colors"
              >
                Aceptar
              </button>
              <button
                onClick={decline}
                className="px-4 py-1.5 rounded-lg border border-[var(--rule-base)] bg-transparent text-[var(--text-primary)] text-xs font-semibold hover:bg-[var(--surface-sunken)] transition-colors"
              >
                Solo necesarias
              </button>
            </div>
          </div>
          <button onClick={decline} className="shrink-0 p-1.5 rounded-md hover:bg-[var(--surface-sunken)] transition-colors" aria-label="Cerrar">
            <X className="h-4 w-4 text-[var(--text-secondary)]" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
}
