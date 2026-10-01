"use client";

/**
 * Los primitivos visuales del bloque de campos personalizados (ADR-427): las
 * clases que calcan los formularios del panel y la fila de un campo.
 *
 * Viven aparte para que el bloque (`CamposPersonalizados`) y el alta
 * (`CampoPersonalizadoNuevo`) los importen en una sola dirección, sin ciclo y
 * sin repetir una cadena de Tailwind de doscientos caracteres en dos archivos.
 */

import { useId } from "react";
import { motivoValorInvalido, type TipoCampo } from "@/lib/campos-personalizados";

/* Calca la clase de los campos de los modales del Libro (`ctp-shared`): h-11
   para que el input y el botón de al lado queden alineados, radio xl y foco en
   el turquesa de la marca. */
export const CAMPO_INPUT =
  "w-full h-11 rounded-xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-3.5 text-sm text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] duration-[var(--motion-fast)] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] disabled:cursor-not-allowed disabled:bg-[var(--surface-sunken)] disabled:text-[var(--text-tertiary)] placeholder:text-[var(--text-tertiary)]";

export const CAMPO_LABEL = "block text-xs font-semibold text-[var(--text-secondary)] mb-1.5";
export const CAMPO_AYUDA = "mt-1 text-xs text-[var(--text-tertiary)]";
export const CAMPO_AVISO = "mt-1 text-xs font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";

const BOTON =
  "inline-flex h-9 items-center gap-1.5 rounded-xl px-3 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60";
export const BOTON_PRIMARIO = `${BOTON} bg-[var(--accent)] text-white hover:bg-[var(--accent-600)]`;
export const BOTON_SUAVE = `${BOTON} border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]`;
export const BOTON_ICONO =
  "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]";

/**
 * El control que le toca a cada tipo. Uno solo por tipo: ofrecer dos formas de
 * escribir lo mismo es lo que hace que un dato se cargue distinto cada vez.
 */
function ControlDeCampo({
  id,
  tipo,
  opciones,
  valor,
  ayudaId,
  onCambio,
}: {
  id: string;
  tipo: TipoCampo;
  opciones: readonly string[];
  valor: string;
  /** `undefined` cuando el campo no tiene ayuda ni aviso: un `aria-describedby`
   *  apuntando a un párrafo vacío hace que el lector anuncie un hueco. */
  ayudaId: string | undefined;
  onCambio: (v: string) => void;
}) {
  if (tipo === "nota") {
    return (
      <textarea
        id={id}
        rows={3}
        aria-describedby={ayudaId}
        className={`${CAMPO_INPUT} h-auto py-2 leading-relaxed`}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
      />
    );
  }
  if (tipo === "si_no") {
    return (
      <select id={id} aria-describedby={ayudaId} className={CAMPO_INPUT} value={valor} onChange={(e) => onCambio(e.target.value)}>
        <option value="">Sin responder</option>
        <option value="si">Sí</option>
        <option value="no">No</option>
      </select>
    );
  }
  if (tipo === "opcion" && opciones.length > 0) {
    return (
      <select id={id} aria-describedby={ayudaId} className={CAMPO_INPUT} value={valor} onChange={(e) => onCambio(e.target.value)}>
        <option value="">Elegir…</option>
        {opciones.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (tipo === "fecha") {
    return <input id={id} type="date" aria-describedby={ayudaId} className={CAMPO_INPUT} value={valor} onChange={(e) => onCambio(e.target.value)} />;
  }
  /* El número va como texto con teclado numérico: así «12,5» llega entero al
     aviso de `motivoValorInvalido` en vez de que el navegador se lo coma en
     silencio y el campo quede vacío sin que nadie sepa por qué. */
  if (tipo === "numero") {
    return (
      <input
        id={id}
        type="text"
        inputMode="decimal"
        aria-describedby={ayudaId}
        className={`${CAMPO_INPUT} tabular-nums`}
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
      />
    );
  }
  return <input id={id} type="text" aria-describedby={ayudaId} className={CAMPO_INPUT} value={valor} onChange={(e) => onCambio(e.target.value)} />;
}

/**
 * Un campo en pantalla: su nombre, sus acciones, el control y —debajo— para qué
 * es. La descripción va ahí y no en un globito porque es lo único que explica,
 * dentro de seis meses, qué se esperaba en ese casillero. Si lo escrito no es
 * lo que el tipo dice, el aviso toma ese lugar: avisa, no traba.
 */
export function FilaCampo({
  nombre,
  descripcion,
  tipo,
  opciones,
  temporal,
  valor,
  onCambio,
  acciones,
}: {
  nombre: string;
  descripcion: string | null;
  tipo: TipoCampo;
  opciones: readonly string[];
  temporal: boolean;
  valor: string;
  onCambio: (v: string) => void;
  acciones?: React.ReactNode;
}) {
  const id = useId();
  const aviso = motivoValorInvalido({ tipo, opciones: [...opciones] }, valor);
  const texto = aviso ?? descripcion;
  return (
    <div className={`min-w-0 ${tipo === "nota" ? "sm:col-span-2" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <label htmlFor={id} className={`${CAMPO_LABEL} min-w-0 flex-1 break-words`}>
          {nombre}
          {/* El espacio es real y no decorativo: sin él un lector de pantalla
              lee «Peso del bultoSólo acá» de corrido. */}
          {temporal && " "}
          {temporal && (
            <span className="rounded-full bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
              Sólo acá
            </span>
          )}
        </label>
        {acciones && <span className="-mt-1.5 flex shrink-0 items-center gap-0.5">{acciones}</span>}
      </div>
      <ControlDeCampo id={id} tipo={tipo} opciones={opciones} valor={valor} ayudaId={texto ? `${id}-ayuda` : undefined} onCambio={onCambio} />
      {texto && (
        <p id={`${id}-ayuda`} className={aviso ? CAMPO_AVISO : CAMPO_AYUDA}>
          {texto}
        </p>
      )}
    </div>
  );
}
