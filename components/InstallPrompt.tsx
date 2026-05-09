"use client";

import { useEffect, useState } from "react";
import { X, Download, Smartphone, Copy, Check, Gift } from "@buleje/design-system/icons";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const INSTALL_COUPON = "INSTALA10";

const LS = {
  firstPurchase: "buleje-first-purchase", // "1" despues de completar la primera orden
  shown: "buleje-install-shown", // "1" cuando ya se mostro — nunca se vuelve a mostrar
  dismissed: "buleje-install-dismissed", // legacy, aun respetado
};

/**
 * InstallPrompt — se muestra UNA sola vez, solo despues de la primera compra
 * del cliente. Ofrece cupon `INSTALA10` como incentivo al instalar la PWA.
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Nunca en admin/superadmin
    if (window.location.pathname.startsWith("/admin") || window.location.pathname.startsWith("/superadmin")) {
      return;
    }

    // Ya se mostro antes — no volver a mostrar
    if (localStorage.getItem(LS.shown) === "1") return;
    if (localStorage.getItem(LS.dismissed) === "1") return;

    // Ya instalada
    if (window.matchMedia("(display-mode: standalone)").matches) return;

    // Solo si el cliente ya completo su primera compra
    const hasFirstPurchase = localStorage.getItem(LS.firstPurchase) === "1";

    const tryShow = () => {
      const ready = localStorage.getItem(LS.firstPurchase) === "1";
      if (ready && deferredPromptRef) setShowPrompt(true);
    };

    let deferredPromptRef: BeforeInstallPromptEvent | null = null;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPromptRef = e as BeforeInstallPromptEvent;
      setDeferredPrompt(deferredPromptRef);
      if (hasFirstPurchase) setShowPrompt(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // Poll ligero: si el usuario termina una compra en otra pestana, detectar el flag
    const pollId = setInterval(() => {
      tryShow();
    }, 3000);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      clearInterval(pollId);
    };
  }, []);

  const markShown = () => {
    localStorage.setItem(LS.shown, "1");
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === "accepted") {
      setInstalled(true);
      markShown();
    } else {
      setShowPrompt(false);
      markShown();
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    markShown();
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_COUPON);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  if (!showPrompt) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="install-prompt-title"
      className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:max-w-sm z-50 animate-slide-up"
    >
      <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-gray-950 shadow-[var(--shadow-xl)] border border-gray-200 dark:border-gray-800">
        {/* Close */}
        <button
          onClick={installed ? handleDismiss : handleDismiss}
          className="absolute right-3 top-3 p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors z-10"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>

        {!installed ? (
          <div className="p-5">
            {/* Header: icon + title */}
            <div className="flex items-start gap-3 pr-6">
              <div className="h-11 w-11 shrink-0 rounded-xl bg-gray-900 dark:bg-white flex items-center justify-center">
                <Smartphone className="h-5 w-5 text-white dark:text-gray-900" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-0">
                <h3
                  id="install-prompt-title"
                  className="text-base font-bold text-gray-900 dark:text-white leading-tight"
                >
                  Instala Buleje
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  App en tu pantalla, pedidos en 2 toques
                </p>
              </div>
            </div>

            {/* Reward block */}
            <div className="mt-4 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 p-3 flex items-center gap-3">
              <Gift className="h-5 w-5 text-gray-900 dark:text-white shrink-0" strokeWidth={1.75} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Regalo por instalar
                </p>
                <p className="text-sm font-bold text-gray-900 dark:text-white mt-0.5">
                  10% de descuento en tu proxima compra
                </p>
              </div>
            </div>

            {/* Action */}
            {deferredPrompt ? (
              <button
                onClick={handleInstall}
                className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 dark:bg-white px-4 py-3 text-sm font-bold text-white dark:text-gray-900 transition-colors hover:bg-gray-800 dark:hover:bg-gray-100 active:scale-[0.98]"
              >
                <Download className="h-4 w-4" strokeWidth={2} />
                Instalar y obtener cupon
              </button>
            ) : (
              <p className="mt-4 text-[length:var(--ts-xs)] text-gray-500 dark:text-gray-400 text-center leading-relaxed">
                Abre Buleje en Chrome o Safari para instalar desde tu navegador.
              </p>
            )}

            <button
              onClick={handleDismiss}
              className="mt-2 w-full text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white font-medium py-1 transition-colors"
            >
              Ahora no
            </button>
          </div>
        ) : (
          <div className="p-5">
            <div className="flex items-start gap-3 pr-6">
              <div className="h-11 w-11 shrink-0 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
                <Check className="h-5 w-5 text-[var(--data-success-600)] dark:text-emerald-400" strokeWidth={2.5} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-gray-900 dark:text-white leading-tight">
                  Listo, app instalada
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Usa este cupon en tu proxima compra
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-700 p-3">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Tu cupon
              </p>
              <div className="mt-1 flex items-center gap-2">
                <code className="flex-1 text-lg font-extrabold tracking-wider tabular-nums text-gray-900 dark:text-white">
                  {INSTALL_COUPON}
                </code>
                <button
                  onClick={handleCopy}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-300 dark:border-gray-700 px-2.5 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors"
                  aria-label="Copiar cupon"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-[var(--data-success-600)]" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copiado" : "Copiar"}
                </button>
              </div>
              <p className="mt-2 text-[length:var(--ts-xs)] text-gray-500 dark:text-gray-400">
                Valido por 10% de descuento en tu proxima compra.
              </p>
            </div>

            <button
              onClick={handleDismiss}
              className="mt-4 w-full rounded-xl bg-gray-900 dark:bg-white px-4 py-2.5 text-sm font-bold text-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100 transition-colors"
            >
              Entendido
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
