"use client";
import { SectionTitle } from "@buleje/design-system";
 
import { useState, useEffect } from "react";
import { Smartphone, Copy, Check, Info } from "@buleje/design-system/icons";
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Smartphone className="w-5 h-5 text-primary" />
          <SectionTitle className="text-lg font-semibold text-[var(--text-primary)]">
            Shortcuts PWA
          </SectionTitle>
        </div>

        {isInstalled ? (
          <span className="flex items-center gap-1.5 text-xs font-medium text-[var(--data-success-500)] dark:text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] px-2.5 py-1 rounded-full">
            <Check className="w-3.5 h-3.5" />
            App instalada
          </span>
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] bg-[var(--surface-sunken)] px-2.5 py-1 rounded-full">
            No instalada
          </span>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-[var(--rule-base)] p-1 bg-[var(--surface-sunken)]">
        {(["config", "preview", "install"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 py-1.5 rounded-md text-sm font-medium transition-colors",
              activeTab === tab
                ? "bg-primary text-white"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] dark:hover:text-[var(--text-tertiary)]"
            )}
          >
            {tab === "config" ? "Configurar" : tab === "preview" ? "Vista previa" : "Instalar"}
          </button>
        ))}
      </div>

      {/* Tab: Configurar */}
      {activeTab === "config" && (
        <div className="space-y-2">
          <p className="text-xs text-[var(--text-tertiary)]">
            Selecciona hasta 4 shortcuts (los primeros 4 habilitados se usan en el manifest).
          </p>
          {shortcuts.map((s) => (
            <div
              key={s.id}
              onClick={() => toggleShortcut(s.id)}
              className={cn(
                "rounded-lg border p-4 cursor-pointer flex items-center gap-4 transition-all select-none",
                s.enabled
                  ? "border-primary bg-primary/5 dark:bg-primary/10"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:bg-gray-50 dark:hover:bg-gray-750"
              )}
            >
              {/* Checkbox visual */}
              <div
                className={cn(
                  "w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors",
                  s.enabled
                    ? "border-primary bg-primary"
                    : "border-[var(--rule-base)] dark:border-gray-600"
                )}
              >
                {s.enabled && <Check className="w-3 h-3 text-white" />}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-[var(--text-primary)]">
                  {s.name}
                </p>
                <p className="text-xs text-[var(--text-tertiary)] truncate">
                  {s.description}
                </p>
                <p className="text-xs text-[var(--text-tertiary)] font-mono mt-0.5">
                  {s.url}
                </p>
              </div>

              {s.enabled && activeShortcuts.indexOf(s) < 4 && (
                <span className="shrink-0 text-xs font-medium text-primary dark:text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  #{activeShortcuts.indexOf(s) + 1}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Tab: Preview */}
      {activeTab === "preview" && (
        <div className="space-y-6">
          <p className="text-xs text-[var(--text-tertiary)]">
            Asi aparecen los shortcuts en el menu del celular al mantener presionado el icono de la app.
          </p>

          {/* Simulacion de menu de celular */}
          <div className="mx-auto w-64 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden">
            <div className="bg-[var(--surface-sunken)] px-4 py-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center">
                <Smartphone className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Buleje
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">buleje.pe</p>
              </div>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {activeShortcuts.length === 0 ? (
                <div className="px-4 py-6 text-xs text-[var(--text-tertiary)] text-center">
                  Habilita al menos un shortcut
                </div>
              ) : (
                activeShortcuts.map((s) => (
                  <div key={s.id} className="px-4 py-3 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Smartphone className="w-4 h-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        {s.name}
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        {s.description}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* JSON generado */}
          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[var(--rule-base)]">
              <span className="text-xs font-mono text-[var(--text-tertiary)]">
                manifest.json — sección shortcuts
              </span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-xs text-primary dark:text-primary hover:underline"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <pre className="px-4 py-3 text-xs text-[var(--text-secondary)] overflow-x-auto font-mono leading-relaxed max-h-56 overflow-y-auto">
              {manifestJson}
            </pre>
          </div>
        </div>
      )}

      {/* Tab: Instalar */}
      {activeTab === "install" && (
        <div className="space-y-6">
          {isInstalled ? (
            <div className="rounded-xl border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] p-4 flex items-start gap-3">
              <Check className="w-5 h-5 text-[var(--data-success-500)] dark:text-[var(--data-success-500)] shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-[var(--data-success-500)] dark:text-[var(--data-success-500)] text-sm">
                  La app ya esta instalada en este dispositivo
                </p>
                <p className="text-xs text-[var(--data-success-500)] dark:text-[var(--data-success-500)] mt-0.5">
                  Los shortcuts estan disponibles en tu pantalla de inicio.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] p-4 flex items-start gap-3">
              <Info className="w-5 h-5 text-[var(--data-success-500)] dark:text-[var(--data-success-500)] shrink-0 mt-0.5" />
              <p className="text-sm text-[var(--data-success-500)] dark:text-[var(--data-success-500)]">
                Esta app aun no esta instalada en este dispositivo. Sigue los pasos para instalarla.
              </p>
            </div>
          )}

          <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4 space-y-4">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
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
                <p className="text-xs font-semibold text-[var(--text-tertiary)] mb-2">
                  {device}
                </p>
                <ol className="space-y-1.5">
                  {steps.map((step, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary dark:text-primary text-xs font-bold flex items-center justify-center mt-0.5">
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
