"use client";

import { SectionTitle } from "@buleje/design-system";

/* eslint-disable react-hooks/set-state-in-effect, react-hooks/purity */

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Edit3, Save, X, Tag } from "@buleje/design-system/icons";

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
    <div className="p-4 rounded-xl border-2 border-primary/30 bg-primary/5 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
            Nombre del producto
          </label>
          <input
            value={form.productName}
            onChange={(e) => set("productName", e.target.value)}
            placeholder="Ej: Arroz Costeño 5kg"
            className="w-full rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
            Precio normal (S/)
          </label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={form.basePrice}
            onChange={(e) => set("basePrice", Number(e.target.value))}
            className="w-full rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
            Unidad
          </label>
          <input
            value={form.unit}
            onChange={(e) => set("unit", e.target.value)}
            placeholder="bolsa, caja, unidad..."
            className="w-full rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
            A partir de (cantidad)
          </label>
          <input
            type="number"
            min={2}
            value={form.discountQty}
            onChange={(e) => set("discountQty", Number(e.target.value))}
            className="w-full rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-[var(--text-secondary)] mb-1">
            Precio con descuento (S/)
          </label>
          <input
            type="number"
            min={0}
            step={0.5}
            value={form.discountPrice}
            onChange={(e) => set("discountPrice", Number(e.target.value))}
            className="w-full rounded-lg border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
          />
        </div>
      </div>
      {valid && (
        <p className="text-xs text-primary font-medium">
          Regla: {form.productName} — 1 {form.unit} a {fmt(form.basePrice)},{" "}
          {form.discountQty}+ {form.unit}s a {fmt(form.discountPrice)} c/u
        </p>
      )}
      <div className="flex gap-2">
        <button
          onClick={() => valid && onSave(form)}
          disabled={!valid}
          className="flex-1 py-2.5 rounded-lg bg-primary text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          Guardar regla
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2.5 rounded-lg border border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-gray-50"
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
    <div className="bg-white dark:bg-[var(--color-card)] rounded-xl border border-[var(--rule-base)] overflow-hidden ">
      {/* Header */}
      <div className="p-5 border-b border-[var(--rule-soft)] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-secondary/10">
            <Tag className="w-5 h-5 text-secondary" />
          </div>
          <div>
            <SectionTitle className="font-bold text-[var(--text-primary)]">Descuento por volumen</SectionTitle>
            <p className="text-xs text-[var(--text-secondary)]">
              {rules.length} regla{rules.length !== 1 ? "s" : ""} configurada{rules.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-primary text-white text-sm font-semibold"
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
          <p className="text-sm text-[var(--text-secondary)] text-center py-8">
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
                className="flex items-center justify-between gap-3 p-4 rounded-xl bg-gray-50 border border-[var(--rule-soft)]"
              >
                <div className="min-w-0">
                  <p className="font-semibold text-[var(--text-primary)] text-sm truncate">
                    {rule.productName}
                  </p>
                  <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                    1 {rule.unit}: {fmt(rule.basePrice)} — {rule.discountQty}+ {rule.unit}s:{" "}
                    <span className="text-primary font-semibold">
                      {fmt(rule.discountPrice)} c/u
                    </span>
                  </p>
                  <p className="text-xs text-secondary font-medium mt-0.5">
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
                    className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
                    aria-label="Editar"
                  >
                    <Edit3 className="w-4 h-4 text-[var(--text-secondary)]" />
                  </button>
                  <button
                    onClick={() => deleteRule(rule.id)}
                    className="p-2 rounded-lg hover:bg-[var(--data-error-50)] transition-colors"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="w-4 h-4 text-[var(--data-error-500)]" />
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
