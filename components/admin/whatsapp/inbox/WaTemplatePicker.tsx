"use client";

import { useEffect, useState } from "react";
import { FileText, X, Loader2, Send, AlertCircle } from "@buleje/design-system/icons";
import { tenantFetch } from "@/lib/tenant-fetch";
import { cn } from "@/lib/utils";

export interface WaTemplateView {
  name: string;
  language: string;
  category: string;
  body: string;
  paramCount: number;
}

interface Props {
  /** Número del negocio del hilo (multi-número); null = primer activo. */
  phoneNumberId: string | null;
  sending: boolean;
  onSend: (tpl: { name: string; language: string; params: string[] }) => Promise<boolean>;
  onClose: () => void;
}

/**
 * WaTemplatePicker — plantillas aprobadas de Meta para responder fuera de la
 * ventana de 24h (texto libre = error 131047). Lista + variables {{n}} simples.
 */
export default function WaTemplatePicker({ phoneNumberId, sending, onSend, onClose }: Props) {
  const [templates, setTemplates] = useState<WaTemplateView[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsWabaId, setNeedsWabaId] = useState(false);
  const [selected, setSelected] = useState<WaTemplateView | null>(null);
  const [params, setParams] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const qs = phoneNumberId ? `?phoneNumberId=${encodeURIComponent(phoneNumberId)}` : "";
        const res = await tenantFetch(`/api/admin/whatsapp/templates${qs}`);
        const json = (await res.json().catch(() => ({}))) as {
          templates?: WaTemplateView[];
          needsWabaId?: boolean;
        };
        if (!cancelled) {
          setTemplates(json.templates ?? []);
          setNeedsWabaId(Boolean(json.needsWabaId));
        }
      } catch {
        /* lista vacía: el estado de abajo lo explica */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phoneNumberId]);

  const pick = (t: WaTemplateView) => {
    setSelected(t);
    setParams(Array.from({ length: t.paramCount }, () => ""));
  };

  const canSend = selected && params.every((p) => p.trim().length > 0);

  return (
    <div className="border-t border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between px-4 pt-3">
        <p className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
          <FileText className="h-4 w-4 text-primary" />
          Plantillas aprobadas
        </p>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="Cerrar plantillas"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="max-h-64 overflow-y-auto p-3">
        {loading && <p className="p-2 text-sm text-slate-500">Cargando plantillas…</p>}

        {!loading && needsWabaId && (
          <p className="flex items-start gap-2 rounded-xl bg-[var(--data-warning-50)] p-3 text-sm text-slate-700 dark:bg-[var(--data-warning-500)]/10 dark:text-slate-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-700)]" />
            Este número no tiene <strong>WABA ID</strong>. Agrégalo en Mensajes → Bot
            WhatsApp → Editar número, y las plantillas aparecen acá.
          </p>
        )}

        {!loading && !needsWabaId && templates.length === 0 && (
          <p className="p-2 text-sm text-slate-500">
            No hay plantillas aprobadas en tu cuenta de Meta. Créalas en el WhatsApp
            Manager de Meta Business.
          </p>
        )}

        {!selected && (
          <ul className="space-y-2">
            {templates.map((t) => (
              <li key={`${t.name}:${t.language}`}>
                <button
                  type="button"
                  onClick={() => pick(t)}
                  className="w-full rounded-xl border-2 border-slate-200 p-3 text-left transition hover:border-primary/60 dark:border-slate-700"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-slate-900 dark:text-white">{t.name}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase text-slate-500 dark:bg-slate-800">
                      {t.language}
                    </span>
                  </span>
                  <span className="mt-1 line-clamp-2 block text-sm text-slate-500 dark:text-slate-400">
                    {t.body}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {selected && (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-[length:var(--ts-xs)] font-bold text-primary"
            >
              ← Elegir otra plantilla
            </button>
            <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {selected.body}
            </p>
            {params.map((p, i) => (
              <input
                key={i}
                value={p}
                onChange={(e) =>
                  setParams((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                }
                placeholder={`Variable {{${i + 1}}}`}
                className="h-12 w-full rounded-2xl border-2 border-slate-200 bg-white px-4 text-base text-slate-900 outline-none transition focus:border-primary dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            ))}
            <button
              type="button"
              disabled={!canSend || sending}
              onClick={async () => {
                if (!selected) return;
                const ok = await onSend({
                  name: selected.name,
                  language: selected.language,
                  params: params.map((p) => p.trim()),
                });
                if (ok) onClose();
              }}
              className={cn(
                "inline-flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-base font-bold text-white transition hover:opacity-90",
                (!canSend || sending) && "cursor-not-allowed opacity-40",
              )}
            >
              {sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
              Enviar plantilla
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
