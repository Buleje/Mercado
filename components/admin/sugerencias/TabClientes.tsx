"use client";

import { useState, useCallback, useRef } from "react";
import { Search, Users, MessageCircle, ArrowRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import ProductImage from "./ProductImage";

interface Customer {
  id: string | number;
  name: string;
  phone?: string;
  totalSpent?: number;
}

interface Recommendation {
  productId: string | number;
  name: string;
  price: number;
  reason?: string;
  imageUrl?: string;
  image?: string;
}

function fmt(n: number): string {
  return `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildWhatsAppText(customerName: string, recs: Recommendation[]): string {
  const lines = recs.slice(0, 5).map((r) => `• ${r.name} — ${fmt(r.price)}`).join("\n");
  return `Hola ${customerName.split(" ")[0]}! Te recomiendo de Buleje:\n\n${lines}\n\n¿Te separo algo?`;
}

export default function TabClientes() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loadingRecs, setLoadingRecs] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((val: string) => {
    setSearch(val);
    setSelected(null);
    setRecs([]);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length < 2) {
      setResults([]);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setLoadingSearch(true);
      try {
        const res = await fetch(`/api/customers?search=${encodeURIComponent(val.trim())}&limit=10`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.customers ?? data ?? []);
        }
      } catch {
        setResults([]);
      } finally {
        setLoadingSearch(false);
      }
    }, 300);
  }, []);

  const handleSelectCustomer = useCallback(async (customer: Customer) => {
    setSelected(customer);
    setResults([]);
    setSearch(customer.name);
    setLoadingRecs(true);
    setRecs([]);
    try {
      const phone = customer.phone ?? "";
      const res = await fetch(`/api/recommendations?phone=${encodeURIComponent(phone)}&limit=8`);
      if (res.ok) {
        const data = await res.json();
        setRecs(data.recommendations ?? data ?? []);
      }
    } catch {
      setRecs([]);
    } finally {
      setLoadingRecs(false);
    }
  }, []);

  const handleWhatsApp = useCallback(() => {
    if (!selected?.phone || recs.length === 0) return;
    const texto = buildWhatsAppText(selected.name, recs);
    const phone = selected.phone.replace(/\D/g, "");
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(texto)}`, "_blank");
  }, [selected, recs]);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-base font-extrabold text-[var(--text-primary)]">Recomendaciones por cliente</p>
        <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Busca un cliente y obtén sugerencias personalizadas que puedes enviarle por WhatsApp
        </p>
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)] pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Nombre o teléfono del cliente..."
          className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-[var(--rule-base)] bg-white text-base font-medium text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--text-primary)] focus:border-[var(--text-primary)]"
        />
        {loadingSearch && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 border-2 border-[var(--text-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Resultados de búsqueda */}
      {results.length > 0 && (
        <ul className="rounded-xl border border-[var(--rule-base)] bg-white overflow-hidden divide-y divide-[var(--rule-soft)]">
          {results.map((c) => (
            <li key={String(c.id)}>
              <button
                onClick={() => handleSelectCustomer(c)}
                className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--surface-sunken)] transition-colors text-left"
              >
                <ProductImage name={c.name} size="sm" rounded="lg" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-[var(--text-primary)] truncate">{c.name}</p>
                  {c.phone && (
                    <p className="text-xs font-medium text-[var(--text-secondary)]">{c.phone}</p>
                  )}
                </div>
                {c.totalSpent !== undefined && (
                  <span className="text-sm font-extrabold tabular-nums text-[var(--text-primary)] shrink-0">
                    {fmt(c.totalSpent)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Recomendaciones */}
      {selected && (
        <div className="space-y-4">
          {/* Cliente seleccionado */}
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--rule-base)] bg-white p-4">
            <div className="flex items-center gap-3 min-w-0">
              <ProductImage name={selected.name} size="md" rounded="lg" />
              <div className="min-w-0">
                <p className="text-base font-extrabold text-[var(--text-primary)] truncate">{selected.name}</p>
                {selected.phone && (
                  <p className="text-xs font-medium text-[var(--text-secondary)]">{selected.phone}</p>
                )}
              </div>
            </div>
            {selected.phone && recs.length > 0 && (
              <button
                onClick={handleWhatsApp}
                className="inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#1fbb58] transition-colors shrink-0"
              >
                <MessageCircle className="h-4 w-4" />
                Enviar por WhatsApp
              </button>
            )}
          </div>

          {/* Lista recomendaciones */}
          {loadingRecs ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-32 rounded-xl bg-[var(--surface-sunken)] animate-pulse" />
              ))}
            </div>
          ) : recs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--rule-base)] p-10 text-center">
              <p className="text-sm font-bold text-[var(--text-primary)]">Sin recomendaciones</p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Este cliente no tiene historial suficiente para personalizar sugerencias.
              </p>
            </div>
          ) : (
            <>
              <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                {recs.length} sugerencias basadas en su historial
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {recs.map((r) => (
                  <div
                    key={String(r.productId)}
                    className="rounded-xl border border-[var(--rule-base)] bg-white p-4 flex items-center gap-3"
                  >
                    <ProductImage name={r.name} imageUrl={r.imageUrl ?? r.image} size="md" rounded="lg" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-[var(--text-primary)] line-clamp-2 leading-tight">
                        {r.name}
                      </p>
                      <p className="mt-1 text-base font-extrabold tabular-nums text-[var(--text-primary)]">
                        {fmt(r.price)}
                      </p>
                      {r.reason && (
                        <p className="mt-1 text-xs font-medium text-[var(--text-secondary)] line-clamp-2">
                          {r.reason}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Preview WhatsApp */}
              {selected.phone && (
                <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-4">
                  <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-2">
                    Mensaje que se enviará
                  </p>
                  <pre className="text-xs font-medium text-[var(--text-primary)] whitespace-pre-wrap font-sans">
                    {buildWhatsAppText(selected.name, recs)}
                  </pre>
                  <button
                    onClick={handleWhatsApp}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-xs font-bold text-white hover:bg-[#1fbb58]"
                  >
                    Enviar
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Estado vacío */}
      {!selected && results.length === 0 && search.trim().length < 2 && (
        <div className="rounded-2xl border border-dashed border-[var(--rule-base)] p-12 text-center">
          <Users className="mx-auto mb-3 h-12 w-12 text-[var(--text-tertiary)]" />
          <p className="text-base font-extrabold text-[var(--text-primary)]">Busca un cliente</p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Empieza escribiendo el nombre o teléfono para ver recomendaciones personalizadas.
          </p>
        </div>
      )}
    </div>
  );
}
