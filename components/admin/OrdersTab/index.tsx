"use client";

/**
 * Pedidos y reparto (`?tab=pedidos`) — plan «panel unificado», 2026-10-09.
 *
 * Cuatro vistas en `?vista=` (link propio, «atrás» del navegador, destino de
 * avisos y del buscador), cada una con SU tarea (10-10, Brandon):
 *   tablero     ← mover los pedidos en marcha de un paso al siguiente
 *   lista       ← los mismos para buscar, ordenar, elegir varios e imprimir
 *   reparto     ← Delivery entero (DeliveryPartnersModule anidado; Brandon
 *                 eligió Delivery DENTRO de Pedidos el 09-10)
 *   archivados  ← los entregados y cancelados
 *
 * Cabecera en UNA fila: título · vistas · Indicadores (de lo que está en
 * marcha). «Imprimir» pasó del «⋯» (su única opción) a la Lista. Los filtros viven en UNA barra pegada al tablero o a la lista
 * (`BarraPedidos`); qué pedidos pasan lo decide `filtrar-pedidos.ts`, así el
 * tablero y la lista nunca dicen cosas distintas. El estado vive en
 * `usePedidos` y las ventanas en `VentanasPedidos`. Reparto se ve si su ORIGEN
 * (delivery-partners) pasa el plan, la plantilla, el rubro y el rol (R2).
 */
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { AlertTriangle, Archive, Kanban, List, Package, Truck } from "@buleje/design-system/icons";
import type { AdminTab } from "@/components/admin/shared/AdminTabBar";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { EmptyState } from "@/components/admin/EmptyState";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import { useContextoPermiso, useVistasPermitidas } from "@/hooks/use-vistas-permitidas";
import type { DbOrder } from "@/lib/jsondb";
import { usePedidos } from "./hooks/usePedidos";
import { OrdersKanban } from "./OrdersKanban";
import { OrdersBulkActions } from "./OrdersBulkActions";
import { OrdersArchive } from "./OrdersArchive";
import { BarraPedidos } from "./BarraPedidos";
import { ListaPedidos } from "./ListaPedidos";
import { ResumenImpresion } from "./ResumenImpresion";
import { VentanasPedidos } from "./VentanasPedidos";

// Delivery entero, montado como vista (R5: mover = montar). Trae el mapa
// Leaflet, que usa `window`.
const Reparto = dynamic(() => import("@/components/admin/unified/DeliveryPartnersModule"), {
  ssr: false,
  loading: () => <LoadingSpinner className="mx-auto my-16" />,
});

const MODULE_ID = "pedidos";

const VISTAS: AdminTab[] = [
  { id: "tablero", label: "Tablero", icon: Kanban },
  { id: "lista", label: "Lista", icon: List },
  { id: "reparto", label: "Reparto", icon: Truck },
  { id: "archivados", label: "Archivados", icon: Archive },
];
type Vista = "tablero" | "lista" | "reparto" | "archivados";
const IDS_VISTAS: readonly Vista[] = ["tablero", "lista", "reparto", "archivados"];

/**
 * `?sub=` es de Reparto (sus secciones: en vivo, repartidores, pagos…). Al
 * salir de Reparto se borra; sin esto, `?vista=tablero&sub=en-vivo` (el enlace
 * de Brandon del 10-10) quedaba pegado en el Tablero.
 */
const OPCIONES_VISTA = { paramsDeVista: { reparto: ["sub"] } } as const;

const AYUDA =
  "Tablero: mueve cada pedido al paso siguiente. Lista: búscalos, ordénalos, elige varios e imprímelos. Reparto: repartidores en vivo, asignaciones, pagos y ranking. Archivados: los entregados y cancelados.";

export default function OrdersTab({ initialTab }: { initialTab?: string } = {}) {
  const { vista, irA } = useVistaModulo<Vista>(
    MODULE_ID,
    IDS_VISTAS,
    "tablero",
    initialTab,
    OPCIONES_VISTA,
  );
  const vistas = useVistasPermitidas(MODULE_ID, VISTAS);
  const contextoPermiso = useContextoPermiso();

  // `paramsDeVista` limpia al SALIR de Reparto; si se llega a otra vista con el
  // `?sub=` ya pegado (un enlace guardado), se borra acá.
  useEffect(() => {
    if (vista === "reparto") return;
    const url = new URL(window.location.href);
    if (!url.searchParams.has("sub")) return;
    url.searchParams.delete("sub");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [vista]);

  const p = usePedidos();
  const { datos, acciones: a, reparto: r, bulk } = p;

  const repartoVisible = vistas.some((v) => v.id === "reparto");
  const tabs = vistas.map((v) =>
    v.id === "tablero" && p.enMarcha > 0 ? { ...v, badge: p.enMarcha } : v,
  );
  const enMarchaVisible = vista === "tablero" || vista === "lista";

  return (
    <AdminTabBar
      heading={{
        title: "Pedidos y reparto",
        description: AYUDA,
        icon: Package,
        // Siempre un elemento (aunque vacío en Reparto y Archivados): con o sin
        // acciones AdminTabBar decide distinto si el título va en la fila de
        // las pestañas, y la cabecera no tiene que saltar al cambiar de vista.
        actions: <>{enMarchaVisible && p.kpis.boton}</>,
      }}
      tabs={tabs}
      activeTab={vista}
      onTabChange={irA}
      moduleId={MODULE_ID}
    >
      <div className="space-y-3 pt-3">
        {enMarchaVisible && (
          <>
            {datos.loadError && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-xl border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-1 text-sm text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/10"
              >
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
                <span className="flex-1">{datos.loadError}</span>
                <button
                  type="button"
                  onClick={() => {
                    datos.setLoadError(null);
                    void datos.load();
                  }}
                  className="h-12 px-2 text-sm font-bold underline"
                >
                  Reintentar
                </button>
              </div>
            )}

            {p.kpis.panel}

            <BarraPedidos
              orders={datos.orders}
              filters={p.filters}
              dispatch={p.dispatch}
              repartidor={r.selectedDriverFilter}
              onRepartidor={r.setSelectedDriverFilter}
              onAbrirFiltros={() => p.setFiltrosAbiertos(true)}
              conCuentas={vista === "lista"}
              extremo={
                vista === "lista" ? (
                  <OrdersBulkActions
                    selectedCount={p.elegidosVisibles.length}
                    bulkStatusTarget={bulk.bulkStatusTarget}
                    bulkUpdating={bulk.bulkUpdating}
                    onBulkStatusChange={bulk.setBulkStatusTarget}
                    onExecuteBulkStatus={() => void bulk.executeBulkStatus(p.elegidosVisibles)}
                    onClearSelection={bulk.clearOrderSelection}
                    onShowPrint={() => p.setImpresionAbierta(true)}
                    onImprimirLista={() => window.print()}
                  />
                ) : undefined
              }
            />

            {vista === "tablero" ? (
              <OrdersKanban
                activeOrders={p.enMarchaFiltrados}
                loading={datos.loading}
                conFiltros={p.puestos > 0}
                storeLat={datos.storeLat}
                storeLon={datos.storeLon}
                driverColor={r.driverColor}
                onSelectOrder={datos.setDetailOrder}
                onUpdateStatus={a.updateStatus}
                onVerifyYape={a.verifyYape}
                onRejectYape={a.rejectYape}
                onMarkDeudaPaid={a.markDeudaPaid}
                onManualDelivery={(id, reason) =>
                  a.patchOrder(id, {
                    status: "entregado",
                    // deliveryReason no es columna de Order — el server PATCH lo
                    // extrae y persiste en OrderStatusHistory.note (audit log).
                    ...({ deliveryReason: reason } as unknown as Partial<DbOrder>),
                  })
                }
              />
            ) : (
              <ListaPedidos
                pedidos={p.enMarchaFiltrados}
                loading={datos.loading}
                conFiltros={p.puestos > 0}
                elegidos={bulk.selectedOrderIds}
                onElegir={bulk.toggleOrderSelect}
                onElegirTodos={bulk.setOrderSelection}
                onSelectOrder={datos.setDetailOrder}
              />
            )}

            <ResumenImpresion pedidos={p.enMarchaFiltrados} />
          </>
        )}

        {vista === "archivados" && (
          <OrdersArchive
            archivedOrders={p.archivados}
            onSelectOrder={datos.setDetailOrder}
            onDeleteOrder={a.setConfirmDeleteId}
          />
        )}

        {vista === "reparto" &&
          (repartoVisible ? (
            <Reparto anidado />
          ) : contextoPermiso === null ? (
            <LoadingSpinner className="mx-auto my-16" />
          ) : (
            <EmptyState
              icon={<Truck className="h-10 w-10 text-[var(--text-tertiary)]" />}
              title="El reparto no está en tu plan o en tu rol"
              actions={[]}
            />
          ))}
      </div>

      <VentanasPedidos p={p} />
    </AdminTabBar>
  );
}
