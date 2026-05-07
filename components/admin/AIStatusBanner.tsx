"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import Link from "next/link";

const DISMISS_KEY = "ai-banner-dismissed-until";
const DISMISS_HOURS = 6;

interface AIStatus {
  status: "healthy" | "degraded" | "critical" | "warning";
  errors: number;
  checks?: Array<{ name: string; status: string; detail: string }>;
}

/**
 * Banner discreto que aparece arriba del admin cuando el sistema IA está caído.
 * - Sondea `/api/ai-assistant/health` cada 60s.
 * - Se puede cerrar; queda oculto por DISMISS_HOURS.
 * - Solo aparece si status === "critical" (sin provider configurado o key inválida).
 */
export default function AIStatusBanner() {
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    // Check dismiss state
    try {
      const until = parseInt(localStorage.getItem(DISMISS_KEY) ?? "0", 10);
      if (Date.now() < until) {
        setDismissed(true);
        return;
      }
      setDismissed(false);
    } catch {
      setDismissed(false);
    }

    let alive = true;
    const fetchStatus = async () => {
      try {
        const res = await fetch("/api/ai-assistant/health", {
          credentials: "include",
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as AIStatus;
        if (alive) setStatus(data);
      } catch {
        /* silent */
      }
    };
    fetchStatus();
    const interval = setInterval(fetchStatus, 60_000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_HOURS * 3_600_000));
    } catch {}
    setDismissed(true);
  };

  // Solo mostrar si crítico Y no descartado
  if (dismissed || !status) return null;
  if (status.status !== "critical") return null;

  const providerCheck = status.checks?.find((c) => c.name === "Proveedor IA activo");
  const providerErrors = status.checks?.filter(
    (c) => c.name.startsWith("Proveedor IA:") && c.status === "warning",
  );

  return (
    <div
      role="alert"
      className="flex items-center gap-3 border-b border-[var(--data-warning-500)]/30 bg-[var(--data-warning-500)]/10 px-4 py-2.5 text-sm dark:bg-[var(--data-warning-500)]/15"
    >
      <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-600)] dark:text-amber-400" />
      <div className="min-w-0 flex-1">
        <span className="font-semibold text-[var(--data-warning-700)] dark:text-amber-300">
          Asistente IA inactivo
        </span>
        <span className="ml-2 text-[var(--data-warning-500)]/80 dark:text-amber-300/80">
          {providerCheck?.detail ?? "Ningún proveedor de IA está configurado correctamente."}
          {providerErrors && providerErrors.length > 0 && (
            <> Configurá una API key real en <code className="rounded bg-[var(--data-warning-500)]/20 px-1 font-mono text-xs">.env.local</code></>
          )}
        </span>
      </div>
      <Link
        href="/admin?tab=settings"
        className="shrink-0 rounded-md border border-[var(--data-warning-500)]/40 px-2.5 py-1 text-xs font-medium text-[var(--data-warning-700)] transition hover:bg-[var(--data-warning-500)]/20 dark:text-amber-300"
      >
        Ver detalles
      </Link>
      <button
        onClick={dismiss}
        aria-label="Descartar 6 horas"
        className="shrink-0 rounded-md p-1 text-[var(--data-warning-500)]/70 transition hover:bg-[var(--data-warning-500)]/20 hover:text-[var(--data-warning-700)] dark:text-amber-300/70 dark:hover:text-amber-300"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
