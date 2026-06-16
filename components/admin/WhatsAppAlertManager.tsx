"use client";

import { SectionTitle } from "@buleje/design-system";



import { useState, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { MessageCircle, Bell, BellOff, Eye, Clock, Save } from "@buleje/design-system/icons";
import { Field } from "@/components/admin/shared/Field";

// ── Types ─────────────────────────────────────────────────────────────────────

type AlertType = "bigSale" | "stockOut" | "goalMet" | "newCredit";

interface AlertConfig {
  bigSale: boolean;
  bigSaleThreshold: number;
  stockOut: boolean;
  goalMet: boolean;
  newCredit: boolean;
  phone: string;
}

interface AlertHistory {
  id: string;
  type: AlertType;
  message: string;
  sentAt: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "wa_alert_config";
const HISTORY_KEY = "wa_alert_history";

const DEFAULT_CONFIG: AlertConfig = {
  bigSale: true,
  bigSaleThreshold: 200,
  stockOut: true,
  goalMet: true,
  newCredit: false,
  phone: "51999999999",
};

const ALERT_META: Record<AlertType, { label: string; description: string }> = {
  bigSale: {
    label: "Venta grande",
    description: "Cuando una venta supera el monto configurado",
  },
  stockOut: {
    label: "Stock agotado",
    description: "Cuando un producto llega a cero",
  },
  goalMet: {
    label: "Meta cumplida",
    description: "Cuando se alcanza la meta diaria de ventas",
  },
  newCredit: {
    label: "Fiado nuevo",
    description: "Cuando se registra un nuevo credito a cliente",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildPreview(type: AlertType, config: AlertConfig): string {
  const now = new Date().toLocaleString("es-PE");
  switch (type) {
    case "bigSale":
      return `[BODEGA] Venta grande registrada: S/${config.bigSaleThreshold}.00+ a las ${now}. Revisar caja.`;
    case "stockOut":
      return `[BODEGA] ALERTA: "Arroz Costeño 5kg" se agoto. Stock: 0 unidades. ${now}`;
    case "goalMet":
      return `[BODEGA] Meta del dia CUMPLIDA. Ventas totales: S/3,000.00. ${now}`;
    case "newCredit":
      return `[BODEGA] Nuevo fiado registrado: "Juan Perez" — S/45.00. ${now}`;
  }
}

function loadConfig(): AlertConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? { ...DEFAULT_CONFIG, ...JSON.parse(raw) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

function loadHistory(): AlertHistory[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// ── Toggle row ────────────────────────────────────────────────────────────────

interface ToggleRowProps {
  alertType: AlertType;
  enabled: boolean;
  onToggle: () => void;
  onPreview: () => void;
}

function ToggleRow({ alertType, enabled, onToggle, onPreview }: ToggleRowProps) {
  const meta = ALERT_META[alertType];
  return (
    <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-[var(--surface-sunken)]/50 border border-[var(--rule-base)]">
      <div className="flex items-center gap-3 min-w-0">
        {enabled ? (
          <Bell className="w-4 h-4 text-primary flex-shrink-0" />
        ) : (
          <BellOff className="w-4 h-4 text-[var(--text-tertiary)] flex-shrink-0" />
        )}
        <div className="min-w-0">
          <p className="font-semibold text-[var(--text-primary)] text-sm">{meta.label}</p>
          <p className="text-xs text-[var(--text-tertiary)] truncate">{meta.description}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onPreview}
          className="p-1.5 rounded-lg hover:bg-[var(--rule-soft)] dark:hover:bg-gray-700 transition-colors"
          title="Ver preview"
        >
          <Eye className="w-4 h-4 text-[var(--text-secondary)]" />
        </button>
        <button
          role="switch"
          aria-checked={enabled}
          onClick={onToggle}
          className={cn(
            "relative w-11 h-6 rounded-full transition-colors flex-shrink-0",
            enabled ? "bg-primary" : "bg-[var(--rule-base)] dark:bg-gray-600"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 left-0.5 w-5 h-5 bg-white dark:bg-[var(--color-card)] rounded-full shadow transition-transform",
              enabled && "translate-x-5"
            )}
          />
        </button>
      </div>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function WhatsAppAlertManager() {
  const [config, setConfig] = useState<AlertConfig>(DEFAULT_CONFIG);
  const [history, setHistory] = useState<AlertHistory[]>([]);
  const [previewType, setPreviewType] = useState<AlertType | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setConfig(loadConfig());
    setHistory(loadHistory());
  }, []);

  const save = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }, [config]);

  const toggle = useCallback((key: keyof Omit<AlertConfig, "bigSaleThreshold" | "phone">) => {
    setConfig((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const addToHistory = useCallback((type: AlertType) => {
    const entry: AlertHistory = {
      id: Date.now().toString(),
      type,
      message: buildPreview(type, config),
      sentAt: new Date().toISOString(),
    };
    const next = [entry, ...history].slice(0, 20);
    setHistory(next);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  }, [config, history]);

  const alertTypes: AlertType[] = ["bigSale", "stockOut", "goalMet", "newCredit"];

  return (
    <div className="bg-[var(--surface-raised)] rounded-xl border border-[var(--rule-base)] overflow-hidden ">
      {/* Header */}
      <div className="p-5 border-b border-[var(--rule-base)] flex items-center gap-3">
        <div className="p-2 rounded-xl bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]">
          <MessageCircle className="w-5 h-5 text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" />
        </div>
        <div>
          <SectionTitle className="font-bold text-[var(--text-primary)]">Alertas por WhatsApp</SectionTitle>
          <p className="text-xs text-[var(--text-tertiary)]">
            Notificaciones automaticas al dueno
          </p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Phone */}
        <Field label="Número WhatsApp del dueno" labelClassName="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
          <input
            type="tel"
            value={config.phone}
            onChange={(e) => setConfig((p) => ({ ...p, phone: e.target.value }))}
            placeholder="51999999999"
            className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
          />
        </Field>

        {/* Big sale threshold */}
        <Field label="Monto mínimo para alerta de venta grande (S/)" labelClassName="block text-xs font-semibold text-[var(--text-secondary)] mb-1.5">
          <input
            type="number"
            min={10}
            value={config.bigSaleThreshold}
            onChange={(e) =>
              setConfig((p) => ({ ...p, bigSaleThreshold: Number(e.target.value) }))
            }
            className="w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-primary"
          />
        </Field>

        {/* Toggles */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[var(--text-secondary)]">
            Tipos de alerta
          </p>
          {alertTypes.map((type) => {
            const configKey = type as keyof Omit<AlertConfig, "bigSaleThreshold" | "phone">;
            return (
              <ToggleRow
                key={type}
                alertType={type}
                enabled={!!config[configKey]}
                onToggle={() => toggle(configKey)}
                onPreview={() =>
                  setPreviewType((p) => (p === type ? null : type))
                }
              />
            );
          })}
        </div>

        {/* Preview */}
        {previewType && (
          <div className="rounded-xl bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 p-4">
            <p className="text-xs font-semibold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mb-2">
              Preview del mensaje
            </p>
            <p className="text-sm text-[var(--text-secondary)] font-mono leading-relaxed">
              {buildPreview(previewType, config)}
            </p>
            <button
              onClick={() => {
                addToHistory(previewType);
                setPreviewType(null);
              }}
              className="mt-3 text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)] font-semibold hover:underline flex items-center gap-1"
            >
              <MessageCircle className="w-3 h-3" />
              Simular envio
            </button>
          </div>
        )}

        {/* Save */}
        <button
          onClick={save}
          className={cn(
            "w-full py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors",
            saved
              ? "bg-primary text-white"
              : "bg-primary/10 text-primary dark:text-primary hover:bg-primary/20"
          )}
        >
          <Save className="w-4 h-4" />
          {saved ? "Guardado" : "Guardar configuracion"}
        </button>

        {/* History */}
        {history.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-[var(--text-secondary)] mb-2">
              Historial de alertas
            </p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {history.map((h) => (
                <div
                  key={h.id}
                  className="flex items-start gap-2 p-3 rounded-xl bg-[var(--surface-sunken)]/50 border border-[var(--rule-base)]"
                >
                  <Clock className="w-3.5 h-3.5 text-[var(--text-tertiary)] flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs text-[var(--text-primary)] font-medium">
                      {ALERT_META[h.type].label}
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)] truncate">
                      {new Date(h.sentAt).toLocaleString("es-PE")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
