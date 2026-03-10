"use client";

import { X, User, Phone, MapPin } from "lucide-react";
import { useCustomer } from "@/contexts/customer-context";

export default function UserAccountModal() {
  const { customer, closeAccountModal, accountModalOpen, openModal } = useCustomer();

  if (!accountModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-[fadeIn_0.2s_ease-out]">
      <div className="bg-white dark:bg-card rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-[scaleIn_0.2s_ease-out]">
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
            </>
          ) : (
            <p className="text-center text-muted py-8">No hay información de cliente disponible</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-surface border-t border-gray-100 dark:border-card-border">
          <button
            onClick={() => {
              closeAccountModal();
              openModal("profile");
            }}
            className="w-full py-2.5 rounded-xl bg-primary text-white font-semibold hover:bg-primary-dark transition-colors"
          >
            Editar información
          </button>
        </div>
      </div>
    </div>
  );
}
