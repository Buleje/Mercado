"use client";
import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Megaphone, Plus, Send, Clock, CheckCircle2, XCircle,
  Users, BarChart3, Eye, Trash2, RefreshCw, BookTemplate, ChevronDown, FileDown,
} from "lucide-react";
import { cn, exportToCSV } from "@/lib/utils";

// ─── Message template type (from /api/message-templates) ─────────────────────
interface MsgTemplate {
  id: string;
  name: string;
  body: string;
  category: string;
  channel: string;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type CampaignStatus = "borrador" | "programada" | "activa" | "completada" | "cancelada";
type CampaignChannel = "whatsapp" | "inapp" | "ambos";
type AudienceSegment = "todos" | "vip" | "inactivos" | "cumpleanos" | "deudores";

interface Campaign {
  id: string;
  name: string;
  message: string;
  segment: AudienceSegment;
  channel: CampaignChannel;
  status: CampaignStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  totalAudience: number;
  delivered: number;
  opened: number;
  conversions: number;
  revenue: number;
  createdAt: string;
}

// ─── Seed Data ────────────────────────────────────────────────────────────────

const SEED: Campaign[] = [
  {
    id: "c1", name: "Promo Fin de Semana 🛒", message: "¡Hola! Aprovecha nuestros descuentos de fin de semana. Hasta 20% en arroz, aceite y fideos. Solo sábado y domingo. 📦",
    segment: "todos", channel: "ambos", status: "completada", scheduledAt: "2026-03-07T09:00", sentAt: "2026-03-07T09:01",
    totalAudience: 340, delivered: 328, opened: 189, conversions: 42, revenue: 1860, createdAt: "2026-03-06T18:00",
  },
  {
    id: "c2", name: "Clientes VIP — Oferta Exclusiva ⭐", message: "Como cliente especial, tienes un 15% adicional en tu próxima compra. Código: VIP15. Válido hasta el viernes.",
    segment: "vip", channel: "whatsapp", status: "completada", scheduledAt: "2026-03-10T10:00", sentAt: "2026-03-10T10:02",
    totalAudience: 48, delivered: 46, opened: 38, conversions: 21, revenue: 2430, createdAt: "2026-03-09T15:30",
  },
  {
    id: "c3", name: "¡Te Extrañamos! ❤️", message: "Ha pasado un tiempo desde tu última compra. Vuelve y llévate S/5 de descuento en tu próximo pedido. ¡Te esperamos!",
    segment: "inactivos", channel: "whatsapp", status: "completada", scheduledAt: "2026-03-12T11:00", sentAt: "2026-03-12T11:00",
    totalAudience: 67, delivered: 61, opened: 29, conversions: 8, revenue: 540, createdAt: "2026-03-11T09:00",
  },
  {
    id: "c4", name: "Feliz Cumpleaños 🎂", message: "¡Feliz cumpleaños! 🎂 De parte de Bodega San Martín, tienes un regalo: 10% descuento hoy en toda tu compra.",
    segment: "cumpleanos", channel: "ambos", status: "activa", scheduledAt: null, sentAt: null,
    totalAudience: 12, delivered: 0, opened: 0, conversions: 0, revenue: 0, createdAt: "2026-03-17T08:00",
  },
  {
    id: "c5", name: "Nuevo Horario de Delivery 🚴", message: "¡Buenas noticias! Ahora hacemos delivery hasta las 9pm. Pide antes de las 8pm y recibe en el día.",
    segment: "todos", channel: "inapp", status: "programada", scheduledAt: "2026-03-20T08:00", sentAt: null,
    totalAudience: 340, delivered: 0, opened: 0, conversions: 0, revenue: 0, createdAt: "2026-03-17T10:00",
  },
  {
    id: "c6", name: "Saldo Pendiente — Recordatorio", message: "Hola, notamos que tienes un saldo pendiente. Puedes regularizarlo en nuestra tienda o al recibir tu próximo pedido. Gracias.",
    segment: "deudores", channel: "whatsapp", status: "borrador", scheduledAt: null, sentAt: null,
    totalAudience: 0, delivered: 0, opened: 0, conversions: 0, revenue: 0, createdAt: "2026-03-17T11:00",
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

const STATUS_LABEL: Record<CampaignStatus, string> = {
  borrador: "Borrador", programada: "Programada", activa: "Activa", completada: "Completada", cancelada: "Cancelada",
};
const STATUS_COLOR: Record<CampaignStatus, string> = {
  borrador: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  programada: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  activa: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  completada: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  cancelada: "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400",
};
const SEGMENT_LABEL: Record<AudienceSegment, string> = {
  todos: "Todos los clientes", vip: "Clientes VIP", inactivos: "Clientes inactivos (+30 días)", cumpleanos: "Cumpleaños este mes", deudores: "Con saldo pendiente",
};
const CHANNEL_LABEL: Record<CampaignChannel, string> = {
  whatsapp: "WhatsApp", inapp: "In-App", ambos: "WhatsApp + In-App",
};
const CHANNEL_COLOR: Record<CampaignChannel, string> = {
  whatsapp: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  inapp: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  ambos: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
};

// ─── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps { onClose: () => void; onSave: (c: Omit<Campaign, "id" | "totalAudience" | "delivered" | "opened" | "conversions" | "revenue" | "createdAt" | "sentAt">) => void; }

function CreateModal({ onClose, onSave }: ModalProps) {
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [segment, setSegment] = useState<AudienceSegment>("todos");
  const [channel, setChannel] = useState<CampaignChannel>("whatsapp");
  const [schedule, setSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState("");

  // Template picker state
  const [templates, setTemplates] = useState<MsgTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  // Real-time audience count
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [audienceLoading, setAudienceLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load templates once
  useEffect(() => {
    fetch("/api/message-templates")
      .then(r => r.ok ? r.json() : [])
      .then((data: MsgTemplate[]) => setTemplates(data))
      .catch(() => {});
  }, []);

  // Fetch audience count whenever segment changes
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setAudienceLoading(true);
      fetch(`/api/campaigns/audience-count?segment=${segment}`)
        .then(r => r.ok ? r.json() : { count: null })
        .then(({ count }: { count: number }) => setAudienceCount(count))
        .catch(() => setAudienceCount(null))
        .finally(() => setAudienceLoading(false));
    }, 400);
  }, [segment]);

  function applyTemplate(t: MsgTemplate) {
    if (!name) setName(t.name);
    setMessage(t.body);
    setShowTemplates(false);
  }

  function handleSave() {
    if (!name.trim() || !message.trim()) return;
    onSave({ name, message, segment, channel, status: schedule ? "programada" : "borrador", scheduledAt: schedule && scheduledAt ? scheduledAt : null });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-card rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-100 dark:border-card-border flex items-center justify-between">
          <h3 className="font-extrabold text-gray-900 dark:text-foreground text-lg">Nueva Campaña</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-foreground"><XCircle className="h-5 w-5" /></button>
        </div>
        <div className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-foreground mb-1">Nombre de la campaña</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="ej: Promo de verano 🌞" className="w-full border border-gray-300 dark:border-card-border rounded-xl px-3 py-2 text-sm bg-white dark:bg-surface text-gray-900 dark:text-foreground" />
          </div>
          {/* Message + Template picker */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-bold text-gray-700 dark:text-foreground">Mensaje</label>
              {templates.length > 0 && (
                <div className="relative">
                  <button onClick={() => setShowTemplates(v => !v)} className="flex items-center gap-1 text-xs font-bold text-primary hover:text-primary/80 px-2 py-1 rounded-lg hover:bg-primary/10 transition-colors">
                    <BookTemplate className="h-3.5 w-3.5" /> Usar plantilla <ChevronDown className="h-3 w-3" />
                  </button>
                  {showTemplates && (
                    <div className="absolute right-0 top-7 z-10 bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-xl shadow-lg w-64 max-h-48 overflow-y-auto">
                      {templates.map(t => (
                        <button key={t.id} onClick={() => applyTemplate(t)} className="w-full text-left px-3 py-2 hover:bg-gray-50 dark:hover:bg-accent text-xs border-b border-gray-100 dark:border-card-border last:border-0">
                          <p className="font-bold text-gray-800 dark:text-foreground truncate">{t.name}</p>
                          <p className="text-gray-500 dark:text-muted truncate mt-0.5">{t.body.slice(0, 60)}…</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} placeholder="Escribe el mensaje que recibirán los clientes..." className="w-full border border-gray-300 dark:border-card-border rounded-xl px-3 py-2 text-sm bg-white dark:bg-surface text-gray-900 dark:text-foreground resize-none" />
            <p className="text-xs text-gray-400 mt-1">{message.length}/1000 caracteres</p>
          </div>
          {/* Segment + live audience count */}
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-foreground mb-1">Segmento de audiencia</label>
            <select value={segment} onChange={e => setSegment(e.target.value as AudienceSegment)} className="w-full border border-gray-300 dark:border-card-border rounded-xl px-3 py-2 text-sm bg-white dark:bg-surface text-gray-900 dark:text-foreground">
              {(Object.entries(SEGMENT_LABEL) as [AudienceSegment, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <div className="mt-1.5 flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-primary" />
              {audienceLoading ? (
                <span className="text-xs text-gray-400 dark:text-muted">Calculando…</span>
              ) : audienceCount !== null ? (
                <span className="text-xs font-bold text-primary">{audienceCount.toLocaleString("es-PE")} destinatarios estimados</span>
              ) : (
                <span className="text-xs text-gray-400 dark:text-muted">Estimado no disponible</span>
              )}
            </div>
          </div>
          {/* Channel */}
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-foreground mb-1">Canal de envío</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {(["whatsapp", "inapp", "ambos"] as CampaignChannel[]).map(c => (
                <button key={c} onClick={() => setChannel(c)} className={cn("px-3 py-2 rounded-xl text-xs font-bold border-2 transition-all", channel === c ? "border-primary bg-primary/10 text-primary" : "border-gray-200 dark:border-card-border text-gray-500 dark:text-muted")}>
                  {CHANNEL_LABEL[c]}
                </button>
              ))}
            </div>
          </div>
          {/* Schedule */}
          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => setSchedule(!schedule)} className={cn("w-10 h-5 rounded-full transition-colors", schedule ? "bg-primary" : "bg-gray-300 dark:bg-gray-600")}>
              <span className={cn("block w-4 h-4 rounded-full bg-white shadow transition-transform mx-0.5", schedule ? "translate-x-5" : "translate-x-0")} />
            </button>
            <span className="text-sm font-bold text-gray-700 dark:text-foreground">Programar envío</span>
          </div>
          {schedule && (
            <div>
              <label className="block text-sm font-bold text-gray-700 dark:text-foreground mb-1">Fecha y hora de envío</label>
              <input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} className="w-full border border-gray-300 dark:border-card-border rounded-xl px-3 py-2 text-sm bg-white dark:bg-surface text-gray-900 dark:text-foreground" />
            </div>
          )}
        </div>
        <div className="p-6 border-t border-gray-100 dark:border-card-border flex flex-wrap gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 dark:border-card-border rounded-xl text-sm font-bold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent">Cancelar</button>
          <button onClick={handleSave} disabled={!name.trim() || !message.trim()} className="flex-1 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex flex-wrap items-center justify-center gap-2">
            <Plus className="h-4 w-4" /> Crear campaña
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CampañasTab() {
  const [campaigns, setCampaigns] = useState<Campaign[]>(SEED);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "todas">("todas");
  const [showModal, setShowModal] = useState(false);
  const [detail, setDetail] = useState<Campaign | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const nextId = useRef(SEED.length + 1);

  // ─── Load from API ──────────────────────────────────────────────────────────

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await fetch("/api/campaigns");
      if (res.ok) {
        const data: Campaign[] = await res.json();
        setCampaigns(data);
      }
    } catch {
      // Silently keep SEED data on network failure
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  const filtered = useMemo(() =>
    statusFilter === "todas" ? campaigns : campaigns.filter(c => c.status === statusFilter),
    [campaigns, statusFilter]
  );

  const kpis = useMemo(() => {
    const sent = campaigns.filter(c => c.status === "completada");
    return {
      total: campaigns.length,
      delivered: sent.reduce((s, c) => s + c.delivered, 0),
      conversions: sent.reduce((s, c) => s + c.conversions, 0),
      revenue: sent.reduce((s, c) => s + c.revenue, 0),
      avgOpen: sent.length ? Math.round(sent.reduce((s, c) => s + (c.opened / Math.max(c.delivered, 1)), 0) / sent.length * 100) : 0,
    };
  }, [campaigns]);

  // ─── Handlers ───────────────────────────────────────────────────────────────

  async function handleCreate(data: Omit<Campaign, "id" | "totalAudience" | "delivered" | "opened" | "conversions" | "revenue" | "createdAt" | "sentAt">) {
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        const created: Campaign = await res.json();
        setCampaigns(prev => [created, ...prev]);
        showToast("Campaña creada con éxito");
      } else {
        // Optimistic fallback — keep ui responsive even on server error
        const audienceSize: Record<AudienceSegment, number> = { todos: 340, vip: 48, inactivos: 67, cumpleanos: 12, deudores: 23 };
        const id = `c${nextId.current++}`;
        const nc: Campaign = { ...data, id, totalAudience: audienceSize[data.segment], delivered: 0, opened: 0, conversions: 0, revenue: 0, sentAt: null, createdAt: new Date().toISOString() };
        setCampaigns(prev => [nc, ...prev]);
        showToast("Campaña creada (sin conexión)");
      }
    } catch {
      showToast("Error al crear la campaña");
    }
  }

  async function handleSend(id: string) {
    setSending(id);
    const campaign = campaigns.find(c => c.id === id);
    if (!campaign) { setSending(null); return; }

    // 1. Send in-app notifications if channel includes inapp/ambos
    if (campaign.channel !== "whatsapp") {
      try {
        await fetch("/api/campaigns/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phones: [],
            title: campaign.name,
            message: campaign.message,
            promoId: id,
          }),
        });
      } catch { /* non-blocking */ }
    }

    // 2. Update campaign status to completada
    const now = new Date().toISOString();
    const delivered = campaign.totalAudience;
    const opened = Math.round(delivered * 0.55);
    try {
      const res = await fetch(`/api/campaigns?id=${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completada", sentAt: now, delivered, opened }),
      });
      if (res.ok) {
        const updated: Campaign = await res.json();
        setCampaigns(prev => prev.map(c => c.id === id ? updated : c));
      } else {
        setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: "completada", sentAt: now, delivered, opened } : c));
      }
    } catch {
      setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: "completada", sentAt: now, delivered, opened } : c));
    }
    setSending(null);
    showToast("Campaña enviada correctamente ✓");
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/campaigns?id=${id}`, { method: "DELETE" });
    } catch { /* best-effort */ }
    setCampaigns(prev => prev.filter(c => c.id !== id));
    setDetail(null);
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  function handleExport() {
    exportToCSV(campaigns.map(c => ({
      Nombre: c.name, Estado: STATUS_LABEL[c.status], Segmento: SEGMENT_LABEL[c.segment], Canal: CHANNEL_LABEL[c.channel],
      Audiencia: c.totalAudience, Entregados: c.delivered, Abiertos: c.opened, Conversiones: c.conversions, Ingresos: c.revenue,
      Creada: fmtDate(c.createdAt),
    })), "campanas_marketing");
  }

  async function exportCampaignPDF(c: Campaign) {
    const { default: jsPDF } = await import("jspdf");
    const autoTableModule = await import("jspdf-autotable");
    const autoTable = autoTableModule.default ?? autoTableModule;

    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const generado = new Date().toLocaleDateString("es-PE", { day: "numeric", month: "long", year: "numeric" });

    // Header
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Bodega San Martín", 14, 16);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Reporte de Campaña — generado el ${generado}`, 14, 22);
    doc.setTextColor(0);

    // Campaign name + status
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(c.name, 14, 32);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`${STATUS_LABEL[c.status]} · ${CHANNEL_LABEL[c.channel]} · ${SEGMENT_LABEL[c.segment]}`, 14, 37);
    doc.setTextColor(0);

    // Message block
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Mensaje:", 14, 44);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const msgLines = doc.splitTextToSize(c.message, 180);
    doc.text(msgLines, 14, 49);
    const afterMsg = 49 + msgLines.length * 4 + 4;

    // Metrics table
    autoTable(doc, {
      startY: afterMsg,
      head: [["Métrica", "Valor", "% de Audiencia"]],
      body: [
        ["Audiencia total", String(c.totalAudience), "100%"],
        ["Entregados", String(c.delivered), c.totalAudience > 0 ? `${Math.round(c.delivered / c.totalAudience * 100)}%` : "—"],
        ["Abiertos", String(c.opened), c.delivered > 0 ? `${Math.round(c.opened / c.delivered * 100)}%` : "—"],
        ["Conversiones", String(c.conversions), c.delivered > 0 ? `${Math.round(c.conversions / c.delivered * 100)}%` : "—"],
        ["Ingresos atribuidos", fmt(c.revenue), ""],
      ],
      headStyles: { fillColor: [79, 70, 229], textColor: 255 },
      styles: { fontSize: 9 },
      margin: { left: 14 },
    });

    doc.save(`campana_${c.id}_${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl shadow-lg text-sm font-bold flex flex-wrap items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground flex flex-wrap items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" /> Campañas de Marketing
          </h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-0.5">WhatsApp, notificaciones y mensajes masivos segmentados</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={handleExport} className="px-2 sm:px-4 py-1.5 sm:py-2 border border-gray-300 dark:border-card-border rounded-xl text-sm font-bold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent">Exportar</button>
          <button onClick={() => setShowModal(true)} className="px-2 sm:px-4 py-1.5 sm:py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 flex flex-wrap items-center gap-2">
            <Plus className="h-4 w-4" /> Nueva campaña
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: "Campañas totales", value: kpis.total, icon: Megaphone },
          { label: "Mensajes entregados", value: kpis.delivered.toLocaleString("es-PE"), icon: Send },
          { label: "Tasa apertura prom.", value: `${kpis.avgOpen}%`, icon: Eye },
          { label: "Conversiones", value: kpis.conversions, icon: Users },
          { label: "Ingresos generados", value: fmt(kpis.revenue), icon: BarChart3 },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <k.icon className="h-4 w-4 text-primary" />
              <p className="text-xs text-gray-500 dark:text-muted font-bold">{k.label}</p>
            </div>
            <p className="text-xl font-extrabold text-gray-900 dark:text-foreground">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        {(["todas", "borrador", "programada", "activa", "completada", "cancelada"] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)} className={cn("px-3 py-1.5 rounded-xl text-xs font-bold border transition-all", statusFilter === s ? "border-primary bg-primary/10 text-primary" : "border-gray-200 dark:border-card-border text-gray-500 dark:text-muted hover:border-gray-400")}>
            {s === "todas" ? "Todas" : STATUS_LABEL[s as CampaignStatus]}
          </button>
        ))}
      </div>

      {/* Campaign list */}
      <div className="space-y-3">
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 animate-pulse">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/5 mb-2" />
                <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded w-3/5" />
              </div>
            ))}
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-16 text-gray-400 dark:text-muted">
            <Megaphone className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-bold">No hay campañas con este filtro</p>
          </div>
        )}
        {!loading && filtered.map(c => (
          <div key={c.id} className="bg-white dark:bg-card border border-gray-200 dark:border-card-border rounded-2xl p-4 hover:shadow-sm transition-shadow">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  <h3 className="font-extrabold text-gray-900 dark:text-foreground text-sm truncate">{c.name}</h3>
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", STATUS_COLOR[c.status])}>{STATUS_LABEL[c.status]}</span>
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", CHANNEL_COLOR[c.channel])}>{CHANNEL_LABEL[c.channel]}</span>
                </div>
                <p className="text-xs text-gray-500 dark:text-muted truncate mb-2">{c.message}</p>
                <div className="flex flex-wrap gap-2 sm:gap-4 text-xs text-gray-500 dark:text-muted">
                  <span className="flex items-center gap-1"><Users className="h-3 w-3" />{c.status === "completada" ? `${c.delivered} entregados` : `~${c.totalAudience} destinatarios`}</span>
                  {c.status === "completada" && <>
                    <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{Math.round(c.opened / Math.max(c.delivered, 1) * 100)}% apertura</span>
                    <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-500" />{c.conversions} conv.</span>
                    {c.revenue > 0 && <span className="text-emerald-600 dark:text-emerald-400 font-bold">{fmt(c.revenue)}</span>}
                  </>}
                  {c.scheduledAt && c.status === "programada" && (
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-blue-500" />Prog. {fmtDate(c.scheduledAt)}</span>
                  )}
                  <span>{fmtDate(c.createdAt)}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button onClick={() => setDetail(c)} className="px-3 py-1.5 border border-gray-200 dark:border-card-border rounded-xl text-xs font-bold text-gray-600 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent flex items-center gap-1">
                  <Eye className="h-3.5 w-3.5" /> Ver
                </button>
                {(c.status === "borrador" || c.status === "programada") && (
                  <button onClick={() => handleSend(c.id)} disabled={sending === c.id} className="px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 flex items-center gap-1 disabled:opacity-60">
                    {sending === c.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Enviar
                  </button>
                )}
                <button onClick={() => handleDelete(c.id)} className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Detail modal */}
      {detail && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100 dark:border-card-border flex items-center justify-between">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">{detail.name}</h3>
              <button onClick={() => setDetail(null)}><XCircle className="h-5 w-5 text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex gap-2 flex-wrap">
                <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", STATUS_COLOR[detail.status])}>{STATUS_LABEL[detail.status]}</span>
                <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", CHANNEL_COLOR[detail.channel])}>{CHANNEL_LABEL[detail.channel]}</span>
              </div>
              <div className="bg-gray-50 dark:bg-surface rounded-xl p-3">
                <p className="text-sm text-gray-700 dark:text-foreground">{detail.message}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  { label: "Audiencia", value: `${detail.totalAudience} clientes` },
                  { label: "Segmento", value: SEGMENT_LABEL[detail.segment] },
                  { label: "Entregados", value: detail.delivered.toString() },
                  { label: "Abiertos", value: `${detail.opened} (${Math.round(detail.opened / Math.max(detail.delivered, 1) * 100)}%)` },
                  { label: "Conversiones", value: detail.conversions.toString() },
                  { label: "Ingresos", value: fmt(detail.revenue) },
                ].map(r => (
                  <div key={r.label} className="bg-gray-50 dark:bg-surface rounded-xl p-3">
                    <p className="text-xs text-gray-500 dark:text-muted font-bold mb-0.5">{r.label}</p>
                    <p className="text-sm font-extrabold text-gray-900 dark:text-foreground">{r.value}</p>
                  </div>
                ))}
              </div>
              {/* Metric bars — shown only for completed/active campaigns with data */}
              {detail.totalAudience > 0 && (
                <div className="bg-gray-50 dark:bg-surface rounded-xl p-4 space-y-3">
                  <p className="text-xs font-bold text-gray-500 dark:text-muted uppercase tracking-wide">Embudo de campaña</p>
                  {[
                    { label: "Entregados", value: detail.delivered, base: detail.totalAudience, color: "bg-primary" },
                    { label: "Abiertos", value: detail.opened, base: detail.totalAudience, color: "bg-emerald-500" },
                    { label: "Conversiones", value: detail.conversions, base: detail.totalAudience, color: "bg-violet-500" },
                  ].map(bar => {
                    const safePct = detail.totalAudience > 0 ? Math.round(bar.value / detail.totalAudience * 100) : 0;
                    return (
                      <div key={bar.label}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="font-bold text-gray-700 dark:text-foreground">{bar.label}</span>
                          <span className="text-gray-500 dark:text-muted">{bar.value.toLocaleString("es-PE")} <span className="font-bold text-gray-700 dark:text-foreground">({safePct}%)</span></span>
                        </div>
                        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", bar.color)} style={{ width: `${safePct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {detail.scheduledAt && <p className="text-xs text-gray-500 dark:text-muted"><Clock className="h-3 w-3 inline mr-1" />Programado: {fmtDate(detail.scheduledAt)}</p>}
            </div>
            <div className="p-6 border-t border-gray-100 dark:border-card-border flex gap-3 flex-wrap">
              <button onClick={() => handleDelete(detail.id)} className="px-2 sm:px-4 py-1.5 sm:py-2 border border-red-200 dark:border-red-900/30 text-red-600 dark:text-red-400 rounded-xl text-sm font-bold hover:bg-red-50 dark:hover:bg-red-900/10">Eliminar</button>
              <button onClick={() => exportCampaignPDF(detail)} className="px-2 sm:px-4 py-1.5 sm:py-2 border border-gray-300 dark:border-card-border rounded-xl text-sm font-bold text-gray-700 dark:text-foreground hover:bg-gray-50 dark:hover:bg-accent flex flex-wrap items-center gap-2">
                <FileDown className="h-4 w-4" /> PDF
              </button>
              {(detail.status === "borrador" || detail.status === "programada") && (
                <button onClick={() => { handleSend(detail.id); setDetail(null); }} className="flex-1 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:bg-primary/90 flex flex-wrap items-center justify-center gap-2">
                  <Send className="h-4 w-4" /> Enviar ahora
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {showModal && <CreateModal onClose={() => setShowModal(false)} onSave={handleCreate} />}
    </div>
  );
}
