"use client";

import { CardTitle } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Bot, X, Send, Mic, MicOff, Sparkles,
  AlertTriangle, TrendingUp, Package, Users, Lightbulb,
  Loader2, Maximize2, Minimize2, Trash2,
  Volume2, VolumeX, Play, Clock, BarChart3, WifiOff, Bell, Check, XCircle,
  History, Star, Command, ChevronRight, ArrowRight, Zap,
  Table, BarChart, Activity, Search } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { escapeHtml } from "@/lib/safe-html";

// ── Types ─────────────────────────────────────────────────────────────────────

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  actions?: ParsedAction[];
};

type ParsedAction = {
  type: string;
  payload: Record<string, unknown>;
  label: string;
  status: "pending" | "executing" | "done" | "error";
  result?: string;
};

type SessionSummary = {
  id: string;
  date: string;
  messageCount: number;
  summary: string;
};

type UsageEntry = {
  ts: number;
  query: string;
  responseMs: number;
};

type QuickAction = {
  label: string;
  icon: React.ElementType;
  prompt: string;
  color: string;
  category: string;
};

type WidgetSize = "mini" | "medium" | "large";

// ── Constants ─────────────────────────────────────────────────────────────────

// Mejora 30: Grouped Quick Actions by category
const QUICK_ACTIONS: QuickAction[] = [
  { label: "¿Qué debo hacer ahora?", icon: Lightbulb, prompt: "Analiza la situación actual del negocio y dime las 5 acciones más urgentes que debo tomar HOY, en orden de prioridad. Incluye a qué módulo ir para cada acción.", color: "text-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-amber-950/30 border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/40", category: "Prioridades" },
  { label: "Estado del negocio", icon: TrendingUp, prompt: "Dame un diagnóstico ejecutivo completo del estado actual del negocio: ventas, inventario, clientes, deudas. Resalta lo positivo y lo que necesita atención urgente.", color: "text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30", category: "Análisis" },
  { label: "Alertas urgentes", icon: AlertTriangle, prompt: "¿Hay alguna alerta urgente? Stock agotado, pedidos sin atender, facturas vencidas, clientes en riesgo. Solo lo crítico.", color: "text-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-red-950/30 border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/40", category: "Prioridades" },
  { label: "Ideas de productos", icon: Package, prompt: "Basándote en mis productos más vendidos y tendencias, ¿qué productos nuevos me recomiendas agregar al catálogo? Dame 5 ideas con precio sugerido y por qué.", color: "text-[var(--data-success-500)] bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30", category: "Estrategia" },
  { label: "Retener clientes", icon: Users, prompt: "¿Cómo puedo retener mejor a mis clientes actuales? Dame estrategias basadas en los datos reales de mis clientes top y su comportamiento de compra.", color: "text-[var(--text-secondary)] bg-[var(--surface-sunken)] border-[var(--rule-base)]", category: "Estrategia" },
  { label: "Plan semanal", icon: Sparkles, prompt: "Crea un plan semanal de tareas ejecutivas para esta semana. Incluye: qué revisar cada día, qué módulo usar, y qué métricas monitorear. Formato tabla o bullets.", color: "text-[var(--text-secondary)] bg-[var(--surface-sunken)] border-[var(--rule-base)]", category: "Análisis" },
  { label: "Ventas de hoy", icon: BarChart, prompt: "Dame un resumen detallado de las ventas de hoy: total vendido, cantidad de pedidos, ticket promedio, productos más vendidos, y comparación con ayer.", color: "text-[var(--data-info-500)] bg-[var(--data-info-50)] dark:bg-cyan-950/30 border-[var(--data-info-500)] dark:border-[var(--data-info-500)]/40", category: "Análisis" },
  { label: "Hazlo por mí", icon: Zap, prompt: "Quiero que ejecutes acciones automáticamente. Revisa qué se necesita hacer urgente y propón acciones ejecutables que yo solo tenga que confirmar.", color: "text-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-orange-950/30 border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/40", category: "Prioridades" },
];

const GREETING: Message = {
  id: "greeting",
  role: "assistant",
  content: `**Hola. Soy tu Asistente Ejecutivo IA.**

Estoy aquí para ayudarte a gestionar tu negocio como un profesional. Puedo:

- **Analizar** la situación actual y darte un diagnóstico
- **Priorizar** qué hacer ahora vs qué puede esperar
- **Alertar** sobre problemas urgentes
- **Recomendar** estrategias de ventas, precios e inventario
- **Asignar tareas** y crear planes de acción
- **Sugerir productos** para agregar al catálogo
- **Ejecutar acciones** directamente — precios, stock, productos
- **Hablar** — activa el sonido para escuchar mis respuestas

**Pregúntame lo que necesites** o usa las acciones rápidas de abajo.`,
  timestamp: Date.now(),
};

// ── Offline pre-calculated responses ──────────────────────────────────────────

const OFFLINE_RESPONSES: Record<string, string> = {
  "estado": "**Modo sin conexión** — No puedo consultar datos en tiempo real, pero aquí tienes una guía general:\n\n1. Revisa pedidos pendientes en \"pedidos\"\n2. Verifica stock crítico en \"inventario-almacenes\"\n3. Revisa facturas vencidas en \"tesoreria\"\n4. Consulta ventas del día en \"panel-principal\"\n\nConéctate a internet para un análisis personalizado.",
  "urgente": "**Modo sin conexión** — Sin acceso a datos reales, te sugiero:\n\n- **Pedidos**: Revisa \"pedidos\" para pendientes sin confirmar\n- **Stock**: Ve a \"inventario-almacenes\" y filtra por agotados\n- **Pagos**: Revisa \"tesoreria\" para facturas vencidas\n\nPara alertas basadas en datos reales, necesito conexión.",
  "productos": "**Modo sin conexión** — Sugerencias generales para bodega:\n\n1. Productos de temporada (según época del año)\n2. Complementos a tu top vendedor\n3. Productos con alto margen en tu categoría principal\n4. Items de impulso para el mostrador\n\nConéctate para recomendaciones basadas en tus datos.",
  "default": "**Modo sin conexión** — No puedo responder con datos en tiempo real.\n\nMientras tanto puedes:\n- Revisar \"panel-principal\" para tu dashboard\n- Consultar \"inventario-almacenes\" para stock\n- Ir a \"pedidos\" para gestionar pendientes\n\nReconecta a internet para un análisis completo.",
};

function getOfflineResponse(query: string): string {
  const q = query.toLowerCase();
  if (q.includes("estado") || q.includes("diagnóstico") || q.includes("negocio")) return OFFLINE_RESPONSES.estado;
  if (q.includes("urgente") || q.includes("alerta") || q.includes("crítico")) return OFFLINE_RESPONSES.urgente;
  if (q.includes("producto") || q.includes("agregar") || q.includes("catálogo")) return OFFLINE_RESPONSES.productos;
  return OFFLINE_RESPONSES.default;
}

// ── Action parser ─────────────────────────────────────────────────────────────

function parseActions(content: string): { cleanContent: string; actions: ParsedAction[] } {
  const actionRegex = /\[ACTION:([a-z_]+)\|(\{.*?\})\|(.+?)\]/g;
  const actions: ParsedAction[] = [];
  const cleanContent = content.replace(actionRegex, (_match, type, payloadStr, label) => {
    try {
      const payload = JSON.parse(payloadStr);
      actions.push({ type, payload, label, status: "pending" });
    } catch { /* skip malformed */ }
    return "";
  }).replace(/\n{3,}/g, "\n\n");
  return { cleanContent, actions };
}

// ── Usage tracking helpers ────────────────────────────────────────────────────

const USAGE_KEY = "buleje-ai-usage";
const MAX_USAGE_ENTRIES = 200;

function trackUsage(query: string, responseMs: number) {
  try {
    const stored = JSON.parse(localStorage.getItem(USAGE_KEY) ?? "[]") as UsageEntry[];
    stored.push({ ts: Date.now(), query: query.slice(0, 100), responseMs });
    localStorage.setItem(USAGE_KEY, JSON.stringify(stored.slice(-MAX_USAGE_ENTRIES)));
  } catch { /* ignore */ }
}

function getUsageStats(): { total: number; avgMs: number; topQueries: string[]; todayCount: number } {
  try {
    const stored = JSON.parse(localStorage.getItem(USAGE_KEY) ?? "[]") as UsageEntry[];
    const today = new Date().toISOString().slice(0, 10);
    const todayEntries = stored.filter(e => new Date(e.ts).toISOString().slice(0, 10) === today);
    const avgMs = stored.length > 0 ? Math.round(stored.reduce((s, e) => s + e.responseMs, 0) / stored.length) : 0;
    const freq: Record<string, number> = {};
    stored.forEach(e => { const k = e.query.slice(0, 50); freq[k] = (freq[k] ?? 0) + 1; });
    const topQueries = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([q]) => q);
    return { total: stored.length, avgMs, topQueries, todayCount: todayEntries.length };
  } catch {
    return { total: 0, avgMs: 0, topQueries: [], todayCount: 0 };
  }
}

// ── Session history helpers ───────────────────────────────────────────────────

const SESSIONS_KEY = "buleje-ai-sessions";
const MAX_SESSIONS = 20;

function saveSession(messages: Message[]) {
  const userMsgs = messages.filter(m => m.role === "user");
  const assistantMsgs = messages.filter(m => m.role === "assistant" && m.id !== "greeting");
  if (userMsgs.length === 0) return;
  const summary = userMsgs.slice(0, 3).map(m => m.content.slice(0, 60)).join(" · ");
  const session: SessionSummary = {
    id: `s-${Date.now()}`,
    date: new Date().toLocaleDateString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
    messageCount: userMsgs.length + assistantMsgs.length,
    summary: summary.slice(0, 120),
  };
  try {
    const stored = JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? "[]") as SessionSummary[];
    stored.unshift(session);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(stored.slice(0, MAX_SESSIONS)));
  } catch { /* ignore */ }
}

function getSessions(): SessionSummary[] {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? "[]") as SessionSummary[];
  } catch { return []; }
}

// ── Mejora 34: Favorites helpers ──────────────────────────────────────────────

const FAVORITES_KEY = "buleje-ai-favorites";
function getFavorites(): string[] {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]"); } catch { return []; }
}
function toggleFavorite(prompt: string) {
  const favs = getFavorites();
  const idx = favs.indexOf(prompt);
  if (idx >= 0) favs.splice(idx, 1);
  else favs.unshift(prompt);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs.slice(0, 10)));
  return favs;
}

// ── Module-contextual suggestions ────────────────────────────────────────────

const MODULE_SUGGESTIONS: Record<string, string[]> = {
  inventario: ["¿Stock bajo?", "¿Productos por vencer?", "¿Qué debo reponer?"],
  "analytics-pro": ["¿Ventas de hoy?", "¿Pedidos pendientes?", "¿Cuánto vendí ayer?"],
  compras: ["¿Qué debo pedir?", "¿A quién le debo?", "¿Compras del mes?"],
  plata: ["¿Cuánto gané hoy?", "¿Gastos del mes?", "¿Balance general?"],
  clientes: ["¿Clientes inactivos?", "¿Quién me debe?", "¿Clientes frecuentes?"],
  productos: ["¿Qué se vende más?", "¿Actualizar precios?", "¿Productos sin stock?"],
};

// ── Mejora 36: Time-based predictive suggestions ─────────────────────────────

function getTimeSuggestions(): string[] {
  const hour = new Date().getHours();
  if (hour < 10) return ["¿Qué debo hacer hoy?", "Resumen de ayer", "Alertas de la mañana"];
  if (hour < 14) return ["¿Cómo van las ventas?", "¿Pedidos sin atender?", "Productos más vendidos hoy"];
  if (hour < 18) return ["Cierre parcial del día", "¿Stock a reponer mañana?", "Performance de hoy"];
  return ["Resumen del día", "Plan para mañana", "¿Qué salió bien hoy?"];
}

// ── Mejora 21: Command Palette Commands ──────────────────────────────────────

const CMD_PALETTE_ITEMS = [
  { cmd: "/ventas", label: "Ver ventas de hoy", navTo: "analytics-pro", icon: BarChart },
  { cmd: "/inventario", label: "Revisar inventario", navTo: "inventario-almacenes", icon: Package },
  { cmd: "/clientes", label: "Panel de clientes", navTo: "clientes", icon: Users },
  { cmd: "/pedidos", label: "Gestionar pedidos", navTo: "pedidos", icon: Table },
  { cmd: "/alertas", label: "Ver alertas urgentes", prompt: "¿Hay alertas urgentes? Dame un resumen.", icon: AlertTriangle },
  { cmd: "/estado", label: "Estado del negocio", prompt: "Diagnóstico ejecutivo completo del negocio", icon: Activity },
  { cmd: "/plan", label: "Plan semanal", prompt: "Crea un plan semanal de tareas ejecutivas", icon: Sparkles },
];

// ── Mejora 38: Guided Tour ───────────────────────────────────────────────────

const TOUR_KEY = "buleje-ai-tour-done";
const TOUR_STEPS = [
  { msg: "**Bienvenido.** Este es tu asistente IA. Te voy a enseñar cómo usarlo en 30 segundos." },
  { msg: "**Escríbeme lo que necesites** — puedo responder preguntas sobre ventas, inventario, clientes, o cualquier parte del negocio." },
  { msg: "**Acciones rápidas** — Usa los botones de colores abajo para consultas frecuentes con un solo clic." },
  { msg: "**Escribe / para comandos** — por ejemplo `/ventas` te lleva directo al módulo de ventas." },
  { msg: "**Favoritos** — Marca tus consultas favoritas con la estrella para acceder rápido." },
  { msg: "**Voz** — Habla directamente apretando el micrófono. Listo, ya sabes lo principal." },
];

// ── Component ─────────────────────────────────────────────────────────────────

interface AIAssistantProps {
  onNavigate?: (tab: string) => void;
  embedded?: boolean;
  moduleContext?: string;
}

export default function AIAssistant({ onNavigate, embedded, moduleContext }: AIAssistantProps) {
  const [open, setOpen] = useState(!!embedded);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === "undefined") return [GREETING];
    try {
      const saved = localStorage.getItem("bodega-chat-history");
      if (saved) {
        const parsed = JSON.parse(saved) as Message[];
        return parsed.length > 0 ? parsed : [GREETING];
      }
    } catch { /* ignore */ }
    return [GREETING];
  });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [pulse, setPulse] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(false);
  const [showPanel, setShowPanel] = useState<"chat" | "history" | "stats">("chat");
  const [notifications, setNotifications] = useState<string[]>([]);
  const [isOffline, setIsOffline] = useState(false);

  // Mejora 28: Widget size
  const [widgetSize, setWidgetSize] = useState<WidgetSize>("medium");

  // Mejora 21: Command palette
  const [showCmdPalette, setShowCmdPalette] = useState(false);
  const [cmdSearch, setCmdSearch] = useState("");

  // Mejora 34: Favorites
  const [favorites, setFavorites] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    return getFavorites();
  });

  // Mejora 38: Guided tour
  const [tourStep, setTourStep] = useState(-1);

  // Mejora 39: Health indicator
  const [healthScore, setHealthScore] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const notifCheckingRef = useRef(false);

  // Persist messages
  useEffect(() => {
    if (messages.length > 1 || messages[0]?.id !== "greeting") {
      localStorage.setItem("bodega-chat-history", JSON.stringify(messages.slice(-50)));
    }
  }, [messages]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 100);
  }, [open]);

  // Pulse animation for new insights
  useEffect(() => {
    const timer = setInterval(() => {
      if (!open) setPulse(true);
      setTimeout(() => setPulse(false), 2000);
    }, 30000);
    return () => clearInterval(timer);
  }, [open]);

  // Online/offline detection
  useEffect(() => {
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    setIsOffline(!navigator.onLine);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => { window.removeEventListener("offline", goOffline); window.removeEventListener("online", goOnline); };
  }, []);

  // Mejora 38: Auto-show tour for new users
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!localStorage.getItem(TOUR_KEY)) setTourStep(0);
  }, []);

  // ── Mejora 21: Keyboard shortcut for command palette ──────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowCmdPalette(s => !s);
      }
      if (e.key === "Escape" && showCmdPalette) {
        setShowCmdPalette(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showCmdPalette]);

  // ── Proactive notifications: check every 2 min ────────────────────────────
  useEffect(() => {
    async function checkAlerts() {
      if (!navigator.onLine || notifCheckingRef.current) return;
      notifCheckingRef.current = true;
      try {
        const res = await fetch("/api/ai-assistant", {
          method: "POST",
          headers: csrfHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            message: "Dame solo alertas URGENTES en 1 línea cada una. Máximo 3 alertas. Si no hay nada urgente, responde exactamente: SIN_ALERTAS. También dame un puntaje de salud general del negocio de 0 a 100 en formato HEALTH:XX",
            history: [],
            stream: false,
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const reply = data.reply ?? "";

        // Mejora 39: Extract health score
        const healthMatch = reply.match(/HEALTH:(\d+)/);
        if (healthMatch) setHealthScore(Math.min(100, Math.max(0, parseInt(healthMatch[1]))));

        if (!reply.includes("SIN_ALERTAS") && reply.trim().length > 10) {
          const alerts = reply.split("\n").filter((l: string) => l.trim().length > 5 && !l.includes("HEALTH:")).slice(0, 3);
          if (alerts.length > 0) {
            setNotifications(alerts);
            if (!open) setPulse(true);
          }
        }
      } catch { /* ignore */ } finally {
        notifCheckingRef.current = false;
      }
    }
    const t1 = setTimeout(checkAlerts, 30_000);
    const t2 = setInterval(checkAlerts, 2 * 60_000);
    return () => { clearTimeout(t1); clearInterval(t2); };
  }, [open]);

  // ── TTS ───────────────────────────────────────────────────────────────────
  const speak = useCallback((text: string) => {
    if (!ttsEnabled || typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    const clean = text.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/[#*`>\-]/g, "").replace(/\[ACTION:[^\]]+\]/g, "").replace(/\n{2,}/g, ". ").replace(/\n/g, ". ").slice(0, 800);
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = "es-PE";
    utter.rate = 1.05;
    utter.pitch = 1;
    speechSynthesis.speak(utter);
  }, [ttsEnabled]);

  // Speech recognition
  const toggleVoice = useCallback(() => {
    if (!("webkitSpeechRecognition" in window) && !("SpeechRecognition" in window)) {
      alert("Tu navegador no soporta reconocimiento de voz.");
      return;
    }
    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const recognition = new SR();
    recognition.lang = "es-PE";
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.onresult = (event: { results: { [index: number]: { transcript: string } }[] }) => {
      const transcript = event.results.map((r: { [index: number]: { transcript: string } }) => r[0].transcript).join("");
      setInput(transcript);
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening]);

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || loading) return;

    // Mejora 22: Intent detection → auto-navigation
    const navIntents: Record<string, string> = {
      "quiero ver ventas": "analytics-pro",
      "ir a inventario": "inventario-almacenes",
      "abrir clientes": "clientes",
      "ver pedidos": "pedidos",
      "abrir productos": "productos",
      "ir a facturas": "facturacion",
      "ver tesorería": "tesoreria",
    };
    const lowerMsg = msg.toLowerCase();
    for (const [pattern, navTarget] of Object.entries(navIntents)) {
      if (lowerMsg.includes(pattern) || lowerMsg.startsWith(pattern.split(" ")[0] + " " + pattern.split(" ")[1])) {
        if (onNavigate) { onNavigate(navTarget); return; }
      }
    }

    // Mejora 21: Handle / commands
    if (msg.startsWith("/")) {
      const cmdItem = CMD_PALETTE_ITEMS.find(c => msg.toLowerCase().startsWith(c.cmd));
      if (cmdItem) {
        if (cmdItem.navTo && onNavigate) { onNavigate(cmdItem.navTo); setInput(""); return; }
        if (cmdItem.prompt) { setInput(""); sendMessage(cmdItem.prompt); return; }
      }
    }

    const userMsg: Message = { id: `u-${Date.now()}`, role: "user", content: msg, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setShowPanel("chat");

    const startTime = Date.now();

    // Offline mode
    if (isOffline) {
      const offlineReply = getOfflineResponse(msg);
      setMessages(prev => [...prev, { id: `a-${Date.now()}`, role: "assistant", content: offlineReply, timestamp: Date.now() }]);
      setLoading(false);
      trackUsage(msg, Date.now() - startTime);
      speak(offlineReply);
      return;
    }

    const history = messages.filter(m => m.role !== "system" && m.id !== "greeting").slice(-8).map(m => ({ role: m.role, content: m.content }));
    const assistantId = `a-${Date.now()}`;

    // Dispara evento global para que el ChatIAModule wrapper actualice
    // el progress bar de uso (consultas consumidas vs limite mensual).
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("chat-ia:query", { detail: { message: msg } }));
    }

    try {
      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          message: msg,
          history,
          stream: true,
          ...(moduleContext ? { moduleContext: `El usuario está en el módulo: ${moduleContext}` } : {}),
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error de red" }));
        throw new Error(err.error ?? `Error ${res.status}`);
      }

      // SSE streaming
      if (res.headers.get("content-type")?.includes("text/event-stream") && res.body) {
        const placeholderMsg: Message = { id: assistantId, role: "assistant", content: "", timestamp: Date.now() };
        setMessages(prev => [...prev, placeholderMsg]);
        setLoading(false);

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let fullContent = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const payload = trimmed.slice(6);
            if (payload === "[DONE]") break;
            try {
              const json = JSON.parse(payload);
              if (json.content) {
                fullContent += json.content;
                const captured = fullContent;
                const { cleanContent, actions } = parseActions(captured);
                setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: cleanContent, actions: actions.length > 0 ? actions : undefined } : m));
              }
            } catch { /* skip malformed */ }
          }
        }
        trackUsage(msg, Date.now() - startTime);
        speak(fullContent);
        return;
      }

      // Non-streaming fallback
      const data = await res.json();
      const { cleanContent, actions } = parseActions(data.reply ?? "");
      setMessages(prev => [...prev, { id: assistantId, role: "assistant", content: cleanContent, timestamp: Date.now(), actions: actions.length > 0 ? actions : undefined }]);
      trackUsage(msg, Date.now() - startTime);
      speak(cleanContent);
    } catch (err) {
      const errText = err instanceof Error ? err.message : String(err);
      const isApiKeyError = errText.includes("503") || errText.includes("500") || errText.includes("GROQ") || errText.includes("API") || errText.includes("key") || errText.includes("Error de red");
      const errorContent = isApiKeyError
        ? `**No se pudo conectar con el asistente IA**\n\nEl asistente usa **Groq** (servicio gratuito). Para activarlo:\n\n1. Ve a [console.groq.com](https://console.groq.com) y crea una cuenta gratis\n2. Copia tu API key (empieza con \`gsk_...\`)\n3. Agrégala en \`.env.local\` como: \`GROQ_API_KEY=gsk_tu_clave_aqui\`\n4. Reinicia el servidor con \`npm run dev\`\n\n**Mientras tanto**, puedo responder con información general. Escribe tu pregunta y usaré el modo offline.`
        : `Aviso: ${errText}`;
      setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: "assistant", content: errorContent, timestamp: Date.now() }]);
      if (isApiKeyError) setIsOffline(true);
      trackUsage(msg, Date.now() - startTime);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, isOffline, speak, moduleContext, onNavigate]);

  const clearHistory = () => {
    saveSession(messages);
    setMessages([GREETING]);
    localStorage.removeItem("bodega-chat-history");
  };

  // Execute action from AI response
  const handleExecuteAction = async (msgId: string, actionIndex: number) => {
    const msg = messages.find(m => m.id === msgId);
    const action = msg?.actions?.[actionIndex];
    if (!action) return;
    const destructive = ["toggle_product", "update_order_status"].includes(action.type);
    if (destructive && !window.confirm(`¿Confirmas ejecutar: ${action.label}?`)) return;

    setMessages(prev => prev.map(m => {
      if (m.id !== msgId || !m.actions) return m;
      const updated = [...m.actions];
      updated[actionIndex] = { ...updated[actionIndex], status: "executing" };
      return { ...m, actions: updated };
    }));

    try {
      const res = await fetch("/api/ai-assistant/actions", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ action: { type: action.type, payload: action.payload } }),
      });
      const data = await res.json();
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId || !m.actions) return m;
        const updated = [...m.actions];
        updated[actionIndex] = { ...updated[actionIndex], status: data.ok ? "done" : "error", result: data.message };
        return { ...m, actions: updated };
      }));
    } catch {
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId || !m.actions) return m;
        const updated = [...m.actions];
        updated[actionIndex] = { ...updated[actionIndex], status: "error", result: "Error de conexión" };
        return { ...m, actions: updated };
      }));
    }
  };

  const handleNavigate = (tab: string) => {
    if (onNavigate) onNavigate(tab);
    setOpen(false);
  };

  // Mejora 40: Visual response formatting (tables, progress bars)
  const renderContent = (content: string) => {
    const moduleRegex = /["«]([a-z-]+)["»]/g;

    return content.split("\n").map((line, i) => {
      // Headers
      if (line.startsWith("### ")) return <h4 key={i} className="font-bold text-sm text-[var(--text-primary)] dark:text-foreground mt-3 mb-1">{line.slice(4)}</h4>;
      if (line.startsWith("## ")) return <CardTitle key={i} className="font-extrabold text-sm text-[var(--text-primary)] dark:text-foreground mt-3 mb-1">{line.slice(3)}</CardTitle>;

      // Mejora 40: Progress bar detection — e.g. [PROGRESS:75|Stock]
      const progressMatch = line.match(/\[PROGRESS:(\d+)\|(.+?)\]/);
      if (progressMatch) {
        const pct = Math.min(100, parseInt(progressMatch[1]));
        const label = progressMatch[2];
        return (
          <div key={i} className="my-1.5">
            <div className="flex items-center justify-between text-[length:var(--ts-2xs)] mb-0.5">
              <span className="text-[var(--text-secondary)]">{label}</span>
              <span className="font-bold">{pct}%</span>
            </div>
            <div className="h-2 rounded-full bg-[var(--surface-sunken)] overflow-hidden">
              <div className={cn("h-full rounded-full transition-all", pct > 70 ? "bg-[var(--accent-soft)]" : pct > 40 ? "bg-[var(--data-warning-500)]" : "bg-[var(--data-error-500)]")} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      }

      // Bullets
      if (line.startsWith("- ") || line.startsWith("* ")) {
        return (
          <div key={i} className="flex flex-wrap items-start gap-1.5 py-0.5">
            <span className="text-primary mt-1 shrink-0">•</span>
            <span dangerouslySetInnerHTML={{ __html: formatInline(line.slice(2), moduleRegex) }} />
          </div>
        );
      }

      // Numbered items
      const numMatch = line.match(/^(\d+)\.\s/);
      if (numMatch) {
        return (
          <div key={i} className="flex flex-wrap items-start gap-2 py-0.5">
            <span className="text-primary font-bold shrink-0 text-xs w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">{numMatch[1]}</span>
            <span dangerouslySetInnerHTML={{ __html: formatInline(line.slice(numMatch[0].length), moduleRegex) }} />
          </div>
        );
      }

      if (line.trim() === "") return <div key={i} className="h-2" />;
      return <p key={i} className="py-0.5" dangerouslySetInnerHTML={{ __html: formatInline(line, moduleRegex) }} />;
    });
  };

  const formatInline = (text: string, moduleRegex: RegExp) => {
    const safe = escapeHtml(text);
    return safe
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-[var(--text-primary)] dark:text-foreground">$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="text-[length:var(--ts-2xs)] bg-gray-100 dark:bg-accent px-1 py-0.5 rounded font-mono">$1</code>')
      .replace(moduleRegex, (_match, mod) => {
        const safeMod = mod.replace(/[^a-z0-9-]/g, "");
        return `<button onclick="window.__bulejeNavTo&&window.__bulejeNavTo('${safeMod}')" class="text-primary font-bold hover:underline cursor-pointer">&quot;${safeMod}&quot;</button>`;
      });
  };

  // Expose navigation handler
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__bulejeNavTo = handleNavigate;
    return () => { delete (window as unknown as Record<string, unknown>).__bulejeNavTo; };
  });

  // Mejora 31: Render action buttons with direct navigation 
  const renderActions = (msg: Message) => {
    if (!msg.actions || msg.actions.length === 0) return null;
    return (
      <div className="mt-2 space-y-1.5">
        {msg.actions.map((action, i) => (
          <div key={i} className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[length:var(--ts-2xs)] border transition-all",
            action.status === "done" ? "bg-[var(--accent-soft)] dark:bg-[var(--accent-muted)] border-[var(--data-success-500)]/30 dark:border-[var(--data-success-500)]/30 text-[var(--data-success-500)] dark:text-[var(--data-success-500)]" :
            action.status === "error" ? "bg-[var(--data-error-50)] dark:bg-red-950/20 border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/40 text-[var(--data-error-500)] dark:text-[var(--data-error-500)]" :
            action.status === "executing" ? "bg-[var(--data-warning-50)] dark:bg-amber-950/20 border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/40 text-[var(--data-warning-500)]" :
            "bg-white dark:bg-accent/30 border-[var(--rule-base)] dark:border-card-border text-[var(--text-secondary)]"
          )}>
            {action.status === "pending" && (
              <button onClick={() => handleExecuteAction(msg.id, i)} className="flex items-center gap-1.5 font-semibold text-primary hover:underline">
                <Play className="h-3 w-3" /> Ejecutar
              </button>
            )}
            {action.status === "executing" && <Loader2 className="h-3 w-3 animate-spin" />}
            {action.status === "done" && <Check className="h-3 w-3 text-[var(--data-success-500)]" />}
            {action.status === "error" && <XCircle className="h-3 w-3 text-[var(--data-error-500)]" />}
            <span className="flex-1">{action.result ?? action.label}</span>
            {/* Mejora 31: Direct navigate if action has a module target */}
            {action.status === "done" && !!action.payload.module && (
              <button onClick={() => handleNavigate(String(action.payload.module))} className="flex items-center gap-0.5 text-primary hover:underline font-semibold">
                Ir <ArrowRight className="h-2.5 w-2.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    );
  };

  // Contextual suggestions based on moduleContext
  const contextSuggestions = moduleContext ? MODULE_SUGGESTIONS[moduleContext] ?? [] : [];

  // Mejora 36: Time-based predictions
  const timeSuggestions = useMemo(() => getTimeSuggestions(), []);

  // Mejora 30: Grouped quick actions
  const groupedActions = useMemo(() => {
    const groups: Record<string, QuickAction[]> = {};
    for (const a of QUICK_ACTIONS) {
      if (!groups[a.category]) groups[a.category] = [];
      groups[a.category].push(a);
    }
    return groups;
  }, []);

  // Mejora 21: Filtered command palette items
  const filteredCmds = useMemo(() => {
    if (!cmdSearch.trim()) return CMD_PALETTE_ITEMS;
    const q = cmdSearch.toLowerCase();
    return CMD_PALETTE_ITEMS.filter(c => c.cmd.includes(q) || c.label.toLowerCase().includes(q));
  }, [cmdSearch]);

  // ── Tour logic ──────────────────────────────────────────────────────────────
  const advanceTour = () => {
    if (tourStep < TOUR_STEPS.length - 1) {
      setTourStep(s => s + 1);
    } else {
      setTourStep(-1);
      localStorage.setItem(TOUR_KEY, "1");
    }
  };

  // ── Shared UI components ──────────────────────────────────────────────────

  // Mejora 23: Contextual smart chips  
  const SmartChips = () => {
    const chips = [
      ...(contextSuggestions.length > 0 ? contextSuggestions : timeSuggestions),
      ...favorites.slice(0, 2).map(f => f.slice(0, 30)),
    ].filter((c, i, arr) => c && arr.indexOf(c) === i).slice(0, 5);
    if (chips.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1.5 px-3 py-1.5 border-t border-[var(--rule-soft)] dark:border-card-border shrink-0">
        {chips.map((chip, idx) => (
          <button key={`${chip}-${idx}`} onClick={() => sendMessage(chip)}
            className="px-2.5 py-1 rounded-full text-[length:var(--ts-2xs)] font-medium bg-[var(--surface-sunken)] text-[var(--text-secondary)] dark:text-[var(--text-primary)] border border-[var(--rule-base)] hover:bg-[var(--surface-sunken)] dark:hover:bg-[var(--accent-muted)]/50 transition-colors">
            {chip}
          </button>
        ))}
      </div>
    );
  };

  // Messages renderer (shared by embedded and floating)
  const renderMessages = () => (
    <>
      {isOffline && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[var(--data-warning-50)] dark:bg-amber-950/20 rounded-xl border border-[var(--data-warning-500)] dark:border-[var(--data-warning-500)]/40 text-[length:var(--ts-2xs)] text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]">
          <WifiOff className="h-3.5 w-3.5 shrink-0" />
          <span>Sin conexión — respuestas pre-calculadas</span>
        </div>
      )}

      {/* Mejora 38: Tour banner */}
      {tourStep >= 0 && tourStep < TOUR_STEPS.length && (
        <div className="bg-[var(--surface-sunken)] border border-[var(--rule-base)] rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-secondary)] tracking-wider">Tour {tourStep + 1}/{TOUR_STEPS.length}</span>
            <button onClick={() => { setTourStep(-1); localStorage.setItem(TOUR_KEY, "1"); }} className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] hover:underline">Saltar</button>
          </div>
          <p className="text-xs text-[var(--text-secondary)] dark:text-[var(--text-primary)] leading-relaxed">{TOUR_STEPS[tourStep].msg.replace(/\*\*/g, "")}</p>
          <button onClick={advanceTour} className="text-xs font-bold text-[var(--text-secondary)] hover:underline flex items-center gap-1">
            {tourStep < TOUR_STEPS.length - 1 ? "Siguiente" : "Entendido"}
          </button>
        </div>
      )}

      {messages.map(msg => (
        <div key={msg.id} className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}>
          {msg.role === "assistant" && (
            <div className="w-6 h-6 rounded-lg bg-[var(--text-primary)] flex items-center justify-center shrink-0 mt-0.5">
              <Bot className="h-3 w-3 text-white" />
            </div>
          )}
          <div className="max-w-[85%]">
            <div className={cn(
              "rounded-xl px-3 py-2 text-xs leading-relaxed",
              msg.role === "user" ? "bg-primary text-white rounded-br-md" : "bg-gray-50 dark:bg-accent/50 text-[var(--text-secondary)] rounded-bl-md border border-[var(--rule-soft)] dark:border-card-border"
            )}>
              {msg.role === "assistant" ? renderContent(msg.content) : msg.content}
            </div>
            {msg.role === "assistant" && renderActions(msg)}
            {/* Mejora 34: Favorite star + TTS */}
            {msg.role === "user" && msg.content.length > 5 && (
              <button onClick={() => setFavorites(toggleFavorite(msg.content))}
                className={cn("mt-0.5 text-[length:var(--ts-2xs)] flex items-center gap-0.5 transition-colors",
                  favorites.includes(msg.content) ? "text-[var(--data-warning-500)]" : "text-[var(--text-tertiary)] hover:text-[var(--data-warning-500)]"
                )}>
                <Star className="h-2.5 w-2.5" fill={favorites.includes(msg.content) ? "currentColor" : "none"} />
                {favorites.includes(msg.content) ? "Favorita" : "Guardar"}
              </button>
            )}
            {msg.role === "assistant" && msg.id !== "greeting" && msg.content.length > 20 && (
              <button onClick={() => speak(msg.content)}
                className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted hover:text-[var(--text-primary)] dark:hover:text-[var(--text-primary)] flex items-center gap-1 transition-colors">
                <Volume2 className="h-2.5 w-2.5" /> Escuchar
              </button>
            )}
          </div>
        </div>
      ))}

      {loading && (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-[var(--text-primary)] flex items-center justify-center shrink-0">
            <Bot className="h-3 w-3 text-white" />
          </div>
          <div className="bg-gray-50 dark:bg-accent/50 rounded-xl rounded-bl-md px-3 py-2 border border-[var(--rule-soft)] dark:border-card-border">
            <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Analizando…
            </div>
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </>
  );

  // Mejora 37: Input area (shared)
  const renderInputArea = (compact?: boolean) => (
    <div className={cn("px-3 py-2 border-t border-[var(--rule-soft)] dark:border-card-border shrink-0", compact && "py-1.5")}>
      <div className="flex items-end gap-2">
        <div className="flex-1 relative">
          <textarea ref={inputRef} value={input}
            onChange={e => {
              setInput(e.target.value);
              // Mejora 21: Show command palette on /
              if (e.target.value === "/") setShowCmdPalette(true);
              else if (showCmdPalette && !e.target.value.startsWith("/")) setShowCmdPalette(false);
            }}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            }}
            placeholder={isListening ? "Escuchando..." : isOffline ? "Modo offline..." : "Pregunta algo... (/ para comandos)"}
            rows={1}
            className={cn(
              "w-full resize-none rounded-lg border px-3 py-2 text-xs bg-gray-50 dark:bg-surface text-[var(--text-primary)] dark:text-foreground placeholder:text-[var(--text-tertiary)] dark:placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors",
              isListening ? "border-[var(--data-error-500)] dark:border-[var(--data-error-500)] bg-[var(--data-error-50)]/30 dark:bg-red-950/10" : "border-[var(--rule-base)] dark:border-card-border"
            )}
            style={{ maxHeight: compact ? 60 : 80 }}
            disabled={loading}
          />
        </div>
        <button onClick={toggleVoice}
          className={cn("h-9 w-9 rounded-xl flex items-center justify-center transition-all shrink-0",
            isListening ? "bg-[var(--data-error-500)] text-white hover:bg-[var(--data-error-500)] animate-pulse" : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted hover:bg-gray-200 dark:hover:bg-accent"
          )}
          title={isListening ? "Detener" : "Hablar"}>
          {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
        </button>
        <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
          className={cn("h-9 w-9 rounded-xl flex items-center justify-center transition-all shrink-0",
            input.trim() && !loading
              ? "bg-[var(--text-primary)] text-[var(--surface-canvas)] hover:opacity-90 "
              : "bg-gray-100 dark:bg-surface text-[var(--text-tertiary)] dark:text-muted cursor-not-allowed"
          )}>
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex items-center justify-between mt-1 px-1">
        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">Ctrl+K comandos · Shift+Enter nueva línea</span>
        {messages.length > 2 && (
          <button onClick={() => setMessages(prev => [...prev, { ...GREETING, id: `greeting-${Date.now()}` }])}
            className="text-[length:var(--ts-2xs)] text-primary font-semibold hover:underline flex items-center gap-0.5">
            <Sparkles className="h-2.5 w-2.5" /> Acciones rápidas
          </button>
        )}
      </div>
    </div>
  );

  // ── Mejora 21: Command Palette Modal ──────────────────────────────────────
  const CommandPalette = () => {
    if (!showCmdPalette) return null;
    return (
      <div className="absolute bottom-full left-0 right-0 mb-1 z-10">
        <div className="mx-3 bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--rule-soft)] dark:border-card-border">
            <Command className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
            <input autoFocus type="text" value={cmdSearch} onChange={e => setCmdSearch(e.target.value)} placeholder="Buscar comando…"
              className="flex-1 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
              onKeyDown={e => { if (e.key === "Escape") { setShowCmdPalette(false); setCmdSearch(""); } }} />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filteredCmds.map(cmd => {
              const Icon = cmd.icon;
              return (
                <button key={cmd.cmd} onClick={() => {
                  setShowCmdPalette(false);
                  setCmdSearch("");
                  if (cmd.navTo && onNavigate) onNavigate(cmd.navTo);
                  else if (cmd.prompt) sendMessage(cmd.prompt);
                }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                  <Icon className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                  <span className="font-mono text-[length:var(--ts-2xs)] text-[var(--text-secondary)]">{cmd.cmd}</span>
                  <span className="flex-1">{cmd.label}</span>
                  <ChevronRight className="h-3 w-3 text-[var(--text-tertiary)]" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ── Embedded mode ─────────────────────────────────────────────────────────
  if (embedded) {
    return (
      <div className="flex flex-col h-full w-full bg-white dark:bg-card">
        {/* Compact header */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--rule-soft)] dark:border-card-border bg-[var(--text-primary)] text-[var(--surface-canvas)] shrink-0">
          <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center">
            <Bot className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <CardTitle className="font-bold text-sm leading-tight">Asistente IA</CardTitle>
            <p className="text-[length:var(--ts-2xs)] text-white/70">
              {isOffline ? "Modo offline" : moduleContext ? `Modulo: ${moduleContext}` : "IA en tiempo real"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setTtsEnabled(!ttsEnabled)} className={cn("p-1.5 rounded-lg transition-colors", ttsEnabled ? "bg-white/30" : "hover:bg-white/20")} title={ttsEnabled ? "Silenciar voz" : "Activar voz"}>
              {ttsEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            </button>
            <AdminTooltip content="Borrar toda la conversación con el asistente">
              <button onClick={clearHistory} aria-label="Limpiar historial" className="p-1.5 rounded-lg hover:bg-white/20 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </AdminTooltip>
          </div>
        </div>

        {/* Mejora 30: Grouped quick actions */}
        {messages.length <= 2 && !loading && (
          <div className="px-4 py-2.5 border-b border-[var(--rule-soft)] dark:border-card-border shrink-0 space-y-2">
            {Object.entries(groupedActions).map(([category, actions]) => (
              <div key={category}>
                <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] mb-1">{category}</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {actions.slice(0, 2).map(action => (
                    <button key={action.label} onClick={() => sendMessage(action.prompt)}
                      className={cn("flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[length:var(--ts-2xs)] font-semibold border transition-all hover:scale-[1.02] hover:shadow-sm text-left", action.color)}>
                      <action.icon className="h-3 w-3 shrink-0" />
                      <span className="leading-tight truncate">{action.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 scroll-smooth">
          {renderMessages()}
        </div>

        <SmartChips />
        <div className="relative">
          <CommandPalette />
          {renderInputArea(true)}
        </div>
      </div>
    );
  }

  // ── Floating mode ─────────────────────────────────────────────────────────
  return (
    <>
      {/* Mejora 39: Enhanced floating trigger button with health indicator */}
      {!open && (
        <button onClick={() => setOpen(true)}
          className={cn(
            "fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-50 h-14 w-14 rounded-xl flex items-center justify-center transition-all duration-[var(--dur-base)]",
            "bg-[var(--text-primary)] hover:opacity-90 hover:scale-105",
            "text-[var(--surface-canvas)]",
            pulse && "animate-bounce"
          )}
          title="Asistente Ejecutivo IA">
          <Bot className="h-7 w-7" />
          {/* Mejora 29: Badge with notification count */}
          {notifications.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-[var(--data-error-500)] rounded-full border-2 border-white dark:border-card text-[length:var(--ts-2xs)] font-bold flex items-center justify-center text-white px-1">
              {notifications.length}
            </span>
          )}
          {/* Mejora 39: Health indicator dot */}
          {notifications.length === 0 && (
            <span className={cn("absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-card",
              healthScore !== null
                ? healthScore > 70 ? "bg-[var(--accent-soft)]" : healthScore > 40 ? "bg-[var(--data-warning-500)] animate-pulse" : "bg-[var(--data-error-500)] animate-pulse"
                : "bg-[var(--accent-soft)] animate-pulse"
            )} />
          )}
          {/* Mejora 33: Mini health score label */}
          {healthScore !== null && notifications.length === 0 && (
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[length:var(--ts-2xs)] font-bold bg-white dark:bg-card text-[var(--text-secondary)] px-1.5 rounded-full border border-[var(--rule-base)] dark:border-card-border ">
              {healthScore}%
            </span>
          )}
        </button>
      )}

      {/* Mejora 21: Global command palette */}
      {showCmdPalette && !open && (
        <>
          <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm" onClick={() => { setShowCmdPalette(false); setCmdSearch(""); }} />
          <div className="fixed top-1/4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md mx-4">
            <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--rule-soft)] dark:border-card-border">
                <Search className="h-4 w-4 text-[var(--text-tertiary)]" />
                <input autoFocus type="text" value={cmdSearch} onChange={e => setCmdSearch(e.target.value)} placeholder="¿Qué quieres hacer?"
                  className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
                  onKeyDown={e => { if (e.key === "Escape") { setShowCmdPalette(false); setCmdSearch(""); } }} />
                <kbd className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] bg-[var(--surface-sunken)] px-1.5 py-0.5 rounded font-mono">Esc</kbd>
              </div>
              <div className="max-h-60 overflow-y-auto">
                {filteredCmds.map(cmd => {
                  const Icon = cmd.icon;
                  return (
                    <button key={cmd.cmd} onClick={() => {
                      setShowCmdPalette(false);
                      setCmdSearch("");
                      if (cmd.navTo && onNavigate) onNavigate(cmd.navTo);
                      else if (cmd.prompt) { setOpen(true); setTimeout(() => sendMessage(cmd.prompt), 200); }
                    }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-gray-50 dark:hover:bg-white/5 transition-colors">
                      <Icon className="h-4 w-4 text-[var(--text-tertiary)]" />
                      <span className="font-mono text-xs text-[var(--text-secondary)]">{cmd.cmd}</span>
                      <span className="flex-1 text-left">{cmd.label}</span>
                      <ChevronRight className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Mejora 28: Chat panel with 3 sizes */}
      {open && (
        <div className={cn(
          "fixed z-50 flex flex-col bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border transition-all duration-[var(--dur-base)]",
          expanded ? "inset-4 rounded-xl" :
          widgetSize === "mini" ? "bottom-20 right-4 sm:bottom-6 sm:right-6 w-80 h-96 max-h-[70vh] rounded-xl" :
          widgetSize === "large" ? "bottom-20 right-4 sm:bottom-6 sm:right-6 w-[480px] h-[700px] max-h-[90vh] rounded-xl" :
          "bottom-20 right-4 sm:bottom-6 sm:right-6 w-95 sm:w-105 h-150 max-h-[85vh] rounded-xl"
        )}>
          {/* Header */}
          <div className="flex flex-wrap items-center gap-3 px-2 sm:px-4 py-2 sm:py-3 border-b border-[var(--rule-soft)] dark:border-card-border bg-[var(--text-primary)] text-[var(--surface-canvas)] rounded-t-2xl shrink-0">
            <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Bot className="h-5 w-5" />
            </div>
            {/* Mejora 33: Mini dashboard in header */}
            <div className="flex-1 min-w-0">
              <CardTitle className="font-bold text-sm leading-tight">Asistente Ejecutivo</CardTitle>
              <p className="text-[length:var(--ts-2xs)] text-white/70 flex items-center gap-2">
                {isOffline ? "Modo offline" : "IA en tiempo real"}
                {healthScore !== null && !isOffline && (
                  <span className={cn("px-1.5 py-0.5 rounded-full text-[length:var(--ts-2xs)] font-bold",
                    healthScore > 70 ? "bg-[var(--accent-soft)] text-[var(--data-success-500)]" : healthScore > 40 ? "bg-[var(--data-warning-500)]/30 text-[var(--data-warning-500)]" : "bg-[var(--data-error-500)]/30 text-[var(--data-error-500)]"
                  )}>
                    Salud: {healthScore}%
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setTtsEnabled(!ttsEnabled)} className={cn("p-1.5 rounded-lg transition-colors", ttsEnabled ? "bg-white/30" : "hover:bg-white/20")} title={ttsEnabled ? "Silenciar" : "Voz"}>
                {ttsEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              </button>
              <button onClick={() => setShowPanel(showPanel === "history" ? "chat" : "history")} className={cn("p-1.5 rounded-lg transition-colors", showPanel === "history" ? "bg-white/30" : "hover:bg-white/20")} title="Historial">
                <History className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setShowPanel(showPanel === "stats" ? "chat" : "stats")} className={cn("p-1.5 rounded-lg transition-colors", showPanel === "stats" ? "bg-white/30" : "hover:bg-white/20")} title="Stats">
                <BarChart3 className="h-3.5 w-3.5" />
              </button>
              <AdminTooltip content="Borrar historial de la conversación"><button onClick={clearHistory} aria-label="Limpiar" className="p-1.5 rounded-lg hover:bg-white/20 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button></AdminTooltip>
              {/* Mejora 28: Size cycle */}
              <button onClick={() => setWidgetSize(s => s === "mini" ? "medium" : s === "medium" ? "large" : "mini")}
                className="p-1.5 rounded-lg hover:bg-white/20 transition-colors" title="Cambiar tamaño">
                {widgetSize === "mini" ? <Minimize2 className="h-3.5 w-3.5" /> : widgetSize === "large" ? <Maximize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
              <button onClick={() => setExpanded(!expanded)} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors" title={expanded ? "Reducir" : "Expandir"}>
                {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
              <button onClick={() => { setOpen(false); if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); }} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors" title="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Mejora 29: Enhanced notifications */}
          {notifications.length > 0 && showPanel === "chat" && (
            <div className="px-3 py-2 bg-[var(--data-error-50)] dark:bg-red-950/20 border-b border-[var(--data-error-500)] dark:border-[var(--data-error-500)]/40 shrink-0">
              <div className="flex items-center gap-2 mb-1">
                <Bell className="h-3.5 w-3.5 text-[var(--data-error-500)]" />
                <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-500)] dark:text-[var(--data-error-500)]">Alertas ({notifications.length})</span>
                <button onClick={() => setNotifications([])} className="ml-auto text-[length:var(--ts-2xs)] text-[var(--data-error-500)] hover:underline">Cerrar</button>
              </div>
              {notifications.map((n, i) => (
                <p key={i} className="text-[length:var(--ts-2xs)] text-[var(--data-error-500)] dark:text-[var(--data-error-500)] leading-relaxed">{n}</p>
              ))}
            </div>
          )}

          {/* Stats panel */}
          {showPanel === "stats" && (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              <h4 className="font-extrabold text-sm text-[var(--text-primary)] dark:text-foreground flex items-center gap-2">
                <BarChart3 className="h-4 w-4 text-[var(--text-secondary)]" /> Estadísticas de Uso
              </h4>
              {(() => {
                const stats = getUsageStats();
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-gray-50 dark:bg-accent/30 rounded-xl p-3 text-center">
                        <div className="text-xl font-extrabold text-[var(--text-secondary)]">{stats.total}</div>
                        <div className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-muted">Consultas totales</div>
                      </div>
                      <div className="bg-gray-50 dark:bg-accent/30 rounded-xl p-3 text-center">
                        <div className="text-xl font-extrabold text-[var(--text-secondary)]">{stats.todayCount}</div>
                        <div className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-muted">Hoy</div>
                      </div>
                      <div className="bg-gray-50 dark:bg-accent/30 rounded-xl p-3 text-center col-span-2">
                        <div className="text-xl font-extrabold text-[var(--data-success-500)]">{stats.avgMs > 0 ? `${(stats.avgMs / 1000).toFixed(1)}s` : "—"}</div>
                        <div className="text-[length:var(--ts-2xs)] text-[var(--text-secondary)] dark:text-muted">Tiempo promedio</div>
                      </div>
                    </div>
                    {stats.topQueries.length > 0 && (
                      <div>
                        <p className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-secondary)] dark:text-muted uppercase mb-1.5">Consultas frecuentes</p>
                        {stats.topQueries.map((q, i) => (
                          <button key={i} onClick={() => { setShowPanel("chat"); sendMessage(q); }} className="block w-full text-left text-[length:var(--ts-2xs)] text-[var(--text-secondary)] hover:text-primary py-1 truncate">
                            {i + 1}. {q}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Mejora 34: Favorites section */}
                    {favorites.length > 0 && (
                      <div>
                        <p className="text-[length:var(--ts-2xs)] font-semibold text-[var(--text-secondary)] dark:text-muted uppercase mb-1.5 flex items-center gap-1"><Star className="h-3 w-3 text-[var(--data-warning-500)]" /> Favoritas</p>
                        {favorites.map((f, i) => (
                          <button key={i} onClick={() => { setShowPanel("chat"); sendMessage(f); }} className="block w-full text-left text-[length:var(--ts-2xs)] text-[var(--text-secondary)] hover:text-primary py-1 truncate flex items-center gap-1.5">
                            <Star className="h-3 w-3 shrink-0 text-[var(--data-warning-500)]" aria-hidden />
                            {f}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* History panel */}
          {showPanel === "history" && (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              <h4 className="font-extrabold text-sm text-[var(--text-primary)] dark:text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-[var(--text-secondary)]" /> Sesiones Anteriores
              </h4>
              {(() => {
                const sessions = getSessions();
                if (sessions.length === 0) return <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">No hay sesiones guardadas.</p>;
                return sessions.map(s => (
                  <div key={s.id} className="bg-gray-50 dark:bg-accent/30 rounded-xl p-3 border border-[var(--rule-soft)] dark:border-card-border">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">{s.date}</span>
                      <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">{s.messageCount} msgs</span>
                    </div>
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] leading-relaxed">{s.summary}</p>
                  </div>
                ));
              })()}
            </div>
          )}

          {/* Chat panel */}
          {showPanel === "chat" && (
            <>
              <div className="flex-1 overflow-y-auto px-2 sm:px-4 py-2 sm:py-3 space-y-3 scroll-smooth">
                {renderMessages()}
              </div>

              {/* Mejora 30: Grouped quick actions */}
              {messages.length <= 2 && !loading && (
                <div className="px-4 pb-2 shrink-0">
                  {Object.entries(groupedActions).map(([category, actions]) => (
                    <div key={category} className="mb-2">
                      <p className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] dark:text-muted mb-1">{category}</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {actions.map(action => (
                          <button key={action.label} onClick={() => sendMessage(action.prompt)}
                            className={cn("flex items-center gap-2 px-2.5 py-2 rounded-xl text-[length:var(--ts-2xs)] font-semibold border transition-all hover:scale-[1.02] hover:shadow-sm text-left", action.color)}>
                            <action.icon className="h-3.5 w-3.5 shrink-0" />
                            <span className="leading-tight">{action.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <SmartChips />
              <div className="relative">
                <CommandPalette />
                {renderInputArea()}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}