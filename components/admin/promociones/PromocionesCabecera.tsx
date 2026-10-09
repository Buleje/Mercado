"use client";

import { SectionTitle } from "@buleje/design-system";
import { Plus, Sparkles, Calendar, Send, MoreHorizontal } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { BotonIndicadores } from "@/components/admin/arqueo/KpisCuadre";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { Promociones } from "@/components/admin/promociones/hooks/use-promociones";

/**
 * Cabecera de Promociones en UNA fila (ley de la vista): título + ⓘ, el botón de indicadores,
 * la acción principal («Nueva promoción») y lo demás —IA, plantillas, campaña— en «Más acciones».
 */
export default function PromocionesCabecera({
  prm,
  kpisAbiertos,
  onAlternarKpis,
  kpisId,
}: {
  prm: Promociones;
  kpisAbiertos: boolean;
  onAlternarKpis: () => void;
  kpisId: string;
}) {
  const {
    setShowAiModal, setAiContext, setShowTemplates, openCreate, openCreateCampaign, requestAiSuggestions,
    promos,
  } = prm;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SectionTitle className="text-[var(--text-primary)]">Promociones y campañas</SectionTitle>
      <InfoTip
        title="Promociones y campañas"
        what="Una promoción es una oferta con su descuento, compra mínima y vencimiento que mandas por WhatsApp a tus clientes. Una campaña programa ese aviso para un grupo de clientes entre dos fechas."
        affects="Activar o pausar una promoción cambia lo que ve el cliente. Los usos y el ingreso de los indicadores son estimados: todavía no salen de tus ventas."
        example="«2x1 en arroz»: 15 % de descuento desde S/ 40, vence el jueves 30/10; la mandas a todos tus clientes con un clic."
      />
      <div className="ml-auto flex items-center gap-2">
        {promos.length > 0 && <BotonIndicadores abierto={kpisAbiertos} onAlternar={onAlternarKpis} controla={kpisId} />}
        <button
          type="button"
          onClick={openCreate}
          aria-label="Nueva promoción"
          className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-[var(--accent)] px-3 text-sm font-semibold text-white transition-all hover:brightness-105 sm:px-4"
        >
          <Plus className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Nueva promoción</span>
        </button>
        <ActionMenu
          label="Más acciones"
          soloIcono
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
      </div>
    </div>
  );
}
