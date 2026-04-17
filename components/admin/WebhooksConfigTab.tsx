"use client";

import React, { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Send, CheckCircle, XCircle, Loader2, Webhook } from "lucide-react";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type WebhookEvent = "new_order" | "low_stock" | "new_customer" | "payment";

interface WebhookConfig {
  id: string;
  url: string;
  events: WebhookEvent[];
  active: boolean;
  createdAt: string;
}

const EVENT_LABELS: Record<WebhookEvent, string> = {
  new_order:    "Nuevo pedido",
  low_stock:    "Stock bajo",
  new_customer: "Cliente nuevo",
  payment:      "Pago recibido",
};

const EVENT_COLORS: Record<WebhookEvent, string> = {
  new_order:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
  low_stock:    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  new_customer: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  payment:      "bg-[var(--surface-sunken)] text-[var(--text-primary)]",
};

const ALL_EVENTS: WebhookEvent[] = ["new_order", "low_stock", "new_customer", "payment"];

// ── Estado del test ───────────────────────────────────────────────────────────

type TestState = "idle" | "loading" | "ok" | "error";

// ── Componente principal ──────────────────────────────────────────────────────

export function WebhooksConfigTab() {
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Estado del formulario
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<WebhookEvent[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  // Estado de test por webhook id
  const [testStates, setTestStates] = useState<Record<string, TestState>>({});

  const fetchWebhooks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/webhooks/config");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { webhooks: WebhookConfig[] };
      setWebhooks(data.webhooks ?? []);
    } catch (e) {
      setError("Error al cargar webhooks: " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchWebhooks();
  }, [fetchWebhooks]);

  const toggleEvent = (event: WebhookEvent) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!url.trim()) {
      setFormError("La URL es requerida.");
      return;
    }
    if (selectedEvents.length === 0) {
      setFormError("Selecciona al menos un evento.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/webhooks/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), events: selectedEvents, active: true }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }

      setUrl("");
      setSelectedEvents([]);
      await fetchWebhooks();
    } catch (err) {
      setFormError("Error al crear: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este webhook?")) return;
    try {
      const res = await fetch("/api/webhooks/config", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await fetchWebhooks();
    } catch (err) {
      setError("Error al eliminar: " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleTest = async (webhook: WebhookConfig) => {
    setTestStates((prev) => ({ ...prev, [webhook.id]: "loading" }));
    try {
      const res = await fetch(webhook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "ping",
          timestamp: new Date().toISOString(),
          data: { message: "Test desde Buleje" },
        }),
        signal: AbortSignal.timeout(5_000),
      });
      setTestStates((prev) => ({ ...prev, [webhook.id]: res.ok ? "ok" : "error" }));
    } catch {
      setTestStates((prev) => ({ ...prev, [webhook.id]: "error" }));
    }
    // Resetear icono tras 3 segundos
    setTimeout(() => {
      setTestStates((prev) => ({ ...prev, [webhook.id]: "idle" }));
    }, 3_000);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <Webhook className="h-5 w-5 text-green-600 dark:text-green-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Webhooks configurables
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Recibe notificaciones en tu servidor cuando ocurran eventos en la tienda.
          </p>
        </div>
      </div>

      {/* Formulario de creacion */}
      <form
        onSubmit={handleCreate}
        className="bg-white dark:bg-gray-900 border border-[var(--rule-base)] rounded-xl p-5 space-y-4"
      >
        <h3 className="font-medium text-gray-800 dark:text-gray-200 text-sm">
          Agregar nuevo webhook
        </h3>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            URL del endpoint
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://mi-servidor.com/webhook"
            className="w-full px-3 py-2 text-sm border border-[var(--rule-base)] rounded-lg bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
            Eventos a escuchar
          </label>
          <div className="flex flex-wrap gap-2">
            {ALL_EVENTS.map((event) => (
              <button
                key={event}
                type="button"
                onClick={() => toggleEvent(event)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  selectedEvents.includes(event)
                    ? "border-green-600 bg-green-600 text-white"
                    : "border-[var(--rule-base)] text-gray-600 dark:text-gray-400 hover:border-green-400"
                }`}
              >
                {EVENT_LABELS[event]}
              </button>
            ))}
          </div>
        </div>

        {formError && (
          <p className="text-xs text-red-600 dark:text-red-400">{formError}</p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-lg transition-colors"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Crear webhook
        </button>
      </form>

      {/* Lista de webhooks */}
      <div className="space-y-3">
        {loading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
          </div>
        )}

        {!loading && error && (
          <p className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-xl p-3">
            {error}
          </p>
        )}

        {!loading && !error && webhooks.length === 0 && (
          <div className="text-center py-10 text-gray-400 dark:text-gray-600">
            <Webhook className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No hay webhooks configurados.</p>
          </div>
        )}

        {webhooks.map((webhook) => {
          const testState = testStates[webhook.id] ?? "idle";
          return (
            <div
              key={webhook.id}
              className="bg-white dark:bg-gray-900 border border-[var(--rule-base)] rounded-xl p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-mono text-gray-800 dark:text-gray-200 truncate">
                    {webhook.url}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Creado: {new Date(webhook.createdAt).toLocaleDateString("es-PE")}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {/* Boton test */}
                  <button
                    onClick={() => handleTest(webhook)}
                    disabled={testState === "loading"}
                    title="Enviar ping de prueba"
                    className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    {testState === "loading" && <Loader2 className="h-4 w-4 animate-spin" />}
                    {testState === "ok"      && <CheckCircle className="h-4 w-4 text-green-500" />}
                    {testState === "error"   && <XCircle className="h-4 w-4 text-red-500" />}
                    {testState === "idle"    && <Send className="h-4 w-4" />}
                  </button>
                  {/* Boton eliminar */}
                  <button
                    onClick={() => handleDelete(webhook.id)}
                    title="Eliminar webhook"
                    className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Badges de eventos */}
              <div className="flex flex-wrap gap-1.5">
                {webhook.events.map((event) => (
                  <span
                    key={event}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${EVENT_COLORS[event]}`}
                  >
                    {EVENT_LABELS[event]}
                  </span>
                ))}
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    webhook.active
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500"
                  }`}
                >
                  {webhook.active ? "Activo" : "Inactivo"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default WebhooksConfigTab;
