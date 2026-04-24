"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Search, UserPlus, X, User, ShoppingBag, RotateCcw, Loader2, Star } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import dynamic from "next/dynamic";
import { csrfHeaders } from "@/lib/csrf-client";

const ClienteFormModal = dynamic(
  () => import("@/components/admin/clientes/ClienteFormModal"),
  { ssr: false }
);

interface CustomerResult {
  phone: string;
  name: string;
  creditBalance?: number;
  totalSpent?: number;
  loyaltyPoints?: number;
  observaciones?: string | null;
}

interface LastPurchase {
  date: string;
  total: number;
  items: { productId: number; name: string; quantity: number; price: number; unit: string; active: boolean }[];
}

interface PaymentHistoryItem {
  date: string;
  total: number;
  paymentMethod: string;
}

interface POSCustomerSearchProps {
  selectedPhone: string;
  selectedName: string;
  onSelect: (phone: string, name: string) => void;
  onClear: () => void;
  onRepeatOrder?: (items: { productId: number; name: string; quantity: number; price: number }[]) => void;
}

export default function POSCustomerSearch({
  selectedPhone,
  selectedName,
  onSelect,
  onClear,
  onRepeatOrder,
}: POSCustomerSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CustomerResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  // Mejora 10: Last purchase
  const [lastPurchase, setLastPurchase] = useState<LastPurchase | null | undefined>(undefined);
  const [loadingLastPurchase, setLoadingLastPurchase] = useState(false);

  // Mejora 2: Payment history
  const [paymentHistory, setPaymentHistory] = useState<PaymentHistoryItem[]>([]);
  // Mejora 10R2: Customer notes/observaciones
  const [customerNotes, setCustomerNotes] = useState<string>("");
  // Mejora 15: Loyalty points
  const [loyaltyPoints, setLoyaltyPoints] = useState<number>(0);
  const [showRedeemSlider, setShowRedeemSlider] = useState(false);
  const [redeemAmount, setRedeemAmount] = useState(0);
  const POINTS_RATE = 0.05; // 1 punto = S/0.05

  // Mejora 11: Score de confiabilidad del cliente
  const [reliabilityScore, setReliabilityScore] = useState<{ score: number; label: string } | null>(null);

  // Mejora M-3: Abono rápido de fiado desde POS
  const [showAbonoRapido, setShowAbonoRapido] = useState(false);
  const [abonoMonto, setAbonoMonto] = useState("");
  const [abonoLoading, setAbonoLoading] = useState(false);
  const [fiadoSaldo, setFiadoSaldo] = useState(0);

  // Click outside close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Debounced search
  useEffect(() => {
    if (query.trim().length < 3) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- legitimate sync: clearing stale results when query falls below min length is the core responsibility of this debounced search effect
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/customers?q=${encodeURIComponent(query.trim())}&limit=8`
        );
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
      } catch {
        setResults([]);
      }
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = useCallback(
    (customer: CustomerResult) => {
      onSelect(customer.phone, customer.name);
      setQuery("");
      setShowResults(false);
    },
    [onSelect]
  );

  const handleClienteSaved = useCallback(() => {
    setShowCreateModal(false);
    // Re-search to pick up the new customer
    if (query.trim().length >= 3) {
      setQuery((q) => q + " "); // trigger re-search
      setTimeout(() => setQuery((q) => q.trim()), 50);
    }
  }, [query]);

  // Mejora 10: Fetch last purchase when customer selected
  // Mejora 2: Fetch payment history
  useEffect(() => {
    if (!selectedPhone) {
      /* eslint-disable react-hooks/set-state-in-effect -- legitimate sync: clearing dependent customer data (fiado, loyalty, reliability) when selected customer changes is the core responsibility of this effect */
      setLastPurchase(undefined);
      setPaymentHistory([]);
      setCustomerNotes("");
      setLoyaltyPoints(0);
      setShowRedeemSlider(false);
      setRedeemAmount(0);
      setReliabilityScore(null);
      setFiadoSaldo(0);
      setShowAbonoRapido(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    // Mejora M-3: Fetch fiado balance
    fetch(`/api/customers/${encodeURIComponent(selectedPhone)}/fiado-resumen`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.montoPendiente) setFiadoSaldo(data.montoPendiente); else setFiadoSaldo(0); })
      .catch(() => setFiadoSaldo(0));
    // Mejora 11: Fetch reliability score from fiados history
    fetch(`/api/fiados?search=${encodeURIComponent(selectedPhone)}&limit=50`)
      .then(r => r.ok ? r.json() : [])
      .then((fiados: Array<{ status: string; createdAt: string; updatedAt: string; fechaVence?: string }>) => {
        const completados = fiados.filter(f => f.status === "PAGADO");
        if (completados.length < 3) {
          setReliabilityScore(null);
          return;
        }
        let pagosATiempo = 0;
        let totalDias = 0;
        for (const f of completados) {
          const created = new Date(f.createdAt).getTime();
          const updated = new Date(f.updatedAt).getTime();
          const dias = Math.max(0, Math.floor((updated - created) / 86400000));
          totalDias += dias;
          if (f.fechaVence) {
            if (updated <= new Date(f.fechaVence).getTime()) pagosATiempo++;
          } else if (dias < 30) pagosATiempo++;
        }
        const pct = (pagosATiempo / completados.length) * 100;
        const avgDias = totalDias / completados.length;
        let sc: number;
        if (pct > 90 && avgDias < 7) sc = 5;
        else if (pct > 75 && avgDias < 15) sc = 4;
        else if (pct > 50 && avgDias < 30) sc = 3;
        else if (pct > 25) sc = 2;
        else sc = 1;
        setReliabilityScore({ score: sc, label: `${"★".repeat(sc)}${"☆".repeat(5 - sc)} (${sc}/5)` });
      })
      .catch(() => setReliabilityScore(null));
    // Mejora 10R2: Fetch customer details for observaciones + Mejora 15: loyalty points
    fetch(`/api/customers/${encodeURIComponent(selectedPhone)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.observaciones) setCustomerNotes(data.observaciones); else setCustomerNotes("");
        setLoyaltyPoints(data?.loyaltyPoints ?? 0);
      })
      .catch(() => { setCustomerNotes(""); setLoyaltyPoints(0); });
    setLoadingLastPurchase(true);
    fetch(`/api/customers/${encodeURIComponent(selectedPhone)}/last-purchase`)
      .then(r => r.json())
      .then(data => setLastPurchase(data || null))
      .catch(() => setLastPurchase(null))
      .finally(() => setLoadingLastPurchase(false));

    // Fetch recent payment history (últimos 5 pagos)
    fetch(`/api/customers/${encodeURIComponent(selectedPhone)}/orders?limit=5`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        if (Array.isArray(data)) {
          setPaymentHistory(data.map((o: { createdAt: string; total: number; paymentMethod?: string }) => ({
            date: o.createdAt,
            total: o.total,
            paymentMethod: o.paymentMethod || "Efectivo",
          })));
        }
      })
      .catch(() => setPaymentHistory([]));
  }, [selectedPhone]);

  // Snapshot "now" once per mount (avoids impure Date.now() during render per React Compiler rules)
  const [nowTs] = useState(() => Date.now());
  // Helper to format relative time
  const getRelativeTime = (dateStr: string) => {
    const diff = nowTs - new Date(dateStr).getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days === 0) return "hoy";
    if (days === 1) return "ayer";
    return `hace ${days} dias`;
  };

  // If a customer is selected, show their info
  if (selectedPhone) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 p-3 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success)]/30 dark:border-[var(--data-success)]/30 rounded-xl">
          <div className="h-10 w-10 rounded-full bg-[var(--data-success)]/15 flex items-center justify-center shrink-0">
            <User className="h-5 w-5 text-[var(--data-success)]" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-[var(--text-primary)] dark:text-foreground truncate">
              {selectedName || selectedPhone}
            </p>
            <p className="text-sm text-[var(--text-secondary)] dark:text-muted tabular-nums">
              {selectedPhone}
            </p>
          </div>
          <button
            onClick={onClear}
            aria-label="Quitar cliente"
            className="p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error)] hover:bg-white/50 dark:hover:bg-card/50 transition-colors shrink-0"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {/* Mejora 11: Reliability score badge */}
        {reliabilityScore && (
          <div className="flex items-center gap-1.5 px-3 py-2 bg-[var(--data-warning-50)] dark:bg-yellow-950/20 border border-[var(--data-warning)] dark:border-[var(--data-warning)]/30 rounded-lg">
            <Star className="h-3.5 w-3.5 text-[var(--data-warning)] shrink-0" />
            <span className={cn(
              "text-sm font-bold",
              reliabilityScore.score >= 4 ? "text-[var(--data-warning)] dark:text-[var(--data-warning)]" :
              reliabilityScore.score >= 3 ? "text-[var(--data-warning)] dark:text-[var(--data-warning)]" :
              "text-[var(--data-error)] dark:text-[var(--data-error)]"
            )}>
              Confiabilidad: {reliabilityScore.label}
            </span>
          </div>
        )}
        {/* Mejora M-3: Abono rápido de fiado */}
        {fiadoSaldo > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-[var(--data-error-50)] dark:bg-red-950/20 border border-[var(--data-error)] dark:border-[var(--data-error)]/30 rounded-lg">
              <span className="text-sm font-bold text-[var(--data-error)] dark:text-[var(--data-error)] flex-1">
                Fiado pendiente: S/{fiadoSaldo.toFixed(2)}
              </span>
              <button
                onClick={() => { setShowAbonoRapido(!showAbonoRapido); setAbonoMonto(fiadoSaldo.toFixed(2)); }}
                className="text-sm font-bold text-[var(--data-success)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] hover:bg-[var(--accent-soft)] px-2 py-1 rounded transition-colors"
              >
                Abonar
              </button>
            </div>
            {showAbonoRapido && (
              <div className="px-2 py-2 bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-lg space-y-1.5">
                <p className="text-sm font-bold text-[var(--text-secondary)] dark:text-foreground">
                  Abonar a fiado de {selectedName || selectedPhone}
                </p>
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] text-sm font-bold">S/</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.10"
                      value={abonoMonto}
                      onChange={(e) => setAbonoMonto(e.target.value)}
                      className="w-full pl-6 pr-2 py-1.5 rounded-lg border border-[var(--rule-base)] dark:border-card-border text-xs font-bold text-[var(--text-primary)] dark:text-foreground outline-none focus:border-primary"
                    />
                  </div>
                  <button
                    onClick={async () => {
                      const monto = Number(abonoMonto);
                      if (!monto || monto <= 0) return;
                      setAbonoLoading(true);
                      try {
                        const res = await fetch("/api/fiados/cobrar", {
                          method: "POST",
                          headers: csrfHeaders({ "Content-Type": "application/json" }),
                          body: JSON.stringify({ customerPhone: selectedPhone, monto }),
                        });
                        if (res.ok) {
                          setFiadoSaldo(prev => Math.max(0, prev - monto));
                          setShowAbonoRapido(false);
                          setAbonoMonto("");
                        }
                      } catch { /* silent */ }
                      setAbonoLoading(false);
                    }}
                    disabled={abonoLoading || !abonoMonto || Number(abonoMonto) <= 0}
                    className="px-2.5 py-1.5 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primary-dark transition-colors disabled:opacity-50"
                  >
                    {abonoLoading ? "..." : "Confirmar"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Mejora 10R2: Notes badge */}
        {customerNotes && (
          <div className="flex items-center gap-1.5 px-3 py-2 bg-[var(--data-warning-50)] dark:bg-amber-950/20 border border-[var(--data-warning)] dark:border-[var(--data-warning)]/30 rounded-lg">
            <span className="text-xs shrink-0">&#128221;</span>
            <span className="text-sm text-[var(--data-warning)] dark:text-[var(--data-warning)] font-medium truncate">
              Nota: {customerNotes.slice(0, 50)}{customerNotes.length > 50 ? "..." : ""}
            </span>
          </div>
        )}
        {/* Mejora 15: Loyalty points */}
        {loyaltyPoints > 0 && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 px-3 py-2 bg-[var(--data-warning-50)] dark:bg-yellow-950/20 border border-[var(--data-warning)] dark:border-[var(--data-warning)]/30 rounded-lg">
              <Star className="h-3.5 w-3.5 text-[var(--data-warning)] shrink-0" />
              <span className="text-sm text-[var(--data-warning)] dark:text-[var(--data-warning)] font-bold">
                {loyaltyPoints} puntos (= S/{(loyaltyPoints * POINTS_RATE).toFixed(2)} en descuento)
              </span>
              {loyaltyPoints >= 100 && (
                <span className="ml-auto text-sm font-bold px-1.5 py-1 rounded-full bg-[var(--accent-soft)] text-[var(--data-success)]">Canjeable</span>
              )}
            </div>
            {loyaltyPoints >= 100 && !showRedeemSlider && (
              <button
                onClick={() => { setShowRedeemSlider(true); setRedeemAmount(Math.min(100, loyaltyPoints)); }}
                className="w-full text-sm font-bold text-primary hover:underline py-0.5 flex items-center justify-center gap-1"
              >
                <Star className="h-4 w-4" /> Canjear puntos
              </button>
            )}
            {showRedeemSlider && (
              <div className="px-3 py-2 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-lg space-y-1">
                <p className="text-sm text-[var(--text-secondary)] font-medium">
                  Canjear {redeemAmount} pts = S/{(redeemAmount * POINTS_RATE).toFixed(2)} de descuento
                </p>
                <input
                  type="range"
                  min={0}
                  max={loyaltyPoints}
                  step={10}
                  value={redeemAmount}
                  onChange={e => setRedeemAmount(Number(e.target.value))}
                  className="w-full h-1.5 accent-[var(--data-success)]"
                />
                <div className="flex gap-1">
                  <button
                    onClick={() => setShowRedeemSlider(false)}
                    className="flex-1 text-sm py-1 rounded bg-gray-100 text-[var(--text-secondary)] font-bold"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => setShowRedeemSlider(false)}
                    className="flex-1 text-sm py-1 rounded bg-[var(--accent-soft)] text-white font-bold"
                  >
                    Aplicar -{" "}S/{(redeemAmount * POINTS_RATE).toFixed(2)}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Mejora 17: Producto que suele comprar */}
        {lastPurchase && lastPurchase.items.length > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1">
            <span className="text-sm text-[var(--text-tertiary)] dark:text-muted">
              🛒 Suele comprar: <span className="font-bold text-[var(--text-secondary)]">{lastPurchase.items[0].name}</span>
              {lastPurchase.items.length > 1 && <span>, {lastPurchase.items[1].name}</span>}
            </span>
          </div>
        )}
        {/* Mejora 10: Last purchase info */}
        {loadingLastPurchase && (
          <div className="flex items-center gap-1.5 px-2 py-1">
            <Loader2 className="h-3 w-3 animate-spin text-[var(--text-tertiary)]" />
            <span className="text-sm text-[var(--text-tertiary)]">Cargando historial...</span>
          </div>
        )}
        {lastPurchase === null && !loadingLastPurchase && paymentHistory.length === 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-lg">
            <ShoppingBag className="h-3 w-3 text-[var(--data-success)] shrink-0" />
            <span className="text-sm text-[var(--data-success)] dark:text-[var(--data-success)] font-medium">Primera compra de este cliente</span>
          </div>
        )}
        {/* Mejora 2: Payment history */}
        {paymentHistory.length > 0 && !loadingLastPurchase && (
          <div className="px-2 py-1">
            <p className="text-sm font-bold text-[var(--text-tertiary)] dark:text-muted mb-1">Ultimos pagos</p>
            <div className="max-h-[3.5rem] overflow-y-auto space-y-0.5">
              {paymentHistory.map((p, i) => {
                const d = new Date(p.date);
                const dateStr = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
                return (
                  <span key={i} className="inline-flex items-center text-sm text-[var(--text-secondary)] dark:text-muted mr-2">
                    {dateStr} · S/{p.total.toFixed(0)} · {p.paymentMethod}
                    {i < paymentHistory.length - 1 && <span className="mx-1 text-[var(--text-tertiary)]">|</span>}
                  </span>
                );
              })}
            </div>
          </div>
        )}
        {lastPurchase && !loadingLastPurchase && (
          <div className="bg-gray-50 dark:bg-surface rounded-lg px-3 py-2">
            <p className="text-sm text-[var(--text-secondary)] dark:text-muted">
              Última compra: {getRelativeTime(lastPurchase.date)} — {lastPurchase.items.map(i => i.name).slice(0, 3).join(", ")}
              {lastPurchase.items.length > 3 && "..."} (S/{lastPurchase.total.toFixed(2)})
            </p>
            {onRepeatOrder && lastPurchase.items.some(i => i.active) && (
              <button
                onClick={() => {
                  const activeItems = lastPurchase.items.filter(i => i.active);
                  onRepeatOrder(activeItems.map(i => ({
                    productId: i.productId,
                    name: i.name,
                    quantity: i.quantity,
                    price: i.price,
                  })));
                }}
                className="mt-1 flex items-center gap-1 text-sm font-bold text-primary hover:underline"
              >
                <RotateCcw className="h-4 w-4" />
                Repetir pedido
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)] dark:text-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          placeholder="Buscar cliente por nombre o teléfono..."
          className="w-full pl-12 pr-4 py-3 rounded-xl border border-[var(--rule-base)] dark:border-card-border text-base text-[var(--text-primary)] dark:text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 transition-all"
          autoComplete="off"
        />
      </div>

      {/* Dropdown resultados */}
      {showResults && query.trim().length >= 3 && (
        <div className="absolute z-40 left-0 right-0 mt-2 bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl shadow-lg max-h-80 overflow-y-auto">
          {loading ? (
            <div className="py-6 text-center text-sm font-semibold text-[var(--text-tertiary)] dark:text-muted flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando...
            </div>
          ) : results.length === 0 ? (
            <div className="py-6 text-center text-[var(--text-tertiary)] dark:text-muted">
              <p className="text-base font-semibold">No se encontraron clientes</p>
              <p className="text-sm mt-1">Puedes continuar sin cliente registrado</p>
            </div>
          ) : (
            results.map((c) => (
              <button
                key={c.phone}
                onClick={() => handleSelect(c)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-surface transition-colors text-left border-b border-gray-50 dark:border-card-border last:border-0"
              >
                <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-[var(--text-primary)] dark:text-foreground truncate">
                    {c.name}
                  </p>
                  <p className="text-sm text-[var(--text-tertiary)] dark:text-muted tabular-nums">
                    {c.phone}
                  </p>
                </div>
                {c.creditBalance != null && c.creditBalance > 0 ? (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--data-error-50)] dark:bg-red-950/20 text-[var(--data-error)] shrink-0">
                    Fiado S/{c.creditBalance.toFixed(2)}
                  </span>
                ) : (
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] text-[var(--data-success)] shrink-0">
                    Sin deuda
                  </span>
                )}
              </button>
            ))
          )}

          {/* Crear cliente */}
          <button
            onClick={() => {
              setShowResults(false);
              setShowCreateModal(true);
            }}
            className="w-full flex items-center gap-2.5 px-4 py-3.5 hover:bg-primary/5 transition-colors text-left border-t border-[var(--rule-soft)] dark:border-card-border text-primary font-semibold"
          >
            <UserPlus className="h-5 w-5" />
            <span className="text-base">Crear nuevo cliente</span>
          </button>
        </div>
      )}

      {/* Crear cliente modal */}
      {showCreateModal && (
        <ClienteFormModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSaved={handleClienteSaved}
          initialFormat="simple"
        />
      )}
    </div>
  );
}
