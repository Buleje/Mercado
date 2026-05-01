"use client";

/**
 * AdminAlertsBanner — banner sticky en el admin que muestra alertas
 * priorizadas. Polling cada 30s al endpoint /api/admin/alerts-summary.
 *
 * Severidades:
 *   - urgent: trial 1-3 días, pedidos sin partner > 0
 *   - warning: trial 4-7 días, solicitudes pendientes
 *   - info: partners online actual
 *
 * Click en cada alerta abre el tab correspondiente.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, AlertTriangle, Clock, Bike, Users, X } from "@buleje/design-system/icons";

interface Summary {
  solicitudesPendientes: number;
  pedidosSinPartner: number;
  partnersOnline: number;
  recentExpiredOffers: number;
  trialDaysLeft: number | null;
}

const REFRESH_MS = 30_000;
const DISMISS_KEY = "admin-alerts-dismissed-at";

export default function AdminAlertsBanner() {
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check si fue dismissed en últimas 6h.
    try {
      const at = localStorage.getItem(DISMISS_KEY);
      if (at && Date.now() - Number(at) < 6 * 3600_000) setDismissed(true);
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    if (dismissed) return;
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/admin/alerts-summary", { credentials: "include" });
        if (!res.ok) return;
        const data: Summary = await res.json();
        if (!cancelled) setSummary(data);
      } catch { /* polling silencioso */ }
    };
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [dismissed]);

  if (dismissed || !summary) return null;

  const alerts: { severity: "urgent" | "warning" | "info"; icon: React.ReactNode; text: string; onClick: () => void }[] = [];

  if (summary.trialDaysLeft != null && summary.trialDaysLeft <= 3) {
    alerts.push({
      severity: "urgent",
      icon: <AlertTriangle className="h-4 w-4" />,
      text: `Tu trial vence en ${summary.trialDaysLeft} día${summary.trialDaysLeft === 1 ? "" : "s"}`,
      onClick: () => router.push("/admin?tab=plan"),
    });
  } else if (summary.trialDaysLeft != null && summary.trialDaysLeft <= 7) {
    alerts.push({
      severity: "warning",
      icon: <Clock className="h-4 w-4" />,
      text: `Trial: ${summary.trialDaysLeft} días restantes`,
      onClick: () => router.push("/admin?tab=plan"),
    });
  }

  if (summary.pedidosSinPartner > 0) {
    alerts.push({
      severity: "urgent",
      icon: <Bike className="h-4 w-4" />,
      text: `${summary.pedidosSinPartner} pedido${summary.pedidosSinPartner === 1 ? "" : "s"} sin repartidor`,
      onClick: () => router.push("/admin?tab=pedidos"),
    });
  }

  if (summary.solicitudesPendientes > 0) {
    alerts.push({
      severity: "warning",
      icon: <Users className="h-4 w-4" />,
      text: `${summary.solicitudesPendientes} solicitud${summary.solicitudesPendientes === 1 ? "" : "es"} de repartidor pendiente${summary.solicitudesPendientes === 1 ? "" : "s"}`,
      onClick: () => router.push("/admin?tab=delivery-partners"),
    });
  }

  if (alerts.length === 0) return null;

  const topSeverity = alerts.some((a) => a.severity === "urgent")
    ? "urgent"
    : alerts.some((a) => a.severity === "warning")
      ? "warning"
      : "info";

  const bgColor = topSeverity === "urgent"
    ? "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800"
    : topSeverity === "warning"
      ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800"
      : "bg-blue-50 dark:bg-blue-950/30 border-blue-300 dark:border-blue-800";

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* noop */ }
  };

  return (
    <div className={`sticky top-0 z-40 border-b-2 ${bgColor}`}>
      <div className="mx-auto max-w-7xl px-4 py-2.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Bell className="h-4 w-4 text-[var(--text-primary)] shrink-0" />
          {alerts.map((a, i) => (
            <button
              key={i}
              onClick={a.onClick}
              className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)] hover:underline"
            >
              {a.icon}
              {a.text}
            </button>
          ))}
        </div>
        <button
          onClick={handleDismiss}
          aria-label="Cerrar alertas"
          className="p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 shrink-0"
        >
          <X className="h-4 w-4 text-[var(--text-tertiary)]" />
        </button>
      </div>
    </div>
  );
}
