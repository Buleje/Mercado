 
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/purity */
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Plus, Trash2, AlertTriangle, Store, TrendingDown } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Competitor {
  id: string;
  name: string;
  address: string;
}

interface PriceEntry {
  id: string;
  competitorId: string;
  productName: string;
  price: number;
  ourPrice: number;
  date: string;
}

// ── Storage keys ──────────────────────────────────────────────────────────────

const COMP_KEY = "competitor_list";
const PRICE_KEY = "competitor_prices";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `S/${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function save(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CompetitorPriceTracker() {
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [prices, setPrices] = useState<PriceEntry[]>([]);
  const [tab, setTab] = useState<"compare" | "add_competitor" | "add_price">("compare");

  // Add competitor form
  const [compName, setCompName] = useState("");
  const [compAddress, setCompAddress] = useState("");

  // Add price form
  const [selComp, setSelComp] = useState("");
  const [productName, setProductName] = useState("");
  const [compPrice, setCompPrice] = useState("");
  const [ourPrice, setOurPrice] = useState("");

  useEffect(() => {
    setCompetitors(load(COMP_KEY, []));
    setPrices(load(PRICE_KEY, []));
  }, []);

  const addCompetitor = useCallback(() => {
    if (!compName.trim()) return;
    const entry: Competitor = {
      id: Date.now().toString(),
      name: compName.trim(),
      address: compAddress.trim(),
    };
    const next = [...competitors, entry];
    setCompetitors(next);
    save(COMP_KEY, next);
    setCompName("");
    setCompAddress("");
    setTab("compare");
  }, [compName, compAddress, competitors]);

  const addPrice = useCallback(() => {
    if (!selComp || !productName.trim() || !compPrice || !ourPrice) return;
    const entry: PriceEntry = {
      id: Date.now().toString(),
      competitorId: selComp,
      productName: productName.trim(),
      price: Number(compPrice),
      ourPrice: Number(ourPrice),
      date: new Date().toISOString().split("T")[0],
    };
    const next = [...prices, entry];
    setPrices(next);
    save(PRICE_KEY, next);
    setProductName("");
    setCompPrice("");
    setOurPrice("");
    setTab("compare");
  }, [selComp, productName, compPrice, ourPrice, prices]);

  const deletePrice = useCallback(
    (id: string) => {
      const next = prices.filter((p) => p.id !== id);
      setPrices(next);
      save(PRICE_KEY, next);
    },
    [prices]
  );

  const alerts = useMemo(
    () => prices.filter((p) => p.price < p.ourPrice),
    [prices]
  );

  const getCompetitorName = useCallback(
    (id: string) => competitors.find((c) => c.id === id)?.name ?? "Desconocido",
    [competitors]
  );

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[#2d6a4f]/10">
            <Store className="w-5 h-5 text-[#2d6a4f]" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">
              Precios de competencia
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {competitors.length} competidor{competitors.length !== 1 ? "es" : ""} —{" "}
              {prices.length} precio{prices.length !== 1 ? "s" : ""} registrado{prices.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        {/* Tabs */}
        <div className="flex gap-1 mt-4 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
          {(
            [
              { key: "compare", label: "Comparar" },
              { key: "add_competitor", label: "+ Tienda" },
              { key: "add_price", label: "+ Precio" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex-1 py-2 rounded-lg text-xs font-semibold transition-colors",
                tab === t.key
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {/* Alerts */}
        {tab === "compare" && alerts.length > 0 && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              <p className="text-sm font-bold text-red-700 dark:text-red-400">
                {alerts.length} producto{alerts.length !== 1 ? "s" : ""} mas barato{alerts.length !== 1 ? "s" : ""} en competencia
              </p>
            </div>
            {alerts.map((a) => (
              <p key={a.id} className="text-xs text-red-600 dark:text-red-400">
                {a.productName}: ellos {fmt(a.price)} vs tu {fmt(a.ourPrice)}
              </p>
            ))}
          </div>
        )}

        {/* Compare table */}
        {tab === "compare" && (
          <>
            {prices.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">
                No hay precios registrados.
                <br />
                Agrega una tienda y comienza a comparar.
              </p>
            ) : (
              <div className="space-y-2">
                {prices.map((entry) => {
                  const cheaper = entry.price < entry.ourPrice;
                  const diff = entry.ourPrice - entry.price;
                  return (
                    <div
                      key={entry.id}
                      className={cn(
                        "flex items-center justify-between gap-3 p-3 rounded-xl border",
                        cheaper
                          ? "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20"
                          : "border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50"
                      )}
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {entry.productName}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {getCompetitorName(entry.competitorId)} — {entry.date}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-xs text-gray-400">Ellos</p>
                          <p
                            className={cn(
                              "text-sm font-bold",
                              cheaper ? "text-red-600" : "text-gray-700 dark:text-gray-300"
                            )}
                          >
                            {fmt(entry.price)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-400">Nosotros</p>
                          <p className="text-sm font-bold text-[#2d6a4f] dark:text-[#52b788]">
                            {fmt(entry.ourPrice)}
                          </p>
                        </div>
                        {cheaper && (
                          <div className="flex items-center gap-1 text-red-500">
                            <TrendingDown className="w-4 h-4" />
                            <span className="text-xs font-bold">{fmt(diff)}</span>
                          </div>
                        )}
                        <button
                          onClick={() => deletePrice(entry.id)}
                          className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-950/40 transition-colors"
                          aria-label="Eliminar"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-red-400" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* Add competitor */}
        {tab === "add_competitor" && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                Nombre de la tienda
              </label>
              <input
                value={compName}
                onChange={(e) => setCompName(e.target.value)}
                placeholder="Ej: Bodega La Esquina"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-[#2d6a4f]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                Direccion (opcional)
              </label>
              <input
                value={compAddress}
                onChange={(e) => setCompAddress(e.target.value)}
                placeholder="Ej: Jr. Tacna 234"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-[#2d6a4f]"
              />
            </div>
            <button
              onClick={addCompetitor}
              disabled={!compName.trim()}
              className="w-full py-3 rounded-xl bg-[#2d6a4f] text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Agregar tienda
            </button>
          </div>
        )}

        {/* Add price */}
        {tab === "add_price" && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                Tienda competidora
              </label>
              <select
                value={selComp}
                onChange={(e) => setSelComp(e.target.value)}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-[#2d6a4f]"
              >
                <option value="">Seleccionar tienda...</option>
                {competitors.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {competitors.length === 0 && (
                <p className="text-xs text-[#f4a261] mt-1">
                  Agrega una tienda primero en la pestana &ldquo;+ Tienda&rdquo;
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                Producto
              </label>
              <input
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder="Ej: Arroz Costeño 5kg"
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-[#2d6a4f]"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  Precio ellos (S/)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={compPrice}
                  onChange={(e) => setCompPrice(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-[#2d6a4f]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
                  Nuestro precio (S/)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  value={ourPrice}
                  onChange={(e) => setOurPrice(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none focus:border-[#2d6a4f]"
                />
              </div>
            </div>
            <button
              onClick={addPrice}
              disabled={!selComp || !productName.trim() || !compPrice || !ourPrice}
              className="w-full py-3 rounded-xl bg-[#2d6a4f] text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              Registrar precio
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
