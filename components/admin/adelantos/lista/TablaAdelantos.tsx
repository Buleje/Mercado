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
      <div ref={wrapRef} className="relative">
        <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
          {/* min-w-[1000px] es clase muerta acá (memoria min-width-utilities-muertas) —
              entre 640-999px (tablet, o desktop angosto con sidebar) la tabla se apretaba
              en vez de forzar el scroll horizontal del wrapper. `.tabla-min-w-1000`
              (globals.css) hace lo mismo que un `style={{minWidth:1000}}` pero SÓLO
              desde 640px — un inline sin media query rompía `.admin-mobile-cards`
              bajo 640px: el ancho nunca bajaba de 1000px y cada valor de la tarjeta
              quedaba empujado fuera de la pantalla (Brandon 2026-08-26: "se ve
              desbordada"). */}
          <DataTable className="w-full text-base tabla-min-w-1000">
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
                        identifica el adelanto por teléfono. `sm:whitespace-nowrap`
                        SÓLO desde 640px — sin esto "ADL-2026-0022" partía en tres
                        líneas y el algoritmo de columnas de la tabla le sacaba
                        todo el ancho a esta celda para dárselo a otra (Brandon
                        2026-08-26: "se ve desbordada"). Plano (sin `sm:`) rompía
                        la tarjeta mobile: el código y "recibo XXX" son DOS spans
                        hermanos que `.admin-mobile-cards` pone en fila, y forzar
                        nowrap en los dos a la vez los hacía superponerse en una
                        pantalla angosta. */}
                    <td className="sm:whitespace-nowrap px-3 py-2.5">
                      <span className="block font-mono text-sm font-bold text-[var(--text-primary)]">
                        {a.codigoOperacion ?? "—"}
                      </span>
                      {a.reciboManual && (
                        <span className="block font-mono text-xs text-[var(--text-tertiary)]" title="N° del recibo de papel">
                          recibo {a.reciboManual}
                        </span>
                      )}
                    </td>
                    <td className="sm:whitespace-nowrap px-3 py-2.5">
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
                        el adelanto para verlo, uno por uno. 170px (no 220) para
                        no ser la columna más ancha de la tabla — el nombre completo
                        sigue en el `title` al pasar el mouse. */}
                    <td className="max-w-[170px] px-3 py-2.5">
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
