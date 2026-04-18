"use client";

import { useState, useEffect } from "react";
import { ShoppingBag, X, Bell, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminNotifications } from "@/hooks/use-admin-notifications";

interface NotificationToastProps {
  onNavigate?: (tab: string) => void;
}

/**
 * Floating notification toast that shows when new orders arrive via SSE.
 * Auto-dismisses after 8 seconds. Shows up to 3 recent notifications.
 */
export default function NotificationToast({ onNavigate }: NotificationToastProps) {
  const { newOrders, lowStockCount, unseenCount, clearUnseen, connected } = useAdminNotifications();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  // Show toast when new orders arrive
  useEffect(() => {
    if (unseenCount > 0) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 8000);
      return () => clearTimeout(timer);
    }
  }, [unseenCount]);

  const activeOrders = newOrders.filter((o) => !dismissed.has(o.id));

  if (!visible || activeOrders.length === 0) {
    // Show connection indicator only
    return (
      <div className="fixed bottom-4 right-4 z-50">
        {unseenCount > 0 && (
          <button
            onClick={() => {
              setVisible(true);
              onNavigate?.("pedidos");
              clearUnseen();
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-primary text-white hover:bg-primary/90 transition-all animate-bounce"
          >
            <Bell className="h-4 w-4" />
            <span className="text-sm font-bold">{unseenCount} nuevo{unseenCount > 1 ? "s" : ""}</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm">
      {activeOrders.slice(0, 3).map((order) => (
        <div
          key={order.id}
          className="flex items-start gap-3 p-4 rounded-xl bg-[var(--surface-raised)] border border-[var(--rule-base)] animate-in slide-in-from-right"
        >
          <div className="h-10 w-10 rounded-xl bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] flex items-center justify-center shrink-0">
            <ShoppingBag className="h-5 w-5 text-[var(--data-success)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground">Nuevo pedido</p>
            <p className="text-xs text-muted truncate">
              {order.customer} — S/{order.total.toFixed(2)}
            </p>
          </div>
          <button
            onClick={() => {
              setDismissed((prev) => new Set([...prev, order.id]));
            }}
            className="p-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors shrink-0"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {lowStockCount > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning)] dark:border-[var(--data-warning)]">
          <AlertTriangle className="h-4 w-4 text-[var(--data-warning)] shrink-0" />
          <p className="text-xs font-semibold text-[var(--data-warning)] dark:text-[var(--data-warning)]">
            {lowStockCount} producto{lowStockCount > 1 ? "s" : ""} con stock bajo
          </p>
        </div>
      )}

      <button
        onClick={() => {
          clearUnseen();
          setVisible(false);
          onNavigate?.("pedidos");
        }}
        className="text-xs text-center text-primary font-semibold hover:underline py-1"
      >
        Ver todos los pedidos
      </button>
    </div>
  );
}
