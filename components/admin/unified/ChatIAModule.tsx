"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, useCallback } from "react";
import {
  MessageSquare,
  Maximize2,
  Minimize2,
  Settings2,
  X,
  Sparkles,
  Thermometer,
  Brain,
  Zap,
  Info,
} from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { cn } from "@/lib/utils";
import { TabLoadingSkeleton as S } from "@/components/ui/skeletons";

const MODULE_ID = "chat-ia";

const AIAssistant = dynamic(() => import("@/components/admin/AIAssistant"), {
  ssr: false,
  loading: S,
});

// ── Config persistente ──────────────────────────────────────────────────────

interface ChatSettings {
  model: "fast" | "balanced" | "smart";
  tone: "feynman" | "ejecutivo" | "tecnico";
  showSources: boolean;
  autoplay: boolean;
  maxTokens: number;
}

const DEFAULT_SETTINGS: ChatSettings = {
  model: "balanced",
  tone: "feynman",
  showSources: true,
  autoplay: false,
  maxTokens: 1500,
};

const STORAGE_KEY = "chat-ia-settings";

function useChatSettings() {
  const [settings, setSettings] = useState<ChatSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
    } catch {
      /* noop */
    }
  }, []);

  const update = useCallback(<K extends keyof ChatSettings>(key: K, value: ChatSettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* noop */
      }
      return next;
    });
  }, []);

  return { settings, update };
}

// ── Limite de consultas ──────────────────────────────────────────────────────

interface UsageStats {
  used: number;
  limit: number;
  resetAt: string;
  plan: string;
}

const USAGE_STORAGE = "chat-ia-usage";

function useUsage() {
  const [usage, setUsage] = useState<UsageStats>({
    used: 0,
    limit: 100,
    resetAt: getNextReset(),
    plan: "Free",
  });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(USAGE_STORAGE);
      if (raw) {
        const parsed = JSON.parse(raw) as UsageStats;
        // Reset si ya pasó el día del reset
        if (new Date(parsed.resetAt).getTime() < Date.now()) {
          const fresh = { ...parsed, used: 0, resetAt: getNextReset() };
          setUsage(fresh);
          localStorage.setItem(USAGE_STORAGE, JSON.stringify(fresh));
        } else {
          setUsage(parsed);
        }
      }
    } catch {
      /* noop */
    }
  }, []);

  // Listen para eventos de uso del chat (disparados por AIAssistant via custom event)
  useEffect(() => {
    const onQuery = () => {
      setUsage((prev) => {
        const next = { ...prev, used: prev.used + 1 };
        try {
          localStorage.setItem(USAGE_STORAGE, JSON.stringify(next));
        } catch {
          /* noop */
        }
        return next;
      });
    };
    window.addEventListener("chat-ia:query", onQuery);
    return () => window.removeEventListener("chat-ia:query", onQuery);
  }, []);

  return usage;
}

function getNextReset(): string {
  // Reset: primer día del próximo mes a las 00:00
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function ChatIAModule() {
  void MODULE_ID;
  const [maximized, setMaximized] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { settings, update } = useChatSettings();
  const usage = useUsage();

  const usagePct = Math.min(100, (usage.used / usage.limit) * 100);
  const usageColor =
    usagePct >= 90
      ? "bg-[var(--data-error)]"
      : usagePct >= 70
        ? "bg-[var(--data-warning)]"
        : "bg-[var(--data-success)]";

  // ESC sale de maximize
  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMaximized(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [maximized]);

  const toolbar = (
    <div className="flex items-center gap-2 shrink-0">
      <button
        type="button"
        onClick={() => setSettingsOpen((s) => !s)}
        aria-label="Configuración"
        title="Configuración del asistente"
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors",
          settingsOpen
            ? "bg-[var(--surface-sunken)] border-[var(--rule-base)] text-[var(--text-primary)]"
            : "border-[var(--rule-soft)] text-[var(--text-secondary)] hover:border-[var(--rule-base)] hover:text-[var(--text-primary)]",
        )}
      >
        <Settings2 className="h-3.5 w-3.5" />
        <span>Configuración</span>
      </button>
      <button
        type="button"
        onClick={() => setMaximized((m) => !m)}
        aria-label={maximized ? "Minimizar" : "Maximizar"}
        title={maximized ? "Volver al panel" : "Pantalla completa (Esc para salir)"}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--rule-soft)] text-xs font-semibold text-[var(--text-secondary)] hover:border-[var(--rule-base)] hover:text-[var(--text-primary)] transition-colors"
      >
        {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
        <span>{maximized ? "Salir" : "Maximizar"}</span>
      </button>
    </div>
  );

  const usageBar = (
    <div className="shrink-0 min-w-[180px]">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
          Consultas · {usage.plan}
        </span>
        <span className="text-xs font-extrabold tabular-nums text-[var(--text-primary)]">
          {usage.used} <span className="text-[var(--text-tertiary)] font-semibold">/ {usage.limit}</span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-300", usageColor)}
          style={{ width: `${usagePct}%` }}
          role="progressbar"
          aria-valuenow={usage.used}
          aria-valuemin={0}
          aria-valuemax={usage.limit}
        />
      </div>
      <p className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
        Reinicia el{" "}
        {new Date(usage.resetAt).toLocaleDateString("es-PE", {
          day: "numeric",
          month: "short",
        })}
      </p>
    </div>
  );

  const content = (
    <div
      className={cn(
        "flex flex-col overflow-hidden bg-white dark:bg-card",
        maximized
          ? "fixed inset-0 z-[9999]"
          : "rounded-xl border border-[var(--rule-base)] min-h-[600px] h-[calc(100vh-220px)]",
      )}
    >
      {/* Barra superior: progress + toolbar */}
      <div className="flex items-center justify-between gap-4 px-5 py-3 border-b border-[var(--rule-soft)] bg-[var(--surface-raised)] shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)]">
            <Sparkles className="h-4 w-4 text-[var(--data-success)]" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-[var(--text-primary)] leading-tight truncate">
              Asistente Ejecutivo IA
            </p>
            <p className="text-[11px] text-[var(--text-tertiary)] leading-tight">
              Análisis en tiempo real · Feynman simple · {modelLabel(settings.model)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {usageBar}
          {toolbar}
        </div>
      </div>

      {/* Layout chat + settings side panel */}
      <div className="flex-1 flex overflow-hidden">
        <div
          className={cn(
            "flex-1 overflow-hidden transition-all",
            // Tipografía base para el chat — evita que la IA responda en texto muy chico.
            "[&_.prose]:text-[15px] [&_.prose]:leading-relaxed",
            "[&_p]:text-[15px] [&_p]:leading-relaxed",
            "[&_li]:text-[15px] [&_li]:leading-relaxed",
            "[&_textarea]:text-[15px]",
            "[&_input]:text-[15px]",
          )}
        >
          <AIAssistant embedded />
        </div>

        {/* Settings panel (slide-in from right) */}
        {settingsOpen && (
          <aside className="w-[320px] shrink-0 border-l border-[var(--rule-soft)] bg-[var(--surface-raised)] overflow-y-auto">
            <SettingsPanel
              settings={settings}
              onUpdate={update}
              onClose={() => setSettingsOpen(false)}
            />
          </aside>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {!maximized && (
        <AdminModuleHeader
          title="Chat IA"
          description="Pregúntale cualquier cosa de tu negocio. Respuestas simples con ejemplos reales (método Feynman)."
          icon={MessageSquare}
        />
      )}
      {content}
    </div>
  );
}

function modelLabel(m: ChatSettings["model"]): string {
  return m === "fast" ? "Rápido" : m === "smart" ? "Inteligente" : "Balanceado";
}

// ── Settings Panel ───────────────────────────────────────────────────────────

function SettingsPanel({
  settings,
  onUpdate,
  onClose,
}: {
  settings: ChatSettings;
  onUpdate: <K extends keyof ChatSettings>(key: K, value: ChatSettings[K]) => void;
  onClose: () => void;
}) {
  return (
    <div className="p-5 space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Configuración
          </p>
          <h3 className="text-base font-extrabold text-[var(--text-primary)] leading-tight">
            Personaliza tu IA
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-8 w-8 inline-flex items-center justify-center rounded-lg hover:bg-[var(--surface-sunken)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          aria-label="Cerrar configuración"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {/* Modelo */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Brain className="h-4 w-4 text-[var(--text-secondary)]" />
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Modelo
          </p>
        </div>
        <div className="space-y-1.5">
          {(["fast", "balanced", "smart"] as const).map((m) => {
            const active = settings.model === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => onUpdate("model", m)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors flex items-start gap-3",
                  active
                    ? "border-[var(--text-primary)] bg-[var(--surface-sunken)]"
                    : "border-[var(--rule-soft)] hover:border-[var(--rule-base)]",
                )}
              >
                <span
                  className={cn(
                    "h-4 w-4 rounded-full border-2 shrink-0 mt-0.5",
                    active ? "border-[var(--text-primary)] bg-[var(--text-primary)]" : "border-[var(--rule-base)]",
                  )}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[var(--text-primary)]">{modelLabel(m)}</p>
                  <p className="text-[11px] text-[var(--text-tertiary)] leading-snug mt-0.5">
                    {m === "fast"
                      ? "Responde en 1-2 seg. Ideal para preguntas simples."
                      : m === "smart"
                        ? "Más lento pero razona mejor. Ideal para análisis estratégico."
                        : "Balance entre velocidad y profundidad. Default."}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Tono */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <MessageSquare className="h-4 w-4 text-[var(--text-secondary)]" />
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Tono de respuesta
          </p>
        </div>
        <div className="space-y-1.5">
          {(["feynman", "ejecutivo", "tecnico"] as const).map((t) => {
            const active = settings.tone === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => onUpdate("tone", t)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors",
                  active
                    ? "border-[var(--text-primary)] bg-[var(--surface-sunken)]"
                    : "border-[var(--rule-soft)] hover:border-[var(--rule-base)]",
                )}
              >
                <p className="font-bold text-[var(--text-primary)] capitalize">
                  {t === "feynman" ? "Simple (Feynman)" : t === "ejecutivo" ? "Ejecutivo" : "Técnico"}
                </p>
                <p className="text-[11px] text-[var(--text-tertiary)] leading-snug mt-0.5">
                  {t === "feynman"
                    ? "Explica con ejemplos del día a día. Define cada término técnico."
                    : t === "ejecutivo"
                      ? "Directo, números, sin explicaciones largas."
                      : "Jerga técnica completa. Para usuarios avanzados."}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Flags */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-[var(--text-secondary)]" />
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Opciones
          </p>
        </div>
        <div className="space-y-2.5">
          <ToggleRow
            label="Mostrar fuentes"
            description="Cita de dónde sacó los datos (módulo + fecha)"
            checked={settings.showSources}
            onChange={(v) => onUpdate("showSources", v)}
          />
          <ToggleRow
            label="Auto-leer respuestas"
            description="Texto a voz automático al recibir respuesta"
            checked={settings.autoplay}
            onChange={(v) => onUpdate("autoplay", v)}
          />
        </div>
      </section>

      {/* MaxTokens */}
      <section>
        <div className="flex items-center gap-2 mb-2">
          <Thermometer className="h-4 w-4 text-[var(--text-secondary)]" />
          <p className="text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
            Longitud máxima
          </p>
        </div>
        <input
          type="range"
          min={500}
          max={4000}
          step={100}
          value={settings.maxTokens}
          onChange={(e) => onUpdate("maxTokens", Number(e.target.value))}
          className="w-full accent-[var(--text-primary)]"
        />
        <div className="flex justify-between text-[11px] text-[var(--text-tertiary)] mt-1">
          <span>Corto</span>
          <span className="font-bold text-[var(--text-primary)] tabular-nums">
            {settings.maxTokens} tokens
          </span>
          <span>Largo</span>
        </div>
      </section>

      {/* Info */}
      <section className="rounded-lg bg-[var(--surface-sunken)] p-3 flex items-start gap-2">
        <Info className="h-4 w-4 text-[var(--text-tertiary)] shrink-0 mt-0.5" />
        <p className="text-[11px] text-[var(--text-secondary)] leading-snug">
          Tu configuración se guarda localmente. Afecta a todas tus conversaciones futuras
          hasta que la cambies.
        </p>
      </section>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors shrink-0 mt-0.5",
          checked ? "bg-[var(--text-primary)]" : "bg-[var(--rule-base)]",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all shadow-sm",
            checked ? "left-4" : "left-0.5",
          )}
        />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)] leading-tight">{label}</p>
        <p className="text-[11px] text-[var(--text-tertiary)] leading-snug mt-0.5">{description}</p>
      </div>
    </label>
  );
}
