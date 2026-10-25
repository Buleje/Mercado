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
import { ArrowDownToLine, ChevronLeft, ChevronRight, Plus, Ruler } from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { FiltroEnCabecera, SinCoincidenciasFila, type FiltrosTabla } from "@/components/admin/forestal/filtros-tabla-forestal";
import {
  type ColumnaOrden,
  type Direccion,
  avanceDe,
  ordenarAdelantos,
  paginar,
  siguienteOrden,
} from "@/lib/adelantos/ordenar-lista";
import { ETIQUETA_CONCEPTO, quienDebe } from "@/lib/adelantos/direccion";
import { fmtPt as fmtPtEntero, ptYPrecioDelAdelanto } from "@/lib/adelantos/madera-adelanto";
import { leerDireccion } from "@/lib/adelantos/modos-alta";
import { MODALIDAD_LABEL, PT_TIPO_LABEL, STATUS_BADGE, fmtMon, fmtPt } from "../shared";
import { formatDate } from "@/lib/format";
import { logger } from "@/lib/logger";
import { ESTADO_VACIO, puedeMandarRecibo } from "@/lib/adelantos/recibo-whatsapp";
import { useMiRol } from "@/hooks/use-mi-rol";
import { imprimirComprobante } from "../detalle/comprobante-del-adelanto";
import CeldaRecibo from "./CeldaRecibo";
import FilaAcciones, { type AccionFila } from "./FilaAcciones";
import ModalesDeLaFila, { type AccionAbierta } from "./ModalesDeLaFila";
import { esDeuda, etiquetaEstado } from "./estado-visible";
import { BotonPagina, IconoOrden, ariaSort } from "./tabla-controles";
import type { useEstadoRecibos } from "./use-estado-recibos";

/** Cómo se abrevia cada modalidad en una celda. El título largo va en `title`. */
const MODALIDAD_CHIP: Record<string, string> = {
  CUENTA_CORRIENTE: "Cta. corriente",
  ENTREGAS_PACTADAS: "Pactadas",
  DESCUENTO_PLANILLA: "Planilla",
};

const fechaCelda = (iso: string) =>
  formatDate(iso);

export default function TablaAdelantos({
  adelantos,
  orden,
  onOrden,
  pagina,
  onPagina,
  porPagina,
  recibos,
  onVerDetalle,
  resaltadoId = null,
  onChange,
  filtros,
}: {
  adelantos: DbAdelanto[];
  orden: { columna: ColumnaOrden; direccion: Direccion };
  onOrden: (o: { columna: ColumnaOrden; direccion: Direccion }) => void;
  pagina: number;
  onPagina: (p: number) => void;
  porPagina: number;
  /** Firma, huella y envío de cada fila: los lee el módulo (también los usan los filtros). */
  recibos: ReturnType<typeof useEstadoRecibos>;
  onVerDetalle: (a: DbAdelanto) => void;
  /** La fila que se vino a ver (`?adelanto=`, `use-adelanto-en-url`): marcada y traída a la vista. */
  resaltadoId?: string | null;
  /** Refresca la lista tras anular o editar notas desde la fila. */
  onChange: () => void;
  /** Autofiltros de Excel (`filtros-columnas-adelantos`): el embudo va al lado de cada título. */
  filtros?: FiltrosTabla<DbAdelanto>;
}) {
  const ordenados = ordenarAdelantos(adelantos, orden.columna, orden.direccion);
  const pag = paginar(ordenados, pagina, porPagina);
  /* La etiqueta de modalidad sólo dice algo cuando lo visible mezcla modalidades: con 8 filas
     «Cta. corriente» era la misma palabra ocho veces (Brandon 25-10). */
  const variasModalidades = new Set(adelantos.map((x) => x.modalidad)).size > 1;

  /** Cuál fila tiene abierto qué acción — un solo modal a la vez. */
  const [abierta, setAbierta] = useState<AccionAbierta | null>(null);
  /** Firma, huella, foto y envío por WhatsApp de cada fila (columna «Recibo», 23-10). */
  const { estados, hojas, carga, recargar } = recibos;
  /* El encargado no entra a la carpeta privada de la persona: «Enviar recibo» le sale apagado con el motivo. */
  const rol = useMiRol();
  const mandaRecibo = rol == null || puedeMandarRecibo(rol);
  const alElegir = (a: DbAdelanto, accion: AccionFila) => {
    if (accion === "pdf") {
      void imprimirComprobante(a).catch((err: unknown) => logger.error("[adelantos] no se pudo armar el recibo PDF", { error: String(err) }));
      return;
    }
    setAbierta({ accion, adelanto: a });
  };

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

  /* La fila que se vino a ver, a la vista UNA vez por llegada: cuando ya está
     en la página que toca (la lista salta a esa página un render después). */
  const traida = useRef<string | null>(null);
  const resaltadaEnPagina = !!resaltadoId && pag.items.some((a) => a.id === resaltadoId);
  useEffect(() => {
    if (!resaltadoId || !resaltadaEnPagina || traida.current === resaltadoId) return;
    traida.current = resaltadoId;
    wrapRef.current?.querySelector(`[data-adelanto-id="${CSS.escape(resaltadoId)}"]`)?.scrollIntoView?.({ block: "center" });
  }, [resaltadaEnPagina, resaltadoId]);

  const th = (columna: ColumnaOrden, label: string, alineado?: "right", extra = "") => (
    <th className={`${alineado === "right" ? "text-right" : "text-left"} ${extra}`.trim()} aria-sort={ariaSort(orden, columna)}>
      {/* Título arriba y embudo abajo, en TODAS las columnas: al lado no entra en
          Fecha/Adelantado/Saldo/Estado (96-120 px) y bajaba sólo en ésas (medido 23-10). */}
      <span className={`inline-flex flex-col gap-1 [&>span]:ml-0 ${alineado === "right" ? "items-end" : "items-start"}`}>
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
      {filtros && <FiltroEnCabecera id={columna} f={filtros} compacto />}
      </span>
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
          {/* Bajo 640 px la tabla se vuelve tarjetas (`.admin-mobile-cards`):
              ahí los `<col>` y el `table-fixed` metían el `tbody` en la
              primera columna y cada tarjeta medía 148 px de ancho en un
              teléfono de 400 (medido 08-10, ya pasaba antes). */}
          <DataTable className="w-full sm:table-fixed">
            <colgroup className="max-sm:hidden">
              <col style={{ width: 148 }} />
              <col />
              <col style={{ width: 112 }} />
              <col className="hidden 2xl:table-column" style={{ width: 128 }} />
              <col style={{ width: 104 }} />
              {/* Avance sólo desde 2xl; antes va como «40% pagado» bajo el saldo (en las tarjetas del celular Avance sale en su fila).
                  Estado 120 (el chip «Cancelado» mide 93 + relleno) y Recibo 160
                  (tres botones de 48): con 72/112 el recibo se montaba sobre el
                  estado (medido 23-10: 33 px a 1280). */}
              <col className="hidden 2xl:table-column" style={{ width: 88 }} />
              <col style={{ width: 104 }} />
              <col style={{ width: 100 }} />
              <col className="w-[132px] 2xl:w-[188px]" />
              <col style={{ width: 96 }} />
            </colgroup>
            {/* Los títulos parejos arriba aunque Recibo no tenga embudo. */}
            <thead className="[&_th]:align-top">
              <tr>
                {th("codigo", "Código")}
                {th("persona", "Persona")}
                {th("fecha", "Fecha")}
                <th className="hidden 2xl:table-cell">
                  <span className="inline-flex flex-col items-start gap-1 [&>span]:ml-0">
                    Motivo
                    {filtros && <FiltroEnCabecera id="motivo" f={filtros} compacto />}
                  </span>
                </th>
                {th("monto", "Adelantado", "right")}
                {th("avance", "Avance", "right", "hidden 2xl:table-cell")}
                {th("saldo", "Saldo", "right")}
                {th("estado", "Estado")}
                <th className="text-left">Recibo</th>
                <th />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--rule-soft)]">
              {pag.items.length === 0 && <SinCoincidenciasFila colSpan={10} />}
              {pag.items.map((a) => {
                const badge = STATUS_BADGE[a.status];
                const deuda = esDeuda(a.status);
                const pct = avanceDe(a);
                const cumplidas = a.entregasPactadas.filter((p) => p.cumplidaEn).length;
                /* ADR-448: lo recibido se marca; lo dado (todo lo de antes) no lleva chip. */
                const dir = leerDireccion(a);
                const madera = ptYPrecioDelAdelanto(a);
                const debe = quienDebe({ direccion: dir.direccion, status: a.status, saldoPendiente: a.saldoPendiente });
                return (
                  <tr
                    key={a.id}
                    onClick={() => onVerDetalle(a)}
                    tabIndex={0}
                    aria-label={`Ver detalle del adelanto de ${a.beneficiario?.nombre ?? "este beneficiario"}`}
                    onKeyDown={(e) => { if (e.target !== e.currentTarget) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onVerDetalle(a);
                      }
                    }}
                    data-adelanto-id={a.id}
                    aria-current={a.id === resaltadoId ? "true" : undefined}
                    className={
                      a.id === resaltadoId
                        ? "cursor-pointer bg-[var(--accent-soft)] outline outline-2 -outline-offset-2 outline-[var(--accent)] transition-colors"
                        : "cursor-pointer transition-colors hover:bg-[var(--surface-sunken)]/50"
                    }
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
                    <td>
                      <span className="block truncate font-mono text-sm font-bold text-[var(--text-primary)]" title={a.codigoOperacion ?? undefined}>
                        {a.codigoOperacion ?? "—"}
                      </span>
                      {a.reciboManual && (
                        <span className="block truncate font-mono text-sm text-[var(--text-tertiary)]" title={`N° del recibo de papel — recibo ${a.reciboManual}`}>
                          recibo {a.reciboManual}
                        </span>
                      )}
                      {/* Liquidación bajó de columna propia a chip acá (Brandon
                          2026-08-28): la modalidad se lee junto al código, no en
                          una columna aparte que sólo repetía info de la fila. */}
                      <span className="flex flex-wrap items-center gap-1 empty:hidden">
                        {dir.direccion === "RECIBIDO" && (
                          <span
                            title={dir.concepto ? ETIQUETA_CONCEPTO[dir.concepto] : "Plata que recibiste"}
                            className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-full bg-[var(--data-info-500)]/12 px-2 py-0.5 text-sm font-bold text-[var(--data-info-ink)]"
                          >
                            <ArrowDownToLine className="h-3 w-3" aria-hidden /> {dir.concepto === "PRESTAMO" ? "Te prestaron" : "Te pagaron antes"}
                          </span>
                        )}
                        {(variasModalidades || a.entregasPactadas.length > 0) && (
                        <span
                          title={MODALIDAD_LABEL[a.modalidad] ?? a.modalidad}
                          className="inline-block whitespace-nowrap rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-sm font-bold text-[var(--text-secondary)]"
                        >
                          {MODALIDAD_CHIP[a.modalidad] ?? a.modalidad}
                          {a.entregasPactadas.length > 0 && ` · ${cumplidas}/${a.entregasPactadas.length}`}
                        </span>
                        )}
                        {a.piesTablares != null && a.piesTablaresTipo && (
                          <span
                            title={`${PT_TIPO_LABEL[a.piesTablaresTipo] ?? a.piesTablaresTipo} · ${fmtPt(a.piesTablares)}`}
                            className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-full bg-[var(--accent)]/10 px-2 py-0.5 text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"
                          >
                            <Ruler className="h-3 w-3" aria-hidden /> {fmtPt(a.piesTablares)}
                          </span>
                        )}
                      </span>
                    </td>
                    <td>
                      {/* El motivo también en el `title`: su columna sólo entra desde 2xl (la de Recibo le ganó el lugar). */}
                      <span className="line-clamp-2 break-words font-bold leading-tight text-[var(--text-primary)]" title={[a.beneficiario?.nombre, a.notas].filter(Boolean).join(" — ") || undefined}>
                        {a.beneficiario?.nombre ?? "—"}
                      </span>
                      {a.beneficiario?.telefono && (
                        <span className="block truncate text-sm tabular-nums text-[var(--text-tertiary)]">{a.beneficiario.telefono}</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap tabular-nums text-[var(--text-secondary)]">
                      {fechaCelda(a.fechaAdelanto)}
                    </td>
                    {/* El motivo con el que se dio la plata: sigue en el `title`
                        siempre; la columna en pantalla sólo aparece desde `xl:`
                        (≥1280px) — es el dato menos urgente de la fila, y forzar
                        su ancho en pantallas normales era lo que empujaba a la
                        tabla entera al scroll horizontal. */}
                    <td className="hidden max-w-[130px] 2xl:table-cell">
                      <span className="block truncate text-sm text-[var(--text-secondary)]" title={a.notas ?? undefined}>
                        {a.notas || <span className="text-[var(--text-tertiary)]">—</span>}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-right tabular-nums text-[var(--text-secondary)]">
                      {fmtMon(a.montoAdelantado, a.moneda)}
                      {madera && (
                        <span className="block text-sm font-semibold text-[var(--text-tertiary)]" title="Los pt que dice el adelanto y el precio que sale de dividir los soles entre los pt">
                          ≈ {fmtPtEntero(madera.pt)} a {fmtMon(madera.precioPt)} el pt
                        </span>
                      )}
                    </td>
                    <td className="hidden 2xl:table-cell">
                      {deuda ? <div className="flex items-center justify-end gap-1.5">
                        <div className="h-2.5 w-10 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                          <div className="h-full rounded-full bg-[var(--data-success)]" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="w-8 text-right text-sm font-semibold tabular-nums text-[var(--text-tertiary)]">{pct}%</span>
                      </div> : <span className="block text-right text-[var(--text-tertiary)]">—</span>}
                    </td>
                    <td className="whitespace-nowrap text-right font-bold tabular-nums">
                      {deuda ? (
                        <>
                          {fmtMon(a.saldoPendiente, a.moneda)}
                          {debe === "le-debes" && (
                            <span className="block text-sm font-semibold text-[var(--data-info-ink)]">le debes</span>
                          )}
                          {a.status === "ABIERTO" && pct > 0 && (
                            <span className="block text-sm font-semibold text-[var(--text-tertiary)] max-sm:hidden 2xl:hidden">{pct}% pagado</span>
                          )}
                        </>
                      ) : (
                        /* Un anulado no se cobra: sin saldo ni %. */
                        <span className="font-semibold text-[var(--text-tertiary)]">—</span>
                      )}
                    </td>
                    <td>
                      <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-sm font-bold ${badge?.className ?? ""}`}>
                        {etiquetaEstado(a.status, badge?.label)}
                      </span>
                    </td>
                    <td>
                      <CeldaRecibo
                        adelanto={a}
                        estado={estados[a.id] ?? ESTADO_VACIO}
                        carga={carga}
                        hoja={hojas[a.id]}
                        onMarca={(tipo, hay) => setAbierta(hay ? { accion: "ver", adelanto: a, tipo } : { accion: tipo === "firma" ? "firmar" : tipo, adelanto: a })}
                      />
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {a.status === "ABIERTO" && (
                          /* Ícono + tooltip (ley de la vista, 6): la fila
                             entera ya abre la ficha; esto es el atajo visible
                             de «cobrar», no un botón con texto por fila. */
                          <button
                            onClick={() => onVerDetalle(a)}
                            title="Registrar una entrega"
                            aria-label={`Registrar una entrega de ${a.beneficiario?.nombre ?? "este adelanto"}`}
                            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-primary text-[var(--accent-ink)] transition-colors hover:bg-primary/10 dark:text-[var(--accent)]"
                          >
                            <Plus className="h-4 w-4" />
                          </button>
                        )}
                        <FilaAcciones adelanto={a} mandaRecibo={mandaRecibo} onAccion={(accion) => alElegir(a, accion)} />
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

      <ModalesDeLaFila abierta={abierta} onCerrar={() => setAbierta(null)} onCambio={onChange} onRecibo={recargar} onCambiarA={setAbierta} />
    </div>
  );
}
