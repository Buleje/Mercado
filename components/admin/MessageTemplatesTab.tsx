"use client";
import { useState, useMemo, useEffect } from "react";
import { MessageSquare, Plus, Copy, Check, Trash2, X, Search, Star, StarOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

/* ── types ──────────────────────────────────────────────────── */
type TemplateChannel = "whatsapp" | "email" | "sms";
type TemplateCategory = "ventas" | "cobranza" | "delivery" | "promociones" | "atención" | "general";

type MessageTemplate = {
  id: string;
  name: string;
  channel: TemplateChannel;
  category: TemplateCategory;
  subject?: string; // email only
  body: string;
  variables: string[];
  starred: boolean;
  usageCount: number;
  createdAt: string;
};

/* ── config ─────────────────────────────────────────────────── */
const CHANNEL_CONFIG: Record<TemplateChannel, { label: string; color: string; bg: string }> = {
  whatsapp: { label: "WhatsApp", color: "text-green-600",  bg: "bg-green-100 dark:bg-green-900/30" },
  email:    { label: "Email",    color: "text-emerald-600",   bg: "bg-emerald-100 dark:bg-emerald-900/30" },
  sms:      { label: "SMS",      color: "text-purple-600", bg: "bg-purple-100 dark:bg-purple-900/30" },
};

const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  ventas: "Ventas", cobranza: "Cobranza", delivery: "Delivery",
  promociones: "Promociones", atención: "Atención", general: "General",
};

/* ── seed data ──────────────────────────────────────────────── */
const INITIAL_TEMPLATES: MessageTemplate[] = [];

/* ── component ──────────────────────────────────────────────── */
export default function MessageTemplatesTab() {
  const [templates, setTemplates] = useState<MessageTemplate[]>(INITIAL_TEMPLATES);
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<"all" | TemplateChannel>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | TemplateCategory>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newChannel, setNewChannel] = useState<TemplateChannel>("whatsapp");
  const [newCategory, setNewCategory] = useState<TemplateCategory>("ventas");
  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/message-templates")
      .then(r => r.json())
      .then(d => setTemplates(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return templates.filter(t => {
      if (channelFilter !== "all" && t.channel !== channelFilter) return false;
      if (categoryFilter !== "all" && t.category !== categoryFilter) return false;
      if (search && !t.name.toLowerCase().includes(search.toLowerCase()) && !t.body.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }).sort((a, b) => {
      if (a.starred && !b.starred) return -1;
      if (!a.starred && b.starred) return 1;
      return b.usageCount - a.usageCount;
    });
  }, [templates, channelFilter, categoryFilter, search]);

  const selected = selectedId ? templates.find(t => t.id === selectedId) : null;

  const handleCopy = async (t: MessageTemplate) => {
    try {
      await navigator.clipboard.writeText(t.body);
      setCopiedId(t.id);
      setTemplates(prev => prev.map(tp => tp.id === t.id ? { ...tp, usageCount: tp.usageCount + 1 } : tp));
      setTimeout(() => setCopiedId(null), 2000);
      fetch(`/api/message-templates?id=${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usageCount: t.usageCount + 1 }) });
    } catch {
      // clipboard not available
    }
  };

  const handleStar = async (id: string) => {
    const t = templates.find(tp => tp.id === id);
    if (!t) return;
    setTemplates(prev => prev.map(tp => tp.id === id ? { ...tp, starred: !tp.starred } : tp));
    fetch(`/api/message-templates?id=${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ starred: !t.starred }) });
  };

  const handleDelete = async (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
    if (selectedId === id) setSelectedId(null);
    try {
      await fetch(`/api/message-templates?id=${id}`, { method: "DELETE" });
      toast.success("Plantilla eliminada");
    } catch { toast.error("Error al eliminar"); }
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newBody.trim()) return;
    const vars = [...newBody.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]);
    try {
      const res = await fetch("/api/message-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          channel: newChannel,
          category: newCategory,
          subject: newChannel === "email" ? newSubject.trim() : undefined,
          body: newBody.trim(),
          variablesJson: JSON.stringify(vars),
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setTemplates(prev => [...prev, created]);
        toast.success("Plantilla creada");
      } else { toast.error("Error al crear la plantilla"); }
    } catch { toast.error("Error al crear la plantilla"); }
    setNewName(""); setNewBody(""); setNewSubject(""); setShowNew(false);
  };

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground">Plantillas de Mensajes</h2>
          <p className="text-sm text-gray-500 dark:text-muted mt-1">Plantillas listas para WhatsApp, Email y SMS</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button onClick={() => setShowNew(true)} className="flex flex-wrap items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors shadow-md shadow-primary/20">
            <Plus className="h-4 w-4" /> Nueva plantilla
          </button>

        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
        {(["whatsapp", "email", "sms"] as TemplateChannel[]).map(ch => {
          const cfg = CHANNEL_CONFIG[ch];
          const count = templates.filter(t => t.channel === ch).length;
          return (
            <div key={ch} className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-4 shadow-sm">
              <p className={cn("text-xs font-semibold", cfg.color)}>{cfg.label}</p>
              <p className="text-xl sm:text-2xl font-extrabold text-gray-900 dark:text-foreground mt-1">{count}</p>
              <p className="text-xs text-gray-400 dark:text-muted">plantillas</p>
            </div>
          );
        })}
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-4 shadow-sm">
          <p className="text-xs text-gray-500 dark:text-muted font-semibold">Usos totales</p>
          <p className="text-xl sm:text-2xl font-extrabold text-emerald-600 mt-1">{templates.reduce((s, t) => s + t.usageCount, 0)}</p>
          <p className="text-xs text-gray-400 dark:text-muted">copias realizadas</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar plantilla..." className="pl-9 pr-4 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-surface text-gray-900 dark:text-foreground text-sm outline-none focus:border-primary w-56" />
        </div>
        <div className="flex rounded-xl border border-gray-200 dark:border-card-border overflow-hidden">
          {[{ val: "all", lbl: "Todos" }, ...Object.entries(CHANNEL_CONFIG).map(([k, v]) => ({ val: k, lbl: v.label }))].map(({ val, lbl }) => (
            <button key={val} onClick={() => setChannelFilter(val as typeof channelFilter)} className={cn("px-3 py-2 text-sm font-semibold transition-colors", channelFilter === val ? "bg-primary text-white" : "text-gray-600 dark:text-muted hover:bg-gray-50 dark:hover:bg-surface")}>{lbl}</button>
          ))}
        </div>
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value as typeof categoryFilter)} className="px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm outline-none focus:border-primary">
          <option value="all">Todas las categorías</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      {/* Template list + preview */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-4 animate-pulse">
              <div className="flex flex-wrap items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-gray-200 dark:bg-surface shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-gray-200 dark:bg-surface rounded-full w-2/3" />
                  <div className="h-3 bg-gray-100 dark:bg-surface/60 rounded-full w-1/2" />
                </div>
                <div className="h-5 w-16 bg-gray-100 dark:bg-surface/60 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* List */}
        <div className="lg:col-span-2 space-y-3">
          {filtered.map(t => {
            const chCfg = CHANNEL_CONFIG[t.channel];
            return (
              <div key={t.id} onClick={() => setSelectedId(t.id)} className={cn("bg-white dark:bg-card rounded-2xl border p-4 cursor-pointer transition-all hover:shadow-md", selectedId === t.id ? "border-primary shadow-md" : "border-gray-200 dark:border-card-border")}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <button onClick={e => { e.stopPropagation(); handleStar(t.id); }} className="shrink-0">
                      {t.starred ? <Star className="h-4 w-4 text-amber-500 fill-amber-500" /> : <StarOff className="h-4 w-4 text-gray-300" />}
                    </button>
                    <h3 className="font-bold text-gray-900 dark:text-foreground text-sm">{t.name}</h3>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", chCfg.bg, chCfg.color)}>{chCfg.label}</span>
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-surface text-gray-600 dark:text-muted text-xs font-semibold">{CATEGORY_LABELS[t.category]}</span>
                  </div>
                </div>
                <p className="text-xs text-gray-500 dark:text-muted line-clamp-2 mb-3 whitespace-pre-line">{t.body.replace(/\{\{(\w+)\}\}/g, "[$1]")}</p>
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400 dark:text-muted">
                    <span>{t.variables.length} variables</span>
                    <span>·</span>
                    <span>{t.usageCount} usos</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={e => { e.stopPropagation(); handleCopy(t); }} className="p-1.5 rounded-lg text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors">
                      {copiedId === t.id ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={e => { e.stopPropagation(); handleDelete(t.id); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="text-center py-12"><MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" /><p className="text-gray-400 font-semibold">No hay plantillas</p></div>}
        </div>

        {/* Preview */}
        <div className="lg:col-span-1">
          {selected ? (
            <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-3 sm:p-5 shadow-sm sticky top-6">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground text-sm mb-1">{selected.name}</h3>
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <span className={cn("px-2 py-0.5 rounded-full text-xs font-bold", CHANNEL_CONFIG[selected.channel].bg, CHANNEL_CONFIG[selected.channel].color)}>{CHANNEL_CONFIG[selected.channel].label}</span>
                <span className="text-xs text-gray-400 dark:text-muted">{selected.createdAt}</span>
              </div>
              {selected.subject && (
                <div className="mb-3"><p className="text-xs text-gray-500 dark:text-muted font-semibold">Asunto:</p><p className="text-sm text-gray-900 dark:text-foreground">{selected.subject}</p></div>
              )}
              <div className={cn("rounded-xl p-4 text-sm whitespace-pre-line leading-relaxed", selected.channel === "whatsapp" ? "bg-emerald-50 dark:bg-emerald-950/20 text-gray-800 dark:text-foreground" : "bg-gray-50 dark:bg-surface text-gray-700 dark:text-foreground")}>
                {selected.body}
              </div>
              {selected.variables.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-gray-500 dark:text-muted font-semibold mb-2">Variables ({selected.variables.length}):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.variables.map(v => (
                      <span key={v} className="px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs font-bold">{`{{${v}}}`}</span>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={() => handleCopy(selected)} className="w-full mt-4 flex flex-wrap items-center justify-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors">
                {copiedId === selected.id ? <><Check className="h-4 w-4" /> Copiado</> : <><Copy className="h-4 w-4" /> Copiar mensaje</>}
              </button>
            </div>
          ) : (
            <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-8 text-center">
              <MessageSquare className="h-10 w-10 text-gray-300 dark:text-muted mx-auto mb-3" />
              <p className="text-sm text-gray-400 dark:text-muted">Selecciona una plantilla para ver la vista previa</p>
            </div>
          )}
        </div>
      </div>
      )}

      {/* New modal */}
      {showNew && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowNew(false)}>
          <div className="bg-white dark:bg-card rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 sm:px-6 py-4 border-b border-gray-100 dark:border-card-border">
              <h3 className="font-extrabold text-gray-900 dark:text-foreground">Nueva plantilla</h3>
              <button onClick={() => setShowNew(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-accent"><X className="h-5 w-5" /></button>
            </div>
            <div className="px-3 sm:px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-foreground mb-1">Nombre</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Ej: Confirmación de pedido" className="w-full px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-surface text-gray-900 dark:text-foreground text-sm outline-none focus:border-primary" autoFocus />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-foreground mb-1">Canal</label>
                  <select value={newChannel} onChange={e => setNewChannel(e.target.value as TemplateChannel)} className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm outline-none focus:border-primary">
                    {Object.entries(CHANNEL_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-foreground mb-1">Categoría</label>
                  <select value={newCategory} onChange={e => setNewCategory(e.target.value as TemplateCategory)} className="w-full px-3 py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm outline-none focus:border-primary">
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
              </div>
              {newChannel === "email" && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 dark:text-foreground mb-1">Asunto</label>
                  <input type="text" value={newSubject} onChange={e => setNewSubject(e.target.value)} placeholder="Asunto del email..." className="w-full px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-surface text-sm outline-none focus:border-primary" />
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-foreground mb-1">Mensaje</label>
                <textarea value={newBody} onChange={e => setNewBody(e.target.value)} placeholder={"Usa {{variable}} para campos dinámicos...\nEj: Hola {{cliente}}, tu pedido..."} rows={6} className="w-full px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl border-2 border-gray-200 dark:border-card-border bg-white dark:bg-surface text-gray-900 dark:text-foreground text-sm outline-none focus:border-primary resize-none font-mono" />
                <p className="text-xs text-gray-400 dark:text-muted mt-1">Variables detectadas: {[...newBody.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).join(", ") || "ninguna"}</p>
              </div>
              <div className="flex flex-wrap justify-end gap-3 pt-2">
                <button onClick={() => setShowNew(false)} className="px-2 sm:px-4 py-1.5 sm:py-2.5 rounded-xl text-sm font-semibold text-gray-600 dark:text-muted hover:bg-gray-100 dark:hover:bg-accent">Cancelar</button>
                <button onClick={handleAdd} disabled={!newName.trim() || !newBody.trim()} className="px-5 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50">Crear plantilla</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
