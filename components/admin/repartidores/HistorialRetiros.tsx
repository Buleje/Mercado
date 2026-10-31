"use client";

import { CardTitle, DataTable } from "@buleje/design-system";
import { Download, MoreHorizontal, RotateCcw, X } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { BOTON, CLASE_CAMPO } from "@/components/admin/rrhh/rrhh-form";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { leerNotaRetiro } from "@/lib/delivery/retiros-conciliacion";
import { formatCurrency, formatDateTimeShort } from "@/lib/format";
import { cn, limaDateKey } from "@/lib/utils";
import { ChipEstadoRetiro } from "./retiros-estado";
import { FILTROS_INICIALES, type DatosRetiros, type FiltroHistorial, type FiltrosHistorial, type RetiroFila } from "./use-retiros";

/**
 * Historial de retiros conciliable (17-10, P35). Antes: «Todos / Pagados /
 * Rechazados» sobre los últimos 60, con la nota pegada en una línea y sin
 * fechas, repartidor ni exportar. Ahora: rango de días y repartidor (filtra la
 * base), medio y N.° de operación en su columna, el motivo del rechazo con qué
 * sigue, totales de TODAS las filas del rango y CSV con los mismos filtros.
 */

const VACIO: Record<FiltroHistorial, string> = {
  todos: "Ningún retiro resuelto con estos filtros.",
  paid: "Ningún retiro pagado con estos filtros.",
  rejected: "Ningún retiro rechazado con estos filtros.",
};

interface Props {
  filas: RetiroFila[];
  totales: DatosRetiros["totales"] | undefined;
  filtros: FiltrosHistorial;
  onFiltros: (f: FiltrosHistorial) => void;
  repartidores: { id: string; name: string }[];
  puedeResolver: boolean;
  /** Las filas de una alerta (P36): se muestran sólo ésas. */
  soloIds: { ids: Set<string>; titulo: string } | null;
  onVerTodo: () => void;
  onDeshacer: (r: RetiroFila) => void;
  onExportar: () => void;
  exportando: boolean;
}

function Medio({ r }: { r: RetiroFila }) {
  const n = leerNotaRetiro(r.status, r.note);
  if (r.status !== "paid") return <span className="text-[var(--text-tertiary)]">—</span>;
  if (!n.metodo) return <span className="text-[var(--text-tertiary)]">{n.libre ? "—" : "Sin anotar"}</span>;
  return (
    <span>
      {n.metodo}
      {n.deCaja && <span className="text-[var(--text-tertiary)]"> · de la caja</span>}
      {n.referencia ? (
        <span className="block font-mono text-sm tabular-nums text-[var(--text-secondary)]">{n.referencia}</span>
      ) : n.metodo !== "Efectivo" ? (
        <span className="block text-sm text-[var(--data-warning-700)]">Sin N.° de operación</span>
      ) : null}
    </span>
  );
}

function Motivo({ r }: { r: RetiroFila }) {
  const n = leerNotaRetiro(r.status, r.note);
  if (r.status === "rejected") {
    return (
      <span>
        {n.motivo ?? "Sin motivo anotado"}
        <span className="block text-sm text-[var(--text-tertiary)]">La plata volvió a su saldo: puede pedirla de nuevo.</span>
      </span>
    );
  }
  return <span className="text-[var(--text-secondary)]">{n.libre ?? "—"}</span>;
}

export function HistorialRetiros(p: Props) {
  const { filtros, onFiltros, totales } = p;
  const hoy = limaDateKey();
  const conFiltros = filtros.desde || filtros.hasta || filtros.partnerId;
  const filas = p.soloIds ? p.filas.filter((r) => p.soloIds?.ids.has(r.id)) : p.filas;
  const poner = (cambio: Partial<FiltrosHistorial>) => onFiltros({ ...filtros, ...cambio });

  return (
    <section className="space-y-2" aria-labelledby="historial-retiros">
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle id="historial-retiros">Historial</CardTitle>
        <InfoTip
          title="Historial conciliable"
          what="Los retiros pagados y rechazados, por el día en que se resolvieron. Los totales suman TODAS las filas del rango, no sólo las que ves."
          affects="El CSV baja las mismas filas (hasta 2000) con fecha, repartidor, medio, N.° de operación y motivo, para cruzarlo con tu Yape o tu banco."
          example="Del 01/10 al 15/10, sólo Juan: ves sus pagos y el total pagado en ese rango."
        />
        <SegmentedControl<FiltroHistorial>
          value={filtros.historial}
          onChange={(historial) => poner({ historial })}
          label="Qué retiros ver en el historial"
          size="lg"
          className="ml-auto"
          options={[
            { value: "todos", label: "Todos" },
            { value: "paid", label: "Pagados" },
            { value: "rejected", label: "Rechazados" },
          ]}
        />
        <ActionMenu
          label="Más opciones del historial"
          icon={MoreHorizontal}
          soloIcono
          className="w-12"
          actions={[
            {
              id: "csv",
              label: "Exportar CSV",
              hint: "Las filas con estos filtros, para Excel",
              icon: Download,
              busy: p.exportando,
              onSelect: p.onExportar,
            },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--text-secondary)]">
          Desde
          <input type="date" value={filtros.desde} max={filtros.hasta || hoy} onChange={(e) => poner({ desde: e.target.value })} className={cn(CLASE_CAMPO, "w-44")} data-qa="retiros-desde" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--text-secondary)]">
          Hasta
          <input type="date" value={filtros.hasta} min={filtros.desde || undefined} max={hoy} onChange={(e) => poner({ hasta: e.target.value })} className={cn(CLASE_CAMPO, "w-44")} data-qa="retiros-hasta" />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-[var(--text-secondary)]">
          Repartidor
          <select value={filtros.partnerId} onChange={(e) => poner({ partnerId: e.target.value })} className={cn(CLASE_CAMPO, "w-56")} data-qa="retiros-repartidor">
            <option value="">Todos</option>
            {p.repartidores.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
        {conFiltros && (
          <button type="button" onClick={() => onFiltros({ ...FILTROS_INICIALES, historial: filtros.historial })} className={BOTON.fantasma}>
            <X className="h-4 w-4" aria-hidden /> Quitar filtros
          </button>
        )}
      </div>

      {totales && (
        <p className="text-sm tabular-nums text-[var(--text-secondary)]" data-qa="retiros-totales">
          Mostrando {filas.length} de {p.soloIds ? p.soloIds.ids.size : totales.filas}
          {" · "}Pagados {formatCurrency(totales.pagados.monto)} ({totales.pagados.cantidad})
          {" · "}Rechazados {formatCurrency(totales.rechazados.monto)} ({totales.rechazados.cantidad})
        </p>
      )}
      {p.soloIds && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl bg-[var(--data-warning-100)] px-3 py-2 text-sm text-[var(--data-warning-700)]">
          Sólo las filas de «{p.soloIds.titulo}».
          <button type="button" onClick={p.onVerTodo} className="h-12 font-bold underline">
            Ver todo el historial
          </button>
        </p>
      )}

      {filas.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)]">{VACIO[filtros.historial]}</p>
      ) : (
        <div className="overflow-x-auto">
          <DataTable className="w-full">
            <thead>
              <tr>
                <th>Resuelto</th>
                <th>Repartidor</th>
                <th className="text-center">Estado</th>
                <th className="text-right">Monto</th>
                <th>Medio y N.° de operación</th>
                <th>Motivo</th>
                {p.puedeResolver && <th data-label="Acciones" aria-label="Acciones" />}
              </tr>
            </thead>
            <tbody>
              {filas.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap tabular-nums">{formatDateTimeShort(r.resolvedAt ?? r.createdAt)}</td>
                  <td>
                    <span className="font-semibold text-[var(--text-primary)]">{r.partnerName}</span>
                    <span className="block text-sm text-[var(--text-tertiary)]">pidió el {formatDateTimeShort(r.createdAt)}</span>
                  </td>
                  <td className="text-center">
                    <ChipEstadoRetiro status={r.status} />
                  </td>
                  <td className="text-right font-semibold tabular-nums">{formatCurrency(r.amount)}</td>
                  <td>
                    <Medio r={r} />
                  </td>
                  <td className="max-w-xs">
                    <Motivo r={r} />
                  </td>
                  {p.puedeResolver && (
                    <td className="text-right">
                      {r.status === "paid" && (
                        <ActionMenu
                          label="Más acciones"
                          icon={MoreHorizontal}
                          soloIcono
                          className="w-12"
                          actions={[
                            {
                              id: "deshacer",
                              label: "Deshacer pago",
                              hint: "Borra el gasto y vuelve a «por pagar»",
                              icon: RotateCcw,
                              tone: "danger",
                              onSelect: () => p.onDeshacer(r),
                            },
                          ]}
                        />
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      )}
    </section>
  );
}
