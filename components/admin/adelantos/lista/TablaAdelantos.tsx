"use client";

/**
 * El listado de adelantos dados.
 *
 * Antes eran cinco columnas y todas las filas de una: el código de operación
 * vivía apretado bajo el nombre, la fecha y la modalidad no aparecían en ningún
 * lado, y el motivo escrito al dar la plata sólo se veía abriendo el adelanto.
 * Con 39 filas ya era un muro; sin orden ni paginado, con 500 es inusable.
 */

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Plus } from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import {
  type ColumnaOrden,
  type Direccion,
  avanceDe,
  ordenarAdelantos,
  paginar,
  siguienteOrden,
} from "@/lib/adelantos/ordenar-lista";
import { MODALIDAD_LABEL, STATUS_BADGE, fmtMon } from "../shared";

/** Cómo se abrevia cada modalidad en una celda. El título largo va en `title`. */
const MODALIDAD_CHIP: Record<string, string> = {
  CUENTA_CORRIENTE: "Cta. corriente",
  ENTREGAS_PACTADAS: "Pactadas",
  DESCUENTO_PLANILLA: "Planilla",
};

const fechaCelda = (iso: string) =>
  new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "2-digit" });

export default function TablaAdelantos({
  adelantos,
  orden,
  onOrden,
  pagina,
  onPagina,
  porPagina,
  onVerDetalle,
}: {
  adelantos: DbAdelanto[];
  orden: { columna: ColumnaOrden; direccion: Direccion };
  onOrden: (o: { columna: ColumnaOrden; direccion: Direccion }) => void;
  pagina: number;
  onPagina: (p: number) => void;
  porPagina: number;
  onVerDetalle: (a: DbAdelanto) => void;
}) {
  const ordenados = ordenarAdelantos(adelantos, orden.columna, orden.direccion);
  const pag = paginar(ordenados, pagina, porPagina);

  const th = (columna: ColumnaOrden, label: string, alineado?: "right") => (
    <th className={`px-3 py-2.5 ${alineado === "right" ? "text-right" : "text-left"}`} aria-sort={ariaSort(orden, columna)}>
      <button
        type="button"
        onClick={() => onOrden(siguienteOrden(orden, columna))}
        className={`inline-flex items-center gap-1 font-bold transition-colors hover:text-[var(--text-primary)] ${
          orden.columna === columna ? "text-[var(--text-primary)]" : ""
        }`}
      >
        {label}
        <IconoOrden activo={orden.columna === columna} direccion={orden.direccion} />
      </button>
    </th>
  );

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        {/* min-w-[1000px] es clase muerta acá (memoria min-width-utilities-muertas) —
            entre 640-999px (tablet, o desktop angosto con sidebar) la tabla se apretaba
            en vez de forzar el scroll horizontal del wrapper. Bajo 640px no importa:
            .admin-mobile-cards la convierte en cards (globals.css). */}
        <DataTable className="w-full text-base" style={{ minWidth: 1000 }}>
          <thead className="bg-[var(--surface-sunken)] text-sm text-[var(--text-tertiary)]">
            <tr>
              {th("codigo", "Código")}
              {th("persona", "Persona")}
              {th("fecha", "Fecha")}
              <th className="px-3 py-2.5 text-left font-bold">Liquidación</th>
              <th className="px-3 py-2.5 text-left font-bold">Motivo</th>
              {th("monto", "Adelantado", "right")}
              {th("avance", "Avance", "right")}
              {th("saldo", "Saldo", "right")}
              {th("estado", "Estado")}
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--rule-soft)]">
            {pag.items.map((a) => {
              const badge = STATUS_BADGE[a.status];
              const pct = avanceDe(a);
              const cumplidas = a.entregasPactadas.filter((p) => p.cumplidaEn).length;
              return (
                <tr
                  key={a.id}
                  onClick={() => onVerDetalle(a)}
                  className="cursor-pointer transition-colors hover:bg-[var(--surface-sunken)]/50"
                >
                  {/* El código, en su propia columna y ordenable: es como se
                      identifica el adelanto por teléfono. */}
                  <td className="px-3 py-2.5">
                    <span className="block font-mono text-sm font-bold text-[var(--text-primary)]">
                      {a.codigoOperacion ?? "—"}
                    </span>
                    {a.reciboManual && (
                      <span className="block font-mono text-xs text-[var(--text-tertiary)]" title="N° del recibo de papel">
                        recibo {a.reciboManual}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="block font-bold text-[var(--text-primary)]">{a.beneficiario?.nombre ?? "—"}</span>
                    {a.beneficiario?.telefono && (
                      <span className="block text-xs tabular-nums text-[var(--text-tertiary)]">{a.beneficiario.telefono}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-sm tabular-nums text-[var(--text-secondary)]">
                    {fechaCelda(a.fechaAdelanto)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      title={MODALIDAD_LABEL[a.modalidad] ?? a.modalidad}
                      className="inline-block whitespace-nowrap rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)]"
                    >
                      {MODALIDAD_CHIP[a.modalidad] ?? a.modalidad}
                    </span>
                    {a.entregasPactadas.length > 0 && (
                      <span className="ml-1.5 text-xs font-bold tabular-nums text-[var(--text-tertiary)]">
                        {cumplidas}/{a.entregasPactadas.length}
                      </span>
                    )}
                  </td>
                  {/* El motivo con el que se dio la plata: antes había que abrir
                      el adelanto para verlo, uno por uno. */}
                  <td className="max-w-[220px] px-3 py-2.5">
                    <span className="block truncate text-sm text-[var(--text-secondary)]" title={a.notas ?? undefined}>
                      {a.notas || <span className="text-[var(--text-tertiary)]">—</span>}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                    {fmtMon(a.montoAdelantado, a.moneda)}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <div className="h-2.5 w-16 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                        <div className="h-full rounded-full bg-[var(--data-success)]" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-9 text-right text-sm font-semibold tabular-nums text-[var(--text-tertiary)]">{pct}%</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right font-bold tabular-nums text-[var(--text-primary)]">
                    {fmtMon(a.saldoPendiente, a.moneda)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${badge?.className ?? ""}`}>
                      {badge?.label ?? a.status}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {a.status === "ABIERTO" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onVerDetalle(a); }}
                        className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-xl border-2 border-primary px-3 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:bg-primary/10 dark:text-[var(--accent)]"
                      >
                        <Plus className="h-4 w-4" /> Entrega
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      </div>

      {/* Sin paginador cuando todo entra en una página: un control que nunca
          cambia nada es ruido. */}
      {pag.totalPaginas > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-[var(--text-secondary)] tabular-nums">
            {pag.desde}–{pag.hasta} de {pag.total}
          </p>
          <div className="flex items-center gap-1.5">
            <BotonPagina onClick={() => onPagina(pag.pagina - 1)} disabled={pag.pagina <= 1} label="Página anterior">
              <ChevronLeft className="h-4 w-4" />
            </BotonPagina>
            <span className="px-2 text-sm font-bold tabular-nums text-[var(--text-secondary)]">
              {pag.pagina} / {pag.totalPaginas}
            </span>
            <BotonPagina onClick={() => onPagina(pag.pagina + 1)} disabled={pag.pagina >= pag.totalPaginas} label="Página siguiente">
              <ChevronRight className="h-4 w-4" />
            </BotonPagina>
          </div>
        </div>
      )}
    </div>
  );
}

function ariaSort(
  orden: { columna: ColumnaOrden; direccion: Direccion },
  columna: ColumnaOrden,
): "ascending" | "descending" | "none" {
  if (orden.columna !== columna) return "none";
  return orden.direccion === "asc" ? "ascending" : "descending";
}

function IconoOrden({ activo, direccion }: { activo: boolean; direccion: Direccion }) {
  if (!activo) return <ArrowUpDown className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />;
  return direccion === "asc" ? (
    <ArrowUp className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
  ) : (
    <ArrowDown className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
  );
}

function BotonPagina({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] disabled:opacity-40 dark:hover:text-[var(--accent)]"
    >
      {children}
    </button>
  );
}
