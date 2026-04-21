"use client";

import { CardTitle, SectionTitle } from "@buleje/design-system";
/**
 * components/admin/ai-center/HITLApprovalsBanner.tsx
 *
 * UI frontend para el Human-in-the-Loop approval flow (Excel Agentes IA
 * práctica #10, TD-025). Complementa el backend en:
 *   - lib/agents/pending-approvals.ts     (store in-memory)
 *   - lib/agents/tool-definitions.ts      (flag requiresApproval)
 *   - app/api/ai-assistant/route.ts       (intercepción)
 *   - app/api/ai-assistant/approvals/*    (endpoint GET + POST)
 *
 * Flujo:
 *   1. Polling cada 5s a GET /api/ai-assistant/approvals
 *   2. Si hay aprobaciones pendientes, muestra un banner persistente
 *   3. Click en el banner abre modal con detalles del tool + botones
 *      [Aprobar] / [Rechazar]
 *   4. Al resolver, POST /api/ai-assistant/approvals con el id y action
 *   5. Re-fetch la lista para actualizar
 *
 * Uso: importar y montar dentro de AICommandCenter.tsx. El componente es
 * autónomo — gestiona su propio polling, estado y modales.
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import { AlertTriangle, CheckCircle2, XCircle, Loader2, Clock } from "@buleje/design-system/icons";

interface PendingApproval {
  id: string;
  toolName: string;
  domain: string;
  action: string;
  payload: Record<string, unknown>;
  conversationId?: string;
  requestedBy: string;
  createdAt: number;
  ageSeconds: number;
}

interface ApprovalsResponse {
  pending: PendingApproval[];
  count: number;
}

const POLL_INTERVAL_MS = 5000;

export default function HITLApprovalsBanner() {
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [selected, setSelected] = useState<PendingApproval | null>(null);
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Fetch pendientes ───────────────────────────────────────────────────────
  const fetchApprovals = useCallback(async () => {
    try {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const res = await fetch("/api/ai-assistant/approvals", {
        signal: controller.signal,
        credentials: "include",
      });
      if (!res.ok) {
        // 401 is expected if not authenticated — silent fail
        if (res.status !== 401) setError(`HTTP ${res.status}`);
        return;
      }
      const data = (await res.json()) as ApprovalsResponse;
      setApprovals(data.pending ?? []);
      setError(null);
    } catch (e: unknown) {
      if ((e as Error).name === "AbortError") return;
      setError((e as Error).message);
    }
  }, []);

  // ── Polling loop ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetchApprovals();
    const interval = setInterval(fetchApprovals, POLL_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [fetchApprovals]);

  // ── Auto-hide toast ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // ── Resolve (approve / reject) ────────────────────────────────────────────
  const resolve = useCallback(
    async (id: string, action: "approve" | "reject") => {
      setResolving(true);
      try {
        const res = await fetch("/api/ai-assistant/approvals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ id, action }),
        });
        const data = await res.json();
        if (!res.ok) {
          setToast({ type: "error", msg: data.error ?? `HTTP ${res.status}` });
          return;
        }
        setToast({
          type: "success",
          msg:
            action === "approve"
              ? "Acción ejecutada correctamente"
              : "Acción rechazada",
        });
        setSelected(null);
        // Refrescar lista
        await fetchApprovals();
      } catch (e: unknown) {
        setToast({ type: "error", msg: (e as Error).message });
      } finally {
        setResolving(false);
      }
    },
    [fetchApprovals],
  );

  // ── No hay pendientes: no render (no ensuciar UI) ─────────────────────────
  if (approvals.length === 0 && !toast) return null;

  return (
    <>
      {/* Banner cuando hay pendientes */}
      {approvals.length > 0 && (
        <div className="bg-[var(--surface-sunken)] border border-[var(--data-warning)]/40 rounded-xl p-4 mb-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-[var(--data-warning)] shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <CardTitle className="text-sm font-bold text-[var(--data-warning)] dark:text-[var(--data-warning)]">
                {approvals.length === 1
                  ? "1 acción del agente esperando aprobación"
                  : `${approvals.length} acciones del agente esperando aprobación`}
              </CardTitle>
              <span className="text-[length:var(--ts-2xs)] px-2 py-0.5 rounded-full bg-[var(--data-warning)]/60 dark:bg-[var(--data-warning)]/40 text-[var(--data-warning)] dark:text-[var(--data-warning)] font-semibold">
                HITL
              </span>
            </div>
            <p className="text-xs text-[var(--data-warning)] dark:text-[var(--data-warning)] mb-3">
              El agente IA solicitó ejecutar una acción marcada como crítica. Revísala antes de aprobar.
            </p>
            <div className="space-y-2">
              {approvals.slice(0, 3).map((a) => (
                <button
                  key={a.id}
                  onClick={() => setSelected(a)}
                  className="w-full text-left bg-[var(--surface-raised)] border border-[var(--data-warning)] dark:border-[var(--data-warning)]/40 rounded-lg px-3 py-2 hover:border-[var(--data-warning)] transition-colors flex items-center gap-2"
                >
                  <Clock className="w-3.5 h-3.5 text-[var(--text-tertiary)] shrink-0" />
                  <span className="text-xs font-mono text-[var(--text-secondary)] truncate flex-1">
                    {a.toolName}
                  </span>
                  <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                    hace {formatAge(a.ageSeconds)}
                  </span>
                </button>
              ))}
              {approvals.length > 3 && (
                <p className="text-[length:var(--ts-2xs)] text-[var(--data-warning)] dark:text-[var(--data-warning)] pl-2">
                  +{approvals.length - 3} más pendientes
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de detalle + aprobación */}
      {selected && (
        <div
          className="modal-backdrop flex items-center justify-center p-4"
          onClick={(e) => e.target === e.currentTarget && !resolving && setSelected(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-[var(--surface-canvas)] border border-[var(--rule-base)] rounded-xl max-w-lg w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[var(--data-warning-100)] dark:bg-[var(--data-warning)]/40 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-[var(--data-warning)] dark:text-[var(--data-warning)]" />
              </div>
              <div className="flex-1">
                <SectionTitle className="text-lg font-bold text-[var(--text-primary)]">
                  Aprobar acción del agente
                </SectionTitle>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                  Solicitada por <strong>{selected.requestedBy}</strong> · hace {formatAge(selected.ageSeconds)}
                </p>
              </div>
            </div>

            <div className="space-y-3 mb-5">
              <DetailRow label="Tool" value={<code className="text-xs font-mono">{selected.toolName}</code>} />
              <DetailRow label="Dominio" value={selected.domain} />
              <DetailRow label="Acción" value={<code className="text-xs font-mono">{selected.action}</code>} />
              {selected.conversationId && (
                <DetailRow
                  label="Conversación"
                  value={<code className="text-[length:var(--ts-2xs)] font-mono opacity-60">{selected.conversationId.slice(0, 8)}…</code>}
                />
              )}
              <div>
                <div className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)] tracking-wide mb-1">
                  Parámetros
                </div>
                <pre className="text-[length:var(--ts-xs)] bg-[var(--surface-canvas)] border border-[var(--rule-base)] rounded-lg p-3 overflow-x-auto text-[var(--text-secondary)] whitespace-pre-wrap">
                  {JSON.stringify(selected.payload, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => resolve(selected.id, "reject")}
                disabled={resolving}
                className="flex-1 px-4 py-2 rounded-lg border border-[var(--rule-base)] text-sm font-semibold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <XCircle className="w-4 h-4" />
                Rechazar
              </button>
              <button
                onClick={() => resolve(selected.id, "approve")}
                disabled={resolving}
                className="flex-1 px-4 py-2 rounded-lg bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)] text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {resolving ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-4 h-4" />
                )}
                Aprobar y ejecutar
              </button>
            </div>

            {error && (
              <p className="text-xs text-[var(--data-error)] mt-3 text-center">{error}</p>
            )}
          </div>
        </div>
      )}

      {/* Toast de confirmación */}
      {toast && (
        <div
          role="status"
          className={[
            "fixed bottom-6 right-6 z-50 px-4 py-3 rounded-xl flex items-center gap-2 text-sm font-semibold",
            toast.type === "success"
              ? "bg-[var(--accent-soft)] text-white"
              : "bg-red-600 text-white",
          ].join(" ")}
        >
          {toast.type === "success" ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <XCircle className="w-4 h-4" />
          )}
          {toast.msg}
        </div>
      )}
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[length:var(--ts-2xs)] uppercase font-bold text-[var(--text-tertiary)] tracking-wide w-20 shrink-0">
        {label}
      </span>
      <span className="text-xs text-[var(--text-primary)] truncate">{value}</span>
    </div>
  );
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}min`;
  return `${Math.floor(seconds / 3600)}h`;
}
