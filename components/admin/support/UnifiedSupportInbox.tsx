"use client";

/**
 * components/admin/support/UnifiedSupportInbox.tsx — Mensajes › Soporte.
 *
 * Lo que espera respuesta, de dos fuentes (`GET /api/admin/support/inbox`):
 *  - WhatsApp: ActivityLog con entity = "whatsapp.inbound"
 *  - Reseñas pendientes de moderación (Review status = "pending")
 *
 * Cada fila lleva a donde se atiende: la reseña a Marketplace › Reseñas (ahí se
 * aprueba o se rechaza) y el WhatsApp a la bandeja de WhatsApp.
 *
 * Antes (medido 11-10): el botón «Resolver» llamaba a
 * `PATCH /api/admin/support/inbox/<id>/resolve`, una ruta que no existe (404):
 * la fila seguía «Pendiente» después del clic. Y el filtro por fuente pedía
 * `?source=`, que la ruta no lee (filtraba igual el cliente, con un pedido de más).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { DataTable, SectionTitle } from "@buleje/design-system";
import { AlertCircle, Loader2, RefreshCw } from "@buleje/design-system/icons";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import type { SupportInboxItem } from "@/app/api/admin/support/inbox/route";

type SourceFilter = "all" | "whatsapp" | "review";

const FUENTE: Record<SupportInboxItem["source"], { rotulo: string; donde: string; href: string }> = {
  whatsapp: { rotulo: "WhatsApp", donde: "Responder", href: "/admin?tab=whatsapp-inbox&vista=whatsapp" },
  review: { rotulo: "Reseña", donde: "Moderar", href: "/admin?tab=marketplace&vista=resenas" },
};

const CHIP = "inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors";
const CHIP_ON = "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]";
const CHIP_OFF = "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]";

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  return `hace ${Math.floor(hrs / 24)} d`;
}

export function UnifiedSupportInbox() {
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [items, setItems] = useState<SupportInboxItem[] | null>(null);
  const [error, setError] = useState(false);
  const [cargando, setCargando] = useState(false);

  const loadInbox = useCallback(async () => {
    setCargando(true);
    try {
      const res = await fetch("/api/admin/support/inbox", { cache: "no-store" });
      if (!res.ok) throw new Error("fetch_failed");
      const json = (await res.json()) as { items?: SupportInboxItem[] };
      setItems(Array.isArray(json.items) ? json.items : []);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void loadInbox();
    const id = setInterval(() => void loadInbox(), 30_000);
    return () => clearInterval(id);
  }, [loadInbox]);

  const cuentas = useMemo(() => {
    const pend = (items ?? []).filter((i) => i.status === "pending");
    return { all: pend.length, whatsapp: pend.filter((i) => i.source === "whatsapp").length, review: pend.filter((i) => i.source === "review").length };
  }, [items]);
  const filas = (items ?? []).filter((i) => sourceFilter === "all" || i.source === sourceFilter);

  return (
    <div className="space-y-3">
      {/* Una fila: título · ⓘ · fuente (con lo pendiente de cada una) · actualizar. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Soporte</SectionTitle>
          <InfoTip
            title="Soporte"
            what="Lo que espera respuesta: mensajes de WhatsApp que el bot no resolvió y reseñas por moderar."
            affects="Cada fila te lleva a donde se atiende: la reseña a Marketplace › Reseñas, el mensaje a la bandeja de WhatsApp."
          />
        </div>
        <div role="group" aria-label="Fuente" className="flex min-w-0 max-w-full gap-1.5 overflow-x-auto scrollbar-none">
          {(["all", "whatsapp", "review"] as const).map((f) => (
            <button key={f} type="button" aria-pressed={sourceFilter === f} onClick={() => setSourceFilter(f)} className={cn(CHIP, sourceFilter === f ? CHIP_ON : CHIP_OFF)}>
              {f === "all" ? "Todo" : FUENTE[f].rotulo}
              {items && <span className="tabular-nums text-[var(--text-secondary)]">{cuentas[f]}</span>}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void loadInbox()} aria-label="Actualizar la bandeja" title="Actualizar" className={button({ variant: "secondary", className: "ml-auto w-12 rounded-xl px-0" })}>
          <RefreshCw className={cn("h-4 w-4", cargando && "animate-spin")} aria-hidden />
        </button>
      </div>

      {error && !items ? (
        <p className="flex items-center gap-2 text-sm text-[var(--data-error-ink)]">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden />
          No se pudo traer la bandeja.
          <button type="button" onClick={() => void loadInbox()} className="font-semibold underline underline-offset-2">Reintentar</button>
        </p>
      ) : !items ? (
        <p className="flex items-center gap-2 py-8 text-sm text-[var(--text-secondary)]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />Cargando la bandeja…</p>
      ) : filas.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--text-secondary)]">Nada espera respuesta.</p>
      ) : (
        <DataTable className="table-fixed [&_thead_th]:text-sm [&_thead_th]:normal-case [&_thead_th]:tracking-normal">
          <colgroup className="max-sm:hidden">
            <col className="w-28" />
            <col className="w-48" />
            <col />
            <col className="w-32" />
            <col className="w-32" />
          </colgroup>
          <thead>
            <tr>
              <th>Fuente</th>
              <th>Cliente</th>
              <th>Mensaje</th>
              <th>Recibido</th>
              <th aria-label="Dónde se atiende" />
            </tr>
          </thead>
          <tbody>
            {filas.map((item) => (
              <tr key={item.id}>
                <td className="text-sm font-semibold text-[var(--text-primary)]">{FUENTE[item.source]?.rotulo ?? item.source}</td>
                <td className="text-sm text-[var(--text-primary)]"><span className="block min-w-0 truncate">{item.customer}</span></td>
                <td className="text-sm text-[var(--text-secondary)]">
                  <span className="block min-w-0 truncate" title={item.message}>{item.message || "Sin mensaje"}</span>
                </td>
                <td className="whitespace-nowrap text-sm text-[var(--text-secondary)]">{formatRelative(item.receivedAt)}</td>
                <td className="text-right">
                  {item.status === "pending" ? (
                    <EnlacePanel href={FUENTE[item.source]?.href} apariencia="heredada" className={button({ variant: "secondary", className: "rounded-xl px-4" })}>{FUENTE[item.source]?.donde ?? "Abrir"}</EnlacePanel>
                  ) : (
                    <span className="text-sm text-[var(--data-success-ink)]">Resuelto</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
