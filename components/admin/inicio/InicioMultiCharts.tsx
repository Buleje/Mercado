"use client";

import { Fragment, memo, type ReactNode } from "react";
import type { DateRange } from "./DashboardDateRange";
import { DraggableSections, type DraggableItem } from "./DraggableSections";
import { bloquesDelResumen } from "./resumen/bloques-resumen";
import type { ResumenMulti } from "./resumen/use-resumen-multi";
import { useChartsVisibilityManager } from "@/lib/admin/charts-visibility";

/**
 * Los bloques del Resumen de Inicio: caja, lo más vendido, compras, inventario
 * y clientes (las cuentas viven en `resumen/calculos-resumen.ts`).
 *
 * Rediseño 2026-10-09 (Brandon: «ocultar gráficos que no tienen ninguna
 * información… mejora los gráficos y KPIs»):
 *  - un bloque sin dato se oculta (`hasData` con `lib/admin/inicio/hay-datos`)
 *    y queda en «Gráficos › Sin datos todavía»;
 *  - un ranking de 1-2 filas es una lista, no un gráfico de una barra;
 *  - un solo eje por gráfico y el mismo color por concepto en todas las
 *    pestañas (`COLOR_CONCEPTO`); nada de compuestos de 3 series y 2 ejes;
 *  - KPIs sin dato salen «—» con ⓘ, no «S/ 0» de relleno;
 *  - caja (la serie por día) a todo el ancho; el resto, de a dos por fila.
 */

const RANGO: Record<string, string> = {
  diario: "hoy",
  semanal: "esta semana",
  mensual: "este mes",
  anual: "este año",
  especifica: "ese día",
  personalizado: "el período",
};

export const InicioMultiCharts = memo(function InicioMultiCharts({
  dateRange,
  resumen,
}: {
  dateRange?: DateRange;
  resumen: ResumenMulti;
}) {
  const { charts } = useChartsVisibilityManager();
  const apagados = new Set(charts.filter((c) => !c.visible).map((c) => c.id));
  const rango = RANGO[dateRange?.preset ?? "semanal"] ?? "el período";
  // Cada bloque con su «¿tiene datos?». Los que no tienen se montan aparte y
  // ocultos: así siguen anotados en «Gráficos › Sin datos todavía» sin dejar
  // un hueco (el CSS del panel oculta la fila entera si adentro hay un oculto).
  const bloques = bloquesDelResumen(resumen, rango);
  type Id = keyof typeof bloques;
  // Un bloque que el dueño apagó en «Gráficos» tampoco va en la fila: si no,
  // su marcador oculto escondería también al vecino.
  const enFila = (id: Id) => bloques[id].conDatos && !apagados.has(`resumen.${id}`);
  const fila = (ids: Id[]) =>
    function filaDeBloques(): ReactNode {
      const con = ids.filter(enFila);
      if (con.length === 0) return null;
      if (con.length === 1) return bloques[con[0]].nodo;
      return (
        <ParDeBloques>
          {con.map((id) => (
            <Fragment key={id}>{bloques[id].nodo}</Fragment>
          ))}
        </ParDeBloques>
      );
    };

  // Una fila por tema: caja (la serie por día) sola; el resto, de a dos, que
  // se reparten el ancho. Una lista corta ya no se estira al alto del vecino.
  const sections: DraggableItem[] = [
    { id: "caja", title: "Plata que entró y salió", render: fila(["caja"]) },
    {
      id: "vendido-y-comprado",
      title: "Lo que más vendiste y compras por proveedor",
      render: fila(["productos", "compras"]),
    },
    {
      id: "stock-y-clientes",
      title: "Inventario y clientes",
      render: fila(["inventario", "clientes"]),
    },
  ];
  const sinDatos = (Object.keys(bloques) as Id[]).filter((id) => !enFila(id));

  return (
    <>
      <DraggableSections
        items={sections}
        storageKey="inicio-resumen-orden"
        layout="column"
        gap={1}
        // En celular, los 2 primeros a la vista y el resto tras «Ver más gráficos».
        mobileCollapseAfter={2}
      />
      {/* Ocultos por falta de datos (o a la vista si el dueño eligió «mostrar igual»). */}
      {sinDatos.length > 0 && (
        <div className="space-y-4 empty:hidden">
          {sinDatos.map((id) => (
            <Fragment key={id}>{bloques[id].nodo}</Fragment>
          ))}
        </div>
      )}
    </>
  );
});

/** Dos bloques lado a lado desde ~48rem; con uno solo visible, ocupa la fila. */
function ParDeBloques({ children }: { children: ReactNode }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))] gap-4">
      {children}
    </div>
  );
}
