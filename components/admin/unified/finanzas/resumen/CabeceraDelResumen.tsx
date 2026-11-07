"use client";

/**
 * La cabecera del Resumen, en UNA fila: el mes · ⓘ · las secciones ·
 * Indicadores · «⋯» (la cabecera de vista del panel, `CabeceraVista`).
 *
 * Antes (medido 2026-10-11): el título solo en su fila con un «⋯», y en la
 * banda del hub un «Actualiza en 283s ⏸ ↻» suelto. El auto-refresco y
 * «Actualizar ahora» son opciones de este menú: sólo el Resumen se actualiza
 * solo, así que viven con él y no en la banda de todo Mi Plata.
 */

import type { ReactNode } from "react";
import { GitCompareArrows, Printer, RefreshCw, Timer, TrendingUp } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { CabeceraVista } from "@/components/admin/inventario/movimientos/CabeceraVista";
import { useMembrete } from "@/hooks/use-membrete";
import { irAlOrigen } from "@/components/admin/unified/finanzas/resultado/ir-al-origen";

interface Props {
  mes: string;
  /** La `BarraDeSecciones` del Resumen. */
  secciones?: ReactNode;
  /** El botón «Indicadores» de las cinco cifras. */
  indicadores?: ReactNode;
  autoActivo: boolean;
  alternarAuto: () => void;
  actualizar: () => void;
}

/** Sólo al imprimir: el logo y el nombre del negocio encabezan el resumen (ADR-514). */
function MembreteParaImprimir({ mes }: { mes: string }) {
  const m = useMembrete();
  const nombre = m?.nombre ?? m?.razonSocial;
  if (!nombre) return null;
  const logo = m?.logoPngUrl ?? m?.logoUrl;
  return (
    <div className="hidden items-center gap-3 border-b border-[var(--rule-strong)] pb-3 print:flex">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {logo && <img src={logo} alt="" className="h-14 max-w-40 object-contain" />}
      <div className="min-w-0 flex-1">
        <CardTitle>{nombre}</CardTitle>
        <p className="text-xs text-[var(--text-secondary)]">{[m?.ruc ? `RUC ${m.ruc}` : null, m?.direccion, m?.telefono].filter(Boolean).join(" · ")}</p>
      </div>
      <p className="text-right text-sm font-semibold text-[var(--text-primary)]">Resumen de {mes}</p>
    </div>
  );
}

export default function CabeceraDelResumen({ mes, secciones, indicadores, autoActivo, alternarAuto, actualizar }: Props) {
  return (
    <>
    <MembreteParaImprimir mes={mes} />
    <CabeceraVista
      titulo={mes}
      ayuda={{
        what: "Arriba, lo que entró, salió y quedó en el mes (hora de Lima) y lo que te deben y debes hoy. Abajo, una sección a la vez: elige cuál y se recuerda.",
        affects: "Entró, salió y quedó son los totales de Resultado › Ganancias, que trae cada renglón. Toca una cifra para ir a su detalle.",
        example: "Si vendiste S/ 1 000 y te costó S/ 850 entre mercadería y luz: entró S/ 1 000, salió S/ 850 y quedó S/ 150.",
      }}
      secciones={secciones}
      indicadores={indicadores}
      tituloMenu="Actualizar, imprimir, ganancias y comparar períodos"
      acciones={[
        { id: "actualizar", label: "Actualizar ahora", icon: RefreshCw, onSelect: actualizar },
        {
          id: "auto",
          label: "Actualizar solo cada 5 min",
          hint: autoActivo ? "Encendido: las ventas del día se suman sin recargar" : "Apagado",
          icon: Timer,
          activo: autoActivo,
          onSelect: alternarAuto,
        },
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
    </>
  );
}
