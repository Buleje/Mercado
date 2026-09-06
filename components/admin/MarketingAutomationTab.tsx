"use client";

import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import { CardTitle } from "@buleje/design-system";

import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Megaphone, Plus, Trash2, X, Users, Clock, CheckCircle2,
  Loader2, MessageCircle, Bell, Send, Ban, Eye, TrendingUp,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { csrfHeaders } from "@/lib/csrf-client";

// ── Types (alineados con /api/campaigns + CampaignsDB) ──────────────────────────

type Segment = "todos" | "vip" | "inactivos" | "cumpleanos" | "deudores";
type Channel = "whatsapp" | "inapp" | "ambos";
type Status = "borrador" | "programada" | "activa" | "completada" | "cancelada";

type Campaign = {
  id: string;
  name: string;
  message: string;
  segment: Segment;
  channel: Channel;
  status: Status;
  scheduledAt: string | null;
  sentAt: string | null;
  totalAudience: number;
  delivered: number;
  opened: number;
  conversions: number;
  revenue: number;
  createdAt: string;
};

// ── Meta ────────────────────────────────────────────────────────────────────────

const SEGMENT_LABELS: Record<Segment, string> = {
  todos: "Todos los clientes",
  vip: "VIP (oro + diamante)",
  inactivos: "Inactivos (30 días)",
  cumpleanos: "Cumpleañeros del mes",
  deudores: "Con deuda (fiado)",
};

const CHANNEL_META: Record<Channel, { label: string; icon: typeof MessageCircle }> = {
  whatsapp: { label: "WhatsApp", icon: MessageCircle },
  inapp: { label: "App", icon: Bell },
  ambos: { label: "WhatsApp + App", icon: Send },
};

const STATUS_META: Record<Status, { label: string; color: string; bg: string }> = {
  borrador:   { label: "Borrador",   color: "text-[var(--text-secondary)]",   bg: "bg-[var(--surface-sunken)]" },
  programada: { label: "Programada", color: "text-[var(--data-info-500)]",    bg: "bg-[var(--data-info-50)] dark:bg-[var(--data-info-500)]/15" },
  activa:     { label: "Activa",     color: "text-[var(--data-warning-500)]", bg: "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/15" },
  completada: { label: "Completada", color: "text-[var(--data-success-500)]", bg: "bg-primary/10 dark:bg-primary/15" },
  cancelada:  { label: "Cancelada",  color: "text-[var(--data-error-500)]",   bg: "bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15" },
};

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";

// datetime-local con la hora local actual (sin segundos)
const nowLocalInput = () => {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

type FormState = {
  name: string;
  message: string;
  segment: Segment;
  channel: Channel;
  mode: "ahora" | "programar" | "borrador";
  scheduledAt: string;
};

const emptyForm: FormState = {
  name: "", message: "", segment: "todos", channel: "whatsapp", mode: "ahora", scheduledAt: "",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function MarketingAutomationTab({
  initialSegment,
  onConsumeSegment,
}: { initialSegment?: string | null; onConsumeSegment?: () => void } = {}) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [audience, setAudience] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/campaigns");
      if (res.ok) setCampaigns(await res.json());
    } catch {
      /* silencioso: lista vacía si falla */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Apertura cross-tab desde "Segmentos": pre-carga el form con el segmento elegido.
  useEffect(() => {
    if (!initialSegment) return;
    const seg = (Object.keys(SEGMENT_LABELS) as Segment[]).includes(initialSegment as Segment)
      ? (initialSegment as Segment)
      : "todos";
    setForm({ ...emptyForm, segment: seg });
    setError(null);
    setShowForm(true);
    onConsumeSegment?.();
  }, [initialSegment, onConsumeSegment]);

  // Cerrar modal con Escape (ui-components rule: modal = click-fuera + Escape)
  useEffect(() => {
    if (!showForm) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setShowForm(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showForm]);

  // Preview de audiencia en vivo cuando cambia el segmento del form
  useEffect(() => {
    if (!showForm) return;
    let active = true;
    setAudience(null);
    fetch(`/api/campaigns/audience-count?segment=${form.segment}`)
      .then(r => (r.ok ? r.json() : { count: 0 }))
      .then(d => { if (active) setAudience(d.count ?? 0); })
      .catch(() => { if (active) setAudience(0); });
    return () => { active = false; };
  }, [form.segment, showForm]);

  const stats = useMemo(() => {
    const programadas = campaigns.filter(c => c.status === "programada").length;
    const completadas = campaigns.filter(c => c.status === "completada").length;
    const alcance = campaigns.reduce((s, c) => s + (c.delivered || 0), 0);
    return { total: campaigns.length, programadas, completadas, alcance };
  }, [campaigns]);

  const submit = async () => {
    setError(null);
    if (!form.name.trim() || !form.message.trim()) {
      setError("Ponle nombre y mensaje a la campaña.");
      return;
    }
    const isScheduled = form.mode !== "borrador";
    const scheduledAt = form.mode === "programar" ? form.scheduledAt : form.mode === "ahora" ? nowLocalInput() : null;
    if (form.mode === "programar" && !scheduledAt) {
      setError("Elige fecha y hora para programar.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          name: form.name.trim(),
          message: form.message.trim(),
          segment: form.segment,
          channel: form.channel,
          status: isScheduled ? "programada" : "borrador",
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
        }),
      });
      if (!res.ok) {
        setError("No se pudo crear la campaña.");
        return;
      }
      // Optimistic: el POST devuelve la campaña creada — la mostramos al instante
      // (el GET con "use cache" puede tardar ~1s en revalidar el tag).
      const created = (await res.json()) as Campaign;
      setCampaigns(prev => [created, ...prev]);
      setShowForm(false);
      setForm(emptyForm);
      void load();
    } catch {
      setError("Error de red al crear la campaña.");
    } finally {
      setSaving(false);
    }
  };

  const patchStatus = async (id: string, status: Status) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/campaigns?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ status }),
      });
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/campaigns?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: csrfHeaders({}),
      });
      if (res.ok) setCampaigns(prev => prev.filter(c => c.id !== id));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header estándar (antes: div a mano con PageTitle suelto). */}
      <AdminModuleHeader
        as="h2"
        title="Campañas"
        description="Mandá promos y avisos a tus clientes por WhatsApp o por la app, segmentado."
        icon={Megaphone}
      >
        <button
          onClick={() => { setForm(emptyForm); setError(null); setShowForm(true); }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> Nueva campaña
        </button>
      </AdminModuleHeader>

      {/* Mismo molde de tarjeta que el resto del panel: superficie ÚNICA y el
          color en la cifra, no en el fondo. Antes cada KPI traía su propio
          `bg` (gris, celeste, verde, gris) y la fila parecía cuatro
          componentes distintos puestos uno al lado del otro. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Campañas", value: String(stats.total), color: "text-[var(--text-primary)]" },
          { label: "Programadas", value: String(stats.programadas), color: "text-[var(--data-info-500)]" },
          { label: "Completadas", value: String(stats.completadas), color: "text-[var(--data-success-500)]" },
          { label: "Clientes alcanzados", value: stats.alcance.toLocaleString("es-PE"), color: "text-[var(--text-primary)]" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
            <p className="text-xs font-bold text-[var(--text-tertiary)]">{label}</p>
            <p className={cn("mt-1 text-2xl font-extrabold tabular-nums", color)}>{value}</p>
          </div>
        ))}
      </div>

      {/* Lista */}
      <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 flex items-center justify-center text-[var(--text-tertiary)] text-sm gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando campañas…
          </div>
        ) : campaigns.length === 0 ? (
          <div className="p-10 text-center">
            <Megaphone className="h-10 w-10 text-[var(--text-tertiary)] mx-auto mb-3" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">Aún no tienes campañas</p>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">Crea tu primera promo segmentada para que tus clientes vuelvan.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--rule-soft)]">
            {campaigns.map(c => {
              const st = STATUS_META[c.status] ?? STATUS_META.borrador;
              const ch = CHANNEL_META[c.channel] ?? CHANNEL_META.whatsapp;
              const ChIcon = ch.icon;
              const segLabel = SEGMENT_LABELS[c.segment] ?? c.segment;
              const busy = busyId === c.id;
              return (
                <div key={c.id} className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn("text-[length:var(--ts-2xs)] font-bold px-2 py-0.5 rounded-full", st.bg, st.color)}>{st.label}</span>
                      <p className="font-bold text-sm text-[var(--text-primary)] truncate">{c.name}</p>
                    </div>
                    <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">{c.message}</p>
                    <div className="flex items-center gap-3 flex-wrap mt-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                      <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />{segLabel} · {c.totalAudience}</span>
                      <span className="inline-flex items-center gap-1"><ChIcon className="h-3 w-3" />{ch.label}</span>
                      {c.scheduledAt && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDate(c.scheduledAt)}</span>}
                      {c.sentAt && (
                        <>
                          <span className="inline-flex items-center gap-1 text-[var(--data-success-500)]"><CheckCircle2 className="h-3 w-3" />Enviada {fmtDate(c.sentAt)}</span>
                          <span className="inline-flex items-center gap-1"><Send className="h-3 w-3" />{c.delivered || 0} entregados</span>
                          <span className="inline-flex items-center gap-1"><Eye className="h-3 w-3" />{c.opened || 0} abiertos{(c.delivered || 0) > 0 ? ` (${Math.round(((c.opened || 0) / c.delivered) * 100)}%)` : ""}</span>
                          {(c.conversions || 0) > 0 && <span className="inline-flex items-center gap-1 text-[var(--data-success-500)]"><TrendingUp className="h-3 w-3" />{c.conversions} conversiones</span>}
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {(c.status === "programada" || c.status === "borrador" || c.status === "activa") && (
                      <button
                        onClick={() => patchStatus(c.id, "cancelada")}
                        disabled={busy}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[var(--data-warning-500)] hover:bg-[var(--data-warning-50)] dark:hover:bg-[var(--data-warning-500)]/15 disabled:opacity-50 transition-colors"
                      >
                        <Ban className="h-3.5 w-3.5" /> Cancelar
                      </button>
                    )}
                    <button
                      onClick={() => remove(c.id)}
                      disabled={busy}
                      aria-label="Eliminar campaña"
                      className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--data-error-500)] hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/15 disabled:opacity-50 transition-colors"
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-[var(--text-tertiary)]">
        Las campañas <span className="font-semibold">programadas por WhatsApp</span> se envían automáticamente a la hora indicada, solo a clientes que aceptaron promociones.
      </p>

      {/* Modal crear */}
      {showForm && (
        <div className="modal-backdrop p-4" onClick={() => setShowForm(false)}>
          <div className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl p-4 sm:p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <CardTitle className="font-extrabold text-[var(--text-primary)] text-base flex items-center gap-2"><Megaphone className="h-5 w-5 text-primary" /> Nueva campaña</CardTitle>
              <button onClick={() => setShowForm(false)} aria-label="Cerrar"><X className="h-5 w-5 text-[var(--text-tertiary)]" /></button>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--text-secondary)]">Nombre</label>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ej: Oferta de fin de semana" className="w-full h-12 px-3 text-sm rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-surface text-[var(--text-primary)] outline-none focus:border-primary" />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-[var(--text-secondary)]">Mensaje</label>
              <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} rows={3} placeholder="Hola {{nombre}}, hoy tenemos 20% en arroz. ¡Pásate por la bodega!" className="w-full px-3 py-2 text-sm rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-surface text-[var(--text-primary)] outline-none focus:border-primary resize-none" />
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Usa <span className="font-mono font-semibold">{"{{nombre}}"}</span> para personalizar con el nombre del cliente.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-secondary)]">A quién</label>
                <select value={form.segment} onChange={e => setForm(f => ({ ...f, segment: e.target.value as Segment }))} className="w-full h-12 px-3 text-sm rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-surface text-[var(--text-primary)] outline-none focus:border-primary">
                  {(Object.keys(SEGMENT_LABELS) as Segment[]).map(s => <option key={s} value={s}>{SEGMENT_LABELS[s]}</option>)}
                </select>
                <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] inline-flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {audience === null ? "Calculando…" : `${audience} cliente${audience === 1 ? "" : "s"} alcanzables`}
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--text-secondary)]">Canal</label>
                <select value={form.channel} onChange={e => setForm(f => ({ ...f, channel: e.target.value as Channel }))} className="w-full h-12 px-3 text-sm rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-surface text-[var(--text-primary)] outline-none focus:border-primary">
                  {(Object.keys(CHANNEL_META) as Channel[]).map(c => <option key={c} value={c}>{CHANNEL_META[c].label}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-[var(--text-secondary)]">Cuándo</label>
              <div className="grid grid-cols-3 gap-2">
                {([["ahora", "Ahora"], ["programar", "Programar"], ["borrador", "Borrador"]] as const).map(([m, lbl]) => (
                  <button key={m} type="button" onClick={() => setForm(f => ({ ...f, mode: m }))} className={cn("h-11 rounded-xl text-sm font-semibold border-2 transition-colors", form.mode === m ? "border-primary bg-primary/5 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]")}>{lbl}</button>
                ))}
              </div>
              {form.mode === "programar" && (
                <input type="datetime-local" value={form.scheduledAt} min={nowLocalInput()} onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} className="w-full h-12 px-3 text-sm rounded-xl border-2 border-[var(--rule-base)] bg-white dark:bg-surface text-[var(--text-primary)] outline-none focus:border-primary" />
              )}
            </div>

            {error && <p className="text-xs font-semibold text-[var(--data-error-500)]">{error}</p>}

            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-xl text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors">Cancelar</button>
              <button onClick={submit} disabled={saving} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 disabled:opacity-50 transition-colors">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {form.mode === "borrador" ? "Guardar borrador" : form.mode === "programar" ? "Programar" : "Crear y enviar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
