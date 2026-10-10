"use client";

/**
 * «Registrar toda la producción» (ADR-464, Brandon 2026-10-03): «con un botón,
 * sin poner manualmente cada producción… y luego podré despachar ahí mismo».
 *
 * Tres momentos en el mismo modal:
 *  1. **Resumen** antes de escribir: bloques, días, trozas y m³ de rolliza →
 *     PT, m³ y piezas de aserrada, y lo que NO entra con su motivo.
 *  2. **Avance**: un día por vez, «Registrando 3 de 12 · bloque X día 2». Se
 *     puede pedir detener (corta entre un día y otro, nunca a la mitad).
 *  3. **Resultado**: lo escrito con sus corridas y, si algo falló, dónde se
 *     paró y qué no se intentó. Lo escrito queda: es el Libro. Reintentar
 *     vuelve a planear desde lo pendiente. El siguiente paso es el Anexo 04
 *     por permiso → «Pasar al libro» (despacho), que ya vive en la pantalla.
 */

import { AlertTriangle, BookOpen, CheckCircle2, FileText, Loader2, RotateCcw, Square } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import type { AvanceDeTanda, PasoDeProduccion, PlanDeProduccion, RecorridoDeTanda } from "@/lib/forestal/toda-la-produccion";
import { ListaDeAvance, ResumenDeTanda } from "./reparto-registrar-todo-partes";

/** El `id` de la sección «Anexo 04 por permiso» de la Distribución: el siguiente paso salta ahí. */
export const ID_SECCION_ANEXO = "reparto-anexo-permiso";

const BTN =
  "inline-flex h-10 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] transition hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-50";
const BTN_PRIMARIO =
  "inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50";
const CAJA = "rounded-lg border px-3 py-2 text-sm";
const CAJA_OK = `${CAJA} border-[var(--data-success-500)]/50 bg-[var(--data-success-500)]/10 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]`;
const CAJA_ERROR = `${CAJA} border-[var(--data-error-500)]/50 bg-[var(--data-error-500)]/10 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]`;
const CAJA_AVISO = `${CAJA} border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]`;

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;
const MAX_NROS = 12;
function nros(lista: readonly (number | null | undefined)[]): string {
  const n = lista.filter((x): x is number => x != null);
  if (n.length === 0) return "";
  const vistos = n.slice(0, MAX_NROS).map((x) => `N° ${x}`).join(", ");
  return n.length > MAX_NROS ? `${vistos} y ${n.length - MAX_NROS} más` : vistos;
}

function Resultado({ recorrido, total }: { recorrido: RecorridoDeTanda<PasoDeProduccion>; total: number }) {
  const escritos = recorrido.escritos.length;
  const corridas = nros(recorrido.escritos.map((e) => e.resultado.lineNo));
  const f = recorrido.fallo;
  const sinIntentar = recorrido.pendientes.length;
  if (!f && !recorrido.detenido) {
    return (
      <p className={`${CAJA_OK} flex items-start gap-2`} role="status">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          <b>{plural(escritos, "día en el Libro", "días en el Libro")}</b>
          {corridas ? ` · corridas ${corridas}` : ""}. Siguiente: pasa el Anexo 04 de cada permiso al libro (despacho); eso descuenta del patio.
        </span>
      </p>
    );
  }
  return (
    <div className="space-y-2" role="status">
      {f ? (
        <p className={`${CAJA_ERROR} flex items-start gap-2`}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <b>Se detuvo en {f.paso.etiqueta} · día {f.paso.jornada.dia}</b>:{" "}
            {f.resultado.estado === "corrida-abierta"
              ? `la corrida N° ${f.resultado.lineNo ?? "?"} consumió sus trozas pero la producción no se declaró (${f.resultado.detalle ?? "sin detalle"}). Declárala desde la tabla del Libro.`
              : (f.resultado.detalle ?? "no se registró.")}
          </span>
        </p>
      ) : (
        <p className={`${CAJA_AVISO} flex items-start gap-2`}>
          <Square className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>Detuviste la tanda entre un día y otro.</span>
        </p>
      )}
      <p className="text-sm text-[var(--text-secondary)]">
        {escritos === 0 ? (
          "No quedó nada escrito en el Libro."
        ) : (
          <>
            Quedaron en el Libro <b className="text-[var(--text-primary)]">{plural(escritos, "día", "días")}</b>
            {corridas ? ` (corridas ${corridas})` : ""}: no se deshacen.
          </>
        )}{" "}
        Sin registrar:{" "}
        <b className="text-[var(--text-primary)]">{plural(total - escritos, "día", "días")}</b>
        {sinIntentar > 0 ? ` (${sinIntentar} sin intentar)` : ""}. «Reintentar lo pendiente» vuelve a armar el plan desde lo que falta.
      </p>
    </div>
  );
}

export default function RepartoRegistrarTodo({
  plan,
  bloque,
  avance,
  recorrido,
  deteniendo,
  motivoApagado,
  leyendo,
  onConfirmar,
  onDetener,
  onReintentar,
  onIrAlAnexo,
  onCerrar,
}: {
  plan: PlanDeProduccion;
  /** Etiqueta del bloque si se abrió desde «Registrar sus N días»; `null` = toda la distribución. */
  bloque: string | null;
  avance: AvanceDeTanda<PasoDeProduccion> | null;
  recorrido: RecorridoDeTanda<PasoDeProduccion> | null;
  deteniendo: boolean;
  motivoApagado: string | null;
  leyendo: boolean;
  onConfirmar: () => void;
  onDetener: () => void;
  onReintentar: () => void;
  onIrAlAnexo: () => void;
  onCerrar: () => void;
}) {
  const fase = avance ? "avance" : recorrido ? "fin" : "resumen";
  const total = plan.pasos.length;
  const actual = avance?.paso;
  const pct = avance && total > 0 ? Math.round((avance.hechos / total) * 100) : 0;
  const quedaAlgo = Boolean(recorrido && (recorrido.fallo || recorrido.detenido));
  const hayAnexo = typeof document !== "undefined" && Boolean(document.getElementById(ID_SECCION_ANEXO));
  const motivo = fase !== "resumen" ? null : motivoApagado ?? (total === 0 ? "No hay días listos para registrar: mira abajo por qué." : null);

  return (
    <AdminModal
      open
      onClose={onCerrar}
      hideCloseButton={fase === "avance"}
      className="sm:max-w-[48rem]"
      icon={BookOpen}
      title={bloque ? `Registrar los días del bloque ${bloque}` : "Registrar toda la producción"}
      description="De la Distribución de rolliza al Libro CTP, un día por vez"
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          {motivo && <span className="mr-auto text-sm text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{motivo}</span>}
          {fase === "resumen" && (
            <>
              <button type="button" onClick={onCerrar} className={BTN}>Cancelar</button>
              <button type="button" onClick={onConfirmar} disabled={Boolean(motivo)} className={BTN_PRIMARIO}>
                <BookOpen className="h-4 w-4" aria-hidden /> Registrar {plural(total, "día", "días")} en el Libro
              </button>
            </>
          )}
          {fase === "avance" && (
            <button type="button" onClick={onDetener} disabled={deteniendo} className={BTN}>
              {deteniendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Square className="h-4 w-4" aria-hidden />}
              {deteniendo ? "Se detiene al terminar este día…" : "Detener después de este día"}
            </button>
          )}
          {fase === "fin" && (
            <>
              <button type="button" onClick={onCerrar} className={BTN}>Cerrar</button>
              {quedaAlgo && (
                <button type="button" onClick={onReintentar} disabled={leyendo} className={BTN}>
                  {leyendo ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RotateCcw className="h-4 w-4" aria-hidden />}
                  {leyendo ? "Leyendo el Libro…" : "Reintentar lo pendiente"}
                </button>
              )}
              {hayAnexo && (recorrido?.escritos.length ?? 0) > 0 && (
                <button type="button" onClick={onIrAlAnexo} className={quedaAlgo ? BTN : BTN_PRIMARIO}>
                  <FileText className="h-4 w-4" aria-hidden /> Ir al Anexo 04 por permiso
                </button>
              )}
            </>
          )}
        </div>
      }
    >
      <div className={`space-y-3 ${MODAL_BODY}`}>
        {fase === "resumen" && <ResumenDeTanda plan={plan} />}
        {fase === "avance" && avance && (
          <div className="space-y-1.5">
            <p className="text-sm font-bold text-[var(--text-primary)]" aria-live="polite">
              Registrando {Math.min(avance.hechos + 1, total)} de {total}
              {actual ? ` · ${actual.etiqueta} día ${actual.jornada.dia}` : ""}
            </p>
            <div
              role="progressbar"
              aria-label="Avance del registro en el Libro"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={avance.hechos}
              className="h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
            >
              <div className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-[var(--dur-base)]" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-xs text-[var(--text-tertiary)]">No cierres la pestaña: cada día consume sus trozas y declara su producción antes del siguiente.</p>
          </div>
        )}
        {fase === "fin" && recorrido && <Resultado recorrido={recorrido} total={total} />}
        {fase !== "resumen" && <ListaDeAvance pasos={plan.pasos} avance={avance} recorrido={recorrido} />}
      </div>
    </AdminModal>
  );
}
