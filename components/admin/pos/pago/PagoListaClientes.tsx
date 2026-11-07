"use client";

import { useState, useEffect } from "react";
import { X, Search, User, Phone, ClipboardList } from "@buleje/design-system/icons";
import { LoadingState, BlockTitle } from "@buleje/design-system";
import { formatCurrency } from "@/lib/format";

/** Lista completa de clientes encima del cobro («Ver clientes»). */
interface CustomerListItem {
  phone: string;
  name: string;
  creditBalance?: number;
  categoria?: string;
}

export default function PagoListaClientes({ onSelect, onClose }: { onSelect: (phone: string, name: string) => void; onClose: () => void }) {
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const res = await fetch("/api/customers?limit=500");
        const data = await res.json();
        setCustomers(Array.isArray(data) ? data : []);
      } catch {
        setCustomers([]);
      }
      setLoading(false);
    };
    fetchCustomers();
  }, []);

  const filtered = filter.trim()
    ? customers.filter(c =>
        c.name.toLowerCase().includes(filter.toLowerCase()) ||
        c.phone.includes(filter)
      )
    : customers;

  return (
    <div className="absolute inset-0 z-10 bg-[var(--surface-raised)] rounded-2xl flex flex-col">
      {/* Header grande */}
      <div className="px-6 py-5 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ClipboardList className="h-5 w-5 text-primary" />
          </div>
          <div>
            <BlockTitle className="text-[length:var(--ts-xl)] font-bold text-[var(--text-primary)] dark:text-[var(--text-primary)]">Todos los clientes</BlockTitle>
            <p className="text-sm text-[var(--text-tertiary)] dark:text-muted">Selecciona un cliente existente</p>
          </div>
        </div>
        <button onClick={onClose} aria-label="Cerrar" className="p-2 rounded-xl hover:bg-[var(--rule-soft)] transition-colors">
          <X className="h-5 w-5 text-[var(--text-tertiary)] dark:text-muted" />
        </button>
      </div>

      {/* Search — input grande */}
      <div className="px-6 py-4 border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)]">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)]" />
          <input
            type="text"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Buscar por nombre o teléfono..."
            className="w-full pl-12 pr-4 h-11 rounded-xl border border-[var(--rule-base)] dark:border-[var(--rule-base)] text-base text-[var(--text-primary)] dark:text-[var(--text-primary)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
            // eslint-disable-next-line jsx-a11y/no-autofocus -- el buscador de clientes se abre para tipear de inmediato
            autoFocus
          />
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <LoadingState message={null} size="lg" className="h-48 py-0" />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-[var(--text-tertiary)] dark:text-muted gap-2">
            <User className="h-10 w-10 opacity-40" />
            <p className="text-base font-semibold">Sin resultados</p>
            <p className="text-sm">Prueba con otro nombre o teléfono</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--rule-soft)] dark:divide-card-border">
            {filtered.map(c => (
              <button
                key={c.phone}
                onClick={() => {
                  onSelect(c.phone, c.name);
                  onClose();
                }}
                className="w-full flex items-center gap-4 px-6 py-4 hover:bg-[var(--surface-sunken)] transition-colors text-left"
              >
                <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-[var(--text-primary)] dark:text-[var(--text-primary)] truncate">{c.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Phone className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                    <p className="text-sm text-[var(--text-tertiary)] dark:text-muted tabular-nums">{c.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.categoria && (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-primary/10 dark:bg-primary/15 text-[var(--accent-ink)] dark:text-[var(--accent)]">
                      {c.categoria}
                    </span>
                  )}
                  {c.creditBalance != null && c.creditBalance > 0 ? (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--data-error-50)] dark:bg-red-950/20 text-[var(--data-error-500)]">
                      Fiado {formatCurrency(Number(c.creditBalance))}
                    </span>
                  ) : null /* Sin «Sin deuda»: creditBalance no sigue a los fiados; lo que debe se ve al elegirlo. */}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer count */}
      <div className="px-6 py-3 border-t border-[var(--rule-soft)] dark:border-[var(--rule-base)] text-center bg-[var(--surface-sunken)]">
        <p className="text-sm text-[var(--text-tertiary)] dark:text-muted">
          <span className="font-semibold text-[var(--text-secondary)]">{filtered.length}</span> de {customers.length} clientes
        </p>
      </div>
    </div>
  );
}
