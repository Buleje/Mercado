"use client";
/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from "react";
import { Smartphone, Copy, Check, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ── */
interface PWAShortcut {
  id: string;
  name: string;
  short_name: string;
  description: string;
  url: string;
  icon: string;
  enabled: boolean;
}

/* ── Shortcuts disponibles ── */
const AVAILABLE_SHORTCUTS: PWAShortcut[] = [
  {
    id: "nueva-venta",
    name: "Nueva venta",
    short_name: "Venta",
    description: "Abrir el punto de venta directamente",
    url: "/pos",
    icon: "/icons/shortcut-pos.png",
    enabled: true,
  },
  {
    id: "ver-caja",
    name: "Ver caja",
    short_name: "Caja",
    description: "Ver el estado actual de la caja",
    url: "/admin/caja",
    icon: "/icons/shortcut-caja.png",
    enabled: true,
  },
  {
    id: "pedidos",
    name: "Pedidos",
    short_name: "Pedidos",
    description: "Gestionar pedidos pendientes",
    url: "/admin/pedidos",
    icon: "/icons/shortcut-pedidos.png",
    enabled: false,
  },
  {
    id: "inventario",
    name: "Inventario",
    short_name: "Stock",
    description: "Consultar y actualizar inventario",
    url: "/admin/inventario",
    icon: "/icons/shortcut-stock.png",
    enabled: false,
  },
  {
    id: "reportes",
    name: "Reportes",
    short_name: "Reportes",
    description: "Ver reportes de ventas del dia",
    url: "/admin/reportes",
    icon: "/icons/shortcut-reportes.png",
    enabled: false,
  },
];

const STORAGE_KEY = "pwa_shortcuts_config";

/* ── Detectar modo standalone ── */
function isPWAInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/* ── Component ── */
export default function PWAShortcuts() {
  const [shortcuts, setShortcuts] = useState<PWAShortcut[]>(AVAILABLE_SHORTCUTS);
  const [isInstalled, setIsInstalled] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"config" | "preview" | "install">("config");

  /* Cargar configuracion */
  useEffect(() => {
    setIsInstalled(isPWAInstalled());

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const savedIds: Record<string, boolean> = JSON.parse(stored);
        setShortcuts((prev) =>
          prev.map((s) => ({ ...s, enabled: savedIds[s.id] ?? s.enabled }))
        );
      }
    } catch {
      /* silencio */
    }
  }, []);

  const toggleShortcut = (id: string) => {
    const updated = shortcuts.map((s) =>
      s.id === id ? { ...s, enabled: !s.enabled } : s
    );
    setShortcuts(updated);
    const map: Record<string, boolean> = {};
    updated.forEach((s) => { map[s.id] = s.enabled; });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  };

  const activeShortcuts = shortcuts.filter((s) => s.enabled).slice(0, 4);

  /* Generar JSON para manifest */
  const manifestJson = JSON.stringify(
    {
      shortcuts: activeShortcuts.map((s) => ({
        name: s.name,
        short_name: s.short_name,
        description: s.description,
        url: s.url,
        icons: [{ src: s.icon, sizes: "96x96", type: "image/png" }],
      })),
    },
    null,
    2
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(manifestJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* silencio */
    }
  };

  /* ── Render ── */
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-[#00B4A6]" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Shortcuts PWA
          </h2>
        </div>

        {isInstalled ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/30 px-2.5 py-1 rounded-full">
            <Check className="w-3.5 h-3.5" />
            App instalada
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2.5 py-1 rounded-full">
            No instalada
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-gray-200 dark:border-gray-700 p-1 bg-gray-50 dark:bg-gray-800">
        {(["config", "preview", "install"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 py-1.5 rounded-md text-sm font-medium transition-colors",
              activeTab === tab
                ? "bg-[#00B4A6] text-white"
                : "text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
            )}
          >
            {tab === "config" ? "Configurar" : tab === "preview" ? "Vista previa" : "Instalar"}
          </button>
        ))}
      </div>

      {/* Tab: Configurar */}
      {activeTab === "config" && (
        <div className="space-y-2">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Selecciona hasta 4 shortcuts (los primeros 4 habilitados se usan en el manifest).
          </p>
          {shortcuts.map((s) => (
            <div
              key={s.id}
              onClick={() => toggleShortcut(s.id)}
              className={cn(
                "rounded-xl border p-4 cursor-pointer flex items-center gap-4 transition-all select-none",
                s.enabled
                  ? "border-[#00B4A6] bg-[#00B4A6]/5 dark:bg-[#00B4A6]/10"
                  : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-750"
              )}
            >
              {/* Checkbox visual */}
              <div
                className={cn(
                  "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors",
                  s.enabled
                    ? "border-[#00B4A6] bg-[#00B4A6]"
                    : "border-gray-300 dark:border-gray-600"
                )}
              >
                {s.enabled && <Check className="w-3 h-3 text-white" />}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-gray-900 dark:text-gray-100">
                  {s.name}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  {s.description}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 font-mono mt-0.5">
                  {s.url}
                </p>
              </div>

              {s.enabled && activeShortcuts.indexOf(s) < 4 && (
                <span className="shrink-0 text-xs font-medium text-[#00B4A6] dark:text-[#2dd4bf] bg-[#00B4A6]/10 px-2 py-0.5 rounded-full">
                  #{activeShortcuts.indexOf(s) + 1}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tab: Preview */}
      {activeTab === "preview" && (
        <div className="space-y-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Asi aparecen los shortcuts en el menu del celular al mantener presionado el icono de la app.
          </p>

          {/* Simulacion de menu de celular */}
          <div className="mx-auto w-64 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl overflow-hidden">
            <div className="bg-gray-100 dark:bg-gray-700 px-4 py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#00B4A6] flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  Buleje
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">buleje.pe</p>
              </div>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {activeShortcuts.length === 0 ? (
                <div className="px-4 py-6 text-xs text-gray-400 text-center">
                  Habilita al menos un shortcut
                </div>
              ) : (
                activeShortcuts.map((s) => (
                  <div key={s.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#00B4A6]/10 flex items-center justify-center shrink-0">
                      <Smartphone className="w-4 h-4 text-[#00B4A6]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {s.name}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500">
                        {s.description}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* JSON generado */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-200 dark:border-gray-700">
              <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
                manifest.json — sección shortcuts
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-xs text-[#00B4A6] dark:text-[#2dd4bf] hover:underline"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <pre className="px-4 py-3 text-xs text-gray-700 dark:text-gray-300 overflow-x-auto font-mono leading-relaxed max-h-56 overflow-y-auto">
              {manifestJson}
            </pre>
          </div>
        </div>
      )}

      {/* Tab: Instalar */}
      {activeTab === "install" && (
        <div className="space-y-4">
          {isInstalled ? (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/10 p-4 flex items-start gap-3">
              <Check className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-emerald-800 dark:text-emerald-300 text-sm">
                  La app ya esta instalada en este dispositivo
                </p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                  Los shortcuts estan disponibles en tu pantalla de inicio.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/10 p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Esta app aun no esta instalada en este dispositivo. Sigue los pasos para instalarla.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-4">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
              Como instalar la PWA
            </p>

            {[
              {
                device: "Android (Chrome)",
                steps: [
                  "Abre la app en Chrome",
                  "Toca el menu (3 puntos) arriba a la derecha",
                  "Selecciona 'Agregar a pantalla de inicio'",
                  "Confirma con 'Agregar'",
                ],
              },
              {
                device: "iPhone / iPad (Safari)",
                steps: [
                  "Abre la app en Safari",
                  "Toca el boton compartir (cuadrado con flecha)",
                  "Desplaza y elige 'Agregar a inicio'",
                  "Toca 'Agregar' arriba a la derecha",
                ],
              },
            ].map(({ device, steps }) => (
              <div key={device}>
                <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                  {device}
                </p>
                <ol className="space-y-1.5">
                  {steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-[#00B4A6]/10 text-[#00B4A6] dark:text-[#2dd4bf] text-xs font-bold flex items-center justify-center mt-0.5">
                        {i + 1}
                      </span>
                      {step}
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
