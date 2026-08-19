"use client";

/**
 * HistorialTabla — las filas del historial, agrupadas por mes.
 *
 * Tres cosas que la tabla anterior prometía y no hacía: el header decía ser
 * `sticky` dentro de un contenedor con `overflow-hidden` (donde `sticky` no
 * pega), el comentario mencionaba indicadores de orden que no existían, y el
 * `truncate` de la descripción no truncaba porque la tabla era `auto`. Acá el
 * contenedor scrollea de verdad, las cabeceras ordenan, y hay `table-fixed`.
 */

import { ArrowDown, ArrowUp, ChevronsUpDown } from "@buleje/design-system/icons";
import StatusBadge from "@/components/admin/shared/StatusBadge";
import { cn } from "@/lib/utils";
import { SOURCE_META } from "./fuentes";
import {
  ESTADO_PAGO_LABELS, fmt, formatDate,
  type EstadoPago, type HistorialItem, type Orden,
} from "./shared";

const ESTADO_VARIANTE: Record<EstadoPago, "success" | "warning" | "error" | "neutral"> = {
  pagado: "success",
  parcial: "warning",
  pendiente: "error",
  sin_registro: "neutral",
};

type Grupo = { clave: string; label: string; total: number; gastos: number; items: HistorialItem[] };

interface Props {
  grupos: Grupo[];
  orden: Orden;
  alternarOrden: (campo: Orden["campo"]) => void;
  resumen: { total: number; pagado: number; porPagar: number; cantidad: number };
  visibles: number;
  totalFilas: number;
  verMas: () => void;
  onAbrir: (item: HistorialItem) => void;
}

function Cabecera({
  campo, label, orden, alternarOrden, alinear = "left",
}: {
  campo: Orden["campo"];
  label: string;
  orden: Orden;
  alternarOrden: (campo: Orden["campo"]) => void;
  alinear?: "left" | "right";
}) {
  const activo = orden.campo === campo;
  const Icono = !activo ? ChevronsUpDown : orden.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      className={cn("px-4 py-2.5", alinear === "right" && "text-right")}
      aria-sort={activo ? (orden.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => alternarOrden(campo)}
        className={cn(
          "inline-flex items-center gap-1 text-sm font-bold uppercase tracking-wider transition-colors hover:text-[var(--text-primary)]",
          activo ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]",
          // La columna de montos alinea a la derecha, así que su cabecera
          // también: con el ícono suelto a la izquierda quedaba flotando en
          // medio de la tabla, lejos de los números que ordena.
          alinear === "right" && "w-full justify-end",
        )}
      >
        {label}
        <Icono className="h-3.5 w-3.5" aria-hidden />
      </button>
    </th>
  );
}

export default function HistorialTabla({
  grupos, orden, alternarOrden, resumen, visibles, totalFilas, verMas, onAbrir,
}: Props) {
  const agrupaPorMes = orden.campo === "fecha";

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-white dark:bg-[var(--color-card)]">
      {/* El scroll vive acá: el header `sticky` necesita un contenedor que
          scrollee en Y, no un `overflow-hidden` en el padre.
          En celular no hace falta un render aparte: el shell del admin ya
          convierte toda `<table>` en tarjetas (`useMobileTableCards` +
          `.admin-mobile-cards` en globals.css). */}
      <div className="max-h-[38rem] overflow-auto rounded-xl">
        <table className="w-full min-w-[880px] table-fixed text-sm">
          <colgroup>
            <col style={{ width: "8.5rem" }} />
            <col style={{ width: "11rem" }} />
            <col style={{ width: "10rem" }} />
            <col />
            <col style={{ width: "9.5rem" }} />
            <col style={{ width: "9rem" }} />
            <col style={{ width: "5rem" }} />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-[var(--surface-sunken)]">
            <tr className="text-left">
              <Cabecera campo="fecha" label="Fecha" orden={orden} alternarOrden={alternarOrden} />
              <Cabecera campo="source" label="Origen" orden={orden} alternarOrden={alternarOrden} />
              <Cabecera campo="category" label="Categoría" orden={orden} alternarOrden={alternarOrden} />
              <th scope="col" className="px-4 py-2.5 text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Descripción
              </th>
              <Cabecera campo="estadoPago" label="Pago" orden={orden} alternarOrden={alternarOrden} />
              <Cabecera campo="amount" label="Monto" orden={orden} alternarOrden={alternarOrden} alinear="right" />
              <th scope="col" className="px-4 py-2.5 text-right text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                <span className="sr-only">Acciones</span>
              </th>
            </tr>
          </thead>

          {grupos.map((grupo) => (
            <tbody key={grupo.clave}>
              {agrupaPorMes && (
                <tr className="bg-[var(--surface-sunken)]/60">
                  <th
                    scope="colgroup"
                    colSpan={5}
                    className="px-4 py-2 text-left text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]"
                  >
                    {grupo.label}
                    <span className="ml-2 font-semibold normal-case tracking-normal text-[var(--text-secondary)]">
                      {grupo.items.length} {grupo.items.length === 1 ? "movimiento" : "movimientos"}
                      {/* El subtotal es de GASTOS: si el mes tiene adelantos o
                          retiros, la cuenta de filas y el número no coinciden,
                          y hay que decir por qué. */}
                      {grupo.gastos !== grupo.items.length && ` · ${grupo.gastos} ${grupo.gastos === 1 ? "es gasto" : "son gasto"}`}
                    </span>
                  </th>
                  <td className="px-4 py-2 text-right text-sm font-bold tabular-nums text-[var(--text-secondary)]">
                    {fmt(grupo.total)}
                  </td>
                  <td />
                </tr>
              )}
              {grupo.items.map((item) => {
                const meta = SOURCE_META[item.source];
                const Icon = meta.icon;
                return (
                  <tr
                    key={item.id}
                    className="border-t border-[var(--rule-soft)] transition-colors hover:bg-[var(--surface-sunken)]/50"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-[var(--text-secondary)]">{formatDate(item.fecha)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: meta.tone }}>
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{meta.label}</span>
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge variant="neutral" label={item.category} />
                    </td>
                    <td className="px-4 py-3 text-[var(--text-primary)]">
                      <span className="block truncate">{item.description || "—"}</span>
                      {/* Quién está del otro lado y, en un adelanto, cuánto de
                          eso todavía no volvió. El saldo venía escrito dentro
                          de la descripción y sin signo de soles: «queda por
                          devolver 450.00» competía con el código del adelanto
                          por el mismo renglón truncado. */}
                      {(item.supplierName || item.saldoPendiente) && (
                        <span className="block truncate text-sm text-[var(--text-secondary)]">
                          {item.supplierName}
                          {item.supplierName && item.saldoPendiente ? " · " : ""}
                          {item.saldoPendiente ? (
                            <span className="font-semibold text-[var(--data-warning-ink)]">
                              debe {fmt(item.saldoPendiente)}
                            </span>
                          ) : null}
                        </span>
                      )}
                      {/* El aviso de duplicado va acá y no en la columna de
                          monto: ahí no entra y se montaba sobre el botón. */}
                      {item.duplicaDe && (
                        <span className="block truncate text-sm font-semibold text-[var(--text-secondary)]">
                          Ya listado como {item.duplicaDe}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        variant={ESTADO_VARIANTE[item.estadoPago]}
                        label={ESTADO_PAGO_LABELS[item.estadoPago]}
                      />
                      {item.estadoPago === "parcial" && (
                        <span className="mt-0.5 block text-sm tabular-nums text-[var(--text-secondary)]">
                          {fmt(item.montoPagado)} de {fmt(item.amount)}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      {/* Un anticipo o un retiro de caja se listan pero no
                          suman al total: el monto va atenuado y dicho, para
                          que nadie lo sume mentalmente con los de arriba. */}
                      <span className={cn(
                        "font-bold tabular-nums",
                        item.clase === "gasto" ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]",
                      )}>
                        {fmt(item.amount)}
                      </span>
                      {item.clase !== "gasto" && (
                        <span className="block text-sm text-[var(--text-secondary)]">no suma</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => onAbrir(item)}
                        className="rounded-lg border-2 border-[var(--rule-base)] px-2.5 py-1 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-primary/40 hover:text-primary"
                      >
                        Ver
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          ))}

          <tfoot className="sticky bottom-0 border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
            <tr>
              <th scope="row" colSpan={4} className="px-4 py-3 text-left text-sm font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Total de lo que se ve
                <span className="ml-2 font-semibold normal-case tracking-normal text-[var(--text-secondary)]">
                  {resumen.cantidad} {resumen.cantidad === 1 ? "movimiento" : "movimientos"}
                </span>
              </th>
              <td className="px-4 py-3 text-sm font-semibold tabular-nums text-[var(--text-secondary)]">
                {fmt(resumen.pagado)} pagado
              </td>
              <td className="px-4 py-3 text-right text-base font-extrabold tabular-nums text-[var(--text-primary)]">
                {fmt(resumen.total)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {visibles < totalFilas && (
        <div className="flex items-center justify-center gap-3 border-t border-[var(--rule-soft)] px-4 py-3">
          <p className="text-sm text-[var(--text-secondary)]">
            Mostrando {visibles} de {totalFilas}
          </p>
          <button
            type="button"
            onClick={verMas}
            className="inline-flex h-10 items-center rounded-lg border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
          >
            Ver más
          </button>
        </div>
      )}
    </div>
  );
}
