"use client";

/**
 * «Contar el patio» (ADR-436, Brandon 2026-09-26) — el conteo físico de trozas
 * con la pistola, la cámara o tipeando. Desde el 05-10 es un recorrido guiado
 * de tres pasos, pensado para el celular (una mano, sol):
 *
 *   1. Etiquetas (`PasoEtiquetas`) — cuántas piezas del patio no tienen QR:
 *      imprimirlas con el modal de siempre o seguir sin ellas.
 *   2. Recorrer (`PasoRecorrer`) — escanear la pila: «8 de 13 encontradas».
 *   3. Acta (`PasoActa`) — faltan con su cancha y días, sobran con su porqué.
 *
 * La hermana es el conteo de Inventario (`ConteoFisicoWizard`): lo esperado
 * contra lo que de verdad se encuentra. Acá lo esperado es el patio libre —
 * `motivoBloqueo === null` Y la guía ya recepcionada (`aTrozaDelConteo`) —.
 * Mientras se cuenta, todo se guarda en el equipo (sobrevive a recargar y a
 * perder señal). Al terminar, el acta se guarda en el libro sola
 * (`useActaDelConteo`) y la ve todo el negocio en la pestaña Trozas. No mueve
 * saldos.
 *
 * Se abre desde el modo patio o directo desde el libro
 * (`/admin/patio?contar=1&volver=…`, el botón de `CtpConteosPatio`).
 */

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, ClipboardList, Loader2, RotateCcw, WifiOff } from "@buleje/design-system/icons";
import { PageTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useConteoPatio } from "@/hooks/use-conteo-patio";
import { resumirConteo, type ConteoPatio } from "@/lib/forestal/conteo-patio";
import {
  RUTA_CONTAR_EL_PATIO,
  etiquetasDelPatio,
  pasoDelConteo,
  volverSeguro,
  type PasoConteo,
} from "@/lib/forestal/conteo-patio-pasos";
import { actaDelConteo, fechaHoraCorta } from "@/lib/forestal/conteo-patio-acta";
import { openCtpReport } from "@/lib/forestal/ctp-print-shared";
import CtpEtiquetasTrozasModal from "./CtpEtiquetasTrozasModal";
import PasoActa from "./ctp-conteo-acta";
import { AVISO_AMBAR, BOTON_BORDE, PasoEtiquetas, PasosDelConteo } from "./ctp-conteo-pasos";
import PasoRecorrer from "./ctp-conteo-recorrer";
import { useActaDelConteo } from "./hooks/use-acta-del-conteo";

/** Abre el acta en el MISMO clic: tras un `await` el navegador bloquea la ventana. */
function abrirActa(c: ConteoPatio, negocio: string | null): string | null {
  try {
    openCtpReport(actaDelConteo(c, negocio));
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** `?volver=` (sólo rutas del panel): se entró desde la pestaña Trozas. Sin SSR: hay `location`. */
const volverDeLaUrl = () => volverSeguro(new URLSearchParams(location.search).get("volver"));

export default function PatioConteo({ onVolver }: { onVolver: () => void }) {
  const [volverA] = useState(volverDeLaUrl);
  const volver = () => {
    if (volverA) return location.assign(volverA);
    /* Sin `?contar=1`, recargar el modo patio ya no reabre el conteo. */
    if (location.search) history.replaceState(null, "", RUTA_CONTAR_EL_PATIO);
    onVolver();
  };
  const h = useConteoPatio();
  const { conteo } = h;
  const acta = useActaDelConteo(conteo);
  const [errorActa, setErrorActa] = useState<string | null>(null);
  /** El paso que eligió la persona (volver a Etiquetas, saltarlas). */
  const [elegido, setElegido] = useState<Exclude<PasoConteo, 3> | null>(null);
  /** Las piezas que se mandan a imprimir, fijadas al abrir: recargar el patio
   *  después de imprimir no cambia la lista con el modal abierto. */
  const [aImprimir, setAImprimir] = useState<string[] | null>(null);
  const resumen = useMemo(() => (conteo ? resumirConteo(conteo) : null), [conteo]);
  const trozas = conteo?.trozas;
  const etiquetas = useMemo(() => (trozas ? etiquetasDelPatio({ trozas }) : null), [trozas]);
  const paso = conteo ? pasoDelConteo(conteo, elegido) : 1;

  const terminar = () => {
    h.terminar();
    setErrorActa(null);
    window.scrollTo({ top: 0 });
  };

  return (
    <main className="mx-auto min-h-dvh max-w-[48rem] space-y-4 p-4" data-conteo-patio data-paso={paso}>
      <button type="button" onClick={volver} className={BOTON_BORDE}>
        <ArrowLeft className="h-5 w-5" aria-hidden /> {volverA ? "Volver al libro" : "Volver al patio"}
      </button>

      <header className="flex items-center gap-2">
        <PageTitle className="flex items-center gap-2 text-[length:var(--ts-xl)] sm:text-[length:var(--ts-xl)] font-bold text-[var(--text-primary)]">
          <ClipboardList className="h-7 w-7 text-[var(--accent)]" aria-hidden /> Contar el patio
        </PageTitle>
        <InfoTip
          title="Contar el patio"
          what="Recorres la pila escaneando cada troza. Al terminar sale el acta: qué falta (y en qué cancha) y qué sobra."
          affects="Mientras cuentas se guarda en este celular: si recargas o pierdes señal, sigues donde ibas. El acta queda en el libro (pestaña Trozas) para todos. No mueve saldos."
          example="Fin de mes: encuentras 12 de 13; la que falta sale con su cancha y sus días para ir a buscarla."
          side="left"
        />
      </header>

      {conteo && <PasosDelConteo paso={paso} onIr={setElegido} />}

      {h.estado === "cargando" && (
        <p className="flex items-center gap-2 py-6 text-lg text-[var(--text-secondary)]">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden /> Trayendo lo que hay en el patio…
        </p>
      )}

      {h.estado === "error" && (
        <div className="space-y-3 rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-500)]/10 px-4 py-3" role="alert">
          <p className="flex items-start gap-2 text-base font-bold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {h.error}
          </p>
          <button type="button" onClick={() => void h.reintentar()} className={BOTON_BORDE}>
            <RotateCcw className="h-5 w-5" aria-hidden /> Reintentar
          </button>
        </div>
      )}

      {conteo && resumen && etiquetas && (
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
              El patio es más grande de lo que se pudo traer: algún «sobra» puede ser una troza que sí está.
            </p>
          )}
          {errorActa && (
            <p role="alert" className={AVISO_AMBAR}>
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {errorActa}
            </p>
          )}

          {paso === 1 && (
            <PasoEtiquetas
              etiquetas={etiquetas}
              onImprimir={() => setAImprimir(etiquetas.sin.map((t) => t.id))}
              onSeguir={() => setElegido(2)}
            />
          )}
          {paso === 2 && (
            <PasoRecorrer
              conteo={conteo}
              resumen={resumen}
              acciones={{ anotar: h.anotar, anotarCodigo: h.anotarCodigo, quitar: h.quitar, empezarOtro: h.empezarOtro }}
              onTerminar={terminar}
            />
          )}
          {paso === 3 && (
            <PasoActa
              conteo={conteo}
              resumen={resumen}
              estado={acta.estado}
              mensaje={acta.mensaje}
              onReintentar={acta.reintentar}
              onImprimir={() => setErrorActa(abrirActa(conteo, h.negocio))}
              onSeguir={() => {
                h.seguirContando();
                setElegido(2);
              }}
              onOtro={() => {
                h.empezarOtro();
                setElegido(null);
              }}
            />
          )}
        </>
      )}

      {aImprimir && (
        <CtpEtiquetasTrozasModal
          ids={aImprimir}
          contexto="Las piezas del patio sin etiqueta"
          onClose={() => setAImprimir(null)}
          /* Las recién impresas ya tienen etiqueta: se vuelve a traer el patio
             para que el paso 1 lo diga (lo contado no se pisa). */
          onListo={() => void h.reintentar()}
        />
      )}
    </main>
  );
}
