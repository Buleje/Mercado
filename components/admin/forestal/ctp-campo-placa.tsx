"use client";

/**
 * Un casillero de placa leído con las reglas de la placa peruana
 * (`lib/forestal/placa-peru.ts`, Brandon 29-09-2026: «para evitar inventados»).
 *
 * Lo usan todas las pantallas donde se escribe una placa: las dos guías de
 * salida (CTP y Libro TH, vía `ctp-guia-placa`), el editor de la GTF de salida,
 * la guía corta del Libro TH, el flete, el Directorio y las dos guías de
 * INGRESO. Cambia sólo cuánto pesa una placa que no puede existir:
 *
 *   · por defecto → ERROR (rojo, `aria-invalid`): la guía de salida la emite el
 *     negocio y una placa inventada invalida la declaración jurada;
 *   · `soloAviso="papel"` → AVISO: en una guía de INGRESO la placa es el papel
 *     de un tercero y hay que poder transcribirlo tal cual (`transcribir`: sin
 *     formato ni recorte);
 *   · `soloAviso="guardada"` → AVISO: una ficha o un flete guardados antes con
 *     esa placa siguen editándose; la regla vuelve si se cambia la placa.
 */

import { useId, type ReactNode } from "react";
import { AlertCircle, AlertTriangle, Check } from "@buleje/design-system/icons";
import { EJEMPLO_PLACA, formatearAlTipear, leerPlaca, normalizarPlacaPeru, partirPlacasDeGuia, type LecturaPlaca } from "@/lib/forestal/placa-peru";
import { CLASE_FALTA, CLASE_NO_APLICA } from "./ctp-guia-piezas";
import { Field, I, type CampoSpan } from "./ctp-shared";

/** Placa que no puede existir: en rojo, pero sólo sin foco (mientras se tipea manda el foco). */
const CLASE_ERROR = "not-focus:border-[var(--data-error-500)] not-focus:bg-[var(--data-error-500)]/5";

/** Cuándo una placa inválida es aviso y no error. */
export type AvisoPlaca = "papel" | "guardada";

const TEXTO_AVISO: Record<AvisoPlaca, (motivo: string) => string> = {
  papel: (m) => `${m} Si el papel dice así, déjala.`,
  guardada: (m) => `Así quedó guardada. ${m}`,
};

/** Lo que dice la placa, debajo del campo. */
function LecturaDePlaca({ id, lectura, aviso }: { id: string; lectura: LecturaPlaca; aviso?: AvisoPlaca }) {
  if (lectura.estado === "vacia") return null;
  if (lectura.estado === "invalida" && !aviso) {
    return (
      <p id={id} className="mt-1 flex items-start gap-1 text-xs leading-snug text-[var(--data-error-ink)]">
        <AlertCircle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{lectura.motivo}</span>
      </p>
    );
  }
  const textoAviso = lectura.estado === "invalida" && aviso ? TEXTO_AVISO[aviso](lectura.motivo) : lectura.estado === "valida" ? lectura.aviso : null;
  if (textoAviso) {
    return (
      <p id={id} className="mt-1 flex items-start gap-1 text-xs leading-snug text-[var(--data-warning-ink)]">
        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>{textoAviso}</span>
      </p>
    );
  }
  if (lectura.estado !== "valida") return null;
  return (
    <p id={id} className="mt-1 text-xs leading-snug">
      <span
        title="Zona registral donde se inscribió el vehículo (1.ª letra de la placa)"
        className="inline-flex items-center gap-1 rounded bg-[var(--surface-sunken)] px-1.5 py-0.5 font-semibold text-[var(--text-secondary)]"
      >
        <Check className="h-3 w-3 text-[var(--data-success-ink)]" aria-hidden />
        <span className="font-mono">{lectura.letraZona}</span>
        <span aria-hidden>·</span>
        {lectura.zona}
      </span>
    </p>
  );
}

/**
 * Un casillero de placa. `validar={false}` (río: matrícula de embarcación)
 * deja el campo como antes: sólo mayúsculas, sin formato ni lectura.
 */
export function CampoPlaca({
  label,
  valor,
  onCambio,
  span,
  required,
  opcional,
  validar = true,
  soloAviso,
  transcribir,
  onRemolque,
  hint,
  casillero,
  accion,
  autoFocus,
  error,
}: {
  label: string;
  valor: string;
  onCambio: (v: string) => void;
  /** Sin `span` no se pone clase: el campo toma el ancho de la grilla que lo envuelve. */
  span?: CampoSpan;
  required?: boolean;
  /** Puede quedar vacío (remolque): vacío va punteado con «no aplica». */
  opcional?: boolean;
  validar?: boolean;
  /** Una placa inválida se AVISA en vez de marcarse como error (ver cabecera). */
  soloAviso?: AvisoPlaca;
  /** Se guarda lo tipeado tal cual (sólo mayúsculas): el papel de un tercero. */
  transcribir?: boolean;
  /**
   * Pegar «V2H-901 / W3A-123» (el casillero «Placa(s)» de SERFOR) deja la
   * primera acá y manda la segunda al remolque. Sin esto, se queda la primera.
   */
  onRemolque?: (v: string) => void;
  hint?: string;
  casillero?: number;
  /** Lo que va al lado del campo (el botón «Buscar»). */
  accion?: ReactNode;
  autoFocus?: boolean;
  /** Un error de afuera (la placa ya está en el Directorio): manda sobre la lectura. */
  error?: string | null;
}) {
  const id = useId();
  const leida: LecturaPlaca = validar ? leerPlaca(valor) : { estado: "vacia" };
  const lectura: LecturaPlaca = error ? { estado: "invalida", normalizada: normalizarPlacaPeru(valor), motivo: error } : leida;
  const aviso = error ? undefined : soloAviso;
  const esError = lectura.estado === "invalida" && !aviso;
  const vacia = leerPlaca(valor).estado === "vacia";
  const noAplica = Boolean(opcional) && vacia;
  const clase = esError ? CLASE_ERROR : lectura.estado === "invalida" || (required && vacia) ? CLASE_FALTA : "";

  function cambiar(crudo: string) {
    if (!validar || transcribir) return onCambio(crudo.toUpperCase());
    if (crudo.includes("/")) {
      const { placa, remolque } = partirPlacasDeGuia(crudo);
      onCambio(formatearAlTipear(placa));
      if (remolque && onRemolque) onRemolque(formatearAlTipear(remolque));
      return;
    }
    onCambio(formatearAlTipear(crudo));
  }

  return (
    <Field span={span} label={label} required={required} hint={hint} casillero={casillero}>
      <div className="flex gap-2">
        <input
          type="text"
          aria-label={label}
          aria-required={required || undefined}
          aria-invalid={esError || undefined}
          aria-describedby={lectura.estado !== "vacia" ? `${id}-lectura` : undefined}
          inputMode="text"
          autoFocus={autoFocus}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          /* Sin maxLength: el navegador recorta lo pegado ANTES de formatear y « V2H-901»
             (con un espacio de adelante) perdía el último número; el formato ya topa en 6. */
          placeholder={noAplica ? "no aplica" : validar ? EJEMPLO_PLACA : undefined}
          className={`${I} min-w-0 flex-1 font-mono uppercase placeholder:normal-case ${clase} ${noAplica ? CLASE_NO_APLICA : ""}`}
          value={valor}
          onChange={(e) => cambiar(e.target.value)}
        />
        {accion}
      </div>
      {(validar || error) && <LecturaDePlaca id={`${id}-lectura`} lectura={lectura} aviso={aviso} />}
    </Field>
  );
}
