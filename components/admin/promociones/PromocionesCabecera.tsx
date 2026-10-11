"use client";

import type { ReactNode } from "react";
import { Plus, Sparkles, Calendar, Send, MoreHorizontal } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { BotonIndicadores } from "@/components/admin/arqueo/KpisCuadre";
import OfertasEncabezado from "@/components/admin/promociones/OfertasEncabezado";
import type { Promociones } from "@/components/admin/promociones/hooks/use-promociones";

/**
 * Cabecera de Promociones en UNA fila (ley de la vista): título + ⓘ, el botón de indicadores,
 * la acción principal («Nueva oferta») y lo demás —IA, plantillas, campaña— en «Más acciones».
 */
export default function PromocionesCabecera({
  prm,
  kpisAbiertos,
  onAlternarKpis,
  kpisId,
  barra,
}: {
  prm: Promociones;
  kpisAbiertos: boolean;
  onAlternarKpis: () => void;
  kpisId: string;
  /** Las secciones de la vista (Ofertas · Cupones), que van en la misma fila. */
  barra?: ReactNode;
}) {
  const {
    setShowAiModal, setAiContext, setShowTemplates, openCreate, openCreateCampaign, requestAiSuggestions,
    promos,
  } = prm;
  return (
    <OfertasEncabezado
      barra={barra}
      ayuda={{
        title: "Ofertas",
        what: "Una oferta tiene su descuento, compra mínima y vencimiento, y la mandas por WhatsApp a tus clientes. Una campaña programa ese aviso para un grupo de clientes entre dos fechas.",
        affects: "Activar o pausar una oferta cambia lo que ve el cliente. Los usos y el ingreso de los indicadores son estimados: todavía no salen de tus ventas.",
        example: "«2x1 en arroz»: 15 % de descuento desde S/ 40, vence el jueves 30/10; la mandas a todos tus clientes con un clic.",
      }}
    >
        {promos.length > 0 && <BotonIndicadores abierto={kpisAbiertos} onAlternar={onAlternarKpis} controla={kpisId} />}
        <button
          type="button"
          onClick={openCreate}
          aria-label="Nueva oferta"
          className="inline-flex h-12 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 text-sm font-semibold text-white transition-all hover:brightness-105 sm:px-4"
        >
          <Plus className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Nueva oferta</span>
        </button>
        <ActionMenu
          label="Más"
          soloIcono
          size="md"
          className="w-12 shrink-0"
          icon={MoreHorizontal}
          actions={[
            {
              id: "ia",
              label: "Sugerencias de la IA",
              hint: "Ideas de promos para tu negocio",
              icon: Sparkles,
              onSelect: () => { setAiContext(""); setShowAiModal(true); requestAiSuggestions(); },
            },
            { id: "plantillas", label: "Plantillas de temporada", hint: "Navidad, Fiestas Patrias, Día de la Madre…", icon: Calendar, onSelect: () => setShowTemplates(true) },
            { id: "campana", label: "Nueva campaña", hint: "Programa un aviso para un grupo de clientes", icon: Send, onSelect: openCreateCampaign },
          ]}
        />
    </OfertasEncabezado>
  );
}
