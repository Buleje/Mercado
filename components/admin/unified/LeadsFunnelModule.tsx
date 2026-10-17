"use client";

/**
 * Clientes › Interesados (antes «Funnel de Leads», `?vista=leads`).
 *
 * Un «lead» acá es un NEGOCIO que dejó su WhatsApp en el formulario de Buleje
 * (`/api/lead/capture`: anuncios, WhatsApp, recomendados) para probar el
 * sistema y todavía no paga. No son compradores de la bodega: `capture`
 * los guarda siempre en el tenant `main`, así que en cualquier otro negocio
 * esta vista sale vacía.
 *
 * Patrón del panel: cabecera en una fila (título · ⓘ · Indicadores ·
 * Actualizar), filtros en una fila pegada a la tabla, una acción por fila.
 * Las cifras son del servidor (`LeadsDB.getStats`); la lista, de
 * `LeadsDB.list`, un interesado por fila aunque haya cambiado de estado.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, RefreshCw } from "@buleje/design-system/icons";
import { LoadingState, SectionTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { FiltrosLeads } from "@/components/admin/leads/FiltrosLeads";
import { TablaLeads } from "@/components/admin/leads/TablaLeads";
import { estadoDe, type EstadoLead } from "@/components/admin/leads/tipos";
import { useIndicadoresLeads } from "@/components/admin/leads/use-indicadores-leads";
import { useLeads } from "@/components/admin/leads/use-leads";

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function LeadsFunnelModule() {
  const { stats, leads, cargando, actualizando, error, moviendo, cargar, cambiarEstado } = useLeads();
  const kpis = useIndicadoresLeads(stats, cargando);
  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<EstadoLead | "">("");
  const [canal, setCanal] = useState("");

  /* Cuentas de los chips sobre la lista ENTERA: filtrar no las mueve. */
  const { porEstado, porCanal } = useMemo(() => {
    const e: Partial<Record<EstadoLead, number>> = {};
    const c: Record<string, number> = {};
    for (const l of leads) {
      const k = estadoDe(l.status);
      e[k] = (e[k] ?? 0) + 1;
      c[l.source] = (c[l.source] ?? 0) + 1;
    }
    return { porEstado: e, porCanal: c };
  }, [leads]);

  const filas = useMemo(() => {
    const q = sinTildes(texto.trim());
    return leads.filter((l) => {
      if (estado && estadoDe(l.status) !== estado) return false;
      if (canal && l.source !== canal) return false;
      if (q && !sinTildes(`${l.name} ${l.businessName ?? ""} ${l.businessType} ${l.city}`).includes(q)) return false;
      return true;
    });
  }, [leads, texto, estado, canal]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Interesados</SectionTitle>
          <InfoTip
            title="Interesados (leads)"
            what="Negocios que dejaron su WhatsApp en el formulario de Buleje para probar el sistema y todavía no pagan. Llegan solos: por la página, los anuncios o un recomendado."
            affects="Cuando lo contactes, pásalo al paso que sigue: Nuevo → Contactado → Demo hecha → Registrado → Ganado. Si ya no le interesa, «⋯» → Perdido. Cada cambio queda en el historial."
            example="Rosa, bodega en Pucallpa, llegó por un anuncio de Facebook: la llamas y pasa a Contactado; le muestras el sistema y pasa a Demo hecha."
          />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          <button
            type="button"
            onClick={() => void cargar()}
            disabled={actualizando}
            aria-label="Actualizar"
            title="Actualizar"
            className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--text-primary)] disabled:opacity-60"
          >
            <RefreshCw className={cn("h-4 w-4", actualizando && "animate-spin")} aria-hidden />
          </button>
        </div>
      </div>

      {kpis.panel}

      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-xl border border-[var(--data-error-500)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--data-error-ink)]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={() => void cargar()} className="min-h-12 shrink-0 px-3 font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]">
            Reintentar
          </button>
        </p>
      )}

      {cargando ? (
        <LoadingState />
      ) : leads.length === 0 ? (
        !error && (
          <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-8 text-center text-sm text-[var(--text-secondary)]">
            Todavía no llega ningún interesado: aparecen cuando un negocio llena el formulario de Buleje.
          </p>
        )
      ) : (
        <div className="space-y-2">
          <FiltrosLeads
            texto={texto}
            onTexto={setTexto}
            estado={estado}
            onEstado={setEstado}
            porEstado={porEstado}
            canal={canal}
            onCanal={setCanal}
            porCanal={porCanal}
          />
          {filas.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-[var(--text-secondary)]">Nadie con esos filtros.</p>
          ) : (
            <TablaLeads filas={filas} moviendo={moviendo} onEstado={(id, e) => void cambiarEstado(id, e)} />
          )}
        </div>
      )}
    </div>
  );
}
