"use client";

/**
 * La cabecera del Resumen, en UNA fila: el mes · ⓘ · «Más».
 *
 * Antes (medido 2026-10-11): un selector «Hoy / 7 dias / 30 dias / Este mes»
 * que no cambiaba ninguna cifra (el período no llegaba a los datos), «Actualizado
 * hace N min» con su botón al lado del «Actualiza en …» de la banda del hub, un
 * «Exportar» que imprimía la página, y una fila de avisos que repetía tarjetas
 * de abajo. Ahora todo es del mes —lo dice el título— y lo de uso ocasional va
 * al menú.
 */

import { SectionTitle } from "@buleje/design-system";
import { GitCompareArrows, MoreHorizontal, Printer, TrendingUp } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { irAlOrigen } from "@/components/admin/unified/finanzas/resultado/ir-al-origen";

export default function CabeceraDelResumen({ mes }: { mes: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">{mes}</SectionTitle>
      <InfoTip
        title="Resumen del mes"
        what="Arriba, lo que entró, salió y quedó en el mes (hora de Lima) y lo que te deben y debes hoy. Abajo, cada bloque se abre con un clic y recuerda cómo lo dejaste."
        affects="Entró, salió y quedó son los totales de Resultado › Ganancias, que trae cada renglón. Toca una cifra para ir a su detalle."
        example="Si vendiste S/ 1 000 y te costó S/ 850 entre mercadería y luz: entró S/ 1 000, salió S/ 850 y quedó S/ 150."
      />
      <div className="ml-auto">
        <ActionMenu
          label="Más"
          icon={MoreHorizontal}
          soloIcono
          size="md"
          className="w-12 shrink-0"
          title="Imprimir, ganancias y comparar períodos"
          actions={[
            { id: "imprimir", label: "Imprimir el resumen", icon: Printer, onSelect: () => window.print() },
            {
              id: "ganancias",
              label: "Ganancias del mes, renglón por renglón",
              icon: TrendingUp,
              onSelect: () => irAlOrigen({ tab: "plata", params: { vista: "pl" } }),
            },
            {
              id: "comparar",
              label: "Comparar períodos",
              icon: GitCompareArrows,
              onSelect: () => irAlOrigen({ tab: "plata", params: { vista: "comparador" } }),
            },
          ]}
        />
      </div>
    </div>
  );
}
