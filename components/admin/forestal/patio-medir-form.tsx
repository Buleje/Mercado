"use client";

/**
 * La tarjeta de la troza escaneada en «Medir escaneando» (Brandon 2026-09-26):
 * quién es (código, especie, guía y sus medidas en la guía) y tres casillas
 * grandes —D1″ · D2″ · L′— con el PT en vivo. Si la guía no trajo D1/D2 en cm,
 * dos casillas más, opcionales.
 *
 * Se usa de pie, con la tablet en una mano: casillas de 56 px, teclado
 * numérico (`inputMode="decimal"`, coma o punto) y Enter que avanza a la
 * casilla siguiente o, si ya está todo, guarda. Lo que se tipea se lee con la
 * planilla de la guía (`planilla-oxapampa.ts`): la misma cuenta, las mismas
 * reglas.
 *
 * Lo que la pistola sigue tipeando del escaneo que abrió la tarjeta (el otro
 * código de la etiqueta, el resto de la ficha del QR grande) se descarta en
 * silencio (`esRestoDelEscaneo`): en Blas «58» es un código y también una
 * medida posible. Si el servidor rechazó lo que se mandó de esta troza, la
 * tarjeta abre con eso y el motivo, lista para reenviar.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, Loader2, ScanBarcode, Trash2 } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { fmtPt } from "@/lib/forestal/cubicacion-formato";
import { partesDeMedidas } from "@/lib/forestal/ficha-texto-troza";
import { codigoDeTroza } from "@/lib/forestal/conteo-patio";
import { LABEL_BLOQUEO, motivoBloqueo, type TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import type { CambioMedidaTroza } from "@/lib/forestal/medidas-troza";
import {
  cambioDeFila,
  erroresDeFila,
  ptVisibleDeFila,
  type CampoPlanilla,
  type FilaPlanilla,
} from "@/lib/forestal/planilla-oxapampa";
import { faltaParaGuardar, filaInicial, oxQueFalta, pareceEscaneo, textoDeLoQueFalta } from "@/lib/forestal/medir-patio";
import { fechaHoraCorta } from "@/lib/forestal/conteo-patio-acta";
import CampoMedida, { ETIQUETA } from "./patio-medir-campo";

const BOTON =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 text-base font-bold transition-colors";

export default function FormMedida({
  troza,
  guardando,
  propuesta = null,
  motivo = null,
  onGuardar,
  onOtra,
  onEscaneoEnCampo,
  esRestoDelEscaneo,
}: {
  troza: TrozaConsumible;
  guardando: boolean;
  /** Lo que se mandó y el servidor rechazó: la tarjeta abre con eso para reenviarlo. */
  propuesta?: CambioMedidaTroza | null;
  /** Por qué no se guardó (sólo con `propuesta`). */
  motivo?: string | null;
  onGuardar: (cambio: CambioMedidaTroza, ptTablet: number | null) => void;
  /** Dejar esta troza sin guardar y volver al escáner. */
  onOtra: () => void;
  /** La pistola tipeó un código en una casilla. `conDatos` = había algo tipeado. */
  onEscaneoEnCampo: (texto: string, conDatos: boolean) => void;
  /** ¿Es el resto del escaneo que abrió la tarjeta (eco de la etiqueta, línea de la ficha)? */
  esRestoDelEscaneo?: (texto: string, previo: string) => boolean;
}) {
  const inicial = useMemo(() => filaInicial(troza, propuesta), [troza, propuesta]);
  const [fila, setFila] = useState<FilaPlanilla>(inicial);
  const [borrando, setBorrando] = useState(false);
  const refs = useRef<Partial<Record<CampoPlanilla, HTMLInputElement | null>>>({});

  /** Las casillas de cm, sólo la punta que la guía no trajo. */
  const camposCm = useMemo(
    () => (["d1Cm", "d2Cm"] as const).filter((c) => (c === "d1Cm" ? troza.d1Cm : troza.d2Cm) == null),
    [troza.d1Cm, troza.d2Cm],
  );
  const orden: CampoPlanilla[] = useMemo(() => ["d1", "d2", "largo", ...camposCm], [camposCm]);

  const errores = erroresDeFila(fila);
  const hayErrores = Object.keys(errores).length > 0;
  const cambio = hayErrores ? null : cambioDeFila(troza, fila);
  const falta = faltaParaGuardar(troza, fila, cambio);
  const pt = ptVisibleDeFila(troza, fila);
  /** «Falta D2″»: se tipeó parte de la cubicación y no alcanza para el PT. */
  const aMedias = hayErrores ? null : textoDeLoQueFalta(oxQueFalta(fila));
  const yaMedida = troza.oxD1Pulg != null || troza.oxD2Pulg != null || troza.oxLargoPies != null;
  const bloqueo = motivoBloqueo(troza);
  const codigo = codigoDeTroza({ id: troza.id, codigoPlanta: troza.codigoPlanta ?? null, codificacion: troza.codificacion });
  const guia = partesDeMedidas(troza);

  /* Al escanear, el cursor va a D1: la pistola deja el foco en el escáner.
     Con lo tipeado SELECCIONADO: si la pistola manda el otro código de la
     etiqueta, reemplaza la medida guardada en vez de pegarse a ella. */
  useEffect(() => {
    const r = requestAnimationFrame(() => {
      refs.current.d1?.focus();
      refs.current.d1?.select();
    });
    return () => cancelAnimationFrame(r);
  }, []);

  const enviar = () => {
    if (falta || !cambio || guardando) return;
    onGuardar(cambio, pt);
  };

  const alEnter = (campo: CampoPlanilla) => {
    const texto = fila[campo];
    if (esRestoDelEscaneo?.(texto, inicial[campo])) {
      setFila((f) => ({ ...f, [campo]: inicial[campo] }));
      requestAnimationFrame(() => refs.current[campo]?.select());
      return;
    }
    if (pareceEscaneo(texto)) {
      const conDatos = orden.some((c) => c !== campo && fila[c] !== inicial[c]);
      setFila((f) => ({ ...f, [campo]: inicial[campo] }));
      onEscaneoEnCampo(texto, conDatos);
      return;
    }
    if (!falta && cambio) return enviar();
    const i = orden.indexOf(campo);
    refs.current[orden[(i + 1) % orden.length]!]?.focus();
  };

  const campo = (c: CampoPlanilla, grande: boolean) => (
    <CampoMedida
      key={c}
      campo={c}
      valor={fila[c]}
      error={errores[c]}
      grande={grande}
      entrar={c === orden[orden.length - 1] ? "done" : "next"}
      onCambio={(v) => setFila((f) => ({ ...f, [c]: v }))}
      onEnter={() => alEnter(c)}
      refCampo={(el) => {
        refs.current[c] = el;
      }}
    />
  );

  return (
    <section
      aria-label={`Medidas de la troza ${codigo}`}
      className="space-y-3 rounded-2xl border-2 border-[var(--accent)] bg-[var(--surface-raised)] p-4"
      data-form-medida={troza.id}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <CardTitle as="h2" className="font-mono text-2xl font-bold text-[var(--text-primary)]">
            {codigo}
          </CardTitle>
          <p className="text-base text-[var(--text-secondary)]">
            {[troza.especieComun, troza.gtfNumber && `guía ${troza.gtfNumber}`].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        {yaMedida && troza.oxPt != null && (
          <span className="rounded-xl bg-[var(--accent)]/12 px-3 py-1 text-base font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
            Ya medida: {fmtPt(troza.oxPt)} PT
            {troza.oxMedidoEn ? ` · ${fechaHoraCorta(troza.oxMedidoEn)}` : ""}
          </span>
        )}
      </div>

      <p className="text-base text-[var(--text-secondary)]">
        En la guía: <span className="tabular-nums text-[var(--text-primary)]">{guia.diametros} · {guia.largo}</span>
      </p>

      {propuesta && motivo && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-500)]/10 px-4 py-3 text-base font-bold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]"
          data-medida-rechazada
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <span className="min-w-0">No se guardó: {motivo} Revisa y vuelve a guardar.</span>
        </p>
      )}

      {bloqueo && (
        <p className="flex items-start gap-2 text-base font-bold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden /> {LABEL_BLOQUEO[bloqueo]}. Igual se puede medir.
        </p>
      )}

      <div className="grid grid-cols-3 gap-2">{(["d1", "d2", "largo"] as const).map((c) => campo(c, true))}</div>

      {/* Con una sola punta (o sin largo) NO hay PT: en su lugar, lo que falta
          (revisión 26-09 de `ptOxapampa`: media medida = sin cubicar). */}
      <p className="flex min-h-12 flex-wrap items-baseline gap-x-3" aria-live="polite" data-pt-en-vivo>
        {pt != null ? (
          <span className="text-4xl font-bold tabular-nums text-[var(--text-primary)]">
            {fmtPt(pt)} <span className="text-2xl">PT</span>
          </span>
        ) : aMedias ? (
          <span className="text-2xl font-bold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">{aMedias}</span>
        ) : (
          <span className="text-4xl font-bold text-[var(--text-tertiary)]">
            — <span className="text-2xl">PT</span>
          </span>
        )}
        {falta && !aMedias && <span className="text-base text-[var(--text-secondary)]">{falta}</span>}
      </p>

      {camposCm.length > 0 && (
        <div className="space-y-1 border-t border-[var(--rule-base)] pt-3">
          <p className="text-base text-[var(--text-secondary)]">
            {camposCm.length === 2 ? "D1 cm · D2 cm" : ETIQUETA[camposCm[0]!]} (la guía no los trae) · opcional
          </p>
          <div className="grid max-w-[20rem] grid-cols-2 gap-2">{camposCm.map((c) => campo(c, false))}</div>
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={enviar}
          disabled={Boolean(falta) || !cambio || guardando}
          className={`${BOTON} min-h-14 grow basis-[14rem] bg-[var(--accent)] text-white hover:bg-[var(--accent-600)] disabled:opacity-40`}
          data-guardar-medida
        >
          {guardando ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <ArrowRight className="h-5 w-5" aria-hidden />}
          Guardar y siguiente
        </button>
        <button
          type="button"
          onClick={onOtra}
          className={`${BOTON} grow border border-[var(--rule-base)] text-[var(--text-primary)] hover:border-[var(--accent)] sm:grow-0`}
        >
          <ScanBarcode className="h-5 w-5" aria-hidden /> Otra troza
        </button>
        {yaMedida &&
          (borrando ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-base font-bold text-[var(--text-primary)]">¿Borrar la medida de {codigo}?</span>
              <button
                type="button"
                onClick={() => {
                  setBorrando(false);
                  onGuardar({ id: troza.id, oxD1Pulg: null, oxD2Pulg: null, oxLargoPies: null }, null);
                }}
                className={`${BOTON} border-2 border-[var(--data-error-500)] text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]`}
              >
                Sí, borrar
              </button>
              <button type="button" onClick={() => setBorrando(false)} className={`${BOTON} border border-[var(--rule-base)] text-[var(--text-primary)]`}>
                No
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setBorrando(true)}
              className={`${BOTON} grow border border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--data-error-500)] hover:text-[var(--data-error-ink)] sm:grow-0 dark:hover:text-[var(--data-error-500)]`}
            >
              <Trash2 className="h-5 w-5" aria-hidden /> Borrar la medida
            </button>
          ))}
      </div>
    </section>
  );
}
