"use client";

/** Tabla de lotes de Acopio (escritorio): columnas arrastrables, orden por título y autofiltro de Variedad y Grado. */
import { ArrowUp, ArrowDown, ArrowUpDown, Trees, Ban, Wallet } from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import { FiltroColumnaMulti } from "@/components/admin/shared/filtros-columna";
import { EnOrden, type useOrdenColumnas } from "@/components/admin/shared/columnas-ordenables";
import { IconAction } from "@/components/admin/shared/module-primitives";
import type { FacetaOpcion } from "@/lib/admin/filtros-columna";
import { GRADO_LABEL, ESTADO_PAGO_LABEL, type CacaoGrado, type CacaoEstadoPago } from "@/lib/cacao/cacao-quality";
import { formatCurrency } from "@/lib/format";
import { SIN_GRADO, fdate, n2, saldoDe, tienePendiente, type Lote, type SortKey } from "./columnas-filtro-acopio";

export interface TablaAcopioProps {
  rows: Lote[];
  rowTotals: { kg: number; liquidacion: number; saldo: number };
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (k: SortKey) => void;
  ordenAcopio: ReturnType<typeof useOrdenColumnas>;
  varFilter: string[];
  onVarFilter: (v: string[]) => void;
  varOptions: FacetaOpcion[];
  gradoFilter: string[];
  onGradoFilter: (v: string[]) => void;
  gradoOptions: FacetaOpcion[];
  onOpenLote: (id: string) => void;
  onPagar: (l: Lote) => void;
  onAnular: (id: string) => void;
}

export default function TablaAcopio({ rows, rowTotals, sort, onSort, ordenAcopio, varFilter, onVarFilter, varOptions, gradoFilter, onGradoFilter, gradoOptions, onOpenLote, onPagar, onAnular }: TablaAcopioProps) {
  return (
      <div className="hidden overflow-x-auto rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] sm:block">
        <DataTable filtrable className="w-full">
          <thead ref={ordenAcopio.refCabecera}>
            <tr>
              <EnOrden
                orden={ordenAcopio.orden}
                celdas={{
                  lote: <Th col="lote">Lote</Th>,
                  fecha: <SortTh label="Fecha" col="fecha" sort={sort} onSort={onSort} className="hidden sm:table-cell" />,
                  productor: <Th col="productor">Productor</Th>,
                  variedad: (
                    <Th col="variedad" className="hidden md:table-cell">
                      <span className="block">Variedad</span>
                      <FiltroColumnaMulti
                        label="Variedad"
                        value={varFilter}
                        options={varOptions}
                        onChange={onVarFilter}
                        placeholder="Todas"
                      />
                    </Th>
                  ),
                  pesoKg: <SortTh label="Peso (kg)" col="pesoKg" sort={sort} onSort={onSort} align="right" />,
                  humedad: <Th col="humedad" className="hidden text-right sm:table-cell">Humedad</Th>,
                  grado: (
                    <Th col="grado" className="hidden md:table-cell">
                      <span className="block">Grado</span>
                      <FiltroColumnaMulti
                        label="Grado"
                        value={gradoFilter}
                        options={gradoOptions}
                        etiqueta={(v) => (v === SIN_GRADO ? "Sin clasificar" : GRADO_LABEL[v as CacaoGrado] ?? v)}
                        onChange={onGradoFilter}
                        placeholder="Todos"
                      />
                    </Th>
                  ),
                  totalPagado: <SortTh label="Liquidación" col="totalPagado" sort={sort} onSort={onSort} align="right" />,
                }}
              />
              <Th className="text-right">Acción</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((l) => {
              const annul = l.status === "anulado";
              return (
                <tr
                  key={l.id}
                  onClick={() => onOpenLote(l.id)}
                  tabIndex={0}
                  role="button"
                  aria-label={`Ver lote ${l.loteCode}`}
                  onKeyDown={(e) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpenLote(l.id); } }}
                  className={`cursor-pointer transition focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent)] ${annul ? "opacity-50" : ""}`}
                >
                  <EnOrden
                    orden={ordenAcopio.orden}
                    celdas={{
                      lote: (
                        <Td>
                          <span className="font-mono text-sm font-bold text-[var(--text-primary)]">
                            {l.loteCode}
                          </span>
                          {annul && (
                            <span className="ml-2 rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]">
                              ANULADO
                            </span>
                          )}
                        </Td>
                      ),
                      fecha: <Td className="hidden text-[var(--text-secondary)] sm:table-cell">{fdate(l.fecha)}</Td>,
                      productor: (
                        <Td className="font-medium text-[var(--text-primary)]">
                          {l.productorNombre ?? "—"}
                          {l.productorNombre && !l.productorId && (
                            <span
                              title="Productor no vinculado al padrón"
                              className="ml-1.5 inline-flex rounded bg-[var(--data-warning-100)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)]"
                            >
                              sin vincular
                            </span>
                          )}
                          {l.parcelaCodigo && (
                            <span
                              title={`Origen: sección ${l.parcelaCodigo} (Campo)`}
                              className="ml-1.5 inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent)]"
                            >
                              <Trees className="h-3 w-3" />origen {l.parcelaCodigo}
                            </span>
                          )}
                        </Td>
                      ),
                      variedad: (
                        <Td className="hidden text-[var(--text-secondary)] md:table-cell">
                          {l.variedad ?? "—"}{" "}
                          <span className="text-xs text-[var(--text-tertiary)]">
                            {l.tipoGrano === "humedo" ? "(húmedo)" : ""}
                          </span>
                        </Td>
                      ),
                      pesoKg: <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{n2(l.pesoKg)}</Td>,
                      humedad: (
                        <Td className="hidden text-right font-mono tabular-nums sm:table-cell">
                          <span
                            className={
                              l.humedadPct && Number(l.humedadPct) > 7
                                ? "text-[var(--data-warning-700)]"
                                : "text-[var(--text-secondary)]"
                            }
                          >
                            {l.humedadPct ? `${Number(l.humedadPct).toFixed(1)}%` : "—"}
                          </span>
                        </Td>
                      ),
                      grado: (
                        <Td className="hidden md:table-cell">
                          <GradoBadge grado={l.grado} />
                        </Td>
                      ),
                      totalPagado: (
                        <Td className="text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">
                              {l.totalPagado ? `S/ ${n2(l.totalPagado)}` : "—"}
                            </span>
                            {l.totalPagado && <PagoBadge estado={l.estadoPago} saldo={saldoDe(l)} />}
                          </div>
                        </Td>
                      ),
                    }}
                  />
                  <Td className="text-right">
                    {annul ? (
                      <span className="text-xs text-[var(--text-tertiary)]">—</span>
                    ) : (
                      // Íconos: la columna de acciones no debe pesar más que
                      // las ocho de datos (mismo criterio que los libros).
                      <div className="flex items-center justify-end gap-1">
                        {tienePendiente(l) && (
                          <IconAction
                            icon={Wallet}
                            tone="accent"
                            label={`Pagar al productor (debe S/ ${n2(saldoDe(l))})`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onPagar(l);
                            }}
                          />
                        )}
                        <IconAction
                          icon={Ban}
                          tone="danger"
                          label="Anular el lote (queda visible con su motivo)"
                          onClick={(e) => {
                            e.stopPropagation();
                            onAnular(l.id);
                          }}
                        />
                      </div>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]/60">
                <EnOrden
                  orden={ordenAcopio.orden}
                  celdas={{
                    lote: <Td className="font-bold text-[var(--text-secondary)]">Total · {rows.length} lote{rows.length === 1 ? "" : "s"}</Td>,
                    fecha: <Td className="hidden sm:table-cell" />,
                    productor: <Td />,
                    variedad: <Td className="hidden md:table-cell" />,
                    pesoKg: <Td className="text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">{n2(rowTotals.kg)}</Td>,
                    humedad: <Td className="hidden sm:table-cell" />,
                    grado: <Td className="hidden md:table-cell" />,
                    totalPagado: (
                      <Td className="text-right">
                        <div className="flex flex-col items-end gap-0.5">
                          <span className="font-mono font-bold tabular-nums text-[var(--text-primary)]">
                            S/ {n2(rowTotals.liquidacion)}
                          </span>
                          {rowTotals.saldo > 0 && (
                            <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)]">
                              S/ {n2(rowTotals.saldo)} por pagar
                            </span>
                          )}
                        </div>
                      </Td>
                    ),
                  }}
                />
                <Td />
              </tr>
            </tfoot>
          )}
        </DataTable>
      </div>
  );
}

function Th({ children, className, col }: { children: React.ReactNode; className?: string; col?: string }) {
  return (
    <th data-col={col} className={`font-bold ${className ?? ""}`}>
      {children}
    </th>
  );
}
function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={`${className ?? ""}`}>{children}</td>;
}
function SortTh({
  label,
  col,
  sort,
  onSort,
  align,
  className,
}: {
  label: string;
  col: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onSort: (k: SortKey) => void;
  align?: "right";
  className?: string;
}) {
  const active = sort.key === col;
  const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th data-col={col} className={`${align === "right" ? "text-right" : ""} ${className ?? ""}`}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={`inline-flex items-center gap-1 font-bold ${align === "right" ? "flex-row-reverse" : ""} ${active ? "text-[var(--accent)]" : "text-[var(--text-primary)] hover:text-[var(--accent)]"}`}
        aria-label={`Ordenar por ${label}`}
      >
        {label}
        <Icon className={`h-3.5 w-3.5 ${active ? "" : "opacity-40"}`} />
      </button>
    </th>
  );
}
export function PagoBadge({ estado, saldo }: { estado: string; saldo: number }) {
  const cls =
    estado === "pagado"
      ? "bg-[var(--data-success-100)] text-[var(--data-success-700)]"
      : estado === "parcial"
        ? "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]"
        : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]";
  const label = ESTADO_PAGO_LABEL[estado as CacaoEstadoPago] ?? estado;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={`rounded px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold ${cls}`}>{label}</span>
      {estado !== "pagado" && saldo > 0 && (
        <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)]">
          debe {formatCurrency(saldo)}
        </span>
      )}
    </span>
  );
}
export function GradoBadge({ grado }: { grado: string | null }) {
  if (!grado) return <span className="text-xs text-[var(--text-tertiary)]">sin clasificar</span>;
  const g = grado as CacaoGrado;
  const cls =
    g === "I"
      ? "bg-[var(--data-success-100)] text-[var(--data-success-700)]"
      : g === "II"
        ? "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]"
        : "bg-[var(--data-error-100)] text-[var(--data-error-700)]";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${cls}`}>
      {GRADO_LABEL[g] ?? grado}
    </span>
  );
}
