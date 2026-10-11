"use client";

/**
 * El «⋯ › Ver lo que quitó» de Turnos › Cajeros: cada vez que el cajero sacó
 * productos del ticket antes de cobrar este mes, del más nuevo al más viejo.
 */
import { DataTable } from "@buleje/design-system";
import { Eraser } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import { formatCurrency } from "@/lib/format";
import { cuandoLima } from "@/lib/pos/quitados";
import { useQuitadosDeCajero } from "./use-control-cajeros";

export function QuitadosModal({ usuario, nombre, onCerrar }: { usuario: string | null; nombre: string; onCerrar: () => void }) {
  const { estado, quitados } = useQuitadosDeCajero(usuario);
  const total = quitados.reduce((s, q) => s + q.detalle.monto, 0);

  return (
    <AdminModal
      open={usuario !== null}
      onClose={onCerrar}
      title={`Lo que quitó ${nombre}`}
      description="Productos sacados del ticket antes de cobrar, este mes"
      icon={Eraser}
      variant="wide"
    >
      <div className={MODAL_BODY}>
        {estado === "cargando" ? (
          <div className="flex justify-center p-8" role="status" aria-label="Cargando lo quitado"><LoadingSpinner size={28} /></div>
        ) : estado !== "listo" ? (
          <p role="alert" className="text-sm text-[var(--data-error-ink)]">No se pudo cargar el detalle. Cierra y vuelve a intentar.</p>
        ) : quitados.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Este mes no quitó productos del ticket.</p>
        ) : (
          <>
            <p className="mb-3 text-sm text-[var(--text-secondary)]">
              {quitados.length} {quitados.length === 1 ? "vez" : "veces"} · <strong className="tabular-nums text-[var(--text-primary)]">{formatCurrency(total)}</strong>
            </p>
            <DataTable>
              <thead>
                <tr>
                  <th>Cuándo</th>
                  <th>Productos</th>
                  <th className="text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {quitados.map((q) => (
                  <tr key={q.id}>
                    <td className="whitespace-nowrap text-[var(--text-secondary)]">
                      {cuandoLima(q.creadoEn)}
                      {q.detalle.motivo === "vaciar" && <span className="block text-sm font-semibold text-[var(--data-warning-ink)]">Vació el ticket</span>}
                    </td>
                    <td>
                      {q.detalle.lineas.map((l, i) => (
                        <span key={`${l.productoId}-${i}`} className="block">
                          <span className="tabular-nums">{l.cantidad}</span> × {l.nombre}
                          {l.descuentoPct ? <span className="text-[var(--text-secondary)]"> (−{l.descuentoPct} %)</span> : null}
                        </span>
                      ))}
                    </td>
                    <td className="text-right font-bold tabular-nums whitespace-nowrap">{formatCurrency(q.detalle.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          </>
        )}
      </div>
    </AdminModal>
  );
}
