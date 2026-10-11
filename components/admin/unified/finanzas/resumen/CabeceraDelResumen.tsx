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
import { CabeceraVista } from "@/components/admin/inventario/movimientos/CabeceraVista";
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

export default function CabeceraDelResumen({ mes, secciones, indicadores, autoActivo, alternarAuto, actualizar }: Props) {
  return (
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
  );
}
