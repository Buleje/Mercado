"use client";

import { CardTitle } from "@buleje/design-system";
import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { X, Search, Loader2, CheckCircle2, User, ShoppingCart } from "@buleje/design-system/icons";

interface CartItemInput {
  product: { id: number; name: string; costPrice?: number | null };
  quantity: number;
}

interface CustomerResult {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  cartItems: CartItemInput[];
}

export default function PuntoCompraOrderCreator({ open, onClose, cartItems }: Props) {
  const [customerSearch, setCustomerSearch] = useState("");
  const [customers, setCustomers] = useState<CustomerResult[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(() =>
    new Set(cartItems.map((i) => i.product.id)),
  );
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ orderId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Search customers with debounce
  useEffect(() => {
    if (customerSearch.trim().length < 2) {
      setCustomers([]);
      return;
    }

    const timeout = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`/api/customers?search=${encodeURIComponent(customerSearch.trim())}`);
        if (!res.ok) throw new Error("search failed");
        const data = await res.json();
        const list: CustomerResult[] = Array.isArray(data) ? data : data.customers ?? [];
        setCustomers(list.slice(0, 8));
      } catch {
        setCustomers([]);
      } finally {
        setSearchLoading(false);
      }
    }, 400);

    return () => clearTimeout(timeout);
  }, [customerSearch]);

  const toggleItem = useCallback((productId: number) => {
    setSelectedItems((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }, []);

  const selectedTotal = cartItems
    .filter((i) => selectedItems.has(i.product.id))
    .reduce((sum, i) => sum + (i.product.costPrice ?? 0) * i.quantity, 0);

  const handleCreateOrder = async () => {
    if (!selectedCustomer || selectedItems.size === 0) return;
    setSubmitting(true);
    setError(null);

    try {
      const items = cartItems
        .filter((i) => selectedItems.has(i.product.id))
        .map((i) => ({
          productId: i.product.id,
          name: i.product.name,
          quantity: i.quantity,
          unitPrice: i.product.costPrice ?? 0,
        }));

      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          customerName: selectedCustomer.name,
          items,
          total: selectedTotal,
          source: "punto-compra",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "Error al crear pedido");
      }

      const order = (await res.json()) as { id: string };
      setSuccess({ orderId: String(order.id) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-[var(--surface-raised)] rounded-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--rule-base)] dark:border-card-border">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-bold text-[var(--text-primary)]">
              Crear pedido de cliente
            </CardTitle>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-full flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] dark:hover:text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {success ? (
            /* Success state */
            <div className="text-center py-8 space-y-3">
              <CheckCircle2 className="h-12 w-12 mx-auto text-[var(--data-success)]" />
              <p className="text-sm font-bold text-[var(--text-primary)]">
                Pedido creado exitosamente
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">
                ID: {success.orderId}
              </p>
              <button
                type="button"
                onClick={onClose}
                className="mt-4 px-6 py-2 bg-primary text-white rounded-lg text-xs font-medium hover:bg-primary-dark transition-colors"
              >
                Cerrar
              </button>
            </div>
          ) : (
            <>
              {/* Customer search */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Cliente
                </label>
                {selectedCustomer ? (
                  <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-xl">
                    <User className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                        {selectedCustomer.name}
                      </p>
                      {selectedCustomer.phone && (
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{selectedCustomer.phone}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCustomer(null);
                        setCustomerSearch("");
                      }}
                      className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] hover:text-[var(--data-error)]"
                    >
                      Cambiar
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                    <input
                      type="text"
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      placeholder="Buscar por nombre o telefono..."
                      className="w-full pl-9 pr-3 py-2 border border-[var(--rule-base)] dark:border-card-border rounded-lg text-xs bg-[var(--surface-raised)] text-[var(--text-primary)] placeholder-gray-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]"
                    />
                    {searchLoading && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-tertiary)] animate-spin" />
                    )}
                  </div>
                )}

                {/* Customer results */}
                {!selectedCustomer && customers.length > 0 && (
                  <div className="mt-1 border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
                    {customers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => {
                          setSelectedCustomer(c);
                          setCustomers([]);
                          setCustomerSearch("");
                        }}
                        className="w-full flex items-center gap-2 p-2 text-left hover:bg-gray-50 dark:hover:bg-white/5 transition-colors border-b border-[var(--rule-soft)] dark:border-card-border last:border-0"
                      >
                        <User className="h-3 w-3 text-[var(--text-tertiary)] shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs text-[var(--text-primary)] truncate">{c.name}</p>
                          {c.phone && (
                            <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{c.phone}</p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Items selection */}
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                  Productos ({selectedItems.size} de {cartItems.length} seleccionados)
                </label>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {cartItems.map((item) => {
                    const checked = selectedItems.has(item.product.id);
                    return (
                      <button
                        key={item.product.id}
                        type="button"
                        onClick={() => toggleItem(item.product.id)}
                        className={cn(
                          "w-full flex items-center gap-2 p-2 rounded-lg text-left transition-colors",
                          checked
                            ? "bg-primary/10 border border-primary/30"
                            : "bg-gray-50 dark:bg-white/5 border border-transparent",
                        )}
                      >
                        <div
                          className={cn(
                            "h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors",
                            checked
                              ? "bg-primary border-primary text-white"
                              : "border-[var(--rule-base)] dark:border-gray-600",
                          )}
                        >
                          {checked && <span className="text-[length:var(--ts-2xs)] font-bold">&#10003;</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-[var(--text-primary)] truncate">
                            {item.product.name}
                          </p>
                        </div>
                        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] shrink-0">
                          x{item.quantity}
                        </span>
                        <span className="text-xs font-mono font-medium text-[var(--text-secondary)] shrink-0">
                          S/{((item.product.costPrice ?? 0) * item.quantity).toFixed(2)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Total */}
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-white/5 rounded-xl">
                <span className="text-xs font-medium text-[var(--text-secondary)]">
                  Total seleccionado
                </span>
                <span className="text-sm font-bold font-mono text-primary">
                  S/{selectedTotal.toFixed(2)}
                </span>
              </div>

              {/* Error message */}
              {error && (
                <p className="text-xs text-[var(--data-error)] dark:text-[var(--data-error)] bg-[var(--data-error-50)] dark:bg-[var(--data-error)]/20 rounded-lg p-2">
                  {error}
                </p>
              )}

              {/* Submit */}
              <button
                type="button"
                onClick={handleCreateOrder}
                disabled={submitting || !selectedCustomer || selectedItems.size === 0}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors",
                  "bg-primary hover:bg-primary-dark text-white",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#00B4A6]",
                )}
              >
                {submitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ShoppingCart className="h-3.5 w-3.5" />
                )}
                {submitting ? "Creando..." : "Crear pedido"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
