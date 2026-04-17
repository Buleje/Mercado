"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { Lightbulb, Users, ShoppingCart, GitMerge, Bell, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";

// ── Spinner compartido ────────────────────────────────────────────────────────

const Spinner = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
  </div>
);

// ── Dynamic imports ───────────────────────────────────────────────────────────

const ComboSuggestionCard = dynamic(
  () => import("@/components/admin/ComboSuggestionCard"),
  { ssr: false, loading: Spinner },
);
const SmartPurchaseAdvisor = dynamic(
  () => import("@/components/admin/SmartPurchaseAdvisor"),
  { ssr: false, loading: Spinner },
);
const SmartReorderCard = dynamic(
  () => import("@/components/admin/SmartReorderCard"),
  { ssr: false, loading: Spinner },
);
const SmartSuggestionsPanel = dynamic(
  () => import("@/components/admin/SmartSuggestionsPanel"),
  { ssr: false, loading: Spinner },
);

// ── Tabs ──────────────────────────────────────────────────────────────────────

const MODULE_ID = "sugerencias-ia";

const TABS = [
  { id: "combos",    label: "Combos",        icon: GitMerge    },
  { id: "clientes",  label: "Para clientes", icon: Users       },
  { id: "comprar",   label: "Qué comprar",   icon: ShoppingCart },
  { id: "crosssell", label: "Cross-sell",    icon: Lightbulb   },
  { id: "alertas",   label: "Alertas",       icon: Bell        },
];

type TabId = string;

// ── Types ─────────────────────────────────────────────────────────────────────

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
}

interface SaleItem {
  name?: string;
}

interface SaleRecord {
  items?: SaleItem[];
}

interface CrossPair {
  a: string;
  b: string;
  count: number;
  confidence: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(n: number) {
  return `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function buildWhatsAppText(customerName: string, recs: Recommendation[]): string {
  const lista = recs
    .slice(0, 5)
    .map((r) => `- ${r.name} (${fmtPrice(r.price)})`)
    .join("\n");
  return `Hola ${customerName}! Te recomendamos:\n${lista}\nVisitanos en Buleje. 🛒`;
}

function computeCrossPairs(sales: SaleRecord[]): CrossPair[] {
  const coMap: Record<string, number> = {};
  const totalSales = sales.length || 1;

  for (const sale of sales) {
    const items = sale.items ?? [];
    const names = items.map((i) => (i.name ?? "").trim()).filter(Boolean);
    if (names.length < 2) continue;
    for (let a = 0; a < names.length; a++) {
      for (let b = a + 1; b < names.length; b++) {
        const key = [names[a], names[b]].sort().join("|||");
        coMap[key] = (coMap[key] ?? 0) + 1;
      }
    }
  }

  return Object.entries(coMap)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 10)
    .map(([key, count]) => {
      const [a, b] = key.split("|||");
      return { a, b, count, confidence: Math.round((count / totalSales) * 100) };
    });
}

// ── Sub-tab: Para clientes ────────────────────────────────────────────────────

function TabClientes() {
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
    <div className="space-y-4">
      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Buscar cliente por nombre o teléfono..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[var(--rule-base)] bg-white text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        {loadingSearch && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Resultados de búsqueda */}
      {results.length > 0 && (
        <ul className="rounded-xl border border-[var(--rule-base)] bg-white divide-y divide-gray-100  overflow-hidden">
          {results.map((c) => (
            <li key={String(c.id)}>
              <button
                onClick={() => handleSelectCustomer(c)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-primary/5 transition-colors text-left min-h-[44px]"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900">{c.name}</p>
                  {c.phone && (
                    <p className="text-xs text-gray-500">{c.phone}</p>
                  )}
                </div>
                {c.totalSpent !== undefined && (
                  <span className="text-xs font-bold text-primary shrink-0">
                    {fmtPrice(c.totalSpent)}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Recomendaciones del cliente seleccionado */}
      {selected && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-gray-900">
              Recomendado para <span className="text-primary">{selected.name}</span>
            </p>
            {selected.phone && recs.length > 0 && (
              <button
                onClick={handleWhatsApp}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25D366] text-white text-xs font-bold hover:bg-[#1fbb58] transition-colors min-h-[36px]"
              >
                Sugerir por WhatsApp
              </button>
            )}
          </div>

          {loadingRecs ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : recs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--rule-base)] p-8 text-center">
              <Lightbulb className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                No hay recomendaciones disponibles para este cliente.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recs.map((r) => (
                <div
                  key={String(r.productId)}
                  className="rounded-xl border border-[var(--rule-base)] bg-white p-4 space-y-1"
                >
                  <p className="text-sm font-semibold text-gray-900 leading-tight">
                    {r.name}
                  </p>
                  <p className="text-base font-extrabold text-primary">
                    {fmtPrice(r.price)}
                  </p>
                  {r.reason && (
                    <p className="text-xs text-gray-500">{r.reason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Estado vacío inicial */}
      {!selected && results.length === 0 && search.trim().length < 2 && (
        <div className="rounded-xl border border-dashed border-[var(--rule-base)] p-10 text-center">
          <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-500">
            Busca un cliente para ver sus recomendaciones personalizadas
          </p>
        </div>
      )}
    </div>
  );
}

// ── Sub-tab: Cross-sell ───────────────────────────────────────────────────────

function TabCrossSell() {
  const [pairs, setPairs] = useState<CrossPair[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(false);
      try {
        const res = await fetch("/api/sales?limit=200");
        if (!res.ok) throw new Error("error");
        const data: SaleRecord[] = await res.json();
        if (!cancelled) setPairs(computeCrossPairs(Array.isArray(data) ? data : []));
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, []);

  const handleCreateCombo = useCallback((pair: CrossPair) => {
    window.location.href = `/admin/bundles?a=${encodeURIComponent(pair.a)}&b=${encodeURIComponent(pair.b)}`;
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
        <p className="text-sm text-red-600 font-semibold">
          No se pudieron cargar las ventas para analizar.
        </p>
      </div>
    );
  }

  if (pairs.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--rule-base)] p-10 text-center">
        <GitMerge className="h-10 w-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500 font-semibold">
          No hay suficientes ventas con múltiples productos para analizar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500">
        Top 10 pares de productos vendidos juntos con mayor frecuencia — últimas 200 ventas.
      </p>
      <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--rule-soft)] bg-gray-50">
              <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500">
                Producto A
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500">
                Producto B
              </th>
              <th className="text-right px-4 py-2.5 text-xs font-bold text-gray-500">
                Juntos
              </th>
              <th className="text-right px-4 py-2.5 text-xs font-bold text-gray-500">
                Confianza
              </th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {pairs.map((pair, idx) => (
              <tr key={idx} className="hover:bg-primary/5 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900 max-w-[180px] truncate">
                  {pair.a}
                </td>
                <td className="px-4 py-3 font-medium text-gray-900 max-w-[180px] truncate">
                  {pair.b}
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-700">
                  {pair.count}x
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={cn(
                      "text-xs font-bold px-2 py-0.5 rounded-full",
                      pair.confidence >= 20
                        ? "bg-primary/10 text-primary"
                        : "bg-gray-100 text-gray-500",
                    )}
                  >
                    {pair.confidence}%
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleCreateCombo(pair)}
                    className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary-dark transition-colors min-h-[32px] whitespace-nowrap"
                  >
                    Crear combo
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Módulo principal ──────────────────────────────────────────────────────────

interface Props {
  tenantId?: string;
}

export default function SugerenciasIAModule({ tenantId: _tenantId }: Props) {
  const [tab, setTab] = useState<TabId>(TABS[0].id);

  return (
    <div className="space-y-6">
      <AdminModuleHeader
        title="Sugerencias IA"
        description="Recomendaciones inteligentes de combos, compras y estrategias de venta"
        icon={Lightbulb}
      />
      <AdminTabBar
        tabs={TABS}
        activeTab={tab}
        onTabChange={(id) => setTab(id)}
        moduleId={MODULE_ID}
      >
        {tab === "combos" && (
          <div className="rounded-xl border border-[var(--rule-base)] overflow-hidden">
            <ComboSuggestionCard />
          </div>
        )}

        {tab === "clientes" && (
          <div className="bg-white rounded-xl border border-[var(--rule-base)] p-5">
            <TabClientes />
          </div>
        )}

        {tab === "comprar" && (
          <div className="space-y-6">
            <SmartPurchaseAdvisor />
            <SmartReorderCard />
          </div>
        )}

        {tab === "crosssell" && (
          <div className="bg-white rounded-xl border border-[var(--rule-base)] p-5">
            <TabCrossSell />
          </div>
        )}

        {tab === "alertas" && (
          <SmartSuggestionsPanel context="general" />
        )}
      </AdminTabBar>
    </div>
  );
}
