"use client";

import { useState, useEffect } from "react";
import { Smartphone, Download, Wifi, Zap } from "@buleje/design-system/icons";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(true); // hidden by default until client check

  useEffect(() => {
    // Check if already installed (client-only)
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    setIsInstalled(false);

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (isInstalled) return null;

  return (
    <section className="py-10 sm:py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          className="relative overflow-hidden rounded-3xl p-6 sm:p-10"
          style={{
            background: "linear-gradient(135deg, var(--accent) 0%, #007A72 50%, var(--accent) 100%)",
          }}
        >
          {/* Decorative circles */}
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/5" />
          <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/5" />

          <div className="relative flex flex-col sm:flex-row items-center gap-6 sm:gap-10">
            {/* Icon */}
            <div className="flex items-center justify-center w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-white/10 backdrop-blur-sm shrink-0">
              <Smartphone className="w-10 h-10 sm:w-12 sm:h-12 text-white" />
            </div>

            {/* Text */}
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-xl sm:text-2xl font-extrabold text-white mb-2">
                Lleva tu bodega en el bolsillo
              </h3>
              <p className="text-sm sm:text-base text-white/70 mb-4 max-w-md">
                Instala nuestra app gratis — funciona sin internet, recibe notificaciones de ofertas y compra mas rapido.
              </p>
              <div className="flex flex-wrap items-center gap-3 justify-center sm:justify-start mb-4">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
                  <Wifi className="w-3.5 h-3.5" /> Sin internet
                </span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
                  <Zap className="w-3.5 h-3.5" /> Super rapida
                </span>
                <span className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
                  <Download className="w-3.5 h-3.5" /> 100% gratis
                </span>
              </div>
              {deferredPrompt ? (
                <button
                  onClick={handleInstall}
                  className="inline-flex items-center gap-2 bg-white text-[#0f766e] font-bold px-6 py-3 rounded-xl hover:bg-white/90 active:scale-95 transition-all shadow-[var(--shadow-lg)]"
                >
                  <Download className="w-4 h-4" />
                  Instalar ahora
                </button>
              ) : (
                <p className="text-xs text-white/50">
                  Abre esta pagina en Chrome o Safari para instalar
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
