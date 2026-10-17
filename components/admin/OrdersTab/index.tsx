"use client";

/**
 * Pedidos y reparto (`?tab=pedidos`) — plan «panel unificado», 2026-10-09.
 *
 * Seis vistas en `?vista=` (link propio, «atrás» del navegador, destino de
 * avisos y del buscador), cada una con SU tarea (10-10, Brandon):
 *   tablero     ← mover los pedidos en marcha de un paso al siguiente
 *   lista       ← los mismos para buscar, ordenar, elegir varios e imprimir
 *   preparacion ← qué juntar, listo para salir y agenda de entregas (17-10)
 *   reparto     ← Delivery entero (DeliveryPartnersModule anidado; Brandon
 *                 eligió Delivery DENTRO de Pedidos el 09-10)
 *   archivados  ← los entregados y cancelados
 *   analisis    ← tiempos por paso, atascados, cancelados y demanda (17-10)
 *
 * Cabecera en UNA fila: título · vistas · Indicadores (de lo que está en
 * marcha). «Imprimir» pasó del «⋯» (su única opción) a la Lista. Los filtros viven en UNA barra pegada al tablero o a la lista
 * (`BarraPedidos`); qué pedidos pasan lo decide `filtrar-pedidos.ts`, así el
 * tablero y la lista nunca dicen cosas distintas. El estado vive en
 * `usePedidos` y las ventanas en `VentanasPedidos`. Reparto se ve si su ORIGEN
 * (delivery-partners) pasa el plan, la plantilla, el rubro y el rol (R2).
 *
 * 17-10: lo que el rol no puede hacer no se muestra (`permisos-pedidos.ts`,
 * por contexto); la Lista suma vistas guardadas (P08), revisión e informe del
 * lote (P09) y la hoja impresa con su contexto (P12).
 */
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { AlertTriangle, Archive, BarChart3, ClipboardList, Kanban, List, Package, Truck } from "@buleje/design-system/icons";
import type { AdminTab } from "@/components/admin/shared/AdminTabBar";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { EmptyState } from "@/components/admin/EmptyState";
import { MenuVistasGuardadas } from "@/components/admin/shared/MenuVistasGuardadas";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import { useVistaModulo } from "@/hooks/use-vista-modulo";
import { useContextoPermiso, useVistasPermitidas } from "@/hooks/use-vistas-permitidas";
import type { DbOrder } from "@/lib/jsondb";
import { AvisosPedidos } from "./AvisosPedidos";
import { usePedidos } from "./hooks/usePedidos";
import { PermisosPedidosContext } from "./permisos-pedidos";
import { OrdersKanban } from "./OrdersKanban";
import { OrdersBulkActions } from "./OrdersBulkActions";
import { OrdersArchive } from "./OrdersArchive";
import { BarraPedidos } from "./BarraPedidos";
import { ListaPedidos } from "./ListaPedidos";
import { ResumenImpresion } from "./ResumenImpresion";
import { VacioPedidos } from "./VacioPedidos";
import { VentanasPedidos } from "./VentanasPedidos";

// Delivery entero, montado como vista (R5: mover = montar). Trae el mapa
// Leaflet, que usa `window`.
const Reparto = dynamic(() => import("@/components/admin/unified/DeliveryPartnersModule"), {
  ssr: false,
  loading: () => <LoadingSpinner className="mx-auto my-16" />,
});
// N02 + N01 (17-10): qué juntar, de qué pedido, listo para salir, agenda de entregas.
const PreparacionPedidos = dynamic(() => import("@/components/admin/pedidos/preparacion/PreparacionPedidos"), {
  loading: () => <LoadingSpinner className="mx-auto my-16" />,
});
// N06 (17-10): tiempos por paso, atascados, cancelados, reparto y demanda (calculado en el servidor).
const AnalisisPedidos = dynamic(() => import("@/components/admin/pedidos/analisis/AnalisisPedidos"), {
  loading: () => <LoadingSpinner className="mx-auto my-16" />,
});

const MODULE_ID = "pedidos";

const VISTAS: AdminTab[] = [
  { id: "tablero", label: "Tablero", icon: Kanban },
  { id: "lista", label: "Lista", icon: List },
  { id: "preparacion", label: "Preparación", icon: ClipboardList },
  { id: "reparto", label: "Reparto", icon: Truck },
  { id: "archivados", label: "Archivados", icon: Archive },
  { id: "analisis", label: "Análisis", icon: BarChart3 },
];
type Vista = "tablero" | "lista" | "preparacion" | "reparto" | "archivados" | "analisis";
const IDS_VISTAS: readonly Vista[] = ["tablero", "lista", "preparacion", "reparto", "archivados", "analisis"];

/**
 * `?sub=` es de Reparto (sus secciones: en vivo, repartidores, pagos…). Al
 * salir de Reparto se borra; sin esto, `?vista=tablero&sub=en-vivo` (el enlace
 * de Brandon del 10-10) quedaba pegado en el Tablero.
 */
const OPCIONES_VISTA = { paramsDeVista: { reparto: ["sub"] } } as const;

const AYUDA =
  "Tablero: mueve cada pedido al paso siguiente. Lista: búscalos, ordénalos, elige varios e imprímelos. Preparación: qué juntar para los confirmados y cuáles están listos para salir. Reparto: repartidores en vivo, asignaciones, pagos y ranking. Archivados: los entregados y cancelados. Análisis: cuánto tarda cada paso, atascados y cancelados.";

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

  const cargando = datos.loading || p.notas.cargando;
  const repartoVisible = vistas.some((v) => v.id === "reparto");
  const tabs = vistas.map((v) =>
    v.id === "tablero" && p.enMarcha > 0 ? { ...v, badge: p.enMarcha } : v,
  );
  const enMarchaVisible = vista === "tablero" || vista === "lista";
  const vacio = (
    <VacioPedidos
      conFiltros={p.puestos > 0}
      onQuitarFiltros={() => {
        p.dispatch({ type: "CLEAR" });
        r.setSelectedDriverFilter("");
      }}
      onVerArchivados={() => irA("archivados")}
      onIrAReparto={repartoVisible ? () => irA("reparto") : undefined}
    />
  );

  return (
    <PermisosPedidosContext.Provider value={p.permisos}>
      <AdminTabBar
        heading={{
          title: "Pedidos y reparto",
          description: AYUDA,
          icon: Package,
          // Siempre un elemento (aunque vacío en Reparto y Archivados): con o sin
          // acciones AdminTabBar decide distinto si el título va en la fila de
          // las pestañas, y la cabecera no tiene que saltar al cambiar de vista.
          // «Vista» (P08) acá y no en la fila de filtros: allá no entraba a 1280.
          actions: (
            <>
              {enMarchaVisible && (
                <MenuVistasGuardadas
                  vistas={p.vistas}
                  queGuarda="Los filtros, el repartidor y el orden de la Lista que tienes puestos ahora"
                  ejemplo="Ej.: Los de delivery de la tarde"
                />
              )}
              {enMarchaVisible && p.kpis.boton}
            </>
          ),
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

              <AvisosPedidos p={p} />

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
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <OrdersBulkActions
                        selectedCount={p.elegidosVisibles.length}
                        bulkStatusTarget={bulk.bulkStatusTarget}
                        bulkUpdating={bulk.bulkUpdating}
                        onBulkStatusChange={bulk.setBulkStatusTarget}
                        onExecuteBulkStatus={() =>
                          bulk.revisar(p.enMarchaFiltrados.filter((o) => bulk.selectedOrderIds.has(o.id)))
                        }
                        onClearSelection={bulk.clearOrderSelection}
                        onShowPrint={() => p.setImpresionAbierta(true)}
                        onImprimirLista={p.imprimirLista}
                        puedeMover={p.permisos.mover}
                      />
                    </div>
                  ) : undefined
                }
              />

              {vista === "tablero" ? (
                <OrdersKanban
                  activeOrders={p.enMarchaFiltrados}
                  loading={cargando}
                  vacio={vacio}
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
                  loading={cargando}
                  vacio={vacio}
                  orden={p.orden}
                  onOrden={p.setOrden}
                  elegidos={bulk.selectedOrderIds}
                  onElegir={bulk.toggleOrderSelect}
                  onElegirTodos={bulk.setOrderSelection}
                  onSelectOrder={datos.setDetailOrder}
                />
              )}

              {/* Un portal de impresión por vez: con los tickets abiertos, imprimen ellos. */}
              {!p.impresionAbierta && (
                <ResumenImpresion
                  pedidos={p.pedidosOrdenados}
                  variante={p.varianteImpresion}
                  filtros={p.filtrosTexto}
                  vista={p.vistas.actual?.nombre ?? null}
                  negocio={datos.storeName}
                />
              )}
            </>
          )}

          {vista === "preparacion" && <PreparacionPedidos />}

          {vista === "analisis" && <AnalisisPedidos />}

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
    </PermisosPedidosContext.Provider>
  );
}
