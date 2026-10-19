"use client";

/**
 * Mi Plata › Deudas › Lo que debo (`?vista=por-pagar`). Desde el 18-10 junta lo
 * que era Compras › Por pagar: pagas en un solo lugar. Cinco secciones en
 * `?sub=`, en UNA barra dentro de la fila del título de cada una (sin tercer
 * nivel, como Órdenes y recepción):
 *
 *   Todo (`todo`)                       cada acreedor con el total de todas las
 *                                       fuentes, lo vencido primero (PorPagarDashboard)
 *   Proveedores (`cuentas`)             las facturas de cada proveedor y pagarlas
 *   Calendario de pagos (`calendario`)  qué vence cada semana y la antigüedad
 *   Propuesta de pagos (`propuesta`)    las que conviene pagar ya, marcadas
 *   Conciliación (`conciliacion`)       orden, recepción, factura y pago lado a lado
 *
 * Proveedores, Calendario y Propuesta son `PayablesTab`, la misma pantalla de
 * Compras. Cada sección se ve sólo con su permiso (`secciones-lo-que-debo.ts`):
 * el plan Básico entra por Activos y no ve las de proveedores.
 */
import { useMemo } from "react";
import { EmptyState } from "@buleje/design-system";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import PayablesTab from "@/components/admin/PayablesTab";
import ConciliacionDeCompras from "@/components/admin/compras/conciliacion/ConciliacionDeCompras";
import { TabLoadingSkeleton } from "@/components/ui/skeletons";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { useContextoPermiso } from "@/hooks/use-vistas-permitidas";
/* Estáticos, no `next/dynamic`: la barra de secciones va en la fila del título
   de cada uno; si bajaran aparte, la barra desaparecía mientras cargaba. */
import PorPagarDashboard from "../PorPagarDashboard";
import { SECCIONES_LO_QUE_DEBO, seccionesVisibles, type SeccionLoQueDebo } from "./secciones-lo-que-debo";

const ID_PANEL = "panel-lo-que-debo";
const ROTULO: Record<SeccionLoQueDebo, string> = {
  todo: "Todo",
  cuentas: "Proveedores",
  calendario: "Calendario de pagos",
  propuesta: "Propuesta de pagos",
  conciliacion: "Conciliación",
};

export default function LoQueDebo({ onIr }: { onIr?: (vista: string) => void } = {}) {
  const { vista: pedida, irA } = useSubvistaModulo<SeccionLoQueDebo>("plata-lo-que-debo", SECCIONES_LO_QUE_DEBO, "todo");
  const ctx = useContextoPermiso();
  const secciones = useMemo(() => (ctx ? seccionesVisibles(ctx) : null), [ctx]);

  /* El permiso llega de una caché (hasta 30 s): sin él no se monta ninguna
     sección, porque Proveedores pediría /api/payables y /api/suppliers. */
  if (!secciones) return <TabLoadingSkeleton />;
  if (secciones.length === 0) {
    return <EmptyState title="No tienes acceso a lo que debes" description="Pídele al dueño que te dé Mi Plata o Compras." />;
  }
  const seccion: SeccionLoQueDebo = secciones.includes(pedida) ? pedida : secciones[0];

  /* Un clic en la barra abre la sección entera: el `?q=` que dejó el «Pagar» de
     un proveedor (desde «Todo») no sigue filtrando la lista. */
  const cambiar = (s: SeccionLoQueDebo) => {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has("q")) {
        url.searchParams.delete("q");
        window.history.replaceState(window.history.state, "", url.toString());
      }
    } catch {
      /* sin history: queda el filtro */
    }
    irA(s);
  };

  /** `propuesta` = cuántas cuentas quedaron marcadas para pagar (sólo lo sabe Proveedores). */
  const barra = (propuesta?: number) => (
    <BarraDeSecciones
      secciones={secciones.map((clave) => ({ clave, rotulo: ROTULO[clave], cuenta: clave === "propuesta" ? propuesta : undefined }))}
      activa={seccion}
      onCambiar={cambiar}
      etiqueta="Secciones de Lo que debo"
      idPanel={ID_PANEL}
    />
  );

  return (
    <div role="tabpanel" id={ID_PANEL} aria-labelledby={idPestanaDeSeccion(ID_PANEL, seccion)}>
      {seccion === "todo" ? (
        <PorPagarDashboard onIr={onIr} barra={barra()} onSeccion={(s) => irA(secciones.includes(s as SeccionLoQueDebo) ? (s as SeccionLoQueDebo) : secciones[0])} />
      ) : seccion === "conciliacion" ? (
        <ConciliacionDeCompras barra={barra()} />
      ) : (
        <PayablesTab seccion={seccion} irA={irA} barra={barra} />
      )}
    </div>
  );
}
