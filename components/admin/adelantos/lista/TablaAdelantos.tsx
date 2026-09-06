"use client";

/**
 * El listado de adelantos dados.
 *
 * Antes eran cinco columnas y todas las filas de una: el código de operación
 * vivía apretado bajo el nombre, la fecha y la modalidad no aparecían en ningún
 * lado, y el motivo escrito al dar la plata sólo se veía abriendo el adelanto.
 * Con 39 filas ya era un muro; sin orden ni paginado, con 500 es inusable.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Ban,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  Plus,
  Ruler,
} from "@buleje/design-system/icons";
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
import { MODALIDAD_LABEL, PT_TIPO_LABEL, STATUS_BADGE, fmtMon, fmtPt } from "../shared";
import AnularAdelantoModal from "./AnularAdelantoModal";
import EditarNotasModal from "./EditarNotasModal";

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
  onChange,
}: {
  adelantos: DbAdelanto[];
  orden: { columna: ColumnaOrden; direccion: Direccion };
  onOrden: (o: { columna: ColumnaOrden; direccion: Direccion }) => void;
  pagina: number;
  onPagina: (p: number) => void;
  porPagina: number;
  onVerDetalle: (a: DbAdelanto) => void;
  /** Refresca la lista tras anular o editar notas desde la fila. */
  onChange: () => void;
}) {
  const ordenados = ordenarAdelantos(adelantos, orden.columna, orden.direccion);
  const pag = paginar(ordenados, pagina, porPagina);

  /** Cuál fila tiene abierto qué acción — un solo modal a la vez. */
  const [anulando, setAnulando] = useState<DbAdelanto | null>(null);
  const [editandoNotas, setEditandoNotas] = useState<DbAdelanto | null>(null);

  /**
   * Mismo patrón que AdminTabBar (checkScroll + canScrollLeft/Right), pero acá
   * el resultado es un degradé pointer-events-none, no un botón: las filas ya
   * son clickeables (onVerDetalle) y un botón de ancho completo en el borde
   * les habría robado ese margen para hacer scroll en vez de abrir el detalle.
   *
   * `<DataTable>` ya envuelve el `<table>` en SU PROPIO div overflow-x-auto
   * (data-display.tsx) — el nuestro, por fuera, es un segundo nivel que no es
   * el que realmente scrollea (el scroll nativo lo hace el de adentro; el de
   * afuera nunca desborda porque overflow-x-auto no deja que el hijo lo
   * empuje). Por eso el chequeo va por `table.parentElement`, no por el ref
   * del div de afuera — y el listener de scroll se ata a mano (con
   * addEventListener) porque el evento `scroll` no burbujea: un `onScroll`
   * en el div de afuera nunca se entera de lo que pasa adentro.
   */
  const wrapRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = wrapRef.current?.querySelector("table")?.parentElement;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = wrapRef.current?.querySelector("table")?.parentElement;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll);
    window.addEventListener("resize", checkScroll);
    return () => {
      el.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
    // Re-chequea si cambia la página: el ancho de la tabla no depende de las
    // filas, pero el navegador puede resetear scrollLeft a 0 al re-renderizar.
  }, [checkScroll, pag.pagina]);

  const th = (columna: ColumnaOrden, label: string, alineado?: "right") => (
    <th className={`px-2.5 py-2.5 ${alineado === "right" ? "text-right" : "text-left"}`} aria-sort={ariaSort(orden, columna)}>
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
      <div ref={wrapRef} className="relative">
        <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          {/* `min-width` en una tabla `table-layout: auto` (el default de
              DataTable) NO limita nada: el navegador igual calcula el ancho
              real a partir del contenido — el `.tabla-min-w-1000` viejo sólo
              ponía un PISO, nunca un TECHO, así que "Adelantado" ADL-2026-0022
              con nombre + chips igual empujaba la tabla a ~1000px reales y
              forzaba scroll aunque el piso bajara (medido acá mismo: 780px de
              piso, 998px reales). El fix real es `table-layout: fixed` +
              anchos explícitos por `<col>` (Brandon 2026-08-28: "evitar el
              scroll a los lados") — Persona es la ÚNICA columna sin ancho
              fijo, así que absorbe el espacio sobrante y el resto trunca con
              `truncate`/`title` en vez de forzar overflow. */}
          <DataTable className="w-full table-fixed text-base">
            <colgroup>
              <col style={{ width: 148 }} />
              <col />
              <col style={{ width: 70 }} />
              <col className="hidden xl:table-column" style={{ width: 128 }} />
              <col style={{ width: 98 }} />
              <col style={{ width: 88 }} />
              <col style={{ width: 98 }} />
              <col style={{ width: 72 }} />
              <col style={{ width: 145 }} />
            </colgroup>
            <thead className="bg-[var(--surface-sunken)] text-sm text-[var(--text-tertiary)]">
              <tr>
                {th("codigo", "Código")}
                {th("persona", "Persona")}
                {th("fecha", "Fecha")}
                <th className="hidden px-2.5 py-2.5 text-left font-bold xl:table-cell">Motivo</th>
                {th("monto", "Adelantado", "right")}
                {th("avance", "Avance", "right")}
                {th("saldo", "Saldo", "right")}
                {th("estado", "Estado")}
                <th className="px-2.5 py-2.5" />
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
                        identifica el adelanto por teléfono. `sm:whitespace-nowrap`
                        SÓLO desde 640px — sin esto "ADL-2026-0022" partía en tres
                        líneas y el algoritmo de columnas de la tabla le sacaba
                        todo el ancho a esta celda para dárselo a otra (Brandon
                        2026-08-26: "se ve desbordada"). Plano (sin `sm:`) rompía
                        la tarjeta mobile: el código y "recibo XXX" son DOS spans
                        hermanos que `.admin-mobile-cards` pone en fila, y forzar
                        nowrap en los dos a la vez los hacía superponerse en una
                        pantalla angosta. */}
                    <td className="px-2.5 py-2.5">
                      <span className="block truncate font-mono text-sm font-bold text-[var(--text-primary)]" title={a.codigoOperacion ?? undefined}>
                        {a.codigoOperacion ?? "—"}
                      </span>
                      {a.reciboManual && (
                        <span className="block truncate font-mono text-xs text-[var(--text-tertiary)]" title={`N° del recibo de papel — recibo ${a.reciboManual}`}>
                          recibo {a.reciboManual}
                        </span>
                      )}
                      {/* Liquidación bajó de columna propia a chip acá (Brandon
                          2026-08-28): la modalidad se lee junto al código, no en
                          una columna aparte que sólo repetía info de la fila. */}
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <span
                          title={MODALIDAD_LABEL[a.modalidad] ?? a.modalidad}
                          className="inline-block whitespace-nowrap rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]"
                        >
                          {MODALIDAD_CHIP[a.modalidad] ?? a.modalidad}
                          {a.entregasPactadas.length > 0 && ` · ${cumplidas}/${a.entregasPactadas.length}`}
                        </span>
                        {a.piesTablares != null && a.piesTablaresTipo && (
                          <span
                            title={`${PT_TIPO_LABEL[a.piesTablaresTipo] ?? a.piesTablaresTipo} · ${fmtPt(a.piesTablares)}`}
                            className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"
                          >
                            <Ruler className="h-3 w-3" aria-hidden /> {fmtPt(a.piesTablares)}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-2.5 py-2.5">
                      <span className="block truncate font-bold text-[var(--text-primary)]" title={a.beneficiario?.nombre ?? undefined}>
                        {a.beneficiario?.nombre ?? "—"}
                      </span>
                      {a.beneficiario?.telefono && (
                        <span className="block truncate text-xs tabular-nums text-[var(--text-tertiary)]">{a.beneficiario.telefono}</span>
                      )}
                    </td>
                    <td className="truncate px-2.5 py-2.5 text-sm tabular-nums text-[var(--text-secondary)]">
                      {fechaCelda(a.fechaAdelanto)}
                    </td>
                    {/* El motivo con el que se dio la plata: sigue en el `title`
                        siempre; la columna en pantalla sólo aparece desde `xl:`
                        (≥1280px) — es el dato menos urgente de la fila, y forzar
                        su ancho en pantallas normales era lo que empujaba a la
                        tabla entera al scroll horizontal. */}
                    <td className="hidden max-w-[130px] px-2.5 py-2.5 xl:table-cell">
                      <span className="block truncate text-sm text-[var(--text-secondary)]" title={a.notas ?? undefined}>
                        {a.notas || <span className="text-[var(--text-tertiary)]">—</span>}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2.5 text-right tabular-nums text-[var(--text-secondary)]">
                      {fmtMon(a.montoAdelantado, a.moneda)}
                    </td>
                    <td className="px-2.5 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <div className="h-2.5 w-10 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                          <div className="h-full rounded-full bg-[var(--data-success)]" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-8 text-right text-sm font-semibold tabular-nums text-[var(--text-tertiary)]">{pct}%</span>
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2.5 text-right font-bold tabular-nums text-[var(--text-primary)]">
                      {fmtMon(a.saldoPendiente, a.moneda)}
                    </td>
                    <td className="px-2.5 py-2.5">
                      <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${badge?.className ?? ""}`}>
                        {badge?.label ?? a.status}
                      </span>
                    </td>
                    <td className="px-2.5 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {a.status === "ABIERTO" && (
                          <button
                            onClick={() => onVerDetalle(a)}
                            className="inline-flex h-9 items-center gap-1 whitespace-nowrap rounded-xl border-2 border-primary px-3 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:bg-primary/10 dark:text-[var(--accent)]"
                          >
                            <Plus className="h-4 w-4" /> Entrega
                          </button>
                        )}
                        <FilaAcciones
                          adelanto={a}
                          onEditarNotas={() => setEditandoNotas(a)}
                          onAnular={() => setAnulando(a)}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        </div>
        {canScrollLeft && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-0 w-8 rounded-l-xl bg-linear-to-r from-[var(--surface-raised)] to-transparent"
          />
        )}
        {canScrollRight && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-xl bg-linear-to-l from-[var(--surface-raised)] to-transparent"
          />
        )}
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

      {anulando && (
        <AnularAdelantoModal
          adelantoId={anulando.id}
          persona={anulando.beneficiario?.nombre ?? "—"}
          monto={anulando.montoAdelantado}
          moneda={anulando.moneda}
          onClose={() => setAnulando(null)}
          onAnulado={() => { setAnulando(null); onChange(); }}
        />
      )}
      {editandoNotas && (
        <EditarNotasModal
          adelantoId={editandoNotas.id}
          notasActuales={editandoNotas.notas ?? null}
          onClose={() => setEditandoNotas(null)}
          onGuardado={() => { setEditandoNotas(null); onChange(); }}
        />
      )}
    </div>
  );
}

/** Menú de "otros útiles" por fila — editar el motivo y anular, que ya vivían
 *  en el backend (`PATCH /api/adelantos/[id]`) sin ninguna pantalla que los
 *  llamara fuera del detalle. `stopPropagation` en el trigger: la fila entera
 *  es clickeable (abre el detalle) y el menú no puede competir con eso. */
function FilaAcciones({
  adelanto,
  onEditarNotas,
  onAnular,
}: {
  adelanto: DbAdelanto;
  onEditarNotas: () => void;
  onAnular: () => void;
}) {
  const bloqueado = adelanto.status === "CANCELADO";
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label="Más acciones"
          title="Más acciones"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
        >
          <MoreHorizontal className="h-4.5 w-4.5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          onClick={(e) => e.stopPropagation()}
          className="z-50 min-w-[12rem] overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-xl)]"
        >
          <DropdownMenu.Item
            onSelect={onEditarNotas}
            className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-semibold text-[var(--text-primary)] outline-none data-[highlighted]:bg-[var(--surface-sunken)]"
          >
            <Pencil className="h-4 w-4 shrink-0 text-[var(--text-secondary)]" /> Editar motivo / notas
          </DropdownMenu.Item>
          {!bloqueado && (
            <DropdownMenu.Item
              onSelect={onAnular}
              className="flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-sm font-semibold text-[var(--data-error)] outline-none data-[highlighted]:bg-[var(--data-error)]/10"
            >
              <Ban className="h-4 w-4 shrink-0" /> Anular adelanto
            </DropdownMenu.Item>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
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
