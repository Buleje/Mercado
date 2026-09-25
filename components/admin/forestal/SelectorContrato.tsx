"use client";

/**
 * SelectorContrato — elegir el permiso bajo el que se registra algo (ADR-421).
 *
 * Único para los cinco formularios (gasto, adelanto, flete, ingreso de madera,
 * lote/producción): si cada uno arma su propio desplegable, el día que cambie
 * la regla —qué contratos se ofrecen, cómo se sugiere— hay que acordarse de
 * cinco lugares.
 *
 * ## Sugiere, no pregunta en blanco
 *
 * Casi siempre el papel ya dice de qué permiso viene: la guía trae su
 * `originCode`, el lote hereda el de sus trozas. Cuando el que llama pasa
 * `codigoSugerido`, el selector resuelve solo a ese contrato y lo dice. Pedir
 * el dato en blanco, teniéndolo, es como se llenan los campos con lo primero
 * de la lista.
 *
 * Si el código sugerido NO está cargado como contrato, no se inventa nada: se
 * avisa y se deja el camino para crearlo desde la pantalla de Contratos.
 *
 * ## El contrato activo de la banda del libro llena el hueco (2026-09-19)
 *
 * Cuando ninguna de las dos cosas de arriba aplica —no hay elección propia NI
 * documento que sugiera algo (ni siquiera uno huérfano)— el permiso fijado en
 * la banda del libro (`useContratoActivo`) es el default. Sigue siendo un
 * default: el documento manda si trae código, y el usuario manda si ya tocó
 * el selector. `sugerirActivo={false}` apaga esto por completo — lo usa quien
 * esté EDITANDO un registro ya guardado, para no pisar un «sin contrato»
 * elegido a mano en su momento (que en el estado es indistinguible de «nunca
 * se tocó»).
 *
 * Y lo dice (2026-09-24): «Propuesto por el permiso activo: …», con el mismo
 * estilo que el aviso del documento. Se recuerda QUÉ id propuso el activo, no
 * se deduce de `value === activo`: un registro que ya traía ese contrato (o
 * una elección a mano del mismo) no fue propuesto por nadie. Apenas el
 * usuario toca el selector, el aviso se va.
 *
 * ## «Sin contrato» elegido a mano se respeta (2026-09-24)
 *
 * Medido en el navegador: con un permiso activo, elegir «Sin contrato» volvía
 * solo al permiso en menos de 1,5 s — el efecto veía `value == null` y lo leía
 * como «nunca se tocó». Así no había forma de registrar un ingreso sin
 * contrato. En el estado, «sin contrato elegido a mano» y «todavía nada» son el
 * mismo `null`; lo que los distingue es haber tocado el selector, y eso se
 * recuerda en un ref. Vale para las dos propuestas: la del documento y la del
 * permiso activo.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { FileText, TriangleAlert } from "@buleje/design-system/icons";
import { normalizarCodigoContrato } from "@/lib/forestal/contratos";
import { useContratos } from "@/hooks/use-contratos";
import { useContratoActivo } from "@/contexts/contrato-activo-context";

interface Props {
  /** El contrato elegido, o `null` para «sin contrato». */
  value: string | null;
  onChange: (contratoId: string | null) => void;
  /** El código que ya trae el documento (`originCode`, `permiso`). */
  codigoSugerido?: string | null;
  label?: string;
  /** Texto bajo el selector. Por defecto explica qué implica elegirlo. */
  hint?: string;
  /** Cuando la pantalla no admite «sin contrato». Por defecto SÍ lo admite: un
   *  gasto de oficina no pertenece a ningún permiso. */
  requerido?: boolean;
  disabled?: boolean;
  /** Para el `aria-describedby` del formulario que lo monta. */
  id?: string;
  /** Apagar el default del contrato activo de la banda (ver doc de arriba).
   *  Por defecto `true`: sólo hace falta `false` en un formulario que EDITA un
   *  registro existente (uno en blanco no tiene nada que proteger). */
  sugerirActivo?: boolean;
}

export default function SelectorContrato({
  value,
  onChange,
  codigoSugerido,
  label = "Contrato / permiso",
  hint,
  requerido = false,
  disabled = false,
  id = "selector-contrato",
  sugerirActivo = true,
}: Props) {
  const { contratos, cargando } = useContratos();
  const { contratoId: activoId } = useContratoActivo();

  /** El contrato que corresponde al código del papel, si está cargado. */
  const sugerido = useMemo(() => {
    const norm = normalizarCodigoContrato(codigoSugerido ?? "");
    if (!norm) return null;
    return contratos.find((c) => c.codigoNorm === norm) ?? null;
  }, [codigoSugerido, contratos]);

  /** El activo sigue existiendo entre los contratos cargados: uno borrado o
   *  renombrado en localStorage no debe terminar seleccionado a ciegas. */
  const activoCargado = useMemo(
    () => (activoId ? (contratos.find((c) => c.id === activoId) ?? null) : null),
    [activoId, contratos],
  );

  const hayCodigoSugerido = Boolean(codigoSugerido?.trim());

  /** El id que puso el contrato activo de la banda, mientras nadie lo cambie
   *  a mano. Sólo lo escribe el efecto de abajo; el `onChange` del select lo
   *  borra. */
  const [propuestoPorActivo, setPropuestoPorActivo] = useState<string | null>(null);

  /** El usuario ya eligió en este selector (cualquier opción, también «Sin
   *  contrato»). Desde ahí ninguna propuesta vuelve a escribir el valor. Ref y
   *  no estado: sólo lo leen los efectos y no cambia nada de lo dibujado. */
  const tocadoRef = useRef(false);

  /**
   * Auto-elegir el sugerido, SÓLO si el usuario todavía no eligió nada.
   * Pisar una elección hecha a mano porque llegó la lista sería decidir por él
   * —el bug de «la carga vieja pisa lo optimista», con otra cara—.
   */
  useEffect(() => {
    if (tocadoRef.current) return;
    if (value == null && sugerido) onChange(sugerido.id);
  }, [sugerido, value, onChange]);

  /**
   * Sin elección propia y sin nada que el documento sugiera —ni siquiera un
   * código huérfano: ESE manda aunque no resuelva a un id—, el permiso fijado
   * en la banda llena el hueco. `hayCodigoSugerido` (no `sugerido`) es a
   * propósito: un código que el papel trae y todavía no es contrato no debe
   * terminar imputado a otro permiso distinto sólo porque el activo sí carga.
   */
  useEffect(() => {
    if (tocadoRef.current) return;
    if (!sugerirActivo || value != null || hayCodigoSugerido || !activoCargado) return;
    setPropuestoPorActivo(activoCargado.id);
    onChange(activoCargado.id);
  }, [sugerirActivo, value, hayCodigoSugerido, activoCargado, onChange]);

  const codigoHuerfano = Boolean(codigoSugerido?.trim()) && !sugerido && !cargando;

  /** Sigue en pie lo que propuso el activo: mismo id, todavía cargado. */
  const propuestoActivo =
    sugerirActivo &&
    activoCargado &&
    propuestoPorActivo === activoCargado.id &&
    value === activoCargado.id
      ? activoCargado
      : null;

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-bold text-[var(--text-secondary)]">
        {label}
        {!requerido && (
          <span className="ml-1 font-medium text-[var(--text-tertiary)]">(opcional)</span>
        )}
      </label>

      <div className="relative">
        <FileText
          className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]"
          aria-hidden
        />
        <select
          id={id}
          value={value ?? ""}
          disabled={disabled || cargando}
          onChange={(e) => {
            tocadoRef.current = true;
            setPropuestoPorActivo(null);
            onChange(e.target.value || null);
          }}
          className="h-12 w-full rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-11 pr-4 text-base font-medium text-[var(--text-primary)] transition-colors focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] disabled:opacity-60"
        >
          {!requerido && <option value="">Sin contrato</option>}
          {requerido && value == null && <option value="">Elige el contrato…</option>}
          {contratos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo}
              {c.alias ? ` · ${c.alias}` : ""} — {c.titularNombre}
            </option>
          ))}
        </select>
      </div>

      {sugerido && value === sugerido.id ? (
        <p className="mt-1.5 text-sm font-medium text-[var(--accent-ink)] dark:text-[var(--accent)]">
          Sugerido por el documento: {sugerido.codigo}
        </p>
      ) : codigoHuerfano ? (
        <p className="mt-1.5 flex items-start gap-1.5 text-sm font-medium text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            El documento dice «{codigoSugerido}» y ese permiso todavía no está cargado como
            contrato. Se puede crear desde Gestión › Contratos; mientras tanto, esto queda sin
            imputar.
          </span>
        </p>
      ) : propuestoActivo ? (
        <p className="mt-1.5 text-sm font-medium text-[var(--accent-ink)] dark:text-[var(--accent)]">
          Propuesto por el permiso activo: {propuestoActivo.codigo}
        </p>
      ) : (
        <p className="mt-1.5 text-sm text-[var(--text-tertiary)]">
          {hint ?? "Lo que se registre con un contrato suma en su balance."}
        </p>
      )}
    </div>
  );
}
