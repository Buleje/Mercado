"use client";

/**
 * SoporteTab — ficha técnica del dispositivo del admin para diagnóstico.
 * Su razón de ser: cuando algo anda mal, el bodeguero le pasa esto a soporte.
 * Por eso lo central es "Copiar diagnóstico" (un toque → todo al portapapeles),
 * un semáforo de salud arriba, el estado de la app (instalada/online/SW) y una
 * acción de "vaciar caché" (el fix de soporte más común).
 *
 * Toda la data sale de useDeviceDiagnostics (fuente única: pantalla = copiado).
 */

import { useState } from "react";
import { CardTitle } from "@buleje/design-system";
import {
  Globe, HardDrive, Wifi, WifiOff, Monitor, MemoryStick, Copy, Check, Smartphone,
  Trash2, CheckCircle2, AlertTriangle, ShieldCheck,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useClipboard } from "@/hooks/use-clipboard";
import {
  useDeviceDiagnostics,
  diagnosticsToText,
  type DeviceDiagnostics,
} from "@/hooks/use-device-diagnostics";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// ── Semáforo de salud ────────────────────────────────────────────────────────

type Health = "ok" | "warn" | "bad";
const HEALTH_UI: Record<Health, { text: string; dot: string }> = {
  ok: { text: "text-[var(--data-success-500)]", dot: "bg-[var(--data-success-500)]" },
  warn: { text: "text-[var(--data-warning-500)]", dot: "bg-[var(--data-warning-500)]" },
  bad: { text: "text-[var(--data-error-500)]", dot: "bg-[var(--data-error-500)]" },
};

function HealthChip({ health, label, value }: { health: Health; label: string; value: string }) {
  const ui = HEALTH_UI[health];
  return (
    <div className="flex items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2.5">
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", ui.dot)} aria-hidden />
      <div className="min-w-0">
        <p className="text-[length:var(--ts-xs)] font-medium text-[var(--text-tertiary)]">{label}</p>
        <p className={cn("text-sm font-bold", ui.text)}>{value}</p>
      </div>
    </div>
  );
}

// ── Conexión ─────────────────────────────────────────────────────────────────

function ConnectionCard({ d }: { d: DeviceDiagnostics }) {
  const styleByGrade = {
    buena: { color: "text-[var(--data-success-500)]", bg: "bg-[var(--data-success-50)]", dot: "bg-[var(--data-success-500)]" },
    regular: { color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)]", dot: "bg-[var(--data-warning-500)]" },
    lenta: { color: "text-[var(--data-error-500)]", bg: "bg-[var(--data-error-50)]", dot: "bg-[var(--data-error-500)]" },
    desconocida: { color: "text-[var(--text-secondary)]", bg: "bg-[var(--surface-sunken)]", dot: "bg-[var(--rule-strong)]" },
  }[d.connGrade];

  if (d.connGrade === "desconocida") {
    return (
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 text-center">
        <Wifi className="mx-auto mb-2 h-6 w-6 text-[var(--text-tertiary)]" aria-hidden />
        <p className="text-sm text-[var(--text-secondary)]">Tu navegador no permite medir la calidad de conexión</p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border border-[var(--rule-base)] p-4", styleByGrade.bg)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-raised)]">
            <Wifi className={cn("h-5 w-5", styleByGrade.color)} aria-hidden />
          </div>
          <div>
            <p className={cn("inline-flex items-center gap-1.5 text-sm font-bold", styleByGrade.color)}>
              <span className={cn("inline-block h-2.5 w-2.5 rounded-full", styleByGrade.dot)} aria-hidden /> Conexión {d.connGrade}
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              {d.connGrade === "buena"
                ? "Tu internet va rápido — la tienda cargará bien"
                : d.connGrade === "regular"
                  ? "Tu internet va normal — puede tardar un poco"
                  : "Tu internet va lento — las páginas tardarán en cargar"}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tabular-nums text-[var(--text-primary)]">
            {d.connSpeed ?? "—"} <span className="text-sm font-normal text-[var(--text-secondary)]">Mbps</span>
          </p>
          <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
            {d.connType}{d.connRtt != null ? ` · ${d.connRtt}ms` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Estado de la app ─────────────────────────────────────────────────────────

function AppStatusCard({ d }: { d: DeviceDiagnostics }) {
  const items = [
    {
      icon: d.online ? Wifi : WifiOff,
      label: "Estado",
      value: d.online ? "Conectado" : "Sin conexión",
      health: (d.online ? "ok" : "bad") as Health,
    },
    {
      icon: Smartphone,
      label: "App instalada",
      value: d.pwaInstalled ? "Sí" : "En navegador",
      health: (d.pwaInstalled ? "ok" : "warn") as Health,
    },
    {
      icon: ShieldCheck,
      label: "Modo seguro",
      value: d.https ? "HTTPS" : "No seguro",
      health: (d.https ? "ok" : "warn") as Health,
    },
  ];
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <CardTitle className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
        <Smartphone className="h-4 w-4 text-[var(--accent)]" aria-hidden />
        Estado de la aplicación
      </CardTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {items.map(({ icon: Icon, label, value, health }) => (
          <div key={label} className="flex items-center gap-2.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)]/40 px-3 py-2.5">
            <Icon className={cn("h-5 w-5 shrink-0", HEALTH_UI[health].text)} aria-hidden />
            <div className="min-w-0">
              <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">{label}</p>
              <p className="text-sm font-bold text-[var(--text-primary)]">{value}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Ficha del navegador ──────────────────────────────────────────────────────

function BrowserInfoCard({ d }: { d: DeviceDiagnostics }) {
  const rows: Array<[string, string]> = [
    ["Navegador", d.browser],
    ["Plataforma", d.platform],
    ["Idioma", d.language],
    ["Pantalla", d.screen],
    ["Ventana actual", d.window],
    ["Píxeles por punto", d.dpr],
    ["Modo oscuro del sistema", d.systemDark ? "Sí" : "No"],
    ["Núcleos CPU", d.cores],
    ["Memoria RAM", d.deviceMemory],
    ["Service Worker", d.serviceWorker],
    ["Cookies habilitadas", d.cookiesEnabled ? "Sí" : "No"],
  ];
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="border-b border-[var(--rule-soft)] px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <Monitor className="h-4 w-4 text-[var(--accent)]" aria-hidden />
          Información del navegador
        </CardTitle>
        <p className="mt-0.5 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
          La ficha técnica de este dispositivo — la incluye el botón &quot;Copiar diagnóstico&quot;
        </p>
      </div>
      <div className="divide-y divide-[var(--rule-soft)]">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 px-4 py-2.5">
            <span className="text-sm font-medium text-[var(--text-secondary)]">{k}</span>
            <span className="text-right text-sm font-semibold text-[var(--text-primary)]">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Almacenamiento ───────────────────────────────────────────────────────────

function StorageSection({ d }: { d: DeviceDiagnostics }) {
  const [clearing, setClearing] = useState(false);
  const [cleared, setCleared] = useState(false);
  const storage = d.storage;

  const clearCache = async () => {
    if (clearing) return;
    setClearing(true);
    try {
      if ("caches" in window) {
        const names = await caches.keys();
        await Promise.all(names.map((n) => caches.delete(n)));
      }
      setCleared(true);
      // Recargar para volver a cachear limpio.
      setTimeout(() => window.location.reload(), 900);
    } catch (err) {
      console.debug("[soporte] limpiar caché falló", err);
      setClearing(false);
    }
  };

  if (!storage) {
    return <div className="h-24 animate-pulse rounded-xl bg-[var(--surface-sunken)]" />;
  }

  const usagePct = storage.quota > 0 ? (storage.usage / storage.quota) * 100 : 0;
  const cards = [
    { icon: HardDrive, label: "Datos guardados", value: formatBytes(storage.localStorage), description: "Configuración y preferencias" },
    { icon: MemoryStick, label: "Sesión actual", value: formatBytes(storage.sessionStorage), description: "Se borra al cerrar" },
    { icon: Globe, label: "Caché del sitio", value: `${storage.caches} archivos`, description: "Para cargar más rápido" },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="mb-1 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
              <HardDrive className="h-4 w-4 text-[var(--accent)]" aria-hidden />
              Espacio utilizado
            </CardTitle>
            <p className="text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
              Cuánto usa la tienda en este navegador
            </p>
          </div>
          <button
            type="button"
            onClick={clearCache}
            disabled={clearing}
            className={cn(
              "inline-flex h-11 items-center gap-2 rounded-xl border-2 px-4 text-sm font-bold transition-colors disabled:opacity-60",
              cleared
                ? "border-[var(--data-success-500)] bg-[var(--data-success-50)] text-[var(--data-success-700)]"
                : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--data-error-500)] hover:text-[var(--data-error-500)]",
            )}
            title="Borra los archivos temporales y recarga — soluciona la mayoría de problemas visuales"
          >
            {cleared ? <Check className="h-4 w-4" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
            {cleared ? "Recargando..." : clearing ? "Vaciando..." : "Vaciar caché"}
          </button>
        </div>

        <div className="mt-3 mb-2 h-4 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              usagePct < 50 ? "bg-[var(--data-success-500)]" : usagePct < 80 ? "bg-[var(--data-warning-500)]" : "bg-[var(--data-error-500)]",
            )}
            style={{ width: `${Math.min(usagePct, 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold text-[var(--text-primary)]">{formatBytes(storage.usage)} usado</span>
          <span className="text-[var(--text-secondary)]">de {formatBytes(storage.quota)} disponible</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map(({ icon: Icon, label, value, description }) => (
          <div key={label} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
            <div className="mb-1.5 flex items-center gap-2">
              <Icon className="h-4 w-4 text-[var(--data-success-500)]" aria-hidden />
              <span className="text-sm font-semibold text-[var(--text-primary)]">{label}</span>
            </div>
            <p className="text-lg font-bold text-[var(--text-primary)]">{value}</p>
            <p className="mt-0.5 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">{description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Tab ──────────────────────────────────────────────────────────────────────

export default function SoporteTab() {
  const d = useDeviceDiagnostics();
  const { copied, copy } = useClipboard();

  if (!d) {
    return <div className="h-40 animate-pulse rounded-2xl bg-[var(--surface-sunken)]" />;
  }

  const health: Array<{ health: Health; label: string; value: string }> = [
    { health: d.online ? "ok" : "bad", label: "Estado", value: d.online ? "Conectado" : "Sin conexión" },
    {
      health: d.connGrade === "buena" ? "ok" : d.connGrade === "regular" ? "warn" : d.connGrade === "lenta" ? "bad" : "warn",
      label: "Conexión",
      value: d.connGrade === "desconocida" ? "No medible" : `${d.connGrade}${d.connSpeed != null ? ` · ${d.connSpeed} Mbps` : ""}`,
    },
    { health: "ok", label: "Navegador", value: d.browser },
    {
      health: !d.storage ? "ok" : d.storage.quota && d.storage.usage / d.storage.quota > 0.8 ? "warn" : "ok",
      label: "Espacio",
      value: d.storage ? `${formatBytes(d.storage.usage)}` : "…",
    },
  ];
  const allOk = health.every((h) => h.health === "ok");

  const handleCopy = () => {
    const stamp = new Date().toLocaleString("es-PE");
    copy(diagnosticsToText(d, stamp));
  };

  return (
    <div className="space-y-4">
      {/* Cabecera: salud + copiar diagnóstico */}
      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-xl",
                allOk ? "bg-[var(--data-success-50)] text-[var(--data-success-500)]" : "bg-[var(--data-warning-50)] text-[var(--data-warning-500)]",
              )}
            >
              {allOk ? <CheckCircle2 className="h-6 w-6" aria-hidden /> : <AlertTriangle className="h-6 w-6" aria-hidden />}
            </span>
            <div>
              <p className="text-base font-bold text-[var(--text-primary)]">
                {allOk ? "Todo en orden" : "Hay algo para revisar"}
              </p>
              <p className="text-sm text-[var(--text-secondary)]">
                Datos de este equipo — si hablás con soporte, copiá y pegáselos.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCopy}
            className={cn(
              "inline-flex h-12 items-center gap-2 rounded-2xl px-5 text-base font-bold shadow-sm transition-all",
              copied
                ? "bg-[var(--data-success-500)] text-white"
                : "bg-[var(--accent)] text-white hover:brightness-105 shadow-[var(--shadow-md)]",
            )}
          >
            {copied ? <Check className="h-5 w-5" aria-hidden /> : <Copy className="h-5 w-5" aria-hidden />}
            {copied ? "¡Copiado!" : "Copiar diagnóstico"}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          {health.map((h) => (
            <HealthChip key={h.label} {...h} />
          ))}
        </div>
      </div>

      <ConnectionCard d={d} />
      <AppStatusCard d={d} />
      <BrowserInfoCard d={d} />
      <StorageSection d={d} />
    </div>
  );
}
