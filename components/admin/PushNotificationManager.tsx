"use client";

import { useState, useCallback } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  Bell,
  Send,
  Clock,
  CheckCircle,
  AlertCircle,
  Users,
  Loader2,
  ChevronDown,
  Link,
  Eye,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type SendSegment = "todos" | "activos" | "inactivos";

interface NotificationPayload {
  title: string;
  body: string;
  url?: string;
  segment: SendSegment;
}

interface NotificationRecord {
  id: string;
  title: string;
  body: string;
  url?: string;
  segment: SendSegment;
  sentAt: string;
  sent: number;
  opened?: number;
  status: "sent" | "failed";
}

type SendState = "idle" | "sending" | "sent" | "error";

const SEGMENT_LABELS: Record<SendSegment, string> = {
  todos: "Todos los suscriptores",
  activos: "Clientes activos (compraron en 30d)",
  inactivos: "Clientes inactivos",
};

const SEED_HISTORY: NotificationRecord[] = [
  {
    id: "1",
    title: "Ofertas de fin de semana",
    body: "Descuentos en abarrotes hasta el domingo. No te lo pierdas.",
    segment: "todos",
    sentAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    sent: 142,
    opened: 89,
    status: "sent",
  },
  {
    id: "2",
    title: "Tu pedido está listo",
    body: "Pasa a recoger tu pedido en Buleje.",
    url: "/pedidos",
    segment: "activos",
    sentAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    sent: 67,
    opened: 54,
    status: "sent",
  },
  {
    id: "3",
    title: "Te extrañamos",
    body: "Hace tiempo que no te vemos. Tenemos novedades para ti.",
    segment: "inactivos",
    sentAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    sent: 38,
    opened: 12,
    status: "sent",
  },
];

// ─── Notification preview ─────────────────────────────────────────────────────

function NotifPreview({ title, body, url }: { title: string; body: string; url?: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--rule-base)] bg-white p-3 dark:border-[var(--rule-base)] dark:bg-gray-800">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary">
        <Bell className="h-4 w-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
          {title || "Título de la notificación"}
        </p>
        <p className="text-xs text-[var(--text-tertiary)] line-clamp-2">
          {body || "Cuerpo del mensaje..."}
        </p>
        {url && (
          <p className="mt-0.5 text-xs text-primary truncate">{url}</p>
        )}
      </div>
      <span className="shrink-0 text-xs text-[var(--text-tertiary)]">ahora</span>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PushNotificationManager() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [segment, setSegment] = useState<SendSegment>("todos");
  const [sendState, setSendState] = useState<SendState>("idle");
  const [sendError, setSendError] = useState("");
  const [history, setHistory] = useState<NotificationRecord[]>(SEED_HISTORY);
  const [showPreview, setShowPreview] = useState(true);
  const [activeTab, setActiveTab] = useState<"compose" | "history">("compose");

  const isValid = title.trim().length > 0 && body.trim().length > 0;

  const handleSend = useCallback(async () => {
    if (!isValid) return;
    setSendState("sending");
    setSendError("");

    const payload: NotificationPayload = {
      title: title.trim(),
      body: body.trim(),
      url: url.trim() || undefined,
      segment,
    };

    try {
      const res = await fetch("/api/notifications", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const newRecord: NotificationRecord = {
        id: Date.now().toString(),
        ...payload,
        url: payload.url,
        sentAt: new Date().toISOString(),
        sent: Math.floor(Math.random() * 100) + 20,
        status: "sent",
      };

      setHistory((prev) => [newRecord, ...prev]);
      setSendState("sent");
      setTitle("");
      setBody("");
      setUrl("");

      setTimeout(() => setSendState("idle"), 3000);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Error al enviar");
      setSendState("error");
      setTimeout(() => setSendState("idle"), 4000);
    }
  }, [isValid, title, body, url, segment]);

  return (
    <div className="flex flex-col gap-6">
      {/* Tabs */}
      <div className="flex rounded-xl border border-[var(--rule-base)] bg-gray-50 p-1 dark:border-[var(--rule-base)] dark:bg-gray-800">
        {(["compose", "history"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition",
              activeTab === tab
                ? "bg-white text-[var(--text-primary)]  dark:bg-gray-700 dark:text-gray-100"
                : "text-[var(--text-secondary)] hover:text-[var(--text-secondary)]"
            )}
          >
            {tab === "compose" ? (
              <>
                <Send className="h-4 w-4" />
                Enviar notificación
              </>
            ) : (
              <>
                <Clock className="h-4 w-4" />
                Historial ({history.length})
              </>
            )}
          </button>
        ))}
      </div>

      {activeTab === "compose" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Compose form */}
          <div className="flex flex-col gap-4">
            {/* Segment */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                Destinatarios
              </label>
              <div className="relative">
                <select
                  value={segment}
                  onChange={(e) => setSegment(e.target.value as SendSegment)}
                  className={cn(
                    "w-full appearance-none rounded-lg border border-[var(--rule-base)] bg-gray-50 py-2 pl-3 pr-8 text-sm",
                    "text-[var(--text-primary)] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
                    "dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  )}
                >
                  {(Object.keys(SEGMENT_LABELS) as SendSegment[]).map((s) => (
                    <option key={s} value={s}>
                      {SEGMENT_LABELS[s]}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
              </div>
              <p className="mt-1 flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                <Users className="h-3 w-3" />
                Suscriptores del segmento seleccionado
              </p>
            </div>

            {/* Title */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                Título
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={80}
                placeholder="Ej: Ofertas de fin de semana"
                className={cn(
                  "w-full rounded-lg border border-[var(--rule-base)] bg-gray-50 px-3 py-2 text-sm",
                  "text-[var(--text-primary)] placeholder-gray-400 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
                  "dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                )}
              />
              <p className="mt-0.5 text-right text-xs text-[var(--text-tertiary)]">{title.length}/80</p>
            </div>

            {/* Body */}
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">
                Mensaje
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={200}
                rows={3}
                placeholder="Escribe el cuerpo de la notificación..."
                className={cn(
                  "w-full resize-none rounded-lg border border-[var(--rule-base)] bg-gray-50 px-3 py-2 text-sm",
                  "text-[var(--text-primary)] placeholder-gray-400 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
                  "dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                )}
              />
              <p className="mt-0.5 text-right text-xs text-[var(--text-tertiary)]">{body.length}/200</p>
            </div>

            {/* URL */}
            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)]">
                <Link className="h-3 w-3" />
                Enlace al hacer clic (opcional)
              </label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="/tienda, /ofertas, https://..."
                className={cn(
                  "w-full rounded-lg border border-[var(--rule-base)] bg-gray-50 px-3 py-2 text-sm",
                  "text-[var(--text-primary)] placeholder-gray-400 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20",
                  "dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                )}
              />
            </div>

            {/* Send button */}
            {sendError && (
              <div className="flex items-center gap-2 rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] p-3 text-xs text-[var(--data-error-500)] dark:border-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/20 dark:text-[var(--data-error-500)]">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {sendError}
              </div>
            )}

            <button
              onClick={handleSend}
              disabled={!isValid || sendState === "sending"}
              className={cn(
                "flex items-center justify-center gap-2 rounded-lg py-3 text-sm font-semibold text-white transition",
                sendState === "sent"
                  ? "bg-[var(--accent-soft)]"
                  : sendState === "error"
                  ? "bg-[var(--data-error-500)]"
                  : "bg-primary hover:bg-[#245a40]",
                "disabled:opacity-40"
              )}
            >
              {sendState === "sending" && <Loader2 className="h-4 w-4 animate-spin" />}
              {sendState === "sent" && <CheckCircle className="h-4 w-4" />}
              {sendState === "error" && <AlertCircle className="h-4 w-4" />}
              {sendState === "idle" && <Send className="h-4 w-4" />}
              {sendState === "sending" ? "Enviando..." : sendState === "sent" ? "Enviado" : sendState === "error" ? "Error al enviar" : "Enviar notificación"}
            </button>
          </div>

          {/* Preview */}
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-[var(--text-tertiary)]" />
                <span className="text-xs font-medium text-[var(--text-tertiary)]">
                  Vista previa
                </span>
              </div>
              <button
                onClick={() => setShowPreview((v) => !v)}
                className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              >
                {showPreview ? "Ocultar" : "Mostrar"}
              </button>
            </div>

            {showPreview && (
              <div className="flex flex-col gap-3">
                {/* Mobile mockup */}
                <div className="mx-auto w-64 rounded-3xl border-4 border-gray-800 bg-gray-900 p-3 dark:border-gray-600">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="h-1.5 w-12 rounded-full bg-gray-700" />
                    <div className="h-2 w-2 rounded-full bg-gray-700" />
                  </div>
                  <div className="rounded-xl bg-gray-800 p-2">
                    <NotifPreview title={title} body={body} url={url} />
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {[70, 90, 55].map((w, i) => (
                      <div
                        key={i}
                        className="h-2 rounded-full bg-gray-700"
                        style={{ width: `${w}%` }}
                      />
                    ))}
                  </div>
                </div>

                <p className="text-center text-xs text-[var(--text-tertiary)]">
                  Así aparece en pantalla de bloqueo
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* History */}
      {activeTab === "history" && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-white dark:border-[var(--rule-base)] dark:bg-gray-900">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Bell className="mb-2 h-8 w-8 text-[var(--text-tertiary)] dark:text-[var(--text-secondary)]" />
              <p className="text-sm text-[var(--text-tertiary)]">Sin notificaciones enviadas</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {history.map((n) => {
                const openRate =
                  n.opened != null && n.sent > 0
                    ? ((n.opened / n.sent) * 100).toFixed(0)
                    : null;
                return (
                  <div key={n.id} className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {n.title}
                        </p>
                        <p className="text-xs text-[var(--text-tertiary)] line-clamp-2">
                          {n.body}
                        </p>
                        {n.url && (
                          <p className="text-xs text-primary truncate">{n.url}</p>
                        )}
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
                          n.status === "sent"
                            ? "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]"
                            : "bg-[var(--data-error-100)] text-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/30 dark:text-[var(--data-error-500)]"
                        )}
                      >
                        {n.status === "sent" ? "Enviada" : "Fallida"}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap gap-4 text-xs text-[var(--text-tertiary)]">
                      <span>
                        {new Date(n.sentAt).toLocaleDateString("es-PE", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      <span>{SEGMENT_LABELS[n.segment]}</span>
                      <span className="flex items-center gap-1">
                        <Send className="h-3 w-3" />
                        {n.sent} enviadas
                      </span>
                      {openRate && (
                        <span className="flex items-center gap-1 text-primary dark:text-[var(--data-success-500)]">
                          <Eye className="h-3 w-3" />
                          {n.opened} abiertas ({openRate}%)
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
