"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import {
  Gauge, HeartPulse, Globe, HardDrive, Wifi, Monitor, MemoryStick, BarChart3, Trash2,
} from "lucide-react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { cn } from "@/lib/utils";

import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const WebVitalsWidget = dynamic(
  () => import("@/components/admin/WebVitalsWidget"),
  { ssr: false, loading: S },
);
const SystemHealthTab = dynamic(
  () => import("@/components/admin/SystemHealthTab"),
  { loading: S },
);

const MODULE_ID = "rendimiento";

const TABS = [
  { id: "web-vitals", label: "Velocidad Web", icon: Gauge },
  { id: "historial", label: "Historial", icon: BarChart3 },
  { id: "salud", label: "Salud del Sistema", icon: HeartPulse },
  { id: "navegador", label: "Mi Navegador", icon: Globe },
  { id: "almacenamiento", label: "Almacenamiento", icon: HardDrive },
];

// ── Browser Info Tab ─────────────────────────────────────────────────────────

function BrowserInfoTab() {
  const [info, _setInfo] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {} as Record<string, string>;
    const nav = navigator as Navigator & Record<string, unknown>;
    const conn = (nav as Record<string, unknown>).connection || (nav as Record<string, unknown>).mozConnection || (nav as Record<string, unknown>).webkitConnection;
    const connObj = conn as Record<string, unknown> | undefined;
    return {
      "Navegador": (nav.userAgent?.split(" ").pop()) || "Desconocido",
      "Plataforma": nav.platform || "Desconocido",
      "Idioma": nav.language || "es",
      "Pantalla": `${screen.width} × ${screen.height} px`,
      "Ventana actual": `${window.innerWidth} × ${window.innerHeight} px`,
      "Pixeles por punto": `${window.devicePixelRatio}x`,
      "Modo oscuro del sistema": window.matchMedia("(prefers-color-scheme: dark)").matches ? "Sí" : "No",
      "Conexión": (connObj?.effectiveType as string)?.toUpperCase() || "Desconocida",
      "Velocidad estimada": connObj?.downlink ? `${connObj.downlink} Mbps` : "No disponible",
      "Ahorro de datos": connObj?.saveData ? "Activado" : "Desactivado",
      "Memoria RAM": (nav as Record<string, unknown>).deviceMemory ? `~${(nav as Record<string, unknown>).deviceMemory} GB` : "No disponible",
      "Núcleos CPU": nav.hardwareConcurrency ? `${nav.hardwareConcurrency} núcleos` : "No disponible",
      "Cookies habilitadas": nav.cookieEnabled ? "Sí" : "No",
      "Modo seguro (HTTPS)": location.protocol === "https:" ? "Sí" : "No",
      "Service Worker": "serviceWorker" in nav ? "Disponible" : "No disponible",
    };
  });

  const entries = Object.entries(info);

  return (
    <div className="space-y-4">
      {/* Connection quality card */}
      <ConnectionQualityCard />

      {/* Browser details */}
      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            <Monitor className="h-4 w-4 text-primary" />
            Información del Navegador
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Datos técnicos de tu dispositivo — como la ficha técnica de tu computadora
          </p>
        </div>
        <div className="divide-y divide-gray-100">
          {entries.map(([key, value]) => (
            <div key={key} className="px-4 py-2.5 flex items-center justify-between gap-4">
              <span className="text-xs font-medium text-gray-500">{key}</span>
              <span className="text-xs font-semibold text-gray-900 text-right">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Connection Quality Card ──────────────────────────────────────────────────

function ConnectionQualityCard() {
  const [quality, setQuality] = useState<{
    type: string;
    speed: number;
    rtt: number;
    grade: "buena" | "regular" | "lenta";
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const conn = (navigator as Navigator & Record<string, unknown>).connection as Record<string, unknown> | undefined;
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
      <div className="rounded-2xl border border-gray-200 bg-white p-4 text-center">
        <Wifi className="h-6 w-6 text-gray-400 mx-auto mb-2" />
        <p className="text-xs text-gray-500">
          Tu navegador no permite medir la calidad de conexión
        </p>
      </div>
    );
  }

  const GRADE_STYLES = {
    buena: { color: "text-emerald-600", bg: "bg-emerald-50", dot: "bg-emerald-500" },
    regular: { color: "text-amber-600", bg: "bg-amber-50", dot: "bg-amber-500" },
    lenta: { color: "text-red-600", bg: "bg-red-50", dot: "bg-red-500" },
  };
  const style = GRADE_STYLES[quality.grade];

  return (
    <div className={cn("rounded-2xl border border-gray-200 p-4", style.bg)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center shadow-sm">
            <Wifi className={cn("h-5 w-5", style.color)} />
          </div>
          <div>
            <p className={cn("text-sm font-bold", style.color)}>
              <span className={cn("inline-block w-2.5 h-2.5 rounded-full", style.dot)} /> Conexión {quality.grade}
            </p>
            <p className="text-xs text-gray-500">
              {quality.grade === "buena"
                ? "Tu internet va rápido — la tienda cargará bien"
                : quality.grade === "regular"
                  ? "Tu internet va normal — puede tardar un poco"
                  : "Tu internet va lento — las páginas tardarán en cargar"}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold text-gray-900">{quality.speed} <span className="text-xs font-normal text-gray-500">Mbps</span></p>
          <p className="text-[10px] text-gray-400">{quality.type} · {quality.rtt}ms</p>
        </div>
      </div>
    </div>
  );
}

// ── Performance History Tab ──────────────────────────────────────────────────

interface PerfSnapshot {
  date: string; // ISO date
  lcp: number;
  fid: number;
  cls: number;
  ttfb: number;
}

const PERF_HISTORY_KEY = "buleje-perf-history";
const MAX_SNAPSHOTS = 14;

function getHistory(): PerfSnapshot[] {
  try {
    const raw = localStorage.getItem(PERF_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveHistory(snapshots: PerfSnapshot[]) {
  try {
    localStorage.setItem(PERF_HISTORY_KEY, JSON.stringify(snapshots.slice(-MAX_SNAPSHOTS)));
  } catch { /* ignore */ }
}

function PerformanceHistoryTab() {
  const [history, setHistory] = useState<PerfSnapshot[]>([]);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  const recordNow = () => {
    setRecording(true);
    const snap: PerfSnapshot = {
      date: new Date().toISOString(),
      lcp: 0, fid: 0, cls: 0, ttfb: 0,
    };

    // Read performance entries
    try {
      const entries = performance.getEntriesByType("navigation");
      if (entries.length > 0) {
        const nav = entries[0] as PerformanceNavigationTiming;
        snap.ttfb = Math.round(nav.responseStart - nav.requestStart);
      }

      // LCP from PerformanceObserver (last recorded)
      const lcpEntries = performance.getEntriesByType("largest-contentful-paint");
      if (lcpEntries.length > 0) {
        snap.lcp = Math.round(lcpEntries[lcpEntries.length - 1].startTime);
      }

      // CLS approximation
      const layoutShifts = performance.getEntriesByType("layout-shift");
      let clsValue = 0;
      for (const entry of layoutShifts) {
        if (!(entry as PerformanceEntry & { hadRecentInput?: boolean }).hadRecentInput) {
          clsValue += (entry as PerformanceEntry & { value?: number }).value || 0;
        }
      }
      snap.cls = Math.round(clsValue * 1000) / 1000;
    } catch { /* ignore */ }

    const next = [...history, snap];
    saveHistory(next);
    setHistory(next);
    setRecording(false);
  };

  const clearHistory = () => {
    try { localStorage.removeItem(PERF_HISTORY_KEY); } catch { /* ignore */ }
    setHistory([]);
  };

  const getGrade = (metric: string, value: number): { color: string; label: string } => {
    if (metric === "lcp") {
      if (value <= 2500) return { color: "bg-emerald-500", label: "Bueno" };
      if (value <= 4000) return { color: "bg-amber-500", label: "Medio" };
      return { color: "bg-red-500", label: "Lento" };
    }
    if (metric === "ttfb") {
      if (value <= 200) return { color: "bg-emerald-500", label: "Rápido" };
      if (value <= 500) return { color: "bg-amber-500", label: "Normal" };
      return { color: "bg-red-500", label: "Lento" };
    }
    if (metric === "cls") {
      if (value <= 0.1) return { color: "bg-emerald-500", label: "Estable" };
      if (value <= 0.25) return { color: "bg-amber-500", label: "Algo inestable" };
      return { color: "bg-red-500", label: "Inestable" };
    }
    return { color: "bg-gray-400", label: "-" };
  };

  // Find max for bar scaling
  const maxLcp = Math.max(...history.map(h => h.lcp), 1);
  const maxTtfb = Math.max(...history.map(h => h.ttfb), 1);

  return (
    <div className="space-y-4">
      {/* Record button */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              Historial de Rendimiento
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Como un diario de salud de tu tienda — registra una medición cada vez que quieras ver cómo va
            </p>
          </div>
          <div className="flex items-center gap-2">
            {history.length > 0 && (
              <button
                onClick={clearHistory}
                className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Borrar historial"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={recordNow}
              disabled={recording}
              className="px-3 py-1.5 bg-primary text-white text-xs font-bold rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {recording ? "Midiendo..." : <><BarChart3 className="h-3.5 w-3.5 inline -mt-0.5" /> Medir ahora</>}
            </button>
          </div>
        </div>

        {history.length === 0 ? (
          <div className="text-center py-8">
            <BarChart3 className="h-8 w-8 text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-gray-500">
              Aún no hay mediciones. Presiona &quot;Medir ahora&quot; para empezar.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* LCP chart */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                LCP — Tiempo de carga principal (ms)
              </p>
              <div className="space-y-1">
                {history.map((snap, i) => {
                  const grade = getGrade("lcp", snap.lcp);
                  const width = Math.max((snap.lcp / maxLcp) * 100, 5);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[9px] text-gray-400 w-14 shrink-0">
                        {new Date(snap.date).toLocaleDateString("es", { day: "2-digit", month: "short" })}
                      </span>
                      <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", grade.color)}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-gray-700 w-14 text-right">
                        {snap.lcp}ms
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* TTFB chart */}
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">
                TTFB — Tiempo de respuesta del servidor (ms)
              </p>
              <div className="space-y-1">
                {history.map((snap, i) => {
                  const grade = getGrade("ttfb", snap.ttfb);
                  const width = Math.max((snap.ttfb / maxTtfb) * 100, 5);
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-[9px] text-gray-400 w-14 shrink-0">
                        {new Date(snap.date).toLocaleDateString("es", { day: "2-digit", month: "short" })}
                      </span>
                      <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", grade.color)}
                          style={{ width: `${width}%` }}
                        />
                      </div>
                      <span className="text-[10px] font-bold text-gray-700 w-14 text-right">
                        {snap.ttfb}ms
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* CLS summary */}
            <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
              <p className="text-[10px] text-gray-500">
                Última estabilidad visual (CLS):
              </p>
              {history.length > 0 && (() => {
                const last = history[history.length - 1];
                const grade = getGrade("cls", last.cls);
                return (
                  <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full text-white", grade.color)}>
                    {last.cls} — {grade.label}
                  </span>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Storage Tab ──────────────────────────────────────────────────────────────

function StorageTab() {
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

      // Storage API
      if (navigator.storage?.estimate) {
        const est = await navigator.storage.estimate();
        data.quota = est.quota || 0;
        data.usage = est.usage || 0;
      }

      // Cache API
      if ("caches" in window) {
        try {
          const names = await caches.keys();
          let total = 0;
          for (const name of names) {
            const cache = await caches.open(name);
            const keys = await cache.keys();
            total += keys.length;
          }
          data.caches = total;
        } catch { /* ignore */ }
      }

      // localStorage size estimate
      try {
        let lsSize = 0;
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key) lsSize += (localStorage.getItem(key)?.length || 0) * 2; // UTF-16
        }
        data.localStorage = lsSize;
      } catch { /* ignore */ }

      // sessionStorage size estimate
      try {
        let ssSize = 0;
        for (let i = 0; i < sessionStorage.length; i++) {
          const key = sessionStorage.key(i);
          if (key) ssSize += (sessionStorage.getItem(key)?.length || 0) * 2;
        }
        data.sessionStorage = ssSize;
      } catch { /* ignore */ }

      setStorage(data);
    }

    measure();
  }, []);

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  if (!storage) {
    return <S />;
  }

  const usagePct = storage.quota > 0 ? (storage.usage / storage.quota) * 100 : 0;

  return (
    <div className="space-y-4">
      {/* Storage overview */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2 mb-3">
          <HardDrive className="h-4 w-4 text-primary" />
          Espacio utilizado
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Como el espacio en tu celular — muestra cuánto está usando la tienda en tu navegador
        </p>

        {/* Progress bar */}
        <div className="relative h-4 bg-gray-100 rounded-full overflow-hidden mb-2">
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-all duration-500",
              usagePct < 50 ? "bg-emerald-500" : usagePct < 80 ? "bg-amber-500" : "bg-red-500"
            )}
            style={{ width: `${Math.min(usagePct, 100)}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-gray-900">
            {formatBytes(storage.usage)} usado
          </span>
          <span className="text-gray-500">
            de {formatBytes(storage.quota)} disponible
          </span>
        </div>
      </div>

      {/* Detail cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StorageCard
          icon={HardDrive}
          label="Datos guardados"
          value={formatBytes(storage.localStorage)}
          description="Configuración, preferencias y datos temporales"
          color="text-blue-500"
        />
        <StorageCard
          icon={MemoryStick}
          label="Sesión actual"
          value={formatBytes(storage.sessionStorage)}
          description="Datos del momento — se borran al cerrar"
          color="text-purple-500"
        />
        <StorageCard
          icon={Globe}
          label="Caché del sitio"
          value={`${storage.caches} archivos`}
          description="Archivos guardados para cargar más rápido"
          color="text-emerald-500"
        />
      </div>
    </div>
  );
}

function StorageCard({
  icon: Icon,
  label,
  value,
  description,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  description: string;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={cn("h-4 w-4", color)} />
        <span className="text-xs font-semibold text-gray-900">{label}</span>
      </div>
      <p className="text-lg font-bold text-gray-900">{value}</p>
      <p className="text-[10px] text-gray-500 mt-0.5">{description}</p>
    </div>
  );
}

// ── Module ───────────────────────────────────────────────────────────────────

export default function RendimientoModule() {
  const [sub, setSub] = useState(TABS[0].id);

  return (
    <div className="space-y-4">
      <AdminModuleHeader
        title="Rendimiento"
        description="Velocidad de tu tienda, salud del sistema y datos de tu dispositivo"
        icon={Gauge}
      />

      <AdminTabBar
        tabs={TABS}
        activeTab={sub}
        onTabChange={setSub}
        moduleId={MODULE_ID}
      >
        {sub === "web-vitals" && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-gray-200 bg-white p-4">
              <h3 className="text-sm font-bold text-gray-900 mb-1">
                ¿Qué tan rápido carga tu tienda?
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                Estas métricas miden la velocidad de tu página — como un velocímetro para tu tienda web.
                Verde = rápido, Amarillo = normal, Rojo = lento.
              </p>
              <WebVitalsWidget />
            </div>
          </div>
        )}
        {sub === "historial" && <PerformanceHistoryTab />}
        {sub === "salud" && <SystemHealthTab />}
        {sub === "navegador" && <BrowserInfoTab />}
        {sub === "almacenamiento" && <StorageTab />}
      </AdminTabBar>
    </div>
  );
}
