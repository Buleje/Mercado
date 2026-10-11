"use client";

/**
 * Crecimiento › Campañas: mensajes que salen SOLOS por el WhatsApp del negocio
 * (o la app) a un grupo de clientes, ahora o a una hora. Patrón del panel
 * (11-10): título · Indicadores · Nueva campaña · Más en una fila; «Para quién»
 * (lo que era la pestaña Segmentos) en una fila de 48 px; la lista en una
 * tabla con el «⋯» por fila.
 *
 * No es Clientes › Mensajes masivos: ahí los abres tú uno por uno en tu
 * WhatsApp (wa.me); acá los manda el servidor a la hora y cuenta cómo le fue.
 * Por eso conviven, y el «Más» lleva de una a la otra.
 */
import { useState } from "react";
import { SectionTitle } from "@buleje/design-system";
import { AlertTriangle, Megaphone, MessageCircle, MoreHorizontal, Plus, RefreshCw } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import { formatNumber } from "@/lib/format";
import { AudienciasCampana } from "@/components/admin/crecimiento/campanas/AudienciasCampana";
import { ModalNuevaCampana } from "@/components/admin/crecimiento/campanas/ModalNuevaCampana";
import { TablaCampanas } from "@/components/admin/crecimiento/campanas/TablaCampanas";
import { useCampanas } from "@/components/admin/crecimiento/campanas/use-campanas";
import type { Segment } from "@/components/admin/crecimiento/campanas/tipos";

function Cifra({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <p className="text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</p>
      <p className="mt-1 text-lg font-extrabold tabular-nums text-[var(--text-primary)]">{valor}</p>
    </div>
  );
}

export default function MarketingAutomationTab() {
  const c = useCampanas();
  // Tocar un grupo de «Para quién» abre el alta ya apuntada a ese grupo.
  const [modal, setModal] = useState<{ abierto: boolean; segmento: Segment }>({ abierto: false, segmento: "todos" });
  const abrir = (segmento: Segment = "todos") => setModal({ abierto: true, segmento });

  const programadas = c.campaigns.filter((x) => x.status === "programada").length;
  const enviadas = c.campaigns.filter((x) => x.status === "completada").length;
  const alcance = c.campaigns.reduce((s, x) => s + (x.delivered || 0), 0);

  const kpis = useKpisPlegables({
    claveMemoria: "crecimiento-campanas",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: c.loading && c.campaigns.length === 0,
    resumen: `${programadas} programada${programadas === 1 ? "" : "s"}`,
    tarjetas: [
      <Cifra key="t" rotulo="Campañas" valor={String(c.campaigns.length)} />,
      <Cifra key="p" rotulo="Programadas" valor={String(programadas)} />,
      <Cifra key="e" rotulo="Enviadas" valor={String(enviadas)} />,
      <Cifra key="a" rotulo="Clientes alcanzados" valor={formatNumber(alcance)} />,
    ],
  });

  const acciones: MenuAccion[] = [
    {
      id: "masivos",
      label: "Escribir uno por uno",
      hint: "Clientes › Mensajes masivos: los abres tú en tu WhatsApp, con los grupos de Mis clientes",
      icon: MessageCircle,
      onSelect: () => { irAEnlace(hrefDeDestino({ tab: "clientes", params: { vista: "mensajes" } })); },
    },
    { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: c.recargar },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Campañas</SectionTitle>
          <InfoTip
            title="Campañas"
            what="Un mensaje que sale solo por el WhatsApp del negocio (o la app) a un grupo de clientes, ahora o a la hora que elijas."
            affects="Sólo llega a quienes aceptaron promociones (Ley 29733). Para escribir tú, uno por uno, desde tu WhatsApp: Más › Escribir uno por uno."
            example="«Hola {{nombre}}, hoy 20% en arroz» a los Inactivos, programada para el sábado 9:00."
          />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          <button type="button" onClick={() => abrir()} aria-haspopup="dialog" className={button({ variant: "primary", className: "shrink-0 gap-1.5 rounded-xl px-4 max-sm:w-12 max-sm:px-0" })}>
            <Plus className="h-4 w-4" aria-hidden />
            <span className="max-sm:sr-only">Nueva campaña</span>
          </button>
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Escribir uno por uno y actualizar" />
        </div>
      </div>

      {kpis.panel}

      <AudienciasCampana conteos={c.conteos} onElegir={abrir} />

      <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        {c.loading && c.campaigns.length === 0 ? (
          <p className="p-6 text-center text-sm text-[var(--text-tertiary)]">Cargando campañas…</p>
        ) : c.error && c.campaigns.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <AlertTriangle className="h-6 w-6 text-[var(--data-error-500)]" aria-hidden />
            <p className="text-sm text-[var(--data-error-ink)]">No se pudieron cargar las campañas.</p>
            <button type="button" onClick={c.recargar} className={button({ variant: "ghost", className: "rounded-xl text-sm" })}>Reintentar</button>
          </div>
        ) : c.campaigns.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-6 text-center">
            <Megaphone className="h-6 w-6 text-[var(--text-tertiary)]" aria-hidden />
            <p className="text-sm text-[var(--text-secondary)]">Aún no tienes campañas</p>
          </div>
        ) : (
          <TablaCampanas
            campaigns={c.campaigns}
            busyId={c.busyId}
            onCancelar={(id) => { void c.cambiarEstado(id, "cancelada"); }}
            onEliminar={(id) => { void c.eliminar(id); }}
          />
        )}
      </div>

      <ModalNuevaCampana
        abierto={modal.abierto}
        segmentoInicial={modal.segmento}
        conteos={c.conteos}
        onCerrar={() => setModal((m) => ({ ...m, abierto: false }))}
        onCrear={c.crear}
      />
    </div>
  );
}
