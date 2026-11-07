"use client";

/**
 * El detalle de UN renglón: las mismas filas que suman su monto (invariante de
 * ADR-451 — si no cerrara, la pantalla se contradiría sola), cada una con su
 * día, quién, qué, y un clic que lleva a su origen.
 *
 * Es una lista y no una tabla: el modal va en un portal, fuera del shell del
 * panel, así que a 400 px una tabla no se volvería tarjetas y desbordaría.
 */

import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from "react";
import { LoadingState } from "@buleje/design-system";
import { ChevronRight, RefreshCw } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import { useDetalleDelRenglon } from "@/hooks/use-resultado-del-mes";
import { diaConNombre } from "@/lib/forestal/plazo-de-apartado";
import type { EnlaceOrigen, FilaFuente, FuenteDetalle } from "@/lib/finance/resultado-del-negocio";
import { esAproximado, etiquetaFuente, medidaTexto, mesConAnio, montoTexto } from "./fuentes";
import { irAlOrigen } from "./ir-al-origen";

/** Clic que el navegador tiene que manejar solo: otra pestaña o ventana (ctrl/cmd/shift/alt). */
const esClicDelNavegador = (e: MouseEvent<HTMLAnchorElement>) => e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;

const FILA = "flex w-full items-center justify-between gap-3 rounded-lg px-2 py-2.5 text-left";

/* Un enlace de verdad (`href` = el origen): ctrl/cmd/clic de rueda lo abre en
   otra pestaña; el clic simple navega sin recargar el panel (`irAlOrigen`).
   Sin origen que lo muestre (`enlace: null`), la fila es texto: un enlace que
   no abre nada es peor que ninguno. */
function FilaDelDetalle({ fila, onIr }: { fila: FilaFuente; onIr: (enlace: EnlaceOrigen) => void }) {
  const medida = medidaTexto(fila.pt, fila.m3);
  const monto = montoTexto(fila.monto, { aproximado: esAproximado(fila.certeza) });
  const cuerpo = (
    <>
      <span className="min-w-0">
        <span className="block text-xs text-[var(--text-secondary)]">
          <span className="font-semibold text-[var(--text-primary)]">{diaConNombre(fila.fecha)}</span>
          {fila.quien && <span> · {fila.quien}</span>}
        </span>
        <span className="block text-sm font-medium text-[var(--text-primary)] [overflow-wrap:anywhere]">{fila.que}</span>
        {medida && <span className="block text-xs text-[var(--text-secondary)] tabular-nums">{medida}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-1 text-sm font-bold tabular-nums text-[var(--text-primary)]">
        {monto}
        {fila.enlace ? (
          <ChevronRight className="h-4 w-4 text-[var(--text-tertiary)] transition-transform group-hover:translate-x-0.5" aria-hidden />
        ) : (
          /* El monto queda en la misma columna que el de las filas con enlace. */
          <span className="h-4 w-4" aria-hidden />
        )}
      </span>
    </>
  );
  const enlace = fila.enlace;
  if (!enlace) return <li className={FILA}>{cuerpo}</li>;
  return (
    <li>
      <a
        href={hrefDeDestino(enlace)}
        onClick={(e) => {
          if (esClicDelNavegador(e)) return;
          e.preventDefault();
          onIr(enlace);
        }}
        aria-label={`${fila.que}, ${diaConNombre(fila.fecha)}: ${monto}. Abrir donde se anotó`}
        className={`group ${FILA} transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]`}
      >
        {cuerpo}
      </a>
    </li>
  );
}

export default function DetalleRenglonModal({
  mes,
  fuente,
  onClose,
}: {
  mes: string;
  /** `null` = cerrado. */
  fuente: FuenteDetalle | null;
  onClose: () => void;
}) {
  const { datos, error, recargar } = useDetalleDelRenglon(mes, fuente);
  /* Los datos del renglón que se abrió ANTES no sirven para este. */
  const listos = datos && datos.fuente === fuente && datos.mes === mes ? datos : null;
  /* El título se queda mientras el modal se va (con `fuente = null` salía vacío en la animación). */
  const [ultima, setUltima] = useState(fuente);
  if (fuente && fuente !== ultima) setUltima(fuente);
  const titulo = ultima ? `${etiquetaFuente(ultima)} · ${mesConAnio(mes)}` : "";

  /* AdminModal se abre sin Dialog.Trigger: al cerrar, Radix deja el foco en <body> y con teclado hay
     que recorrer la página desde arriba. Se guarda el renglón que lo abrió (layout effect: antes de
     que Radix mueva el foco adentro) y se le devuelve al cerrar. */
  const origen = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (fuente && !origen.current && document.activeElement instanceof HTMLElement) origen.current = document.activeElement;
  }, [fuente]);
  useEffect(() => {
    if (fuente || !origen.current) return;
    const el = origen.current;
    origen.current = null;
    const t = window.setTimeout(() => {
      if (el.isConnected) el.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [fuente]);
  const aproximado = listos?.filas.some((f) => esAproximado(f.certeza)) ?? false;

  const ir = (enlace: EnlaceOrigen) => {
    onClose();
    irAlOrigen(enlace);
  };

  return (
    <AdminModal
      open={fuente != null}
      onClose={onClose}
      title={titulo}
      variant="wide"
      claveVentana="finanzas-detalle-renglon"
      footer={
        listos && listos.filas.length > 0 ? (
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-semibold text-[var(--text-secondary)]">
              {fuente === "caja_sin_sumar" ? "Neto (no se suma a la caja)" : "Total del renglón"}
            </span>
            <span className="text-base font-extrabold tabular-nums text-[var(--text-primary)]">
              {montoTexto(listos.total, { aproximado })}
            </span>
          </div>
        ) : undefined
      }
    >
      <div className={MODAL_BODY}>
        {error && !listos ? (
          <div className="flex flex-col items-start gap-2 py-4" role="alert">
            <p className="text-sm font-medium text-[var(--data-error-ink)]">{error}</p>
            <button
              type="button"
              onClick={recargar}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[var(--rule-base)] px-3 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
            >
              <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
            </button>
          </div>
        ) : !listos ? (
          <LoadingState message="Cargando el detalle…" />
        ) : listos.filas.length === 0 ? (
          <p className="py-4 text-sm text-[var(--text-secondary)]">No hay movimientos en {mesConAnio(mes).toLowerCase()}.</p>
        ) : (
          <ul className="-mx-2 divide-y divide-[var(--rule-soft)]">
            {listos.filas.map((f) => (
              <FilaDelDetalle key={f.id} fila={f} onIr={ir} />
            ))}
          </ul>
        )}
      </div>
    </AdminModal>
  );
}
