"use client";

import { useState, useEffect } from "react";
import { Shield, X } from "lucide-react";

const CONSENT_KEY = "bsm-cookie-consent";

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
    <div className="fixed bottom-0 left-0 right-0 z-60 p-4 sm:p-6 animate-[fadeUp_0.4s_ease-out]">
      <div className="mx-auto max-w-2xl bg-white dark:bg-card rounded-2xl shadow-2xl border border-gray-200 dark:border-card-border p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="shrink-0 flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 text-primary">
            <Shield className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-foreground text-sm mb-1">🍪 Usamos cookies</h3>
            <p className="text-xs text-muted leading-relaxed">
              Utilizamos cookies y almacenamiento local para mejorar tu experiencia de compra, 
              recordar tu carrito y preferencias. No compartimos tu información con terceros.
            </p>
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={accept}
                className="px-5 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark active:scale-95 transition-all shadow-md"
              >
                Aceptar
              </button>
              <button
                onClick={decline}
                className="px-5 py-2 rounded-xl bg-gray-100 dark:bg-surface text-foreground text-sm font-semibold hover:bg-gray-200 dark:hover:bg-card active:scale-95 transition-all"
              >
                Solo necesarias
              </button>
            </div>
          </div>
          <button onClick={decline} className="shrink-0 p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-surface transition-colors" aria-label="Cerrar">
            <X className="h-4 w-4 text-muted" />
          </button>
        </div>
      </div>
    </div>
  );
}
