"use client";

/**
 * «Contar el patio» (ADR-436, Brandon 2026-09-26) — el conteo físico de trozas
 * con la pistola, la cámara o tipeando.
 *
 * La hermana es el conteo de Inventario (`ConteoFisicoWizard`): lo esperado
 * contra lo que de verdad se encuentra. Acá lo esperado es el patio libre —
 * `motivoBloqueo === null` Y la guía ya recepcionada (`aTrozaDelConteo`: una
 * guía cargada al libro pero que no bajó del camión no es patio físico) — y
 * el resultado son tres listas: Encontradas, Faltan y Sorpresas. Mientras se
 * cuenta, todo se guarda en el equipo (sobrevive a recargar y a perder señal).
 * Al terminar sale el acta imprimible y el acta se guarda en el libro
 * (`useActaDelConteo`, 2026-09-26) para que la vea todo el negocio en la
 * pestaña Trozas. No mueve saldos.
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, ClipboardList, Loader2, RotateCcw, WifiOff,
} from "@buleje/design-system/icons";
import { PageTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useConteoPatio } from "@/hooks/use-conteo-patio";
import { resumirConteo, type ConteoPatio, type TrozaDelConteo } from "@/lib/forestal/conteo-patio";
import { actaDelConteo, fechaHoraCorta } from "@/lib/forestal/conteo-patio-acta";
import { openCtpReport } from "@/lib/forestal/ctp-print-shared";
import { LABEL_BLOQUEO } from "@/lib/forestal/consumo-trozas";
import EscanerTrozas, { nombreDeTroza } from "./EscanerTrozas";
import ListasDelConteo from "./patio-conteo-listas";
import { useActaDelConteo, type EstadoActa } from "./hooks/use-acta-del-conteo";

const BOTON =
  "inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-4 text-base font-bold transition-colors";
const BOTON_BORDE = `${BOTON} border border-[var(--rule-base)] text-[var(--text-primary)] hover:border-[var(--accent)]`;
const AVISO_AMBAR =
  "flex items-start gap-2 rounded-2xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 px-4 py-3 text-base font-bold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]";

/** Qué pasó con el acta en el libro, en una línea. */
function EstadoDelActa({ estado, mensaje, onReintentar }: { estado: EstadoActa; mensaje: string | null; onReintentar: () => void }) {
  if (estado === "nada") return null;
  if (estado === "subiendo") {
    return (
      <p className="flex items-center gap-2 text-base text-[var(--text-secondary)]" role="status">
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Guardando el acta en el libro…
      </p>
    );
  }
  if (estado === "guardada") {
    return (
      <p className="flex items-start gap-2 text-base font-bold text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]" role="status" data-acta-estado="guardada">
        <ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> Acta guardada en el libro: la ven todos en Trozas.
      </p>
    );
  }
  if (estado === "en-equipo") {
    return (
      <p className={AVISO_AMBAR} role="status" data-acta-estado="en-equipo">
        <WifiOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> Sin señal: el acta quedó en esta tablet y se sube sola al volver la señal.
      </p>
    );
  }
  return (
    <div className="space-y-2" role="alert" data-acta-estado="error">
      <p className={AVISO_AMBAR}>
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> El acta no se guardó en el libro: {mensaje}
      </p>
      <button type="button" onClick={onReintentar} className={BOTON_BORDE}>
        <RotateCcw className="h-5 w-5" aria-hidden /> Reintentar
      </button>
    </div>
  );
}

/** Abre el acta en el MISMO clic: tras un `await` el navegador bloquea la ventana. */
function abrirActa(c: ConteoPatio, negocio: string | null): string | null {
  try {
    openCtpReport(actaDelConteo(c, negocio));
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export default function PatioConteo({ onVolver }: { onVolver: () => void }) {
  const h = useConteoPatio();
  const [errorActa, setErrorActa] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  const { conteo } = h;
  const acta = useActaDelConteo(conteo);
  const resumen = useMemo(() => (conteo ? resumirConteo(conteo) : null), [conteo]);
  const yaContadas = useMemo(
    () => new Set((conteo?.lecturas ?? []).flatMap((l) => (l.trozaId ? [l.trozaId] : []))),
    [conteo?.lecturas],
  );

  const avisoAlTomar = (t: TrozaDelConteo) =>
    t.motivo
      ? { tono: "ya" as const, mensaje: `Sorpresa: troza ${nombreDeTroza(t)}. ${LABEL_BLOQUEO[t.motivo]}.` }
      : { tono: "ok" as const, mensaje: `Troza ${nombreDeTroza(t)} contada.` };

  const onDesconocido = (codigo: string) => {
    h.anotarCodigo(codigo);
    return `Sorpresa: ${codigo} no es de ninguna troza del patio.`;
  };

  const terminar = () => {
    const fin = h.terminar();
    if (fin) setErrorActa(abrirActa(fin, h.negocio));
  };

  const pct = resumen && resumen.total > 0 ? Math.round((resumen.contadas / resumen.total) * 100) : 0;
  const terminado = Boolean(conteo?.terminadoEn);

  return (
    <main className="mx-auto min-h-dvh max-w-[48rem] space-y-4 p-4" data-conteo-patio>
      <button type="button" onClick={onVolver} className={BOTON_BORDE}>
        <ArrowLeft className="h-5 w-5" aria-hidden /> Volver al patio
      </button>

      <header className="flex items-center gap-2">
        <PageTitle className="flex items-center gap-2 text-xl font-bold text-[var(--text-primary)]">
          <ClipboardList className="h-6 w-6 text-[var(--accent)]" aria-hidden /> Contar el patio
        </PageTitle>
        <InfoTip
          title="Contar el patio"
          what="Escanea cada troza que ves en la pila. Te dice cuáles faltan y cuáles no deberían estar."
          affects="Mientras cuentas se guarda en este equipo: si recargas o pierdes señal, sigues donde ibas. Al terminar, el acta queda en el libro (pestaña Trozas) para todos. No mueve saldos."
          example="Encuentras 80 de 84: las 4 que faltan salen por especie o guía para ir a buscarlas."
          side="left"
        />
      </header>

      {h.estado === "cargando" && (
        <p className="flex items-center gap-2 py-6 text-base text-[var(--text-secondary)]">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> Trayendo lo que hay en el patio…
        </p>
      )}

      {h.estado === "error" && (
        <div className="space-y-3 rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-500)]/10 px-4 py-3">
          <p className="flex items-start gap-2 text-base font-bold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {h.error}
          </p>
          <button type="button" onClick={() => void h.reintentar()} className={BOTON_BORDE}>
            <RotateCcw className="h-5 w-5" aria-hidden /> Reintentar
          </button>
        </div>
      )}

      {conteo && resumen && (
        <>
          {h.avisoFoto && (
            <p className={AVISO_AMBAR}>
              <WifiOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <span>
                {h.avisoFoto} Lo esperado es de {fechaHoraCorta(conteo.fotoEn)}.
              </span>
            </p>
          )}
          {h.avisoGuardado && (
            <p className={AVISO_AMBAR}>
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {h.avisoGuardado}
            </p>
          )}
          {conteo.truncado && (
            <p className={AVISO_AMBAR}>
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              El patio es más grande de lo que se pudo traer: alguna sorpresa puede ser una troza que sí está.
            </p>
          )}

          <section className="space-y-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
            <p className="text-3xl font-bold tabular-nums text-[var(--text-primary)]" data-conteo-progreso>
              {resumen.contadas} <span className="text-xl font-semibold text-[var(--text-secondary)]">de {resumen.total} contadas</span>
            </p>
            <div
              role="progressbar"
              aria-label="Avance del conteo"
              aria-valuemin={0}
              aria-valuemax={resumen.total}
              aria-valuenow={resumen.contadas}
              className="h-3 overflow-hidden rounded-full bg-[var(--surface-sunken)]"
            >
              <div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-base text-[var(--text-secondary)]">
              {resumen.faltan.length} faltan · {resumen.sorpresas.length} sorpresa{resumen.sorpresas.length === 1 ? "" : "s"}
              {" · "}empezó {fechaHoraCorta(conteo.iniciadoEn)}
              {conteo.quien && ` · ${conteo.quien}`}
            </p>
          </section>

          {terminado ? (
            <section className="space-y-3 rounded-2xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-500)]/10 p-4" aria-live="polite">
              <p className="flex items-start gap-2 text-base font-bold text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                Conteo terminado {fechaHoraCorta(conteo.terminadoEn ?? conteo.iniciadoEn)}.
              </p>
              <EstadoDelActa estado={acta.estado} mensaje={acta.mensaje} onReintentar={acta.reintentar} />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setErrorActa(abrirActa(conteo, h.negocio))}
                  className={`${BOTON} bg-[var(--accent)] text-white hover:bg-[var(--accent-600)]`}
                >
                  <ClipboardList className="h-5 w-5" aria-hidden /> Ver el acta
                </button>
                <button type="button" onClick={h.seguirContando} className={BOTON_BORDE}>
                  Seguir contando
                </button>
                <button type="button" onClick={h.empezarOtro} className={BOTON_BORDE}>
                  <RotateCcw className="h-5 w-5" aria-hidden /> Empezar otro conteo
                </button>
              </div>
            </section>
          ) : (
            <EscanerTrozas
              trozas={conteo.trozas}
              onTroza={h.anotar}
              yaElegidas={yaContadas}
              accion="contada"
              mostrarCuenta={false}
              avisoAlTomar={avisoAlTomar}
              onDesconocido={onDesconocido}
            />
          )}

          {errorActa && (
            <p role="alert" className={AVISO_AMBAR}>
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {errorActa}
            </p>
          )}

          <ListasDelConteo resumen={resumen} onQuitar={terminado ? undefined : h.quitar} />

          {!terminado && (
            <div className="flex flex-wrap gap-2 border-t border-[var(--rule-base)] pt-4">
              <button
                type="button"
                onClick={terminar}
                disabled={conteo.lecturas.length === 0}
                className={`${BOTON} grow basis-[14rem] bg-[var(--accent)] text-white hover:bg-[var(--accent-600)] disabled:opacity-40`}
              >
                <CheckCircle2 className="h-5 w-5" aria-hidden /> Terminar conteo
              </button>
              {conteo.lecturas.length > 0 &&
                (borrando ? (
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold text-[var(--text-primary)]">¿Borrar lo contado?</span>
                    <button
                      type="button"
                      onClick={() => {
                        h.empezarOtro();
                        setBorrando(false);
                      }}
                      className={`${BOTON} border-2 border-[var(--data-error-500)] text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]`}
                    >
                      Sí, borrar
                    </button>
                    <button type="button" onClick={() => setBorrando(false)} className={BOTON_BORDE}>
                      No
                    </button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setBorrando(true)} className={`${BOTON_BORDE} grow sm:grow-0`}>
                    <RotateCcw className="h-5 w-5" aria-hidden /> Empezar de cero
                  </button>
                ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}
