"use client";

import { CardTitle } from "@buleje/design-system";
import { useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";

interface NotifConfig {
  notifyWhatsApp: boolean;
  notifyEmail: boolean;
  notifyUrgent: boolean;
}

interface DeliveryPartnerRow {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  notes?: string | null;
}

interface Props {
  partner: DeliveryPartnerRow;
  onSaved?: (updated: DeliveryPartnerRow) => void;
}

function parseConfig(notes: string | null | undefined): NotifConfig {
  if (!notes) return { notifyWhatsApp: true, notifyEmail: true, notifyUrgent: true };
  try {
    const parsed = JSON.parse(notes) as Partial<NotifConfig>;
    return {
      notifyWhatsApp: parsed.notifyWhatsApp ?? true,
      notifyEmail: parsed.notifyEmail ?? true,
      notifyUrgent: parsed.notifyUrgent ?? true,
    };
  } catch {
    return { notifyWhatsApp: true, notifyEmail: true, notifyUrgent: true };
  }
}

export default function DeliveryNotificationSettings({ partner, onSaved }: Props) {
  const [config, setConfig] = useState<NotifConfig>(() => parseConfig(partner.notes));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(key: keyof NotifConfig) {
    setConfig((prev) => ({ ...prev, [key]: !prev[key] }));
    setSaved(false);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/delivery/partners`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ id: partner.id, notes: JSON.stringify(config) }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? "Error al guardar");
      }
      const updated = (await res.json()) as DeliveryPartnerRow;
      setSaved(true);
      onSaved?.(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error inesperado");
    } finally {
      setSaving(false);
    }
  }

  const options: { key: keyof NotifConfig; label: string; description: string }[] = [
    {
      key: "notifyWhatsApp",
      label: "WhatsApp al asignar pedido",
      description: "Envia mensaje al repartidor cuando se le asigna un pedido nuevo",
    },
    {
      key: "notifyEmail",
      label: "Email resumen diario",
      description: "Envia un correo con el resumen de pedidos del dia",
    },
    {
      key: "notifyUrgent",
      label: "Alerta de pedido urgente",
      description: "Notifica cuando hay un pedido marcado como urgente",
    },
  ];

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 space-y-4">
      <div>
        <CardTitle className="font-semibold text-[var(--text-primary)] text-base">
          Notificaciones — {partner.name}
        </CardTitle>
        <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
          Configura que alertas recibe este repartidor
        </p>
      </div>

      <div className="space-y-3">
        {options.map((opt) => (
          <label
            key={opt.key}
            className="flex items-start gap-3 cursor-pointer group"
          >
            <div className="relative flex-shrink-0 mt-0.5">
              <input
                type="checkbox"
                checked={config[opt.key]}
                onChange={() => toggle(opt.key)}
                className="sr-only"
              />
              <div
                className={`w-10 h-6 rounded-full transition-colors duration-[var(--dur-base)] ${
                  config[opt.key]
                    ? "bg-primary"
                    : "bg-gray-300 dark:bg-gray-600"
                }`}
                onClick={() => toggle(opt.key)}
              >
                <div
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-transform duration-[var(--dur-base)] ${
                    config[opt.key] ? "translate-x-5" : "translate-x-1"
                  }`}
                />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)]">
                {opt.label}
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">
                {opt.description}
              </p>
            </div>
          </label>
        ))}
      </div>

      {error && (
        <p className="text-sm text-[var(--data-error-500)] dark:text-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/20 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {saved && (
        <p className="text-sm text-[var(--data-success-500)] dark:text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] rounded-lg px-3 py-2">
          Configuracion guardada correctamente
        </p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full py-2 px-4 rounded-lg bg-primary hover:bg-primary-dark text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? "Guardando..." : "Guardar configuracion"}
      </button>
    </div>
  );
}
