"use client";

import { useState } from "react";
import { Download, MoreHorizontal, RefreshCw } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import TableSkeleton from "@/components/admin/shared/TableSkeleton";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { EstadoConciliacion } from "@/lib/compras/conciliacion";
import { cn, exportToCSV, formatCurrency } from "@/lib/utils";
import TablaConciliacion, { CHIP_ESTADO } from "./TablaConciliacion";
import { PERIODOS, rangoDe, useConciliacion, type PeriodoConciliacion } from "./use-conciliacion";

const CAMPO =
  "h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
const POR_PAGINA = 50;
type FiltroEstado = EstadoConciliacion | "todas";
const ESTADOS: Array<{
  id: FiltroEstado;
  clave: "revisar" | "sinComparar" | "enCurso" | "cuadra" | "filas";
}> = [
  { id: "revisar", clave: "revisar" },
  { id: "sin-comparar", clave: "sinComparar" },
  { id: "en-curso", clave: "enCurso" },
  { id: "cuadra", clave: "cuadra" },
  { id: "todas", clave: "filas" },
];

/**
 * Por pagar › Conciliación (N04): por orden de compra, lo pedido, lo que llegó
 * y se aceptó, la factura, la cuenta y lo pagado, lado a lado, con qué no
 * cuadra y de qué papel sale. Todo lo calcula el servidor; acá se elige el
 * período, el proveedor y qué ver. No paga ni une nada: «Vincular a su orden»
 * abre la ventana de Por pagar, que pide confirmar.
 */
export default function ConciliacionDocumentos({
  marca,
  onVerCuenta,
  onVincular,
}: {
  /** Cambia cuando Por pagar recarga sus cuentas: la conciliación se vuelve a pedir. */
  marca: unknown;
  onVerCuenta: (cuentaId: string) => void;
  onVincular: (cuentaId: string) => void;
}) {
  const { datos, cargando, error, periodo, setPeriodo, proveedor, setProveedor, recargar } =
    useConciliacion(marca);
  const [estadoElegido, setEstado] = useState<FiltroEstado | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [cuantas, setCuantas] = useState(POR_PAGINA);

  const resumen = datos?.resumen;
  // Sin elegir, arranca en «Por revisar» si hay algo que revisar.
  const estado: FiltroEstado =
    estadoElegido ?? (resumen && resumen.revisar > 0 ? "revisar" : "todas");
  const filas = (datos?.filas ?? []).filter((f) => estado === "todas" || f.estado === estado);
  const visibles = filas.slice(0, cuantas);
  const { desde, hasta } = rangoDe(periodo);

  const descargar = () =>
    exportToCSV(
      filas.map((f) => ({
        proveedor: f.proveedor,
        documento: f.codigo,
        fecha: f.fecha,
        pedido: f.pedido?.monto ?? "",
        aceptado: f.llego?.valor ?? "",
        factura: f.documento ?? "",
        cuenta: f.cuenta?.monto ?? "",
        pagado: f.cuenta?.pagado ?? "",
        estado: CHIP_ESTADO[f.estado].texto,
        que_no_cuadra: f.diferencias.map((d) => d.texto).join(" | "),
      })),
      `conciliacion-compras-${desde}-a-${hasta}`,
    );

  const cambiar = (fn: () => void) => {
    fn();
    setAbierta(null);
    setCuantas(POR_PAGINA);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Qué ver" className="flex flex-wrap gap-2">
          {ESTADOS.map((e) => (
            <button
              key={e.id}
              type="button"
              aria-pressed={estado === e.id}
              onClick={() => cambiar(() => setEstado(e.id))}
              className={cn(
                "h-12 rounded-xl border px-2.5 text-sm font-semibold transition-colors",
                estado === e.id
                  ? "border-primary bg-primary text-white"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {e.id === "todas" ? "Todas" : CHIP_ESTADO[e.id].texto}{" "}
              <span className="tabular-nums opacity-80">{resumen ? resumen[e.clave] : "…"}</span>
            </button>
          ))}
        </div>
        {/* Filtros, ⓘ y «⋯» viajan juntos: si no entran, bajan en grupo (nunca el «⋯» solo en su fila). */}
        <div className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
          <select
            value={proveedor}
            onChange={(e) => cambiar(() => setProveedor(e.target.value))}
            aria-label="Filtrar por proveedor"
            className={cn(CAMPO, "w-40 max-w-full truncate")}
          >
            <option value="">Todos los proveedores</option>
            {(datos?.proveedores ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
          <select
            value={periodo}
            onChange={(e) => cambiar(() => setPeriodo(e.target.value as PeriodoConciliacion))}
            aria-label="Período"
            className={CAMPO}
          >
            {PERIODOS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <InfoTip
            title="Conciliación de documentos"
            what="Pone lado a lado lo que pediste en la orden, lo que llegó y aceptaste al recibir, la factura, la cuenta por pagar y lo que pagaste, y dice qué no cuadra y de qué papel sale. Diferencias de hasta S/ 1 se toman como iguales."
            affects="Sólo mira: no paga ni cambia ninguna cuenta. Las propuestas («Puede ser») explican por qué una cuenta o una recepción suelta puede ser de una orden; unirlas lo haces tú con «Vincular a su orden»."
            example="Factura de 10 sacos y aceptaste 8: la línea muestra «faltan 2» y, si la cuenta sigue por S/ 100 cuando lo aceptado vale S/ 80, avisa S/ 20 de más."
          />
          <ActionMenu
            label="Más de la conciliación"
            soloIcono
            size="md"
            className="w-12 shrink-0"
            icon={MoreHorizontal}
            actions={[
              {
                id: "actualizar",
                label: "Actualizar",
                icon: RefreshCw,
                onSelect: recargar,
                busy: cargando,
              },
              {
                id: "csv",
                label: "Descargar CSV",
                hint: "Lo que estás viendo, con qué no cuadra",
                icon: Download,
                onSelect: descargar,
                disabled: filas.length === 0,
              },
            ]}
          />
        </div>
      </div>

      {resumen && resumen.filas > 0 && (
        <p className="text-sm text-[var(--text-secondary)]" aria-live="polite">
          Pediste{" "}
          <strong className="tabular-nums text-[var(--text-primary)]">
            {formatCurrency(resumen.pedido)}
          </strong>
          {" · aceptaste "}
          <strong className="tabular-nums text-[var(--text-primary)]">
            {formatCurrency(resumen.aceptado)}
          </strong>
          {" · cuentas por "}
          <strong className="tabular-nums text-[var(--text-primary)]">
            {formatCurrency(resumen.cuentas)}
          </strong>
          {" · pagaste "}
          <strong className="tabular-nums text-[var(--text-primary)]">
            {formatCurrency(resumen.pagado)}
          </strong>
          {resumen.enDiferencia > 0 && (
            <>
              {" · en diferencias por revisar "}
              <strong className="tabular-nums text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                {formatCurrency(resumen.enDiferencia)}
              </strong>
            </>
          )}
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] px-4 py-3 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]"
        >
          <span>{error}</span>
          <button type="button" onClick={recargar} className="underline underline-offset-2">
            Reintentar
          </button>
        </div>
      )}
      {datos?.recortado && (
        <p className="text-sm text-[var(--text-secondary)]">
          Se leyeron las 1.500 órdenes más recientes del período: elige uno más corto para ver todo.
        </p>
      )}

      {cargando && !datos ? (
        <TableSkeleton
          rows={4}
          cols={5}
          className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]"
        />
      ) : !datos ? null : filas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
          {datos.filas.length === 0
            ? "No hay compras en este período."
            : estado === "revisar"
              ? "Nada por revisar en este período."
              : "Nada con este filtro."}
        </p>
      ) : (
        <div className={cn("space-y-2", cargando && "opacity-60")} aria-busy={cargando}>
          <TablaConciliacion
            filas={visibles}
            abierta={abierta}
            setAbierta={setAbierta}
            onVerCuenta={onVerCuenta}
            onVincular={onVincular}
          />
          {filas.length > visibles.length && (
            <button
              type="button"
              onClick={() => setCuantas((n) => n + POR_PAGINA)}
              className="h-12 w-full rounded-xl border border-[var(--rule-base)] text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
            >
              Ver {Math.min(POR_PAGINA, filas.length - visibles.length)} más de{" "}
              {filas.length - visibles.length}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
