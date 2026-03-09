"use client";

import { useState, useEffect } from "react";
import { useNotifications } from "@/hooks/use-notifications";
// TODO: Uncomment after creating hooks/use-first-order.ts (see use-notifications.ts for content)
// import { useHasCompletedFirstOrder } from "@/hooks/use-first-order";
import { Bell, X } from "lucide-react";

export default function NotificationPrompt() {
  const { permission, requestPermission, hasAsked } = useNotifications();
  // TODO: Uncomment after creating use-first-order.ts
  // const hasFirstOrder = useHasCompletedFirstOrder();
  const hasFirstOrder = true; // TEMPORARY - replace with hook
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (permission === "default" && !hasAsked) {
      const timer = setTimeout(() => setShow(true), 8000);
      return () => clearTimeout(timer);
    }
  }, [permission, hasAsked]);

  // Don't show until we know if user has completed first order
  if (!show || permission !== "default" || hasFirstOrder !== true) return null;

  const handleAllow = async () => {
    await requestPermission();
    setShow(false);
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-50 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl shadow-2xl p-4 animate-[fadeUp_0.4s_ease-out_both]">
      <button onClick={() => setShow(false)} className="absolute top-2 right-2 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-accent transition-colors">
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
            <button onClick={() => setShow(false)} className="text-xs font-semibold text-gray-400 hover:text-gray-600 transition-colors">
              Ahora no
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
