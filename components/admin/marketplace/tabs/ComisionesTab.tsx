"use client";

/**
 * Marketplace › Comisiones: lo que la plataforma cobra por cada venta tuya en
 * el marketplace (`/api/commissions/ledger`). No es Ventas › Comisiones de
 * vendedores (lo que ganan tus empleados por lo que venden).
 *
 * Patrón del panel (11-10): una fila de cabecera con las tres cifras del
 * backend en Indicadores, los estados como chips pegados a la tabla y
 * «Liquidar» en el «⋯» de cada fila. Antes: un héroe con el total sumado en el
 * cliente, la misma cifra otra vez en los chips y una columna «Total» que
 * siempre decía S/ 0,00 (el ledger no trae el total de la orden), y botones
 * «Marcar pagado» / «Pagar liquidado» que en realidad liquidan (el PATCH sólo
 * pasa pendiente → liquidada; no existe el paso a pagada).
 */
import { DataTable, StatCard } from "@buleje/design-system";
import { CheckCircle, Clock, Download, MoreHorizontal, RotateCcw, Users, Wallet } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { useMarketplaceCommissions, type CommissionEntry } from "@/components/admin/marketplace/hooks/use-marketplace-commissions";
import { TableSkeleton } from "@/components/admin/marketplace/shared";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { formatCurrency } from "@/lib/format";
import { cn, exportToCSV } from "@/lib/utils";
import { useAccionesDeVista } from "@/components/admin/marketplace/acciones-de-vista";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { diaDe, ENCABEZADOS_14, ErrorDeCarga, FilaDeVista, SelectFiltro, VacioDeUnaFrase, type OpcionFiltro } from "./cabecera-vista";

type Filtro = "all" | CommissionEntry["status"];

const ROTULO: Record<CommissionEntry["status"], string> = { pendiente: "Por liquidar", liquidado: "Liquidadas", pagado: "Pagadas", reembolsado: "Reembolsadas" };
/** El estado de UNA fila, con texto `-ink` (el `--data-warning` de shared.tsx da < 4,5:1 a 14 px). */
const ESTADO_FILA: Record<CommissionEntry["status"], { rotulo: string; clase: string }> = {
  pendiente: { rotulo: "Por liquidar", clase: "bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]" },
  liquidado: { rotulo: "Liquidada", clase: "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" },
  pagado: { rotulo: "Pagada", clase: "bg-[var(--data-success-100)] text-[var(--data-success-ink)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]" },
  /* La venta se devolvió: la comisión no se cobra. Antes decía «Pagada» y no sumaba en «Pagadas». */
  reembolsado: { rotulo: "Reembolsada", clase: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]" },
};
const HREF_COMISIONES_VENDEDORES = "/admin?tab=ventas-caja&vista=comisiones";

export function MarketplaceComisionesTab() {
  const { entries, filtered, summary, loading, error, filterStatus, setFilterStatus, markingPaid, load, handleMarkPaid, handleBulkPay } =
    useMarketplaceCommissions();
  const pendientes = entries.filter((e) => e.status === "pendiente");

  const kpis = useKpisPlegables({
    claveMemoria: "marketplace-comisiones",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: loading && entries.length === 0,
    resumen: `Por liquidar ${formatCurrency(summary.pendiente)}`,
    tarjetas: [
      <StatCard density="compact" key="p" label="Por liquidar" value={formatCurrency(summary.pendiente)} icon={Clock} highlight info={<InfoTip what="Comisiones de ventas que todavía no se liquidaron." />} />,
      <StatCard density="compact" key="l" label="Liquidadas" value={formatCurrency(summary.liquidado)} icon={CheckCircle} info={<InfoTip what="Ya calculadas y cerradas; falta que se paguen." />} />,
      <StatCard density="compact" key="g" label="Pagadas" value={formatCurrency(summary.pagado)} icon={Wallet} />,
      ...(summary.reembolsado > 0
        ? [<StatCard density="compact" key="r" label="Reembolsadas" value={formatCurrency(summary.reembolsado)} icon={RotateCcw} info={<InfoTip what="Ventas devueltas: esa comisión no se cobra." />} />]
        : []),
    ],
  });

  const acciones: MenuAccion[] = [
    {
      id: "liquidar",
      label: "Liquidar las pendientes",
      hint: pendientes.length > 0 ? `${pendientes.length} por ${formatCurrency(summary.pendiente)}: pasan a liquidadas` : "No hay comisiones por liquidar",
      icon: CheckCircle,
      busy: markingPaid === "bulk",
      disabled: pendientes.length === 0 || markingPaid === "bulk",
      onSelect: () => void handleBulkPay(),
    },
    {
      id: "csv",
      label: "Exportar a Excel",
      hint: `${filtered.length} comisiones, con el filtro de abajo`,
      icon: Download,
      disabled: filtered.length === 0,
      onSelect: () =>
        exportToCSV(
          filtered.map((e) => ({ orden: e.orderId, comision: e.amount, estado: ROTULO[e.status], fecha: e.createdAt.slice(0, 10) })),
          "comisiones-marketplace",
        ),
    },
    { id: "vendedores", label: "Comisiones de tus vendedores", hint: "Ventas › lo que gana cada empleado", icon: Users, onSelect: () => irAEnlace(HREF_COMISIONES_VENDEDORES) },
  ];
  /* Al «⋯ Más» del hub (una sola banda); «Actualizar» ya lo pone el hub. */
  useAccionesDeVista(acciones);

  const opciones: OpcionFiltro<Filtro>[] = [
    { valor: "all", rotulo: "Todos los estados", cuenta: entries.length },
    ...(Object.keys(ROTULO) as CommissionEntry["status"][])
      .map((s) => ({ valor: s, rotulo: ROTULO[s], cuenta: entries.filter((e) => e.status === s).length }))
      // «Reembolsadas» sólo aparece si hay alguna (casi nunca): no suma un chip en 0.
      .filter((o) => o.valor !== "reembolsado" || o.cuenta > 0),
  ];

  return (
    <div className="space-y-3 sm:space-y-4">
      <FilaDeVista
        titulo="Comisiones"
        ayuda={{
          what: "Lo que la plataforma cobra por cada venta tuya en el marketplace: un porcentaje de la orden.",
          affects: "Liquidar una comisión la cierra con su monto; después se paga. Lo que ganan tus vendedores por lo que venden está en Ventas › Comisiones de vendedores.",
          example: "Una orden de S/ 39,50 con 5 % deja S/ 1,98 de comisión «por liquidar».",
        }}
        derecha={kpis.boton}
      >
        <SelectFiltro opciones={opciones} activo={filterStatus as Filtro} onCambiar={setFilterStatus} etiqueta="Estado de la comisión" />
      </FilaDeVista>
      {kpis.panel}
      {error && <ErrorDeCarga mensaje={error} onReintentar={load} />}

      {loading && entries.length === 0 ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <VacioDeUnaFrase>
          {filterStatus !== "all" ? `No hay comisiones ${ROTULO[filterStatus as CommissionEntry["status"]]?.toLowerCase() ?? ""}.` : "Sin comisiones todavía: aparecen con tu primera venta en el marketplace."}
        </VacioDeUnaFrase>
      ) : (
        <DataTable className={ENCABEZADOS_14}>
          <thead>
            <tr>
              <th>Orden</th>
              <th className="text-right">Comisión</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => {
              const sc = ESTADO_FILA[e.status] ?? ESTADO_FILA.pendiente;
              return (
                <tr key={e.id}>
                  <td data-label="Orden" className="font-mono font-bold">#{e.orderId.slice(-8).toUpperCase()}</td>
                  <td data-label="Comisión" className="text-right font-extrabold tabular-nums">{formatCurrency(e.amount)}</td>
                  <td data-label="Estado">
                    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold", sc.clase)}>{sc.rotulo}</span>
                  </td>
                  <td data-label="Fecha" className="text-[var(--text-secondary)]">{diaDe(e.createdAt)}</td>
                  <td className="w-12 text-right max-sm:empty:hidden">
                    {e.status === "pendiente" && (
                      <ActionMenu
                        label="Acciones"
                        icon={MoreHorizontal}
                        soloIcono
                        size="md"
                        className="w-12"
                        title={`Acciones de la comisión de la orden #${e.orderId.slice(-8).toUpperCase()}`}
                        actions={[
                          {
                            id: "liquidar",
                            label: "Liquidar",
                            hint: `${formatCurrency(e.amount)} pasa a liquidada`,
                            icon: CheckCircle,
                            busy: markingPaid === e.id,
                            disabled: markingPaid === e.id,
                            onSelect: () => void handleMarkPaid(e.id),
                          },
                        ]}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
