"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Scale, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types ───────────────────────────────────────────────────────────────────

type WeighEntry = {
  id: string;
  product: string;
  weight: number;
  pricePerKg: number;
  total: number;
  time: string;
};

// ── Constants ────────────────────────────────────────────────────────────────

const LS_KEY = "bsm_weight_history";

const PRESETS = [
  { name: "Arroz extra", pricePerKg: 3.5 },
  { name: "Azucar rubia", pricePerKg: 2.8 },
  { name: "Frijoles", pricePerKg: 5.0 },
  { name: "Lentejas", pricePerKg: 5.5 },
  { name: "Fideos sueltos", pricePerKg: 4.0 },
  { name: "Sal", pricePerKg: 1.2 },
  { name: "Menestra", pricePerKg: 6.0 },
  { name: "Maiz morado", pricePerKg: 4.5 },
];

const fmt = (n: number) =>
  `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2 })}`;

// ── Component ────────────────────────────────────────────────────────────────

export default function BulkWeightCalculator() {
  const [product, setProduct] = useState("");
  const [weight, setWeight] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");
  const [history, setHistory] = useState<WeighEntry[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const all: WeighEntry[] = JSON.parse(raw);
        // Only show today's entries
        const today = new Date().toDateString();
        setHistory(all.filter((e) => new Date(e.time).toDateString() === today));
      }
    } catch {}
  }, []);

  const saveHistory = (entries: WeighEntry[]) => {
    setHistory(entries);
    try {
      // Load all history, replace today's
      const raw = localStorage.getItem(LS_KEY);
      const all: WeighEntry[] = raw ? JSON.parse(raw) : [];
      const today = new Date().toDateString();
      const notToday = all.filter(
        (e) => new Date(e.time).toDateString() !== today
      );
      localStorage.setItem(LS_KEY, JSON.stringify([...notToday, ...entries]));
    } catch {}
  };

  const w = parseFloat(weight) || 0;
  const ppkg = parseFloat(pricePerKg) || 0;
  const total = w * ppkg;

  const loadPreset = (preset: { name: string; pricePerKg: number }) => {
    setProduct(preset.name);
    setPricePerKg(preset.pricePerKg.toString());
  };

  const addToHistory = () => {
    if (w <= 0 || ppkg <= 0 || !product.trim()) return;
    const entry: WeighEntry = {
      id: Date.now().toString(),
      product: product.trim(),
      weight: w,
      pricePerKg: ppkg,
      total,
      time: new Date().toISOString(),
    };
    const next = [entry, ...history];
    saveHistory(next);
  };

  const removeEntry = (id: string) => {
    saveHistory(history.filter((e) => e.id !== id));
  };

  const todayTotal = history.reduce((s, e) => s + e.total, 0);

  const handleAddToCart = () => {
    addToHistory();
    // Could dispatch to cart context — for now just records
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Calculadora por Peso
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Calcula el precio de productos vendidos al granel
        </p>
      </div>

      {/* Presets */}
      <div>
        <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          Productos frecuentes
        </p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => loadPreset(p)}
              className={cn(
                "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                product === p.name
                  ? "border-[#00B4A6] bg-[#00B4A6] text-white"
                  : "border-gray-200 bg-gray-50 text-gray-700 hover:border-[#00B4A6]/50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              )}
            >
              {p.name}
              <span className="ml-1 opacity-60">{fmt(p.pricePerKg)}/kg</span>
            </button>
          ))}
        </div>
      </div>

      {/* Calculator */}
      <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Producto
            </label>
            <input
              value={product}
              onChange={(e) => setProduct(e.target.value)}
              placeholder="Nombre del producto"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-[#00B4A6] focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Peso (kg)
            </label>
            <div className="relative">
              <Scale className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="0.000"
                step="0.001"
                min="0"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm focus:border-[#00B4A6] focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Precio por kg (S/)
            </label>
            <input
              type="number"
              value={pricePerKg}
              onChange={(e) => setPricePerKg(e.target.value)}
              placeholder="0.00"
              step="0.10"
              min="0"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm focus:border-[#00B4A6] focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>
        </div>

        {/* Result */}
        <div className="mt-5 flex items-center justify-between rounded-xl bg-[#00B4A6]/10 px-5 py-4 dark:bg-[#00B4A6]/20">
          <div>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {w > 0 && ppkg > 0
                ? `${w.toFixed(3)} kg × ${fmt(ppkg)}/kg`
                : "Ingresa peso y precio"}
            </p>
            <p className="text-3xl font-bold text-[#00B4A6]">{fmt(total)}</p>
          </div>
          <button
            onClick={handleAddToCart}
            disabled={w <= 0 || ppkg <= 0 || !product.trim()}
            className="flex items-center gap-2 rounded-xl bg-[#f97316] px-5 py-3 font-semibold text-white transition hover:bg-[#e08c4a] disabled:opacity-40"
          >
            <Plus className="h-5 w-5" />
            Agregar
          </button>
        </div>
      </div>

      {/* History */}
      <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-100 p-4 dark:border-gray-800">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-800 dark:text-white">
              Pesajes del dia
            </h3>
          </div>
          <span className="rounded-full bg-[#00B4A6]/10 px-3 py-1 text-sm font-bold text-[#00B4A6]">
            Total: {fmt(todayTotal)}
          </span>
        </div>

        {history.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">
            No hay pesajes registrados hoy.
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {history.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-800 dark:text-gray-200">
                    {e.product}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {e.weight.toFixed(3)} kg x {fmt(e.pricePerKg)}/kg —{" "}
                    {new Date(e.time).toLocaleTimeString("es-PE", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <span className="font-bold text-[#00B4A6]">{fmt(e.total)}</span>
                <button
                  onClick={() => removeEntry(e.id)}
                  className="ml-2 text-gray-300 hover:text-red-400 dark:text-gray-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
