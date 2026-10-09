"use client";

import { useId, useMemo, useState } from "react";
import { SectionTitle } from "@buleje/design-system";
import { CreditCard, Download, MoreHorizontal, Plus, RefreshCw, X } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import EmptyState from "@/components/admin/shared/EmptyState";
import TableSkeleton from "@/components/admin/shared/TableSkeleton";
import { BotonIndicadores } from "@/components/admin/arqueo/KpisCuadre";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { formatCurrency } from "@/lib/format";
import { cn, exportToCSV, limaDateKey } from "@/lib/utils";
import KpisPorPagar from "@/components/admin/cuentas-por-pagar/KpisPorPagar";
import NuevaCuentaModal from "@/components/admin/cuentas-por-pagar/NuevaCuentaModal";
import TablaCuentas, { type Abierto } from "@/components/admin/cuentas-por-pagar/TablaCuentas";
import { useCuentasPorPagar } from "@/components/admin/cuentas-por-pagar/use-cuentas-por-pagar";
import {
  diaDeVencimiento, estaPagada, filtrar, ordenar, proveedoresConCuentas, resumir, saldo, type FiltroEstado,
} from "@/components/admin/cuentas-por-pagar/resumen-cuentas";

const ESTADOS: { id: FiltroEstado; label: string }[] = [
  { id: "pendientes", label: "Por pagar" },
  { id: "pagadas", label: "Pagadas" },
  { id: "todas", label: "Todas" },
];

/**
 * Cuentas por pagar a proveedores: a quién le debes, cuánto, cuándo vence y
 * pagar. Vive en Compras › Por pagar y en Facturación › Cuentas x Pagar.
 */
export default function PayablesTab() {
  const { cuentas, proveedores, loading, error, setError, saving, load, crear, pagar, eliminar } = useCuentasPorPagar();
  const { confirm } = useConfirm();
  const [kpisAbiertos, setKpisAbiertos] = useLocalStorage<boolean>("compras:por-pagar:kpis-abiertos", true);
  const [estado, setEstado] = useState<FiltroEstado>("pendientes");
  const [proveedorId, setProveedorId] = useState("");
  const [abierto, setAbierto] = useState<Abierto>(null);
  const [nueva, setNueva] = useState(false);
  const [aviso, setAviso] = useState<{ texto: string; tono: "ok" | "aviso" } | null>(null);
  const kpisId = useId();
  const hoy = limaDateKey();

  const resumen = useMemo(() => resumir(cuentas, hoy), [cuentas, hoy]);
  const porProveedor = useMemo(() => proveedoresConCuentas(cuentas), [cuentas]);
  const visibles = useMemo(() => ordenar(filtrar(cuentas, estado, proveedorId)), [cuentas, estado, proveedorId]);
  const conteo = useMemo(() => {
    const deProveedor = filtrar(cuentas, "todas", proveedorId);
    const pagadas = deProveedor.filter(estaPagada).length;
    return { pendientes: deProveedor.length - pagadas, pagadas, todas: deProveedor.length };
  }, [cuentas, proveedorId]);
  const elegido = porProveedor.find((p) => p.id === proveedorId);

  const borrar = async (id: string) => {
    if (!(await confirm({ title: "¿Eliminar esta cuenta por pagar?", description: "Se borra con sus pagos registrados.", intent: "danger", confirmLabel: "Sí, eliminar" }))) return;
    await eliminar(id);
  };

  const descargar = () => exportToCSV(ordenar(cuentas).map((c) => ({
    proveedor: c.supplierName, concepto: c.description, total: c.amount, pagado: c.paidAmount,
    falta: saldo(c), vence: diaDeVencimiento(c.dueDate), estado: c.status, orden: c.purchaseOrderId ?? "",
  })), "cuentas-por-pagar");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle className="text-[var(--text-primary)]">Cuentas por pagar</SectionTitle>
        <InfoTip
          title="Cuentas por pagar"
          what="Lo que le debes a cada proveedor: las compras a crédito crean su cuenta sola y también puedes cargar una a mano. Arriba van las vencidas y las que vencen primero."
          affects="Al recibir con productos dañados, vencidos o faltantes, la cuenta de esa orden baja sola. Si pagas en efectivo puedes marcar «Sale de la caja» y el pago queda como egreso de la caja abierta."
          example="Orden de S/ 140 a 15 días con Distribuidora Ucayali: vence el jueves 23/10; si pagas S/ 100 hoy te faltan S/ 40."
        />
        <div className="ml-auto flex items-center gap-2">
          <BotonIndicadores abierto={kpisAbiertos} onAlternar={() => setKpisAbiertos((v) => !v)} controla={kpisId} />
          <button type="button" onClick={() => setNueva(true)} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-primary px-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark sm:px-4">
            <Plus className="h-4 w-4" aria-hidden /> <span className="max-sm:sr-only">Nueva cuenta</span>
          </button>
          <ActionMenu
            label="Más acciones"
            soloIcono
            icon={MoreHorizontal}
            actions={[
              { id: "refrescar", label: "Actualizar", icon: RefreshCw, onSelect: () => void load(), busy: loading },
              { id: "csv", label: "Descargar CSV", hint: "Todas las cuentas", icon: Download, onSelect: descargar, disabled: cuentas.length === 0 },
            ]}
          />
        </div>
      </div>

      {(error || aviso) && (
        <div
          role={error ? "alert" : "status"}
          className={cn(
            "flex items-start justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-semibold",
            error ? "border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]"
              : aviso?.tono === "aviso" ? "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]"
              : "border-[var(--accent)]/40 bg-[var(--accent-soft)] text-[var(--text-primary)]",
          )}
        >
          <p>{error ?? aviso?.texto}</p>
          <button type="button" onClick={() => { setError(null); setAviso(null); }} className="shrink-0 hover:opacity-70" aria-label="Cerrar aviso">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      {!loading && cuentas.length > 0 && <KpisPorPagar r={resumen} abierto={kpisAbiertos} id={kpisId} />}

      {loading ? (
        <TableSkeleton rows={4} cols={4} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]" />
      ) : cuentas.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No le debes nada a ningún proveedor"
          description="Las compras a crédito crean su cuenta aquí solas."
          action={{ label: "Anotar una cuenta", onClick: () => setNueva(true) }}
          className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]"
        />
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Qué cuentas ver" className="inline-flex rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-0.5">
              {ESTADOS.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  aria-pressed={estado === e.id}
                  onClick={() => setEstado(e.id)}
                  className={cn(
                    "h-9 rounded-lg px-3 text-sm font-semibold transition-colors",
                    estado === e.id ? "bg-primary text-white" : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                  )}
                >
                  {e.label} <span className="tabular-nums opacity-80">{conteo[e.id]}</span>
                </button>
              ))}
            </div>
            <select
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
              aria-label="Filtrar por proveedor"
              className="h-10 max-w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              <option value="">Todos los proveedores</option>
              {porProveedor.map((p) => (
                <option key={p.id} value={p.id}>{p.nombre}{p.debe > 0 ? ` · debes ${formatCurrency(p.debe)}` : " · al día"}</option>
              ))}
            </select>
            {elegido && (
              <p className="text-sm text-[var(--text-secondary)]">
                Le debes <strong className="tabular-nums text-[var(--text-primary)]">{formatCurrency(elegido.debe)}</strong> en {elegido.n} cuenta{elegido.n === 1 ? "" : "s"}.
              </p>
            )}
          </div>
          {visibles.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
              {estado === "pendientes" ? "No te falta pagar nada con este filtro." : "Sin cuentas con este filtro."}
            </p>
          ) : (
            <TablaCuentas
              cuentas={visibles}
              hoy={hoy}
              abierto={abierto}
              setAbierto={setAbierto}
              saving={saving}
              onPagar={pagar}
              onEliminar={(id) => void borrar(id)}
              onAviso={(texto, tono) => setAviso({ texto, tono })}
            />
          )}
        </div>
      )}

      {nueva && <NuevaCuentaModal proveedores={proveedores} saving={saving} onCrear={crear} onCerrar={() => setNueva(false)} />}
    </div>
  );
}
