"use client";

import { SectionTitle } from "@buleje/design-system";
import { useState, useEffect } from "react";
import { Plus, Trash2, ToggleLeft, ToggleRight, ChevronRight, AlertTriangle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ConditionType = "stock_lt" | "price_gt" | "sales_day_gt" | "hour_eq";
type ActionType = "create_alert" | "send_whatsapp" | "create_order" | "apply_discount";

type Condition = {
  type: ConditionType;
  value: number;
};

type Action = {
  type: ActionType;
  value: string;
};

type BusinessRule = {
  id: string;
  condition: Condition;
  action: Action;
  enabled: boolean;
  createdAt: string;
};

// ── Catalogs ──────────────────────────────────────────────────────────────────

const CONDITION_OPTIONS: { value: ConditionType; label: string; unit: string; placeholder: string }[] = [
  { value: "stock_lt",      label: "Stock menor que",         unit: "unidades",  placeholder: "10" },
  { value: "price_gt",      label: "Precio mayor que",        unit: "S/",        placeholder: "100" },
  { value: "sales_day_gt",  label: "Ventas del dia mayores a", unit: "S/",       placeholder: "500" },
  { value: "hour_eq",       label: "Hora igual a",            unit: "h (0-23)",  placeholder: "18" },
];

const ACTION_OPTIONS: { value: ActionType; label: string; valuePlaceholder: string; valueLabel: string }[] = [
  { value: "create_alert",    label: "Crear alerta",               valueLabel: "Mensaje de alerta",     valuePlaceholder: "Revisar stock urgente" },
  { value: "send_whatsapp",   label: "Enviar WhatsApp",            valueLabel: "Numero de destino",     valuePlaceholder: "51987654321" },
  { value: "create_order",    label: "Crear pedido a proveedor",   valueLabel: "Proveedor",             valuePlaceholder: "Distribuidora XYZ" },
  { value: "apply_discount",  label: "Aplicar descuento",          valueLabel: "Porcentaje de descuento", valuePlaceholder: "10" },
];

const CONDITION_SUMMARY: Record<ConditionType, (v: number) => string> = {
  stock_lt:      (v) => `Stock < ${v} unidades`,
  price_gt:      (v) => `Precio > S/ ${v}`,
  sales_day_gt:  (v) => `Ventas del dia > S/ ${v}`,
  hour_eq:       (v) => `Hora = ${v}:00`,
};

const ACTION_SUMMARY: Record<ActionType, (v: string) => string> = {
  create_alert:   (v) => `Crear alerta: "${v}"`,
  send_whatsapp:  (v) => `WhatsApp a ${v}`,
  create_order:   (v) => `Pedido a ${v}`,
  apply_discount: (v) => `Descuento del ${v}%`,
};

const ACTION_COLOR: Record<ActionType, string> = {
  create_alert:   "bg-[var(--data-warning-100)] text-[var(--data-warning)] dark:bg-[var(--data-warning)]/30 dark:text-[var(--data-warning)]",
  send_whatsapp:  "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",
  create_order:   "bg-[var(--accent-soft)] text-[var(--data-success)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success)]",
  apply_discount: "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
};

const STORAGE_KEY = "buleje_business_rules";
const MAX_RULES = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadRules(): BusinessRule[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BusinessRule[]) : [];
  } catch {
    return [];
  }
}

function saveRules(rules: BusinessRule[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

// ── Empty form state ──────────────────────────────────────────────────────────

const emptyForm = () => ({
  conditionType: "stock_lt" as ConditionType,
  conditionValue: "",
  actionType: "create_alert" as ActionType,
  actionValue: "",
});

// ── Component ─────────────────────────────────────────────────────────────────

export default function BusinessRuleBuilder() {
  const [rules, setRules] = useState<BusinessRule[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setRules(loadRules());
  }, []);

  const persist = (next: BusinessRule[]) => {
    setRules(next);
    saveRules(next);
  };

  const validate = () => {
    const e: Record<string, string> = {};
    const cv = Number(form.conditionValue);
    if (!form.conditionValue.trim() || isNaN(cv)) e.conditionValue = "Ingresa un numero valido";
    if (form.conditionType === "hour_eq" && (cv < 0 || cv > 23)) e.conditionValue = "La hora debe estar entre 0 y 23";
    if (!form.actionValue.trim()) e.actionValue = "Este campo es obligatorio";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleAdd = () => {
    if (!validate()) return;
    const rule: BusinessRule = {
      id: `rule_${Date.now()}`,
      condition: { type: form.conditionType, value: Number(form.conditionValue) },
      action:    { type: form.actionType,    value: form.actionValue.trim() },
      enabled:   true,
      createdAt: new Date().toISOString(),
    };
    persist([...rules, rule]);
    setForm(emptyForm());
    setErrors({});
    setShowForm(false);
  };

  const handleToggle = (id: string) => {
    persist(rules.map(r => r.id === id ? { ...r, enabled: !r.enabled } : r));
  };

  const handleDelete = (id: string) => {
    persist(rules.filter(r => r.id !== id));
  };

  const conditionMeta = CONDITION_OPTIONS.find(o => o.value === form.conditionType)!;
  const actionMeta    = ACTION_OPTIONS.find(o => o.value === form.actionType)!;
  const atLimit       = rules.length >= MAX_RULES;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-lg font-semibold text-[var(--text-primary)]">Constructor de Reglas</SectionTitle>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
            Automatiza acciones segun condiciones del negocio ({rules.length}/{MAX_RULES})
          </p>
        </div>
        <button
          onClick={() => { setShowForm(true); setForm(emptyForm()); setErrors({}); }}
          disabled={atLimit || showForm}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors",
            atLimit || showForm
              ? "bg-gray-100 text-[var(--text-tertiary)] dark:bg-gray-800 dark:text-[var(--text-secondary)] cursor-not-allowed"
              : "bg-[#00B4A6] text-white hover:bg-[#245a41]"
          )}
        >
          <Plus className="w-4 h-4" />
          Nueva regla
        </button>
      </div>

      {atLimit && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--data-warning-50)] dark:bg-[var(--data-warning)]/20 border border-[var(--data-warning)] dark:border-[var(--data-warning)] text-[var(--data-warning)] dark:text-[var(--data-warning)] text-sm">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Limite de {MAX_RULES} reglas alcanzado. Elimina una para agregar otra.
        </div>
      )}

      {/* Form */}
      {showForm && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-5  space-y-5">
          <p className="text-sm font-semibold text-[var(--text-secondary)]">Nueva regla automatica</p>

          {/* Condition row */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--text-tertiary)]">SI...</p>
            <div className="flex flex-wrap gap-3">
              <select
                value={form.conditionType}
                onChange={e => setForm(f => ({ ...f, conditionType: e.target.value as ConditionType, conditionValue: "" }))}
                className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40"
              >
                {CONDITION_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <div className="flex-1 min-w-[140px] space-y-1">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={form.conditionValue}
                    onChange={e => setForm(f => ({ ...f, conditionValue: e.target.value }))}
                    placeholder={conditionMeta.placeholder}
                    className={cn(
                      "w-full px-3 py-2 rounded-lg border bg-white dark:bg-card text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40",
                      errors.conditionValue ? "border-[var(--data-error)] dark:border-[var(--data-error)]" : "border-[var(--rule-base)] dark:border-card-border"
                    )}
                  />
                  <span className="text-xs text-[var(--text-tertiary)] whitespace-nowrap">{conditionMeta.unit}</span>
                </div>
                {errors.conditionValue && <p className="text-xs text-[var(--data-error)]">{errors.conditionValue}</p>}
              </div>
            </div>
          </div>

          {/* Action row */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-[var(--text-tertiary)]">ENTONCES...</p>
            <div className="flex flex-wrap gap-3">
              <select
                value={form.actionType}
                onChange={e => setForm(f => ({ ...f, actionType: e.target.value as ActionType, actionValue: "" }))}
                className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-card text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40"
              >
                {ACTION_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <div className="flex-1 min-w-[200px] space-y-1">
                <input
                  type="text"
                  value={form.actionValue}
                  onChange={e => setForm(f => ({ ...f, actionValue: e.target.value }))}
                  placeholder={actionMeta.valuePlaceholder}
                  className={cn(
                    "w-full px-3 py-2 rounded-lg border bg-white dark:bg-card text-[var(--text-primary)] text-sm focus:outline-none focus:ring-2 focus:ring-[#00B4A6]/40",
                    errors.actionValue ? "border-[var(--data-error)] dark:border-[var(--data-error)]" : "border-[var(--rule-base)] dark:border-card-border"
                  )}
                />
                {errors.actionValue && <p className="text-xs text-[var(--data-error)]">{errors.actionValue}</p>}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => { setShowForm(false); setErrors({}); }}
              className="px-4 py-2 rounded-lg text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleAdd}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-[#00B4A6] text-white hover:bg-[#245a41] transition-colors"
            >
              Guardar regla
            </button>
          </div>
        </div>
      )}

      {/* Rules list */}
      {rules.length === 0 && !showForm && (
        <div className="text-center py-16 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]">
          <p className="text-sm">Sin reglas configuradas.</p>
          <p className="text-xs mt-1">Crea la primera para automatizar acciones.</p>
        </div>
      )}

      <div className="space-y-3">
        {rules.map(rule => (
          <div
            key={rule.id}
            className={cn(
              "bg-white dark:bg-card border rounded-xl p-4  transition-opacity",
              rule.enabled ? "border-[var(--rule-base)] dark:border-card-border" : "border-[var(--rule-soft)] dark:border-card-border/50 opacity-60"
            )}
          >
            <div className="flex flex-wrap items-center gap-3">
              {/* Condition */}
              <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                <span className="px-2.5 py-1 rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)] text-xs font-medium">
                  SI
                </span>
                <span className="text-sm text-[var(--text-secondary)]">
                  {CONDITION_SUMMARY[rule.condition.type](rule.condition.value)}
                </span>
              </div>

              <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)] shrink-0" />

              {/* Action */}
              <div className="flex items-center gap-2 flex-1 min-w-[180px]">
                <span className="px-2.5 py-1 rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)] text-xs font-medium">
                  ENTONCES
                </span>
                <span className={cn("px-2.5 py-1 rounded-lg text-xs font-medium", ACTION_COLOR[rule.action.type])}>
                  {ACTION_SUMMARY[rule.action.type](rule.action.value)}
                </span>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2 ml-auto">
                <button
                  onClick={() => handleToggle(rule.id)}
                  title={rule.enabled ? "Desactivar" : "Activar"}
                  className="text-[var(--text-tertiary)] hover:text-[#00B4A6] dark:hover:text-[#4a9e78] transition-colors"
                >
                  {rule.enabled
                    ? <ToggleRight className="w-5 h-5 text-[#00B4A6] dark:text-[#4a9e78]" />
                    : <ToggleLeft className="w-5 h-5" />
                  }
                </button>
                <button
                  onClick={() => handleDelete(rule.id)}
                  title="Eliminar"
                  className="text-[var(--text-tertiary)] hover:text-[var(--data-error)] dark:hover:text-[var(--data-error)] transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            <p className="text-xs text-[var(--text-tertiary)] dark:text-[var(--text-secondary)] mt-2">
              Creada {new Date(rule.createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" })}
              {!rule.enabled && " — Inactiva"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
