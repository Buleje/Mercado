"use client";

/**
 * SoporteTab — ficha técnica del dispositivo del admin (navegador, conexión,
 * almacenamiento). Fusiona los ex sub-tabs "Mi Navegador" + "Almacenamiento":
 * son datos de ESTE dispositivo (no del negocio), útiles para diagnosticar
 * problemas con soporte.
 */

import { useEffect, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Globe, HardDrive, Wifi, Monitor, MemoryStick } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

// ── Conexión ─────────────────────────────────────────────────────────────────

function ConnectionQualityCard() {
  const [quality, setQuality] = useState<{
    type: string;
    speed: number;
    rtt: number;
    grade: "buena" | "regular" | "lenta";
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const conn = (navigator as Navigator & Record<string, unknown>).connection as
      | Record<string, unknown>
      | undefined;
    if (!conn) return;

    const update = () => {
      const speed = (conn.downlink as number) || 0;
      const rtt = (conn.rtt as number) || 0;
      const type = (conn.effectiveType as string) || "unknown";
      const grade = speed >= 5 ? "buena" : speed >= 1.5 ? "regular" : "lenta";
      setQuality({ type: type.toUpperCase(), speed, rtt, grade });
    };

    update();
    const target = conn as unknown as EventTarget;
    target.addEventListener("change", update);
    return () => target.removeEventListener("change", update);
  }, []);

  if (!quality) {
    return (
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 text-center">
        <Wifi className="mx-auto mb-2 h-6 w-6 text-[var(--text-tertiary)]" aria-hidden />
        <p className="text-sm text-[var(--text-secondary)]">
          Tu navegador no permite medir la calidad de conexión
        </p>
      </div>
    );
  }

  const GRADE_STYLES = {
    buena: { color: "text-[var(--data-success-500)]", bg: "bg-[var(--data-success-50)]", dot: "bg-[var(--data-success-500)]" },
    regular: { color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)]", dot: "bg-[var(--data-warning-500)]" },
    lenta: { color: "text-[var(--data-error-500)]", bg: "bg-[var(--data-error-50)]", dot: "bg-[var(--data-error-500)]" },
  };
  const style = GRADE_STYLES[quality.grade];

  return (
    <div className={cn("rounded-xl border border-[var(--rule-base)] p-4", style.bg)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--surface-raised)]">
            <Wifi className={cn("h-5 w-5", style.color)} aria-hidden />
          </div>
          <div>
            <p className={cn("inline-flex items-center gap-1.5 text-sm font-bold", style.color)}>
              <span className={cn("inline-block h-2.5 w-2.5 rounded-full", style.dot)} aria-hidden /> Conexión {quality.grade}
            </p>
            <p className="text-sm text-[var(--text-secondary)]">
              {quality.grade === "buena"
                ? "Tu internet va rápido — la tienda cargará bien"
                : quality.grade === "regular"
                  ? "Tu internet va normal — puede tardar un poco"
                  : "Tu internet va lento — las páginas tardarán en cargar"}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tabular-nums text-[var(--text-primary)]">
            {quality.speed} <span className="text-sm font-normal text-[var(--text-secondary)]">Mbps</span>
          </p>
          <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
            {quality.type} · {quality.rtt}ms
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Navegador ────────────────────────────────────────────────────────────────

function BrowserInfoCard() {
  const [info] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    const nav = navigator as Navigator & Record<string, unknown>;
    const conn = (nav.connection || nav.mozConnection || nav.webkitConnection) as
      | Record<string, unknown>
      | undefined;
    const data: Record<string, string> = {
      "Navegador": (nav.userAgent as string | undefined)?.split(" ").pop() || "Desconocido",
      "Plataforma": (nav.platform as string | undefined) || "Desconocido",
      "Idioma": (nav.language as string | undefined) || "es",
      "Pantalla": `${screen.width} × ${screen.height} px`,
      "Ventana actual": `${window.innerWidth} × ${window.innerHeight} px`,
      "Píxeles por punto": `${window.devicePixelRatio}x`,
      "Modo oscuro del sistema": window.matchMedia("(prefers-color-scheme: dark)").matches ? "Sí" : "No",
      "Conexión": ((conn?.effectiveType as string) || "").toUpperCase() || "Desconocida",
      "Velocidad estimada": conn?.downlink ? `${conn.downlink} Mbps` : "No disponible",
      "Ahorro de datos": conn?.saveData ? "Activado" : "Desactivado",
      "Memoria RAM": nav.deviceMemory ? `~${nav.deviceMemory} GB` : "No disponible",
      "Núcleos CPU": nav.hardwareConcurrency ? `${nav.hardwareConcurrency} núcleos` : "No disponible",
      "Cookies habilitadas": nav.cookieEnabled ? "Sí" : "No",
      "Modo seguro (HTTPS)": location.protocol === "https:" ? "Sí" : "No",
      "Service Worker": "serviceWorker" in nav ? "Disponible" : "No disponible",
    };
    return data;
  });

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="border-b border-[var(--rule-soft)] px-4 py-3">
        <CardTitle className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <Monitor className="h-4 w-4 text-[var(--accent)]" aria-hidden />
          Información del navegador
        </CardTitle>
        <p className="mt-0.5 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
          La ficha técnica de este dispositivo — pasásela a soporte si algo anda mal
        </p>
      </div>
      <div className="divide-y divide-[var(--rule-soft)]">
        {Object.entries(info).map(([key, value]) => (
          <div key={key} className="flex items-center justify-between gap-4 px-4 py-2.5">
            <span className="text-sm font-medium text-[var(--text-secondary)]">{key}</span>
            <span className="text-right text-sm font-semibold text-[var(--text-primary)]">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Almacenamiento ───────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function StorageSection() {
  const [storage, setStorage] = useState<{
    quota: number;
    usage: number;
    caches: number;
    localStorage: number;
    sessionStorage: number;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    async function measure() {
      const data = { quota: 0, usage: 0, caches: 0, localStorage: 0, sessionStorage: 0 };
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        data.quota = est.quota || 0;
        data.usage = est.usage || 0;
      }
      if ("caches" in window) {
        try {
          const names = await caches.keys();
          let total = 0;
          for (const name of names) {
            const cache = await caches.open(name);
            total += (await cache.keys()).length;
          }
          data.caches = total;
        } catch { /* ignore */ }
      }
      try {
        let size = 0;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) size += (localStorage.getItem(key)?.length || 0) * 2;
        }
        data.localStorage = size;
      } catch { /* ignore */ }
      try {
        let size = 0;
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key) size += (sessionStorage.getItem(key)?.length || 0) * 2;
        }
        data.sessionStorage = size;
      } catch { /* ignore */ }
      setStorage(data);
    }

    // Storage API no disponible en este navegador → la sección queda oculta.
    measure().catch((err) => console.debug("[soporte-tab] storage estimate falló", err));
  }, []);

  if (!storage) return null;

  const usagePct = storage.quota > 0 ? (storage.usage / storage.quota) * 100 : 0;
  const cards = [
    { icon: HardDrive, label: "Datos guardados", value: formatBytes(storage.localStorage), description: "Configuración, preferencias y datos temporales" },
    { icon: MemoryStick, label: "Sesión actual", value: formatBytes(storage.sessionStorage), description: "Datos del momento — se borran al cerrar" },
    { icon: Globe, label: "Caché del sitio", value: `${storage.caches} archivos`, description: "Archivos guardados para cargar más rápido" },
  ];

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
        <CardTitle className="mb-1 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <HardDrive className="h-4 w-4 text-[var(--accent)]" aria-hidden />
          Espacio utilizado
        </CardTitle>
        <p className="mb-3 text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
          Como el espacio en tu celular — cuánto usa la tienda en este navegador
        </p>
        <div className="relative mb-2 h-4 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-all",
              usagePct < 50
                ? "bg-[var(--data-success-500)]"
                : usagePct < 80
                  ? "bg-[var(--data-warning-500)]"
                  : "bg-[var(--data-error-500)]",
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
  return (
    <div className="space-y-4">
      <ConnectionQualityCard />
      <BrowserInfoCard />
      <StorageSection />
    </div>
  );
}
