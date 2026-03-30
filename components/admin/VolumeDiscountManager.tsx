 
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/purity */
"use client";

import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Edit3, Save, X, Tag } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface VolumeRule {
  id: string;
  productName: string;
  baseQty: number;
  basePrice: number;
  discountQty: number;
  discountPrice: number;
  unit: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "volume_discount_rules";

const EMPTY_RULE: Omit<VolumeRule, "id"> = {
  productName: "",
  baseQty: 1,
  basePrice: 0,
  discountQty: 3,
  discountPrice: 0,
  unit: "bolsa",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return `S/${n.toLocaleString("es-PE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function loadRules(): VolumeRule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : getDefaultRules();
  } catch {
    return getDefaultRules();
  }
}

function getDefaultRules(): VolumeRule[] {
  return [
    {
      id: "1",
      productName: "Arroz Costeño",
      baseQty: 1,
      basePrice: 19,
      discountQty: 3,
      discountPrice: 17,
      unit: "bolsa",
    },
    {
      id: "2",
      productName: "Aceite Primor",
      baseQty: 1,
      basePrice: 8.5,
      discountQty: 6,
      discountPrice: 7.5,
      unit: "unidad",
    },
  ];
}

export function applyVolumeDiscount(
  rules: VolumeRule[],
  productName: string,
  qty: number
): number | null {
  const rule = rules.find(
    (r) => r.productName.toLowerCase() === productName.toLowerCase()
  );
  if (!rule) return null;
  if (qty >= rule.discountQty) return rule.discountPrice;
  return null;
}

// ── Form ──────────────────────────────────────────────────────────────────────

interface RuleFormProps {
  initial?: Partial<VolumeRule>;
  onSave: (rule: Omit<VolumeRule, "id">) => void;
  onCancel: () => void;
}

function RuleForm({ initial, onSave, onCancel }: RuleFormProps) {
  const [form, setForm] = useState<Omit<VolumeRule, "id">>({
    ...EMPTY_RULE,
    ...initial,
  });

  const set = useCallback(
    (key: keyof Omit<VolumeRule, "id">, value: string | number) => {
      setForm((p) => ({ ...p, [key]: value }));
    },
    []
  );

  const valid =
    form.productName.trim().length > 0 &&
    form.basePrice > 0 &&
    form.discountPrice > 0 &&
    form.discountQty > form.baseQty;

  return (
    <div className="p-4 rounded-2xl border-2 border-[#0f766e]/30 bg-[#0f766e]/5 dark:bg-[#0f766e]/10 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            Nombre del producto
          </label>
          <input
            value={form.productName}
            onChange={(e) => set("productName", e.target.value)}
            placeholder="Ej: Arroz Costeño 5kg"
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:border-[#0f766e]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            Precio normal (S/)
          </label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={form.basePrice}
            onChange={(e) => set("basePrice", Number(e.target.value))}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:border-[#0f766e]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            Unidad
          </label>
          <input
            value={form.unit}
            onChange={(e) => set("unit", e.target.value)}
            placeholder="bolsa, caja, unidad..."
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:border-[#0f766e]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            A partir de (cantidad)
          </label>
          <input
            type="number"
            min={2}
            value={form.discountQty}
            onChange={(e) => set("discountQty", Number(e.target.value))}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:border-[#0f766e]"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">
            Precio con descuento (S/)
          </label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={form.discountPrice}
            onChange={(e) => set("discountPrice", Number(e.target.value))}
            className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-sm text-gray-900 dark:text-white outline-none focus:border-[#0f766e]"
          />
        </div>
      </div>
      {valid && (
        <p className="text-xs text-[#0f766e] dark:text-[#14b8a6] font-medium">
          Regla: {form.productName} — 1 {form.unit} a {fmt(form.basePrice)},{" "}
          {form.discountQty}+ {form.unit}s a {fmt(form.discountPrice)} c/u
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => valid && onSave(form)}
          disabled={!valid}
          className="flex-1 py-2.5 rounded-xl bg-[#0f766e] text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          Guardar regla
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function VolumeDiscountManager() {
  const [rules, setRules] = useState<VolumeRule[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    setRules(loadRules());
  }, []);

  const persist = useCallback((updated: VolumeRule[]) => {
    setRules(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  }, []);

  const addRule = useCallback(
    (rule: Omit<VolumeRule, "id">) => {
      persist([...rules, { ...rule, id: Date.now().toString() }]);
      setShowForm(false);
    },
    [rules, persist]
  );

  const updateRule = useCallback(
    (id: string, rule: Omit<VolumeRule, "id">) => {
      persist(rules.map((r) => (r.id === id ? { ...rule, id } : r)));
      setEditingId(null);
    },
    [rules, persist]
  );

  const deleteRule = useCallback(
    (id: string) => {
      persist(rules.filter((r) => r.id !== id));
    },
    [rules, persist]
  );

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="p-5 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[#f97316]/10">
            <Tag className="w-5 h-5 text-[#f97316]" />
          </div>
          <div>
            <h2 className="font-bold text-gray-900 dark:text-white">Descuento por volumen</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {rules.length} regla{rules.length !== 1 ? "s" : ""} configurada{rules.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#0f766e] text-white text-sm font-semibold"
          >
            <Plus className="w-4 h-4" />
            Nueva regla
          </button>
        )}
      </div>

      <div className="p-4 space-y-3">
        {showForm && (
          <RuleForm onSave={addRule} onCancel={() => setShowForm(false)} />
        )}

        {rules.length === 0 && !showForm ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
            No hay reglas de descuento por volumen.
            <br />
            Agrega una para comenzar.
          </p>
        ) : (
          rules.map((rule) =>
            editingId === rule.id ? (
              <RuleForm
                key={rule.id}
                initial={rule}
                onSave={(r) => updateRule(rule.id, r)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <div
                key={rule.id}
                className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                    {rule.productName}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    1 {rule.unit}: {fmt(rule.basePrice)} — {rule.discountQty}+ {rule.unit}s:{" "}
                    <span className="text-[#0f766e] dark:text-[#14b8a6] font-semibold">
                      {fmt(rule.discountPrice)} c/u
                    </span>
                  </p>
                  <p className="text-xs text-[#f97316] font-medium mt-0.5">
                    Ahorro:{" "}
                    {fmt(
                      (rule.basePrice - rule.discountPrice) * rule.discountQty
                    )}{" "}
                    al comprar {rule.discountQty}+
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => setEditingId(rule.id)}
                    className="p-2 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    aria-label="Editar"
                  >
                    <Edit3 className="w-4 h-4 text-gray-500" />
                  </button>
                  <button
                    onClick={() => deleteRule(rule.id)}
                    className="p-2 rounded-xl hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </button>
                </div>
              </div>
            )
          )
        )}
      </div>
    </div>
  );
}
