"use client";

import { useState, useEffect } from "react";
import { useNotifications } from "@/hooks/use-notifications";
import { useHasCompletedFirstOrder } from "@/hooks/use-first-order";
import { Bell, X } from "lucide-react";

const DISMISS_KEY = "bsm-notif-dismissed-until";

export default function NotificationPrompt() {
  const { permission, requestPermission, hasAsked } = useNotifications();
  const hasFirstOrder = useHasCompletedFirstOrder();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (permission === "default" && !hasAsked) {
      try {
        const until = Number(localStorage.getItem(DISMISS_KEY) || 0);
        if (Date.now() < until) return;
      } catch { /* silent */ }
      const timer = setTimeout(() => setShow(true), 12000);
      return () => clearTimeout(timer);
    }
  }, [permission, hasAsked]);

  // Solo mostrar después de la primera compra
  if (!show || permission !== "default" || hasFirstOrder !== true) return null;

  const handleAllow = async () => {
    await requestPermission();
    setShow(false);
  };

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000));
    } catch { /* silent */ }
    setShow(false);
  };

  return (
    <div className="fixed bottom-44 left-4 right-4 sm:left-auto sm:bottom-20 sm:right-4 sm:max-w-sm z-50 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-4 animate-[fadeUp_0.4s_ease-out_both]">
      <button onClick={handleDismiss} className="absolute top-2 right-2 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
        <X className="h-4 w-4 text-gray-400" />
      </button>
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Bell className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h4 className="font-bold text-foreground text-sm">¿Activar notificaciones?</h4>
          <p className="text-xs text-muted mt-0.5">Recibe avisos de ofertas y el estado de tus pedidos.</p>
          <div className="flex gap-2 mt-3">
            <button onClick={handleAllow} className="bg-primary text-white text-xs font-bold rounded-lg px-3 py-1.5 hover:bg-primary-dark active:scale-95 transition-all">
              Activar
            </button>
            <button onClick={handleDismiss} className="text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors">
              Ahora no
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
