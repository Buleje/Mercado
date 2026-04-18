"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  Unlock,
  AlertTriangle,
  RefreshCw,
  Globe,
  Clock,
  Ban,
} from "lucide-react";
import { StatCard } from "@buleje/design-system";

interface SecurityEvent {
  id: string;
  action: string;
  detail: string;
  ipAddress: string | null;
  createdAt: string;
}

interface SecurityData {
  events: SecurityEvent[];
  summary: Record<string, number>;
  uniqueIPs: number;
  suspiciousIPs: { ip: string; failedAttempts: number }[];
  period: { days: number; since: string };
}

// Ola 3 — Iconos del timeline:
//   Eventos rutinarios (login_success, 2fa_challenge, logout) → gris neutral.
//   Eventos criticos (login_failed, login_locked, 2fa_failed) → semaforo
//   porque son senales genuinas que requieren atencion del operador.
const ACTION_CONFIG: Record<string, { label: string; icon: typeof Shield; color: string; bg: string }> = {
  login_success: { label: "Login exitoso", icon: ShieldCheck, color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]" },
  login_failed: { label: "Login fallido", icon: ShieldAlert, color: "text-[var(--data-error)]", bg: "bg-[var(--data-error)]/10" },
  login_locked: { label: "IP bloqueada", icon: Ban, color: "text-[var(--data-error)]", bg: "bg-[var(--data-error)]/10" },
  "2fa_failed": { label: "2FA fallido", icon: Lock, color: "text-[var(--data-warning)]", bg: "bg-[var(--data-warning)]/10" },
  "2fa_challenge": { label: "2FA enviado", icon: Unlock, color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]" },
  logout: { label: "Cerrar sesión", icon: Clock, color: "text-[var(--text-tertiary)]", bg: "bg-[var(--surface-sunken)]" },
};

export default function SecurityDashboardPage() {
  const [data, setData] = useState<SecurityData | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/superadmin/security?days=${days}`, { credentials: "include" });
      if (res.ok) {
        const json = await res.json();
        setData(json.data);
      }
    } catch { /* ignored */ }
    setLoading(false);
  }, [days]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Ola 3: tasa de exito solo valida cuando hay suficiente volumen de eventos.
  // Sin datos (totalEvents < umbral), 0% NO es error — es ausencia de datos.
  const totalLoginEvents = data
    ? (data.summary.login_success ?? 0) + (data.summary.login_failed ?? 0)
    : 0;
  const MIN_EVENTS_FOR_RATE = 10;
  const successRate = data
    ? Math.round(
        ((data.summary.login_success ?? 0) /
          Math.max(totalLoginEvents, 1)) *
          100,
      )
    : 0;
  const rateEmphasis: "error" | "neutral" =
    totalLoginEvents >= MIN_EVENTS_FOR_RATE && successRate < 80 ? "error" : "neutral";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-[var(--data-success)]/10">
            <Shield className="h-6 w-6 text-[var(--data-success)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Panel de Seguridad</h1>
            <p className="text-sm text-gray-400">Monitoreo de accesos y amenazas</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-gray-800 text-gray-300 text-sm rounded-lg px-3 py-2 border border-gray-700"
          >
            <option value={1}>Último día</option>
            <option value={7}>Última semana</option>
            <option value={30}>Último mes</option>
            <option value={90}>Últimos 3 meses</option>
          </select>
          <button
            onClick={fetchData}
            disabled={loading}
            className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {loading && !data ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-gray-800/40 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : data ? (
        <>
          {/* Summary Cards — Ola 2: migrados a StatCard DS con iconos neutros.
              Emphasis semantico SOLO cuando el valor cruza umbral critico. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={ShieldCheck}
              label="Logins exitosos"
              value={(data.summary.login_success ?? 0).toLocaleString("es-PE")}
              density="default"
            />
            <StatCard
              icon={ShieldAlert}
              label="Intentos fallidos"
              value={(data.summary.login_failed ?? 0).toLocaleString("es-PE")}
              emphasis={(data.summary.login_failed ?? 0) > 0 ? "warning" : "neutral"}
              density="default"
            />
            <StatCard
              icon={Globe}
              label="IPs únicas"
              value={data.uniqueIPs.toLocaleString("es-PE")}
              density="default"
            />
            <StatCard
              icon={Lock}
              label="Tasa de éxito"
              value={`${successRate}%`}
              emphasis={rateEmphasis}
              density="default"
            />
          </div>

          {/* Suspicious IPs */}
          {data.suspiciousIPs.length > 0 && (
            <div className="rounded-xl border border-[var(--data-error)]/30 bg-[var(--data-error)]/5 p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-[var(--data-error)]" />
                <h2 className="font-semibold text-[var(--data-error)]">IPs sospechosas</h2>
              </div>
              <div className="space-y-2">
                {data.suspiciousIPs.map((ip) => (
                  <div
                    key={ip.ip}
                    className="flex items-center justify-between rounded-lg bg-[var(--data-error)]/10 px-4 py-2"
                  >
                    <span className="font-mono text-sm text-[var(--data-error)]">{ip.ip}</span>
                    <span className="text-sm text-[var(--data-error)] font-medium">
                      {ip.failedAttempts} intentos fallidos
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Event Timeline */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/50">
            <div className="flex items-center gap-2 p-4 border-b border-gray-800">
              <Clock className="h-5 w-5 text-gray-400" />
              <h2 className="font-semibold text-gray-200">Actividad reciente</h2>
              <span className="ml-auto text-xs text-gray-500">{data.events.length} eventos</span>
            </div>
            <div className="divide-y divide-gray-800/50 max-h-125 overflow-y-auto">
              {data.events.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No hay eventos de seguridad en este período.
                </div>
              ) : (
                data.events.map((event) => {
                  const config = ACTION_CONFIG[event.action] ?? {
                    label: event.action,
                    icon: Shield,
                    color: "text-gray-400",
                    bg: "bg-gray-500/10",
                  };
                  const Icon = config.icon;
                  const ipMatch = event.detail.match(/IP\s+([\d.]+|[\da-f:]+|unknown)/i);

                  return (
                    <div key={event.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-800/30 transition-colors">
                      <div className={`p-1.5 rounded-lg ${config.bg} mt-0.5 shrink-0`}>
                        <Icon className={`h-4 w-4 ${config.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
                          {ipMatch && (
                            <span className="flex items-center gap-1 text-xs text-gray-500">
                              <Globe className="h-3 w-3" />
                              {ipMatch[1]}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{event.detail}</p>
                      </div>
                      <time className="text-xs text-gray-600 whitespace-nowrap shrink-0">
                        {new Date(event.createdAt).toLocaleString("es-PE", {
                          timeZone: "America/Lima",
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* 2FA Status */}
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Lock className="h-5 w-5 text-gray-400" />
              <h2 className="font-semibold text-gray-200">Estado de seguridad</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatusItem
                label="2FA habilitado"
                value={!!process.env.NEXT_PUBLIC_SUPERADMIN_2FA}
              />
              <StatusItem
                label="Lockout activo"
                value={true}
                detail="5 intentos → 15 min bloqueo"
              />
              <StatusItem
                label="Alertas WhatsApp"
                value={!!process.env.NEXT_PUBLIC_SUPERADMIN_PHONE}
                detail="Notificación cada login"
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatusItem({ label, value, detail }: { label: string; value: boolean; detail?: string }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-gray-800/40 px-4 py-3">
      <div className={`h-2.5 w-2.5 rounded-full ${value ? "bg-[var(--data-success)]" : "bg-gray-600"}`} />
      <div>
        <p className="text-sm font-medium text-gray-200">{label}</p>
        {detail && <p className="text-xs text-gray-500">{detail}</p>}
      </div>
    </div>
  );
}
