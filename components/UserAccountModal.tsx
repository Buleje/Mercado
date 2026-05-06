"use client";

import { useState, useEffect } from "react";
import { X, User, Phone, MapPin, Star, Trophy, LogOut, Package } from "@buleje/design-system/icons";
import { useCustomer } from "@/contexts/customer-context";

export default function UserAccountModal() {
  const { customer, closeAccountModal, accountModalOpen, openModal, openOrderStatusModal, clear } = useCustomer();
  const [loyalty, setLoyalty] = useState<{ loyaltyPoints: number; loyaltyTier: string } | null>(null);

  useEffect(() => {
    if (!accountModalOpen || !customer?.phone) { setLoyalty(null); return; }
    const phone = customer.phone.replace(/\D/g, "").slice(-9);
    if (phone.length < 6) return;
    let cancelled = false;
    (async () => {
      try {
        const auth = await fetch("/api/auth/customer/me", { credentials: "include", cache: "no-store" });
        if (cancelled || !auth.ok) return;
        const authData = await auth.json();
        if (!authData?.authenticated) return;
        const r = await fetch(`/api/loyalty/${phone}`, { credentials: "include" });
        if (!r.ok) return;
        const data = await r.json();
        if (!cancelled && data) setLoyalty(data);
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, [accountModalOpen, customer?.phone]);

  if (!accountModalOpen) return null;

  const tierColors: Record<string, string> = {
    Bronce: "text-[var(--data-warning-700)] bg-amber-50 border-amber-200",
    Plata: "text-gray-600 bg-gray-50 border-gray-200",
    Oro: "text-yellow-700 bg-yellow-50 border-yellow-200",
    Platino: "text-[var(--accent)] bg-purple-50 border-purple-200",
  };

  return (
    <div className="fixed inset-0 z-7500 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
      <div role="dialog" aria-modal="true" aria-label="Mi cuenta" className="bg-white dark:bg-card rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-[scaleIn_0.2s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-card-border bg-primary/5">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground">Mi Cuenta</h2>
          </div>
          <button
            onClick={closeAccountModal}
            className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5 text-muted" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-4">
          {customer ? (
            <>
              <div className="flex items-start gap-3">
                <User className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-xs text-muted">Nombre</p>
                  <p className="text-sm font-semibold text-foreground">{customer.name}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Phone className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-xs text-muted">Teléfono</p>
                  <p className="text-sm font-semibold text-foreground">{customer.phone}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <MapPin className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="text-xs text-muted">Ubicación</p>
                  <p className="text-sm font-semibold text-foreground">{customer.location}</p>
                  {customer.reference && (
                    <p className="text-xs text-muted mt-0.5">{customer.reference}</p>
                  )}
                </div>
              </div>

              {/* Loyalty info */}
              {loyalty && (
                <div className="space-y-2 pt-2 border-t border-gray-100 dark:border-card-border">
                  <div className="flex items-center gap-3">
                    <Star className="h-5 w-5 text-[var(--data-warning-500)] mt-0.5" />
                    <div>
                      <p className="text-xs text-muted">Puntos acumulados</p>
                      <p className="text-sm font-bold text-[var(--data-warning-600)]">{loyalty.loyaltyPoints} pts</p>
                    </div>
                  </div>
                  {loyalty.loyaltyTier && (
                    <div className="flex items-center gap-3">
                      <Trophy className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="text-xs text-muted">Tu nivel</p>
                        <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full border ${tierColors[loyalty.loyaltyTier] ?? "text-gray-600 bg-gray-50 border-gray-200"}`}>
                          {loyalty.loyaltyTier}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Order status shortcut */}
              <button
                type="button"
                onClick={() => { closeAccountModal(); openOrderStatusModal(); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors"
              >
                <Package className="h-5 w-5 text-primary" />
                <span className="text-sm font-semibold text-primary">Ver estado de mi pedido</span>
              </button>
            </>
          ) : (
            <p className="text-center text-muted py-8">No hay información de cliente disponible</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-surface border-t border-gray-100 dark:border-card-border space-y-2">
          <button
            onClick={() => {
              closeAccountModal();
              openModal("profile");
            }}
            className="w-full py-2.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dark transition-colors"
          >
            Editar información
          </button>
          {customer && (
            <button
              onClick={() => { clear(); closeAccountModal(); }}
              className="w-full py-2.5 rounded-xl border-2 border-red-200 text-[var(--data-error-500)] font-semibold hover:bg-red-50 transition-colors flex items-center justify-center gap-2 text-sm"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
