"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import dynamic from "next/dynamic";
import { Lightbulb, Users, ShoppingCart, GitMerge, Bell, Search, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Spinner compartido ────────────────────────────────────────────────────────

const Spinner = () => (
  <div className="flex items-center justify-center py-12">
    <div className="h-8 w-8 border-4 border-[#0f766e] border-t-transparent rounded-full animate-spin" />
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

const TABS = [
  { id: "combos",    label: "Combos",        icon: GitMerge    },
  { id: "clientes",  label: "Para clientes", icon: Users       },
  { id: "comprar",   label: "Qué comprar",   icon: ShoppingCart },
  { id: "crosssell", label: "Cross-sell",    icon: Lightbulb   },
  { id: "alertas",   label: "Alertas",       icon: Bell        },
] as const;

type TabId = (typeof TABS)[number]["id"];

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
          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#0f766e]/40"
        />
        {loadingSearch && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="h-4 w-4 border-2 border-[#0f766e] border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Resultados de búsqueda */}
      {results.length > 0 && (
        <ul className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 divide-y divide-gray-100 dark:divide-gray-800 shadow-sm overflow-hidden">
          {results.map((c) => (
            <li key={String(c.id)}>
              <button
                onClick={() => handleSelectCustomer(c)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#0f766e]/5 transition-colors text-left min-h-[44px]"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{c.name}</p>
                  {c.phone && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">{c.phone}</p>
                  )}
                </div>
                {c.totalSpent !== undefined && (
                  <span className="text-xs font-bold text-[#0f766e] dark:text-emerald-400 shrink-0">
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
            <p className="text-sm font-bold text-gray-900 dark:text-white">
              Recomendado para <span className="text-[#0f766e]">{selected.name}</span>
            </p>
            {selected.phone && recs.length > 0 && (
              <button
                onClick={handleWhatsApp}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#25D366] text-white text-xs font-bold hover:bg-[#1fbb58] transition-colors min-h-[36px]"
              >
                Sugerir por WhatsApp
              </button>
            )}
          </div>

          {loadingRecs ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 rounded-2xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
              ))}
            </div>
          ) : recs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-8 text-center">
              <Lightbulb className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No hay recomendaciones disponibles para este cliente.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {recs.map((r) => (
                <div
                  key={String(r.productId)}
                  className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 space-y-1"
                >
                  <p className="text-sm font-semibold text-gray-900 dark:text-white leading-tight">
                    {r.name}
                  </p>
                  <p className="text-base font-black text-[#0f766e] dark:text-emerald-400">
                    {fmtPrice(r.price)}
                  </p>
                  {r.reason && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">{r.reason}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Estado vacío inicial */}
      {!selected && results.length === 0 && search.trim().length < 2 && (
        <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-10 text-center">
          <Users className="h-10 w-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
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
          <div key={i} className="h-12 rounded-xl bg-gray-100 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/20 p-6 text-center">
        <p className="text-sm text-red-600 dark:text-red-400 font-semibold">
          No se pudieron cargar las ventas para analizar.
        </p>
      </div>
    );
  }

  if (pairs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 dark:border-gray-700 p-10 text-center">
        <GitMerge className="h-10 w-10 text-gray-300 mx-auto mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400 font-semibold">
          No hay suficientes ventas con múltiples productos para analizar.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Top 10 pares de productos vendidos juntos con mayor frecuencia — últimas 200 ventas.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-gray-200 dark:border-gray-700">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
              <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Producto A
              </th>
              <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Producto B
              </th>
              <th className="text-right px-4 py-2.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Juntos
              </th>
              <th className="text-right px-4 py-2.5 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Confianza
              </th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
            {pairs.map((pair, idx) => (
              <tr key={idx} className="hover:bg-[#0f766e]/5 dark:hover:bg-[#0f766e]/10 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white max-w-[180px] truncate">
                  {pair.a}
                </td>
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white max-w-[180px] truncate">
                  {pair.b}
                </td>
                <td className="px-4 py-3 text-right font-bold text-gray-700 dark:text-gray-300">
                  {pair.count}x
                </td>
                <td className="px-4 py-3 text-right">
                  <span
                    className={cn(
                      "text-xs font-bold px-2 py-0.5 rounded-full",
                      pair.confidence >= 20
                        ? "bg-[#0f766e]/10 text-[#0f766e] dark:text-emerald-400"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400",
                    )}
                  >
                    {pair.confidence}%
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleCreateCombo(pair)}
                    className="px-3 py-1.5 rounded-xl bg-[#0f766e] text-white text-xs font-bold hover:bg-[#0d5f58] transition-colors min-h-[32px] whitespace-nowrap"
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
  const [tab, setTab] = useState<TabId>("combos");
  const [bannerVisible, setBannerVisible] = useState(true);
  const [tabOrder, setTabOrder] = useState<string[]>(() =>
    typeof window === "undefined" ? TABS.map((t) => t.id) as string[] : (() => {
      try {
        const s = localStorage.getItem("sugerencias-tab-order");
        if (s) {
          const parsed: string[] = JSON.parse(s);
          const all = TABS.map((t) => t.id) as string[];
          const valid = parsed.filter((id) => all.includes(id));
          const missing = all.filter((id) => !valid.includes(id));
          return [...valid, ...missing];
        }
      } catch { /* ignorar */ }
      return TABS.map((t) => t.id) as string[];
    })(),
  );
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("banner-sugerencias");
    if (stored === "hidden") setBannerVisible(false);
  }, []);

  const toggleBanner = () => {
    const next = !bannerVisible;
    setBannerVisible(next);
    localStorage.setItem("banner-sugerencias", next ? "visible" : "hidden");
  };

  const orderedTabs = useMemo(
    () =>
      tabOrder
        .map((id) => TABS.find((t) => t.id === id))
        .filter(Boolean) as typeof TABS[number][],
    [tabOrder],
  );

  function handleDropTab(targetId: string) {
    if (!draggedTab || draggedTab === targetId) return;
    const n = [...tabOrder];
    const f = n.indexOf(draggedTab);
    const t = n.indexOf(targetId);
    n.splice(f, 1);
    n.splice(t, 0, draggedTab);
    setTabOrder(n);
    localStorage.setItem("sugerencias-tab-order", JSON.stringify(n));
    setDraggedTab(null);
    setDragOverTab(null);
  }

  const resetTabOrder = () => {
    const defaultOrder = TABS.map((t) => t.id) as string[];
    setTabOrder(defaultOrder);
    localStorage.removeItem("sugerencias-tab-order");
  };

  const defaultOrder = TABS.map((t) => t.id).join(",");
  const isReordered = tabOrder.join(",") !== defaultOrder;

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-[#0f766e] text-white flex items-center justify-center shadow-sm shrink-0">
          <Lightbulb className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Sugerencias IA
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            La IA analiza tus ventas y te sugiere qué vender, comprar y ofrecer
          </p>
        </div>
      </div>

      {/* Banner */}
      {bannerVisible ? (
        <button
          onClick={toggleBanner}
          className="w-full text-left bg-[#0f766e]/5 dark:bg-[#0f766e]/10 border border-[#0f766e]/20 rounded-xl p-3 mb-1 transition-colors hover:bg-[#0f766e]/10"
        >
          <p className="text-sm text-[#0f766e] dark:text-emerald-400">
            <span className="font-semibold">Sugerencias IA</span> — Combos sugeridos por
            co-ocurrencia, recomendaciones por cliente, qué comprar urgente, cross-sell y alertas
            del negocio. Todo en un solo lugar.
          </p>
        </button>
      ) : (
        <button
          onClick={toggleBanner}
          className="text-xs text-gray-400 hover:text-[#0f766e] transition-colors"
        >
          Mostrar descripción
        </button>
      )}

      {/* Pill-tabs con drag-drop */}
      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-gray-100 dark:from-[var(--color-surface)] to-transparent z-10 pointer-events-none rounded-l-xl" />
        <div className="flex gap-1 bg-gray-100 dark:bg-surface rounded-xl p-1 overflow-x-auto scrollbar-none">
          {orderedTabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                draggable
                onDragStart={() => setDraggedTab(t.id)}
                onDragOver={(e) => { e.preventDefault(); setDragOverTab(t.id); }}
                onDragLeave={() => setDragOverTab(null)}
                onDrop={() => handleDropTab(t.id)}
                onDragEnd={() => { setDraggedTab(null); setDragOverTab(null); }}
                onClick={() => setTab(t.id as TabId)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-colors cursor-grab active:cursor-grabbing",
                  tab === t.id
                    ? "bg-[#0f766e] text-white shadow-sm"
                    : "text-gray-600 dark:text-muted hover:bg-gray-200 dark:hover:bg-gray-700",
                  draggedTab === t.id && "opacity-40 scale-95",
                  dragOverTab === t.id && draggedTab !== t.id && "ring-2 ring-[#0f766e] ring-offset-1",
                )}
                aria-current={tab === t.id ? "page" : undefined}
              >
                <GripVertical className="h-3 w-3 shrink-0 opacity-30" />
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            );
          })}
          {isReordered && (
            <button
              onClick={resetTabOrder}
              className="shrink-0 ml-1 px-2 py-1.5 text-[10px] text-gray-400 dark:text-muted hover:text-[#0f766e] dark:hover:text-emerald-400 transition-colors whitespace-nowrap"
              title="Restablecer orden de tabs"
            >
              Restablecer
            </button>
          )}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-gray-100 dark:from-[var(--color-surface)] to-transparent z-10 pointer-events-none rounded-r-xl" />
      </div>

      {/* Contenido activo */}
      {tab === "combos" && (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <ComboSuggestionCard />
        </div>
      )}

      {tab === "clientes" && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <TabClientes />
        </div>
      )}

      {tab === "comprar" && (
        <div className="space-y-4">
          <SmartPurchaseAdvisor />
          <SmartReorderCard />
        </div>
      )}

      {tab === "crosssell" && (
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 p-5">
          <TabCrossSell />
        </div>
      )}

      {tab === "alertas" && (
        <SmartSuggestionsPanel context="general" />
      )}
    </div>
  );
}
