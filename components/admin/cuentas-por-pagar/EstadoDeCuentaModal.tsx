"use client";

import { useState } from "react";
import { DataTable } from "@buleje/design-system";
import { Download, ScrollText } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { Field } from "@/components/admin/shared/Field";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import TableSkeleton from "@/components/admin/shared/TableSkeleton";
import { button } from "@/components/ui-system/button-variants";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/format";
import { cn, exportToCSV, limaDateKey } from "@/lib/utils";
import { CAMPO, ROTULO } from "./OrigenCuentaCampos";
import { fechaConDia } from "./resumen-cuentas";
import { useEstadoDeCuenta } from "./use-estado-de-cuenta";

/** «distribuidora-ucayali» para el nombre del archivo. */
const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "proveedor";

/**
 * Estado de cuenta con un proveedor a una fecha de corte (C48): cada deuda es
 * un cargo y cada pago un abono, con el saldo corrido. El saldo final es la
 * suma de lo que falta de cada cuenta: se explica por sus componentes. Lo arma
 * el servidor y se descarga tal cual para mandárselo al proveedor.
 */
export default function EstadoDeCuentaModal({ proveedores, inicial, onCerrar }: {
  proveedores: { id: string; nombre: string }[];
  inicial?: string;
  onCerrar: () => void;
}) {
  const [proveedorId, setProveedorId] = useState(inicial ?? proveedores[0]?.id ?? "");
  const [corte, setCorte] = useState(limaDateKey());
  const { estado, cargando, error } = useEstadoDeCuenta(proveedorId, corte);

  const descargar = () => {
    if (!estado) return;
    exportToCSV(
      estado.movimientos.map((m) => ({
        fecha: m.fecha, movimiento: m.tipo === "cargo" ? "Cargo" : "Abono", detalle: m.detalle,
        cargo: m.cargo || "", abono: m.abono || "", saldo: m.saldo,
      })),
      `estado-de-cuenta-${slug(estado.proveedor.nombre)}-${estado.corte}`,
    );
  };

  const cifras = estado
    ? [
        { rotulo: "Cargos", valor: estado.cargos },
        { rotulo: "Pagaste", valor: estado.abonos },
        { rotulo: "Saldo", valor: estado.saldo, fuerte: true },
        { rotulo: "Vencido", valor: estado.vencido, alerta: estado.vencido > 0 },
      ]
    : [];

  return (
    <AdminModal
      open
      onClose={onCerrar}
      title="Estado de cuenta del proveedor"
      icon={ScrollText}
      size="xl"
      claveVentana="cuentas-por-pagar-estado"
      footer={
        <ModalFooter>
          <button type="button" onClick={onCerrar} className={button({ variant: "secondary" })}>Cerrar</button>
          <button type="button" onClick={descargar} disabled={!estado || estado.movimientos.length === 0} className={button({ variant: "primary", className: "gap-1.5" })}>
            <Download className="h-4 w-4" aria-hidden /> Descargar CSV
          </button>
        </ModalFooter>
      }
    >
      <div className={`space-y-4 ${MODAL_BODY}`}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Proveedor" labelClassName={ROTULO}>
            <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className={CAMPO}>
              {proveedores.length === 0 && <option value="">Sin proveedores con cuentas</option>}
              {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </Field>
          <Field label="Al día (corte)" labelClassName={ROTULO} hint={corte ? fechaConDia(corte) : undefined}>
            <input type="date" value={corte} max={limaDateKey()} onChange={(e) => setCorte(e.target.value)} className={CAMPO} />
          </Field>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] px-4 py-3 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]">
            {error}
          </p>
        )}

        {cargando && !estado ? (
          <TableSkeleton rows={4} cols={5} className="rounded-xl border border-[var(--rule-base)]" />
        ) : estado ? (
          <>
            <div className={cn("grid grid-cols-2 gap-2 sm:grid-cols-4", cargando && "opacity-60")} aria-busy={cargando}>
              {cifras.map((c) => (
                <div key={c.rotulo} className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-2">
                  <p className="text-sm text-[var(--text-secondary)]">{c.rotulo}</p>
                  <p className={cn(
                    "tabular-nums",
                    c.fuerte ? "text-lg font-bold text-[var(--text-primary)]" : "font-semibold text-[var(--text-primary)]",
                    c.alerta && "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
                  )}>
                    {formatCurrency(c.valor)}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
              <span>
                {estado.abiertas} cuenta{estado.abiertas === 1 ? "" : "s"} con saldo
                {estado.sinDocumento > 0 && ` · ${estado.sinDocumento} sin factura ni orden`}
              </span>
              <InfoTip
                title="Cómo se lee"
                what="Cada deuda entra como cargo el día que se anotó (por lo que vale hoy: si al recibir faltó mercadería, ya está restado) y cada pago como abono. El saldo es cargos menos lo que pagaste."
                affects="«Sin factura ni orden» son deudas sin papel: consíguelo antes de conciliar con el proveedor."
                example="Cargo S/ 500 el lunes 06/10, abono S/ 200 el jueves 09/10 → saldo S/ 300."
              />
            </div>
            {estado.movimientos.length === 0 ? (
              <p className="rounded-xl border border-dashed border-[var(--rule-base)] px-4 py-6 text-center text-sm text-[var(--text-secondary)]">
                Sin movimientos con este proveedor hasta el {fechaConDia(estado.corte)}.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
                <DataTable wrapperClassName="overflow-visible rounded-none border-0" className="w-full">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Detalle</th>
                      <th className="text-right">Cargo</th>
                      <th className="text-right">Abono</th>
                      <th className="text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--rule-soft)]">
                    {estado.movimientos.map((m, i) => (
                      <tr key={`${m.cuentaId}-${m.tipo}-${i}`}>
                        <td className="whitespace-nowrap">{fechaConDia(m.fecha)}</td>
                        <td>{m.detalle}</td>
                        <td className="text-right tabular-nums">{m.cargo ? formatCurrency(m.cargo) : "—"}</td>
                        <td className="text-right tabular-nums">{m.abono ? formatCurrency(m.abono) : "—"}</td>
                        <td className="text-right font-semibold tabular-nums">{formatCurrency(m.saldo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </DataTable>
              </div>
            )}
          </>
        ) : null}
      </div>
    </AdminModal>
  );
}
