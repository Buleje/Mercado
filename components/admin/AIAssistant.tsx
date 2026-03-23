"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Bot, X, Send, Mic, MicOff, Sparkles,
  AlertTriangle, TrendingUp, Package, Users, Lightbulb,
  Loader2, Maximize2, Minimize2, Trash2,
  Volume2, VolumeX, Play, Clock, BarChart3, WifiOff, Bell, Check, XCircle,
  History,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
};

// ── Constants ─────────────────────────────────────────────────────────────────

const QUICK_ACTIONS: QuickAction[] = [
  { label: "¿Qué debo hacer ahora?", icon: Lightbulb, prompt: "Analiza la situación actual del negocio y dime las 5 acciones más urgentes que debo tomar HOY, en orden de prioridad. Incluye a qué módulo ir para cada acción.", color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/40" },
  { label: "Estado del negocio", icon: TrendingUp, prompt: "Dame un diagnóstico ejecutivo completo del estado actual del negocio: ventas, inventario, clientes, deudas. Resalta lo positivo y lo que necesita atención urgente.", color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/40" },
  { label: "Alertas urgentes", icon: AlertTriangle, prompt: "¿Hay alguna alerta urgente? Stock agotado, pedidos sin atender, facturas vencidas, clientes en riesgo. Solo lo crítico.", color: "text-red-600 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800/40" },
  { label: "Ideas de productos", icon: Package, prompt: "Basándote en mis productos más vendidos y tendencias, ¿qué productos nuevos me recomiendas agregar al catálogo? Dame 5 ideas con precio sugerido y por qué.", color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/40" },
  { label: "Retener clientes", icon: Users, prompt: "¿Cómo puedo retener mejor a mis clientes actuales? Dame estrategias basadas en los datos reales de mis clientes top y su comportamiento de compra.", color: "text-violet-600 bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800/40" },
  { label: "Plan semanal", icon: Sparkles, prompt: "Crea un plan semanal de tareas ejecutivas para esta semana. Incluye: qué revisar cada día, qué módulo usar, y qué métricas monitorear. Formato tabla o bullets.", color: "text-indigo-600 bg-indigo-50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800/40" },
];

const GREETING: Message = {
  id: "greeting",
  role: "assistant",
  content: `👋 **¡Hola! Soy tu Asistente Ejecutivo IA.**

Estoy aquí para ayudarte a gestionar tu negocio como un profesional. Puedo:

- 📊 **Analizar** la situación actual y darte un diagnóstico
- 🎯 **Priorizar** qué hacer ahora vs qué puede esperar
- 🚨 **Alertar** sobre problemas urgentes
- 💡 **Recomendar** estrategias de ventas, precios e inventario
- 📋 **Asignar tareas** y crear planes de acción
- 🛒 **Sugerir productos** para agregar al catálogo
- ⚡ **Ejecutar acciones** directamente — precios, stock, productos
- 🔊 **Hablar** — activa el sonido para escuchar mis respuestas

**Pregúntame lo que necesites** o usa las acciones rápidas de abajo 👇`,
  timestamp: Date.now(),
};

// ── Offline pre-calculated responses ──────────────────────────────────────────

const OFFLINE_RESPONSES: Record<string, string> = {
  "estado": "⚠️ **Modo sin conexión** — No puedo consultar datos en tiempo real, pero aquí tienes una guía general:\n\n1. Revisa pedidos pendientes en \"pedidos\"\n2. Verifica stock crítico en \"inventario-almacenes\"\n3. Revisa facturas vencidas en \"tesoreria\"\n4. Consulta ventas del día en \"panel-principal\"\n\nConéctate a internet para un análisis personalizado.",
  "urgente": "⚠️ **Modo sin conexión** — Sin acceso a datos reales, te sugiero:\n\n- **Pedidos**: Revisa \"pedidos\" para pendientes sin confirmar\n- **Stock**: Ve a \"inventario-almacenes\" y filtra por agotados\n- **Pagos**: Revisa \"tesoreria\" para facturas vencidas\n\nPara alertas basadas en datos reales, necesito conexión.",
  "productos": "⚠️ **Modo sin conexión** — Sugerencias generales para bodega:\n\n1. Productos de temporada (según época del año)\n2. Complementos a tu top vendedor\n3. Productos con alto margen en tu categoría principal\n4. Items de impulso para el mostrador\n\nConéctate para recomendaciones basadas en tus datos.",
  "default": "⚠️ **Modo sin conexión** — No puedo responder con datos en tiempo real.\n\nMientras tanto puedes:\n- Revisar \"panel-principal\" para tu dashboard\n- Consultar \"inventario-almacenes\" para stock\n- Ir a \"pedidos\" para gestionar pendientes\n\nReconecta a internet para un análisis completo.",
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
    return ""; // remove from display text
  }).replace(/\n{3,}/g, "\n\n"); // clean up extra newlines
  return { cleanContent, actions };
}

// ── Usage tracking helpers ────────────────────────────────────────────────────

const USAGE_KEY = "bsm-ai-usage";
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

    // Top queries by frequency
    const freq: Record<string, number> = {};
    stored.forEach(e => { const k = e.query.slice(0, 50); freq[k] = (freq[k] ?? 0) + 1; });
    const topQueries = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([q]) => q);

    return { total: stored.length, avgMs, topQueries, todayCount: todayEntries.length };
  } catch {
    return { total: 0, avgMs: 0, topQueries: [], todayCount: 0 };
  }
}

// ── Session history helpers ───────────────────────────────────────────────────

const SESSIONS_KEY = "bsm-ai-sessions";
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
  } catch {
    return [];
  }
}

// ── Module-contextual suggestions ────────────────────────────────────────────

const MODULE_SUGGESTIONS: Record<string, string[]> = {
  inventario: ["¿Stock bajo?", "¿Productos por vencer?", "¿Qué debo reponer?"],
  "ventas-caja": ["¿Ventas de hoy?", "¿Pedidos pendientes?", "¿Cuánto vendí ayer?"],
  compras: ["¿Qué debo pedir?", "¿A quién le debo?", "¿Compras del mes?"],
  plata: ["¿Cuánto gané hoy?", "¿Gastos del mes?", "¿Balance general?"],
  clientes: ["¿Clientes inactivos?", "¿Quién me debe?", "¿Clientes frecuentes?"],
  productos: ["¿Qué se vende más?", "¿Actualizar precios?", "¿Productos sin stock?"],
};

interface AIAssistantProps {
  onNavigate?: (tab: string) => void;
  /** When true, renders inline (no floating button, no fixed positioning) */
  embedded?: boolean;
  /** Current admin module context — prepended to system prompt + shows contextual suggestions */
  moduleContext?: string;
}

export default function AIAssistant({ onNavigate, embedded, moduleContext }: AIAssistantProps) {
  const [open, setOpen] = useState(!!embedded);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>(() => {
    if (typeof window === "undefined") return [GREETING];
    try {
      const saved = localStorage.getItem("bsm-ai-assistant-history");
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const notifCheckingRef = useRef(false);

  // Persist messages
  useEffect(() => {
    if (messages.length > 1 || messages[0]?.id !== "greeting") {
      localStorage.setItem("bsm-ai-assistant-history", JSON.stringify(messages.slice(-50)));
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

  // ── Proactive notifications: check every 2 min ────────────────────────────
  useEffect(() => {
    async function checkAlerts() {
      if (!navigator.onLine || notifCheckingRef.current) return;
      notifCheckingRef.current = true;
      try {
        const res = await fetch("/api/ai-assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: "Dame solo alertas URGENTES en 1 línea cada una. Máximo 3 alertas. Si no hay nada urgente, responde exactamente: SIN_ALERTAS",
            history: [],
            stream: false,
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const reply = data.reply ?? "";
        if (!reply.includes("SIN_ALERTAS") && reply.trim().length > 10) {
          const alerts = reply.split("\n").filter((l: string) => l.trim().length > 5).slice(0, 3);
          if (alerts.length > 0) {
            setNotifications(alerts);
            if (!open) setPulse(true);
          }
        }
      } catch { /* ignore */ } finally {
        notifCheckingRef.current = false;
      }
    }

    // First check after 30s, then every 2 min
    const t1 = setTimeout(checkAlerts, 30_000);
    const t2 = setInterval(checkAlerts, 2 * 60_000);
    return () => { clearTimeout(t1); clearInterval(t2); };
  }, [open]);

  // ── TTS: speak assistant messages ─────────────────────────────────────────
  const speak = useCallback((text: string) => {
    if (!ttsEnabled || typeof speechSynthesis === "undefined") return;
    speechSynthesis.cancel();
    // Strip markdown formatting for cleaner speech
    const clean = text
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/[#*`>\-]/g, "")
      .replace(/\[ACTION:[^\]]+\]/g, "")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, ". ")
      .slice(0, 800);
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
      const transcript = event.results
        .map((r: { [index: number]: { transcript: string } }) => r[0].transcript)
        .join("");
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

    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: "user",
      content: msg,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setShowPanel("chat");

    const startTime = Date.now();

    // ── Offline mode ─────────────────────────────────────────────────────────
    if (isOffline) {
      const offlineReply = getOfflineResponse(msg);
      setMessages(prev => [...prev, {
        id: `a-${Date.now()}`,
        role: "assistant",
        content: offlineReply,
        timestamp: Date.now(),
      }]);
      setLoading(false);
      trackUsage(msg, Date.now() - startTime);
      speak(offlineReply);
      return;
    }

    // Build history for API (last 8 messages)
    const history = messages
      .filter(m => m.role !== "system" && m.id !== "greeting")
      .slice(-8)
      .map(m => ({ role: m.role, content: m.content }));

    const assistantId = `a-${Date.now()}`;

    try {
      const res = await fetch("/api/ai-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
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

      // ── Streaming: read SSE chunks and build response progressively ──────
      if (res.headers.get("content-type")?.includes("text/event-stream") && res.body) {
        const placeholderMsg: Message = {
          id: assistantId,
          role: "assistant",
          content: "",
          timestamp: Date.now(),
        };
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
                // Parse actions from current content
                const { cleanContent, actions } = parseActions(captured);
                setMessages(prev =>
                  prev.map(m => m.id === assistantId ? { ...m, content: cleanContent, actions: actions.length > 0 ? actions : undefined } : m)
                );
              }
            } catch { /* skip malformed */ }
          }
        }

        trackUsage(msg, Date.now() - startTime);
        speak(fullContent);
        return;
      }

      // ── Non-streaming fallback ─────────────────────────────────────────────
      const data = await res.json();
      const { cleanContent, actions } = parseActions(data.reply ?? "");
      const assistantMsg: Message = {
        id: assistantId,
        role: "assistant",
        content: cleanContent,
        timestamp: Date.now(),
        actions: actions.length > 0 ? actions : undefined,
      };
      setMessages(prev => [...prev, assistantMsg]);
      trackUsage(msg, Date.now() - startTime);
      speak(cleanContent);
    } catch (err) {
      const errorMsg: Message = {
        id: `e-${Date.now()}`,
        role: "assistant",
        content: `⚠️ ${err instanceof Error ? err.message : "Error al conectar con el asistente. Verifica que GROQ_API_KEY esté configurada."}`,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, errorMsg]);
      trackUsage(msg, Date.now() - startTime);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, isOffline, speak]);

  const clearHistory = () => {
    // Save session before clearing
    saveSession(messages);
    setMessages([GREETING]);
    localStorage.removeItem("bsm-ai-assistant-history");
  };

  // ── Execute action from AI response ───────────────────────────────────────
  const handleExecuteAction = async (msgId: string, actionIndex: number) => {
    const msg = messages.find(m => m.id === msgId);
    const action = msg?.actions?.[actionIndex];
    if (!action) return;

    // Confirm destructive actions
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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: { type: action.type, payload: action.payload } }),
      });
      const data = await res.json();

      setMessages(prev => prev.map(m => {
        if (m.id !== msgId || !m.actions) return m;
        const updated = [...m.actions];
        updated[actionIndex] = {
          ...updated[actionIndex],
          status: data.ok ? "done" : "error",
          result: data.message,
        };
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

  // Navigate to a module when assistant mentions one
  const handleNavigate = (tab: string) => {
    if (onNavigate) onNavigate(tab);
    setOpen(false);
  };

  // Parse markdown-ish to simple HTML
  const renderContent = (content: string) => {
    // Detect module references like "módulo" followed by a quoted name
    const moduleRegex = /["«]([a-z-]+)["»]/g;

    return content.split("\n").map((line, i) => {
      // Headers
      if (line.startsWith("### ")) return <h4 key={i} className="font-bold text-sm text-gray-800 dark:text-foreground mt-3 mb-1">{line.slice(4)}</h4>;
      if (line.startsWith("## ")) return <h3 key={i} className="font-extrabold text-sm text-gray-900 dark:text-foreground mt-3 mb-1">{line.slice(3)}</h3>;

      // Bullets
      if (line.startsWith("- ") || line.startsWith("* ")) {
        const text = line.slice(2);
        return (
          <div key={i} className="flex flex-wrap items-start gap-1.5 py-0.5">
            <span className="text-primary mt-1 shrink-0">•</span>
            <span dangerouslySetInnerHTML={{ __html: formatInline(text, moduleRegex) }} />
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

      // Empty line
      if (line.trim() === "") return <div key={i} className="h-2" />;

      // Regular text  
      return <p key={i} className="py-0.5" dangerouslySetInnerHTML={{ __html: formatInline(line, moduleRegex) }} />;
    });
  };

  const escapeHtml = (str: string) =>
    str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  const formatInline = (text: string, moduleRegex: RegExp) => {
    // Escape HTML first to prevent XSS, then apply safe formatting
    const safe = escapeHtml(text);
    return safe
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold text-gray-900 dark:text-foreground">$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code class="text-[10px] bg-gray-100 dark:bg-accent px-1 py-0.5 rounded font-mono">$1</code>')
      .replace(moduleRegex, (_match, mod) => {
        const safeMod = mod.replace(/[^a-z0-9-]/g, "");
        return `<button onclick="window.__bsmNavTo&&window.__bsmNavTo('${safeMod}')" class="text-primary font-bold hover:underline cursor-pointer">&quot;${safeMod}&quot;</button>`;
      });
  };

  // Expose navigation handler for inline module links
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__bsmNavTo = handleNavigate;
    return () => { delete (window as unknown as Record<string, unknown>).__bsmNavTo; };
  });

  // Render action buttons for a message
  const renderActions = (msg: Message) => {
    if (!msg.actions || msg.actions.length === 0) return null;
    return (
      <div className="mt-2 space-y-1.5">
        {msg.actions.map((action, i) => (
          <div key={i} className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[10px] border transition-all",
            action.status === "done" ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-700 dark:text-emerald-400" :
            action.status === "error" ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800/40 text-red-700 dark:text-red-400" :
            action.status === "executing" ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/40 text-amber-700" :
            "bg-white dark:bg-accent/30 border-gray-200 dark:border-card-border text-gray-700 dark:text-gray-300"
          )}>
            {action.status === "pending" && (
              <button
                onClick={() => handleExecuteAction(msg.id, i)}
                className="flex items-center gap-1.5 font-semibold text-primary hover:underline"
              >
                <Play className="h-3 w-3" /> Ejecutar
              </button>
            )}
            {action.status === "executing" && <Loader2 className="h-3 w-3 animate-spin" />}
            {action.status === "done" && <Check className="h-3 w-3 text-emerald-600" />}
            {action.status === "error" && <XCircle className="h-3 w-3 text-red-500" />}
            <span className="flex-1">{action.result ?? action.label}</span>
          </div>
        ))}
      </div>
    );
  };

  // ── Contextual suggestions based on moduleContext ─────────────────────────
  const contextSuggestions = moduleContext ? MODULE_SUGGESTIONS[moduleContext] ?? [] : [];

  // ── Embedded mode: inline render (no floating button, no fixed positioning) ─
  if (embedded) {
    return (
      <div className="flex flex-col h-full w-full bg-white dark:bg-card">
        {/* Compact header */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 dark:border-card-border bg-linear-to-r from-violet-600 to-indigo-600 text-white shrink-0">
          <div className="h-8 w-8 rounded-lg bg-white/20 flex items-center justify-center">
            <Bot className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm leading-tight">Asistente IA</h3>
            <p className="text-[10px] text-white/70">
              {isOffline ? "⚡ Modo offline" : moduleContext ? `Módulo: ${moduleContext}` : "IA · Análisis en tiempo real"}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTtsEnabled(!ttsEnabled)}
              className={cn("p-1.5 rounded-lg transition-colors", ttsEnabled ? "bg-white/30" : "hover:bg-white/20")}
              title={ttsEnabled ? "Silenciar voz" : "Activar voz"}
            >
              {ttsEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
            </button>
            <button onClick={clearHistory} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors" title="Limpiar historial">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Quick actions at the top (always visible when few messages) */}
        {messages.length <= 2 && !loading && (
          <div className="px-4 py-2.5 border-b border-gray-100 dark:border-card-border shrink-0">
            <div className="grid grid-cols-2 gap-1.5">
              {QUICK_ACTIONS.slice(0, 4).map(action => (
                <button
                  key={action.label}
                  onClick={() => sendMessage(action.prompt)}
                  className={cn(
                    "flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-[10px] font-semibold border transition-all hover:scale-[1.02] hover:shadow-sm text-left",
                    action.color
                  )}
                >
                  <action.icon className="h-3 w-3 shrink-0" />
                  <span className="leading-tight truncate">{action.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-3 scroll-smooth">
          {isOffline && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800/40 text-[10px] text-amber-700 dark:text-amber-400">
              <WifiOff className="h-3.5 w-3.5 shrink-0" />
              <span>Sin conexión — respuestas pre-calculadas</span>
            </div>
          )}

          {messages.map(msg => (
            <div
              key={msg.id}
              className={cn("flex gap-2", msg.role === "user" ? "justify-end" : "justify-start")}
            >
              {msg.role === "assistant" && (
                <div className="w-6 h-6 rounded-lg bg-linear-to-br from-violet-500 to-indigo-500 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-3 w-3 text-white" />
                </div>
              )}
              <div className="max-w-[85%]">
                <div
                  className={cn(
                    "rounded-2xl px-3 py-2 text-xs leading-relaxed",
                    msg.role === "user"
                      ? "bg-primary text-white rounded-br-md"
                      : "bg-gray-50 dark:bg-accent/50 text-gray-700 dark:text-gray-300 rounded-bl-md border border-gray-100 dark:border-card-border"
                  )}
                >
                  {msg.role === "assistant" ? renderContent(msg.content) : msg.content}
                </div>
                {msg.role === "assistant" && renderActions(msg)}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-linear-to-br from-violet-500 to-indigo-500 flex items-center justify-center shrink-0">
                <Bot className="h-3 w-3 text-white" />
              </div>
              <div className="bg-gray-50 dark:bg-accent/50 rounded-2xl rounded-bl-md px-3 py-2 border border-gray-100 dark:border-card-border">
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Analizando…
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Contextual suggestions */}
        {contextSuggestions.length > 0 && !loading && (
          <div className="px-3 py-1.5 border-t border-gray-100 dark:border-card-border shrink-0 flex flex-wrap gap-1.5">
            {contextSuggestions.map(suggestion => (
              <button
                key={suggestion}
                onClick={() => sendMessage(suggestion)}
                className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-800/40 hover:bg-violet-100 dark:hover:bg-violet-950/50 transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="px-3 py-2 border-t border-gray-100 dark:border-card-border shrink-0">
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={isListening ? "🎙️ Escuchando…" : isOffline ? "Modo offline…" : "Pregunta algo…"}
                rows={1}
                className={cn(
                  "w-full resize-none rounded-xl border px-3 py-2 text-xs bg-gray-50 dark:bg-surface text-gray-800 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors",
                  isListening ? "border-red-300 dark:border-red-800 bg-red-50/30 dark:bg-red-950/10" : "border-gray-200 dark:border-card-border"
                )}
                style={{ maxHeight: 80 }}
                disabled={loading}
              />
            </div>
            <button
              onClick={toggleVoice}
              className={cn(
                "h-9 w-9 rounded-xl flex items-center justify-center transition-all shrink-0",
                isListening
                  ? "bg-red-500 text-white hover:bg-red-600 animate-pulse"
                  : "bg-gray-100 dark:bg-surface text-gray-500 dark:text-muted hover:bg-gray-200 dark:hover:bg-accent"
              )}
              title={isListening ? "Detener" : "Hablar"}
            >
              {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              className={cn(
                "h-9 w-9 rounded-xl flex items-center justify-center transition-all shrink-0",
                input.trim() && !loading
                  ? "bg-linear-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700 shadow-sm"
                  : "bg-gray-100 dark:bg-surface text-gray-300 dark:text-muted cursor-not-allowed"
              )}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Floating trigger button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className={cn(
            "fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-50 h-14 w-14 rounded-2xl shadow-2xl flex items-center justify-center transition-all duration-300",
            "bg-linear-to-br from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 hover:shadow-violet-500/30 hover:scale-105",
            "text-white",
            pulse && "animate-bounce shadow-violet-500/40"
          )}
          title="Asistente Ejecutivo IA"
        >
          <Bot className="h-7 w-7" />
          {(notifications.length > 0) && (
            <span className="absolute -top-1 -right-1 min-w-4.5 h-4.5 bg-red-500 rounded-full border-2 border-white dark:border-card text-[9px] font-bold flex items-center justify-center text-white px-1">
              {notifications.length}
            </span>
          )}
          {notifications.length === 0 && (
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-white dark:border-card animate-pulse" />
          )}
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className={cn(
            "fixed z-50 flex flex-col bg-white dark:bg-card border border-gray-200 dark:border-card-border shadow-2xl transition-all duration-300",
            expanded
              ? "inset-4 rounded-2xl"
              : "bottom-20 right-4 sm:bottom-6 sm:right-6 w-95 sm:w-105 h-150 max-h-[85vh] rounded-2xl"
          )}
        >
          {/* Header */}
          <div className="flex flex-wrap items-center gap-3 px-2 sm:px-4 py-2 sm:py-3 border-b border-gray-100 dark:border-card-border bg-linear-to-r from-violet-600 to-indigo-600 text-white rounded-t-2xl shrink-0">
            <div className="h-9 w-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Bot className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-bold text-sm leading-tight">Asistente Ejecutivo</h3>
              <p className="text-[10px] text-white/70">
                {isOffline ? "⚡ Modo offline" : "IA · Análisis en tiempo real"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setTtsEnabled(!ttsEnabled)}
                className={cn("p-1.5 rounded-lg transition-colors", ttsEnabled ? "bg-white/30" : "hover:bg-white/20")}
                title={ttsEnabled ? "Silenciar voz" : "Activar voz"}
              >
                {ttsEnabled ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => setShowPanel(showPanel === "history" ? "chat" : "history")}
                className={cn("p-1.5 rounded-lg transition-colors", showPanel === "history" ? "bg-white/30" : "hover:bg-white/20")}
                title="Historial de sesiones"
              >
                <History className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => setShowPanel(showPanel === "stats" ? "chat" : "stats")}
                className={cn("p-1.5 rounded-lg transition-colors", showPanel === "stats" ? "bg-white/30" : "hover:bg-white/20")}
                title="Estadísticas"
              >
                <BarChart3 className="h-3.5 w-3.5" />
              </button>
              <button onClick={clearHistory} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors" title="Limpiar historial">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button onClick={() => setExpanded(!expanded)} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors" title={expanded ? "Reducir" : "Expandir"}>
                {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
              <button onClick={() => { setOpen(false); if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel(); }} className="p-1.5 rounded-lg hover:bg-white/20 transition-colors" title="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* ── Notifications banner ─────────────────────────────────────────── */}
          {notifications.length > 0 && showPanel === "chat" && (
            <div className="px-3 py-2 bg-red-50 dark:bg-red-950/20 border-b border-red-200 dark:border-red-800/40 shrink-0">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                <Bell className="h-3.5 w-3.5 text-red-500" />
                <span className="text-[10px] font-bold text-red-700 dark:text-red-400 uppercase tracking-wider">Alertas proactivas</span>
                <button onClick={() => setNotifications([])} className="ml-auto text-[9px] text-red-400 hover:underline">Cerrar</button>
              </div>
              {notifications.map((n, i) => (
                <p key={i} className="text-[10px] text-red-600 dark:text-red-400 leading-relaxed">{n}</p>
              ))}
            </div>
          )}

          {/* ── Stats panel ──────────────────────────────────────────────────── */}
          {showPanel === "stats" && (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
              <h4 className="font-extrabold text-sm text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
                <BarChart3 className="h-4 w-4 text-violet-500" /> Estadísticas de Uso
              </h4>
              {(() => {
                const stats = getUsageStats();
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="bg-gray-50 dark:bg-accent/30 rounded-xl p-3 text-center">
                        <div className="text-xl font-extrabold text-violet-600">{stats.total}</div>
                        <div className="text-[10px] text-gray-500 dark:text-muted">Consultas totales</div>
                      </div>
                      <div className="bg-gray-50 dark:bg-accent/30 rounded-xl p-3 text-center">
                        <div className="text-xl font-extrabold text-indigo-600">{stats.todayCount}</div>
                        <div className="text-[10px] text-gray-500 dark:text-muted">Hoy</div>
                      </div>
                      <div className="bg-gray-50 dark:bg-accent/30 rounded-xl p-3 text-center col-span-2">
                        <div className="text-xl font-extrabold text-emerald-600">{stats.avgMs > 0 ? `${(stats.avgMs / 1000).toFixed(1)}s` : "—"}</div>
                        <div className="text-[10px] text-gray-500 dark:text-muted">Tiempo promedio de respuesta</div>
                      </div>
                    </div>
                    {stats.topQueries.length > 0 && (
                      <div>
                        <p className="text-[10px] font-semibold text-gray-500 dark:text-muted uppercase tracking-wider mb-1.5">Consultas frecuentes</p>
                        {stats.topQueries.map((q, i) => (
                          <button key={i} onClick={() => { setShowPanel("chat"); sendMessage(q); }} className="block w-full text-left text-[10px] text-gray-600 dark:text-gray-400 hover:text-primary py-1 truncate">
                            {i + 1}. {q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── History panel ────────────────────────────────────────────────── */}
          {showPanel === "history" && (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
              <h4 className="font-extrabold text-sm text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
                <Clock className="h-4 w-4 text-violet-500" /> Sesiones Anteriores
              </h4>
              {(() => {
                const sessions = getSessions();
                if (sessions.length === 0) return <p className="text-[10px] text-gray-400 dark:text-muted">No hay sesiones guardadas. Al limpiar el chat, se guardará automáticamente.</p>;
                return sessions.map(s => (
                  <div key={s.id} className="bg-gray-50 dark:bg-accent/30 rounded-xl p-3 border border-gray-100 dark:border-card-border">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-gray-700 dark:text-gray-300">{s.date}</span>
                      <span className="text-[9px] text-gray-400 dark:text-muted">{s.messageCount} mensajes</span>
                    </div>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 leading-relaxed">{s.summary}</p>
                  </div>
                ));
              })()}
            </div>
          )}

          {/* ── Chat panel (messages) ────────────────────────────────────────── */}
          {showPanel === "chat" && (
            <>
              <div className="flex-1 overflow-y-auto px-2 sm:px-4 py-2 sm:py-3 space-y-3 scroll-smooth">
                {/* Offline banner inside chat */}
                {isOffline && (
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800/40 text-[10px] text-amber-700 dark:text-amber-400">
                    <WifiOff className="h-3.5 w-3.5 shrink-0" />
                    <span>Sin conexión — respuestas pre-calculadas disponibles</span>
                  </div>
                )}

                {messages.map(msg => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex gap-2",
                      msg.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    {msg.role === "assistant" && (
                      <div className="w-7 h-7 rounded-lg bg-linear-to-br from-violet-500 to-indigo-500 flex items-center justify-center shrink-0 mt-0.5">
                        <Bot className="h-3.5 w-3.5 text-white" />
                      </div>
                    )}
                    <div className="max-w-[85%]">
                      <div
                        className={cn(
                          "rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed",
                          msg.role === "user"
                            ? "bg-primary text-white rounded-br-md"
                            : "bg-gray-50 dark:bg-accent/50 text-gray-700 dark:text-gray-300 rounded-bl-md border border-gray-100 dark:border-card-border"
                        )}
                      >
                        {msg.role === "assistant" ? renderContent(msg.content) : msg.content}
                      </div>
                      {msg.role === "assistant" && renderActions(msg)}
                      {/* TTS play button for individual messages */}
                      {msg.role === "assistant" && msg.id !== "greeting" && msg.content.length > 20 && (
                        <button
                          onClick={() => speak(msg.content)}
                          className="mt-1 text-[9px] text-gray-400 dark:text-muted hover:text-violet-600 dark:hover:text-violet-400 flex items-center gap-1 transition-colors"
                        >
                          <Volume2 className="h-2.5 w-2.5" /> Escuchar
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-linear-to-br from-violet-500 to-indigo-500 flex items-center justify-center shrink-0">
                      <Bot className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="bg-gray-50 dark:bg-accent/50 rounded-2xl rounded-bl-md px-2 sm:px-4 py-2 sm:py-3 border border-gray-100 dark:border-card-border">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Analizando datos del negocio…
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Quick actions (only when few messages) */}
              {messages.length <= 2 && !loading && (
                <div className="px-4 pb-2 shrink-0">
                  <p className="text-[10px] font-semibold text-gray-400 dark:text-muted uppercase tracking-wider mb-2">Acciones rápidas</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {QUICK_ACTIONS.map(action => (
                      <button
                        key={action.label}
                        onClick={() => sendMessage(action.prompt)}
                        className={cn(
                          "flex items-center gap-2 px-2.5 py-2 rounded-xl text-[10px] font-semibold border transition-all hover:scale-[1.02] hover:shadow-sm text-left",
                          action.color
                        )}
                      >
                        <action.icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="leading-tight">{action.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input area */}
              <div className="px-3 py-2.5 border-t border-gray-100 dark:border-card-border shrink-0">
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex-1 relative">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          sendMessage();
                        }
                      }}
                      placeholder={isListening ? "🎙️ Escuchando…" : isOffline ? "Modo offline…" : "Pregunta al asistente…"}
                      rows={1}
                      className={cn(
                        "w-full resize-none rounded-xl border px-3 py-2.5 text-xs bg-gray-50 dark:bg-surface text-gray-800 dark:text-foreground placeholder:text-gray-400 dark:placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors",
                        isListening ? "border-red-300 dark:border-red-800 bg-red-50/30 dark:bg-red-950/10" : "border-gray-200 dark:border-card-border"
                      )}
                      style={{ maxHeight: 120 }}
                      disabled={loading}
                    />
                  </div>
                  <button
                    onClick={toggleVoice}
                    className={cn(
                      "h-10 w-10 rounded-xl flex items-center justify-center transition-all shrink-0",
                      isListening
                        ? "bg-red-500 text-white hover:bg-red-600 animate-pulse"
                        : "bg-gray-100 dark:bg-surface text-gray-500 dark:text-muted hover:bg-gray-200 dark:hover:bg-accent"
                    )}
                    title={isListening ? "Detener" : "Hablar"}
                  >
                    {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => sendMessage()}
                    disabled={!input.trim() || loading}
                    className={cn(
                      "h-10 w-10 rounded-xl flex items-center justify-center transition-all shrink-0",
                      input.trim() && !loading
                        ? "bg-linear-to-r from-violet-600 to-indigo-600 text-white hover:from-violet-700 hover:to-indigo-700 shadow-sm"
                        : "bg-gray-100 dark:bg-surface text-gray-300 dark:text-muted cursor-not-allowed"
                    )}
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </div>
                <div className="flex items-center justify-between mt-1.5 px-1">
                  <span className="text-[9px] text-gray-300 dark:text-muted">
                    Shift+Enter nueva línea · {isOffline ? "Offline" : "Groq IA"}
                  </span>
                  {messages.length > 2 && (
                    <button
                      onClick={() => {
                        setMessages(prev => [...prev, { ...GREETING, id: `greeting-${Date.now()}` }]);
                      }}
                      className="text-[9px] text-primary font-semibold hover:underline flex items-center gap-0.5"
                    >
                      <Sparkles className="h-2.5 w-2.5" /> Acciones rápidas
                    </button>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
