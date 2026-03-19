"use client";

import { useEffect, useState } from "react";
import { X, Download, Smartphone } from "lucide-react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * PWA Install Prompt Component
 * Displays a prompt to install the app when the browser indicates it's installable
 * Respects user dismissal and shows at strategic moments
 */
export default function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Check if user already dismissed the prompt
    const dismissed = localStorage.getItem("bsm-install-dismissed");
    if (dismissed === "1") {
      return;
    }

    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      return;
    }

    // Listen for the beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the default browser install prompt
      e.preventDefault();
      
      // Store the event for later use (cast to our interface)
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // Show prompt based on engagement: user must scroll >40% AND spend >12s
      let scrolledEnough = false;
      let timeReady = false;
      const tryShow = () => { if (scrolledEnough && timeReady) setShowPrompt(true); };

      const onScroll = () => {
        const scrollPct = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
        if (scrollPct > 0.4) { scrolledEnough = true; window.removeEventListener("scroll", onScroll); tryShow(); }
      };
      window.addEventListener("scroll", onScroll, { passive: true });

      const timer = setTimeout(() => { timeReady = true; tryShow(); }, 12000);

      // Fallback: show after 30s regardless of scroll (e.g., on mobile with short pages)
      const fallback = setTimeout(() => setShowPrompt(true), 30000);

      // Cleanup stored for component unmount
      (handleBeforeInstallPrompt as { _cleanup?: () => void })._cleanup = () => {
        window.removeEventListener("scroll", onScroll);
        clearTimeout(timer);
        clearTimeout(fallback);
      };
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      (handleBeforeInstallPrompt as { _cleanup?: () => void })._cleanup?.();
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      return;
    }

    // Show the browser's install prompt
    deferredPrompt.prompt();

    // Wait for the user's response
    const { outcome } = await deferredPrompt.userChoice;

    if (outcome === "accepted") {
      console.log("[PWA] User accepted the install prompt");
    } else {
      console.log("[PWA] User dismissed the install prompt");
    }

    // Clear the prompt
    setDeferredPrompt(null);
    setShowPrompt(false);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("bsm-install-dismissed", "1");
  };

  if (!showPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-20 md:bottom-6 left-4 right-4 md:left-auto md:right-6 md:max-w-md z-50 animate-slide-up">
      <div className="bg-white dark:bg-card rounded-2xl shadow-2xl border border-gray-200 dark:border-card-border overflow-hidden">
        {/* Header */}
        <div className="bg-linear-to-r from-primary to-primary-dark px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <Smartphone className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-white font-bold text-sm">Instalar Bodega San Martín</h3>
              <p className="text-white/70 text-xs">Acceso rápido desde tu inicio</p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="text-white/70 hover:text-white transition-colors p-1"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
            Instala nuestra app para acceder más rápido, recibir ofertas exclusivas y comprar incluso sin conexión.
          </p>

          {/* Benefits */}
          <ul className="space-y-2 mb-5">
            <li className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="text-green-500">✓</span>
              Acceso instantáneo desde tu pantalla de inicio
            </li>
            <li className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="text-green-500">✓</span>
              Funciona sin conexión con caché inteligente
            </li>
            <li className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
              <span className="text-green-500">✓</span>
              Notificaciones de ofertas y promociones
            </li>
          </ul>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleInstall}
              className="flex-1 bg-primary hover:bg-primary-dark text-white font-semibold py-3 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2 shadow-md hover:shadow-lg active:scale-95"
            >
              <Download className="h-4 w-4" />
              Instalar ahora
            </button>
            <button
              onClick={handleDismiss}
              className="px-4 py-3 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium text-sm transition-colors"
            >
              Ahora no
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
