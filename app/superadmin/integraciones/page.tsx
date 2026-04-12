"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Cable,
  Copy,
  Check,
  Edit3,
  Save,
  X,
  Plus,
  Trash2,
  Sparkles,
  Loader2,
  CheckCircle2,
  Clock,
  AlertCircle,
} from "lucide-react";

/**
 * /superadmin/integraciones
 *
 * Módulo "Integraciones y funciones" — 2 secciones:
 *
 *  1. "Sistema Actual" — un solo bloque de texto con TODO el panorama del
 *     proyecto (arquitectura, flujo, módulos, integraciones SUNAT/RENIEC/
 *     WhatsApp/email/Stripe/Capacitor, etc.) en una sola línea completa,
 *     con botones de Copiar y Editar.
 *
 *  2. "Integraciones nuevas o mejoras" — lista viva de nuevas funciones /
 *     integraciones / fixes con fecha, detalle y estado (hecho / falta /
 *     en-progreso). Se agrega 1 por 1 con un form inline.
 *
 * Persistencia vía /api/superadmin/integrations → PlatformSetting
 * (key-value, misma tabla usada por Settings). No requiere migración.
 */

// ── Tipos ─────────────────────────────────────────────────────────────────

type ItemType = "integracion" | "mejora" | "feature" | "fix";
type ItemStatus = "hecho" | "falta" | "en-progreso";

interface NewItem {
  id: string;
  title: string;
  date: string; // ISO yyyy-mm-dd
  type: ItemType;
  status: ItemStatus;
  details: string;
}

// ── Constantes de UI ──────────────────────────────────────────────────────

const TYPE_LABEL: Record<ItemType, string> = {
  integracion: "Integración",
  mejora: "Mejora",
  feature: "Feature",
  fix: "Fix",
};

const STATUS_META: Record<ItemStatus, { label: string; className: string; icon: React.ReactNode }> = {
  hecho: {
    label: "Hecho",
    className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    icon: <CheckCircle2 className="w-3.5 h-3.5" />,
  },
  "en-progreso": {
    label: "En progreso",
    className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    icon: <Clock className="w-3.5 h-3.5" />,
  },
  falta: {
    label: "Falta",
    className: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  },
};

function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function newId(): string {
  return `itg_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

// ── Página ────────────────────────────────────────────────────────────────

export default function IntegracionesPage() {
  const [overview, setOverview] = useState<string>("");
  const [overviewDraft, setOverviewDraft] = useState<string>("");
  const [editingOverview, setEditingOverview] = useState(false);
  const [copied, setCopied] = useState(false);

  const [items, setItems] = useState<NewItem[]>([]);
  const [savingOverview, setSavingOverview] = useState(false);
  const [savingItems, setSavingItems] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form inline para nuevo item
  const [addingNew, setAddingNew] = useState(false);
  const [draft, setDraft] = useState<NewItem>({
    id: "",
    title: "",
    date: todayISO(),
    type: "integracion",
    status: "falta",
    details: "",
  });

  // ── Load inicial ─────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/superadmin/integrations", {
          credentials: "include",
          cache: "no-store",
        });
        const data = (await res.json().catch(() => null)) as
          | { overview?: string; items?: NewItem[]; error?: string; message?: string }
          | null;
        if (!alive) return;

        if (!res.ok) {
          const detail = data?.message || data?.error || `HTTP ${res.status}`;
          setError(`No se pudo cargar desde el servidor: ${detail}. Mostrando plantilla.`);
          setOverview("");
          setOverviewDraft("");
          setItems([]);
          return;
        }

        setOverview(data?.overview ?? "");
        setOverviewDraft(data?.overview ?? "");
        setItems(Array.isArray(data?.items) ? data!.items! : []);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Error al cargar");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // ── Acciones overview ────────────────────────────────────────────────────
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(overview);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [overview]);

  const handleSaveOverview = useCallback(async () => {
    setSavingOverview(true);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/integrations?kind=overview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overview: overviewDraft }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOverview(overviewDraft);
      setEditingOverview(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSavingOverview(false);
    }
  }, [overviewDraft]);

  const handleCancelOverview = useCallback(() => {
    setOverviewDraft(overview);
    setEditingOverview(false);
  }, [overview]);

  // ── Acciones lista ───────────────────────────────────────────────────────
  const persistItems = useCallback(async (next: NewItem[]) => {
    setSavingItems(true);
    setError(null);
    try {
      const res = await fetch("/api/superadmin/integrations?kind=items", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar lista");
    } finally {
      setSavingItems(false);
    }
  }, []);

  const handleAddNew = useCallback(async () => {
    if (!draft.title.trim()) return;
    const item: NewItem = { ...draft, id: newId() };
    const next = [item, ...items];
    await persistItems(next);
    setDraft({
      id: "",
      title: "",
      date: todayISO(),
      type: "integracion",
      status: "falta",
      details: "",
    });
    setAddingNew(false);
  }, [draft, items, persistItems]);

  const handleToggleStatus = useCallback(
    async (id: string) => {
      const next = items.map((it) => {
        if (it.id !== id) return it;
        const cycle: Record<ItemStatus, ItemStatus> = {
          falta: "en-progreso",
          "en-progreso": "hecho",
          hecho: "falta",
        };
        return { ...it, status: cycle[it.status] };
      });
      await persistItems(next);
    },
    [items, persistItems],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const next = items.filter((it) => it.id !== id);
      await persistItems(next);
    },
    [items, persistItems],
  );

  // ── Métricas rápidas ─────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = items.length;
    const done = items.filter((i) => i.status === "hecho").length;
    const progress = items.filter((i) => i.status === "en-progreso").length;
    const pending = items.filter((i) => i.status === "falta").length;
    return { total, done, progress, pending };
  }, [items]);

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-teal-600/10 flex items-center justify-center">
          <Cable className="w-5 h-5 text-teal-600 dark:text-teal-400" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Integraciones y funciones
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Todo el sistema en una sola línea + bitácora de integraciones nuevas.
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-900/40 px-4 py-3 text-sm text-rose-700 dark:text-rose-300">
          {error}
        </div>
      )}

      {/* ── Sección 1: Sistema actual ─────────────────────────────────────── */}
      <section className="rounded-2xl bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              Sistema actual — vista completa en una línea
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Arquitectura, flujo, módulos e integraciones externas.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title="Copiar todo el texto"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-500" /> Copiado
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" /> Copiar
                </>
              )}
            </button>

            {!editingOverview ? (
              <button
                type="button"
                onClick={() => setEditingOverview(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" /> Editar
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleCancelOverview}
                  disabled={savingOverview}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  <X className="w-3.5 h-3.5" /> Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveOverview}
                  disabled={savingOverview || !overviewDraft.trim()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 transition-colors disabled:opacity-50"
                >
                  {savingOverview ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  Guardar
                </button>
              </>
            )}
          </div>
        </div>

        <div className="p-5">
          {editingOverview ? (
            <textarea
              value={overviewDraft}
              onChange={(e) => setOverviewDraft(e.target.value)}
              rows={16}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-4 text-sm text-gray-800 dark:text-gray-100 font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-teal-500"
              placeholder="Describe todo el sistema en una sola línea completa…"
            />
          ) : (
            <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap break-words">
              {overview}
            </p>
          )}
        </div>
      </section>

      {/* ── Sección 2: Nuevas integraciones / mejoras ─────────────────────── */}
      <section className="rounded-2xl bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <div>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                Integraciones nuevas o mejoras
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Bitácora: qué se integra o mejora, cuándo, con qué detalle y si ya está hecho.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setAddingNew((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 transition-colors"
          >
            {addingNew ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            {addingNew ? "Cerrar" : "Agregar"}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <StatPill label="Total" value={stats.total} tone="neutral" />
          <StatPill label="Hecho" value={stats.done} tone="emerald" />
          <StatPill label="En progreso" value={stats.progress} tone="amber" />
          <StatPill label="Falta" value={stats.pending} tone="rose" />
        </div>

        {/* Form inline */}
        {addingNew && (
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Título (ej: Integración pgvector para WhatsApp)"
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <input
                type="date"
                value={draft.date}
                onChange={(e) => setDraft({ ...draft, date: e.target.value })}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
              <select
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value as ItemType })}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {Object.entries(TYPE_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value as ItemStatus })}
                className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="falta">Falta</option>
                <option value="en-progreso">En progreso</option>
                <option value="hecho">Hecho</option>
              </select>
            </div>
            <textarea
              value={draft.details}
              onChange={(e) => setDraft({ ...draft, details: e.target.value })}
              rows={3}
              placeholder="Detalles: qué hace, por qué se integró, qué queda pendiente…"
              className="w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddingNew(false)}
                className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAddNew}
                disabled={savingItems || !draft.title.trim()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 disabled:opacity-50"
              >
                {savingItems ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Guardar item
              </button>
            </div>
          </div>
        )}

        {/* Lista */}
        <div className="divide-y divide-gray-100 dark:divide-gray-800">
          {items.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
              Sin items todavía. Agrega la primera integración o mejora.
            </div>
          ) : (
            items.map((item) => {
              const meta = STATUS_META[item.status];
              return (
                <div key={item.id} className="px-5 py-4 flex items-start gap-4">
                  <button
                    type="button"
                    onClick={() => handleToggleStatus(item.id)}
                    className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold shrink-0 ${meta.className}`}
                    title="Click para cambiar de estado"
                  >
                    {meta.icon}
                    {meta.label}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                        {item.title}
                      </h4>
                      <span className="text-[11px] font-medium text-teal-600 dark:text-teal-400 uppercase tracking-wide">
                        {TYPE_LABEL[item.type]}
                      </span>
                      <span className="text-[11px] text-gray-400">· {item.date}</span>
                    </div>
                    {item.details && (
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 whitespace-pre-wrap">
                        {item.details}
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDelete(item.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-colors shrink-0"
                    title="Eliminar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}

// ── Helper component ────────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "emerald" | "amber" | "rose";
}) {
  const tones: Record<typeof tone, string> = {
    neutral: "bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-800",
    emerald: "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900/40",
    amber: "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/40",
    rose: "bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-900/40",
  };
  return (
    <div className={`rounded-xl border px-4 py-3 ${tones[tone]}`}>
      <div className="text-[11px] font-medium uppercase tracking-wide opacity-80">{label}</div>
      <div className="text-xl font-bold mt-0.5">{value}</div>
    </div>
  );
}
