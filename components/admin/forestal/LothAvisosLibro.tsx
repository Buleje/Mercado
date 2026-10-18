"use client";

/**
 * La campana del Libro TH, en el hueco `avisos` de la banda (compactación
 * 17-10). Junta lo que antes eran dos bloques arriba de las Secciones: el
 * estado del resumen «Aprovechamiento» (bloqueos, alertas, m³ fuera del plan)
 * y el aviso de líneas sin permiso. Mismo botón y mismo lenguaje de color que
 * los avisos del Libro CTP (`CtpPendientes`): una sola forma de avisar.
 *
 * Son dos piezas porque a 1280 el botón cae dentro del «⋯» del libro, y ese
 * panel se desmonta al aparecer una ventana: la ventana (`LothAvisosVentana`)
 * va con las vistas y su estado vive en `useLothAvisosLibro`.
 *
 * «Atarlas» cierra la lista y abre la ventana de atar: una al lado de la otra,
 * nunca una encima de la otra.
 */

import { useState } from "react";
import { AlertTriangle, ArrowRight, Bell, CheckCircle2, Link2 } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import type { PlanTablero } from "@/lib/forestal/loth-tablero-permiso";
import { formatNumber } from "@/lib/format";
import type { AvisoLibroTh, EstadoAvisosLibroTh } from "./hooks/use-loth-avisos-libro";
import { AtarModal } from "./LothAtarSinPlan";

/** Mismos tonos que los avisos del CTP. */
const TONO: Record<AvisoLibroTh["tono"], string> = {
  bloquea:
    "border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] text-[var(--data-error-700)] hover:border-[var(--data-error-500)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]",
  atrasado:
    "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] text-[var(--data-warning-700)] hover:border-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]",
};

const BOTON = "inline-flex h-12 shrink-0 items-center gap-2 rounded-xl border-2 px-3 text-sm font-bold transition-colors";

function resumenDe(avisos: AvisoLibroTh[]): string {
  if (avisos.length === 0) return "El libro está en orden: sin bloqueos, sin alertas y sin líneas sin permiso";
  return avisos.map((a) => (a.cantidad != null ? `${formatNumber(a.cantidad)} ${a.titulo.toLowerCase()}` : a.titulo)).join(" · ");
}

/** El botón de la banda. */
export function LothAvisosBoton({ estado }: { estado: EstadoAvisosLibroTh }) {
  const { avisos, cargando, fallo, setAbierto } = estado;
  const hay = avisos.length > 0;
  const rojo = avisos.some((a) => a.tono === "bloquea");
  const tono = cargando || fallo
    ? "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)]"
    : !hay
      ? "border-[var(--data-success-500)]/50 bg-[var(--surface-raised)] text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
      : rojo
        ? "border-[var(--data-error-500)] bg-[var(--surface-raised)] text-[var(--data-error-600)] dark:text-[var(--data-error-500)]"
        : "border-[var(--data-warning-500)] bg-[var(--surface-raised)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";
  return (
    <button
      type="button"
      onClick={() => setAbierto(true)}
      aria-label={
        cargando ? "Revisando el libro"
          : fallo ? "No se pudo revisar el libro"
            : !hay ? "Sin avisos en el libro"
              : `${avisos.length} ${avisos.length === 1 ? "aviso" : "avisos"} en el libro`
      }
      title={cargando ? "Revisando…" : fallo ? "No se pudo revisar el libro" : resumenDe(avisos)}
      className={`${BOTON} ${tono}`}
    >
      <Bell className={`h-4 w-4 ${cargando ? "animate-pulse" : ""}`} aria-hidden />
      <span className="max-lg:sr-only">Avisos</span>
      {!cargando && !fallo && hay && (
        <span className="rounded-full bg-current/15 px-1.5 font-mono text-xs tabular-nums">{avisos.length}</span>
      )}
    </button>
  );
}

/** La ventana con los avisos y, si se eligió «Atarlas», la de atar. */
export function LothAvisosVentana({
  estado,
  planes,
  planInicial,
  puedeAtar,
  onCumplimiento,
  onAtado,
}: {
  estado: EstadoAvisosLibroTh;
  planes: readonly PlanTablero[];
  planInicial: string | null;
  puedeAtar: boolean;
  /** Los bloqueos y alertas se resuelven en Cumplimiento. */
  onCumplimiento: () => void;
  /** Se ataron líneas: el libro relee (y con él, los avisos). */
  onAtado: () => void;
}) {
  const { avisos, cargando, fallo, abierto, setAbierto } = estado;
  const [atando, setAtando] = useState(false);

  const elegir = (a: AvisoLibroTh) => {
    setAbierto(false);
    if (a.accion === "atar") setAtando(true);
    else onCumplimiento();
  };

  return (
    <>
      <AdminModal
        open={abierto}
        onClose={() => setAbierto(false)}
        title="Avisos del libro"
        description={cargando ? "Revisando…" : fallo ? undefined : resumenDe(avisos)}
        icon={Bell}
      >
        <div className={MODAL_BODY}>
          {cargando && avisos.length === 0 ? (
            <div className="space-y-2" aria-hidden>
              {[0, 1].map((i) => <span key={i} className="block h-12 animate-pulse rounded-xl bg-[var(--surface-sunken)]" />)}
            </div>
          ) : fallo ? (
            <p className="text-sm text-[var(--text-tertiary)]">No se pudo revisar el libro. Usa «Recargar» de la banda.</p>
          ) : avisos.length === 0 ? (
            <p className="flex items-center gap-2 rounded-xl border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] px-3 py-3 text-sm font-bold text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/12 dark:text-[var(--data-success-500)]">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> {resumenDe(avisos)}
            </p>
          ) : (
            <ul className="space-y-2">
              {avisos.map((a) => {
                const Icono = a.accion === "atar" ? Link2 : AlertTriangle;
                const cuerpo = (
                  <>
                    <Icono className="h-4 w-4 shrink-0" aria-hidden />
                    {a.cantidad != null && <b className="font-mono text-lg tabular-nums">{formatNumber(a.cantidad)}</b>}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">{a.titulo}</span>
                      <span className="block text-sm opacity-80">{a.detalle}</span>
                    </span>
                  </>
                );
                const clase = `flex w-full items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors ${TONO[a.tono]}`;
                /* Las líneas sin permiso las ata el administrador o el dueño (el
                   servidor lo exige igual): el resto ve el aviso, no la acción. */
                const accionable = a.accion !== "atar" || puedeAtar;
                return (
                  <li key={a.clave}>
                    {accionable ? (
                      <button type="button" onClick={() => elegir(a)} className={clase}>
                        {cuerpo}
                        <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold">
                          {a.accion === "atar" ? "Atarlas" : <span className="max-sm:sr-only">Ver en Cumplimiento</span>}
                          <ArrowRight className="h-4 w-4 opacity-60" aria-hidden />
                        </span>
                      </button>
                    ) : (
                      <div className={clase}>{cuerpo}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </AdminModal>
      {atando && (
        <AtarModal
          planes={planes}
          planInicial={planInicial}
          onClose={() => setAtando(false)}
          onAtado={() => {
            setAtando(false);
            onAtado();
          }}
        />
      )}
    </>
  );
}
