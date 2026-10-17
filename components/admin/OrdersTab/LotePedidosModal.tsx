"use client";

/**
 * Revisar y después ver qué pasó con un cambio de estado en lote (P09).
 *
 *   revisar  cuáles van y cuáles no (con el porqué) antes de mandar nada
 *   informe  qué le pasó a cada pedido; «Reintentar» manda sólo los pendientes
 *
 * La regla está en `lote-pedidos.ts`; el estado, en `useOrderBulkActions`.
 */
import { DataTable } from "@buleje/design-system";
import { ListChecks, RotateCcw } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import type { EstadoLote } from "./hooks/useOrderBulkActions";
import { contarResultados, pendientesDe, type Resultado } from "./lote-pedidos";
import { STATUS_LABELS } from "./types";

const TONO: Record<Resultado, string> = {
  cambiado: "bg-[var(--data-success-50)] text-[var(--data-success-ink)] dark:bg-[var(--data-success-500)]/15",
  "ya-estaba": "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  rechazado: "bg-[var(--data-error-50)] text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/15",
  pendiente: "bg-[var(--data-warning-50)] text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/15",
  "no-encontrado": "bg-[var(--data-error-50)] text-[var(--data-error-ink)] dark:bg-[var(--data-error-500)]/15",
};

const pedidos = (n: number) => `${n} ${n === 1 ? "pedido" : "pedidos"}`;

function etiqueta(r: Resultado, destino: string, mandado: boolean): string {
  if (r === "cambiado") return `Pasó a ${destino}`;
  if (r === "ya-estaba") return "Ya estaba";
  if (r === "rechazado") return "No se mueve";
  if (r === "no-encontrado") return "No está";
  return mandado ? "Pendiente" : "Va";
}

export function LotePedidosModal({
  lote,
  onConfirmar,
  onReintentar,
  onClose,
}: {
  lote: EstadoLote;
  onConfirmar: () => void;
  onReintentar: () => void;
  onClose: () => void;
}) {
  const destino = STATUS_LABELS[lote.destino];
  const mandado = lote.fase !== "revisar";
  const enviando = lote.fase === "enviando";
  const c = contarResultados(lote.filas);
  const pendientes = pendientesDe(lote.filas).length;
  const cliente = new Map(lote.pedidos.map((p) => [p.id, p.customer.name]));
  /* Lo que pide atención, arriba. */
  const PESO: Record<Resultado, number> = {
    rechazado: 0,
    "no-encontrado": 0,
    pendiente: mandado ? 1 : 3,
    "ya-estaba": 2,
    cambiado: 3,
  };
  const filas = [...lote.filas].sort((a, b) => PESO[a.resultado] - PESO[b.resultado]);

  const resumen = mandado
    ? [
        c.cambiado > 0 && `${pedidos(c.cambiado)} a ${destino}`,
        c["ya-estaba"] > 0 && `${c["ya-estaba"]} ya estaban`,
        c.rechazado + c["no-encontrado"] > 0 && `${c.rechazado + c["no-encontrado"]} no se movieron`,
        pendientes > 0 && `${pendientes} pendientes`,
      ]
        .filter(Boolean)
        .join(" · ")
    : `Van ${pedidos(lote.elegibles.length)} a ${destino}` +
      (lote.filas.length > lote.elegibles.length
        ? `; ${lote.filas.length - lote.elegibles.length} se quedan donde están`
        : "");

  return (
    <AdminModal
      open
      onClose={enviando ? () => undefined : onClose}
      title={mandado ? `Pasar a ${destino}: qué pasó` : `Pasar a ${destino}`}
      description={resumen}
      icon={ListChecks}
      size="lg"
      footer={
        <ModalFooter
          nota={
            !mandado && lote.destino === "cancelado"
              ? "Cancelar repone el stock de cada pedido y no se deshace"
              : enviando
                ? "Mandando…"
                : undefined
          }
        >
          {mandado ? (
            <>
              {pendientes > 0 && (
                <button
                  type="button"
                  onClick={onReintentar}
                  disabled={enviando}
                  className={button({ variant: "secondary", className: "gap-1.5 rounded-xl px-4" })}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  Reintentar {pendientes === 1 ? "el pendiente" : `los ${pendientes} pendientes`}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                disabled={enviando}
                className={button({ variant: "primary", className: "rounded-xl px-4" })}
              >
                Listo
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className={button({ variant: "secondary", className: "rounded-xl px-4" })}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onConfirmar}
                disabled={lote.elegibles.length === 0}
                className={button({
                  variant: lote.destino === "cancelado" ? "danger" : "primary",
                  className: "rounded-xl px-4",
                })}
              >
                {lote.elegibles.length === 0
                  ? "Ninguno puede pasar"
                  : `Pasar ${pedidos(lote.elegibles.length)}`}
              </button>
            </>
          )}
        </ModalFooter>
      }
    >
      <div className={MODAL_BODY}>
        <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
          <DataTable className="w-full">
            <thead>
              <tr>
                <th data-label="Pedido">Pedido</th>
                <th data-label="Cliente">Cliente</th>
                <th data-label="Resultado">Resultado</th>
                <th data-label="Por qué">Por qué</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule-soft)]">
              {filas.map((f) => (
                <tr key={f.id} data-resultado={f.resultado}>
                  <td className="whitespace-nowrap font-mono text-sm">#{f.id.slice(-6)}</td>
                  <td className="text-sm text-[var(--text-primary)]">{cliente.get(f.id) ?? "—"}</td>
                  <td>
                    <span
                      className={cn(
                        "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-sm font-semibold",
                        !mandado && f.resultado === "pendiente" ? TONO.cambiado : TONO[f.resultado],
                      )}
                    >
                      {etiqueta(f.resultado, destino, mandado)}
                    </span>
                  </td>
                  <td className="text-sm text-[var(--text-secondary)]">
                    {!mandado && f.resultado === "pendiente" ? "" : f.motivo}
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      </div>
    </AdminModal>
  );
}
