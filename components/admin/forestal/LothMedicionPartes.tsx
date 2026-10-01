"use client";

/**
 * Las piezas del bloque de medición (`LothMedicionFuste`): el selector de la
 * forma de anotar el diámetro, las dos formas y el número que sale de la
 * cuenta. Aparte para que el bloque se lea de arriba abajo.
 */

import { useRef, useState, type InputHTMLAttributes } from "react";
import { Plus } from "@buleje/design-system/icons";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fusteIrregular } from "@/lib/forestal/loth-tala";
import { FORMAS_MEDICION, type FormaMedicion } from "@/lib/forestal/loth-forma-medicion";
import { limpiarDecimal } from "@/lib/forestal/medida-decimal";

/**
 * Sin `w-full`: dos utilidades de ancho en el mismo elemento las resuelve el
 * orden del CSS, no el del string, así que `${INPUT} w-24` quedaba en ancho
 * completo y empujaba fuera la etiqueta del descuento. El ancho lo pone cada
 * uso.
 */
export const INPUT_MEDIDA =
  "h-10 rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-mono tabular-nums text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--data-success-500)]";

type AtributosDelCampo = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange" | "inputMode">;

/**
 * Un campo de medida: texto con teclado decimal (no `type="number"`, ver
 * `lib/forestal/medida-decimal.ts`) y marcado `data-medida` para que las
 * flechas y Enter lo recorran (`navegar-medidas.ts`).
 */
export function CampoMedida({ valor, onValor, ...resto }: AtributosDelCampo & { valor: string; onValor: (v: string) => void }) {
  return (
    <input
      {...resto}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      data-medida=""
      value={valor}
      onChange={(e) => onValor(limpiarDecimal(e.target.value))}
    />
  );
}

/**
 * El mismo campo para un valor que se guarda como NÚMERO (los metros de un
 * descuento). Recuerda lo tipeado: convertido en cada tecla, «0.» volvía a
 * «0» y no se podía escribir 0.5.
 */
export function CampoMetros({ metros, onMetros, ...resto }: AtributosDelCampo & { metros: number; onMetros: (m: number) => void }) {
  const [texto, setTexto] = useState(metros ? String(metros) : "");
  // Cambió desde afuera (se quitó, se reinició): manda el número.
  if ((Number(texto) || 0) !== (metros || 0)) setTexto(metros ? String(metros) : "");
  return (
    <CampoMedida
      {...resto}
      valor={texto}
      onValor={(v) => {
        setTexto(v);
        onMetros(Number(v) || 0);
      }}
    />
  );
}

/** «D1 y D2 promediados» / «Varias medidas por Ø», con la elección recordada. */
export function SelectorFormaMedicion({ forma, onForma }: { forma: FormaMedicion; onForma: (f: FormaMedicion) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <SegmentedControl
        size="sm"
        label="Cómo anotas el diámetro"
        value={forma}
        onChange={onForma}
        options={FORMAS_MEDICION.map((f) => ({ value: f.key, label: f.label }))}
      />
      <InfoTip
        title="Cómo anotas el diámetro"
        what="«D1 y D2 promediados»: traes de la libreta el Ø de cada sección ya promediado. «Varias medidas por Ø»: anotas las medidas cruzadas y el libro saca el promedio."
        affects="La forma que elijas queda fijada en este equipo, para la tala y el trozado. Lo que va al libro es lo mismo: Ø mayor, Ø menor, longitud y volumen."
        example="D1 1.20 y D2 0.90 = lo mismo que 1.30 + 1.10 y 0.95 + 0.85 en varias medidas."
      />
    </div>
  );
}

/** Un número que sale de la cuenta, no que se tipea: misma altura que el input de al lado. */
export function Resultado({
  rotulo,
  valor,
  destacado = false,
  className = "",
}: {
  rotulo: string;
  valor: string;
  destacado?: boolean;
  className?: string;
}) {
  return (
    <div className={className}>
      <span className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">{rotulo}</span>
      <output
        aria-label={rotulo}
        className={`flex h-10 items-center justify-end rounded-lg px-3 font-mono tabular-nums text-[var(--text-primary)] ${
          destacado ? "bg-primary/10 text-base font-bold dark:bg-primary/20" : "bg-[var(--surface-sunken)] text-sm font-semibold"
        }`}
      >
        {valor}
      </output>
    </div>
  );
}

/** Una sección del fuste: N medidas cruzadas y el promedio que va al libro. */
export function SeccionDiametro({
  titulo,
  medidas,
  promedio,
  onMedida,
  onAgregar,
}: {
  titulo: string;
  medidas: string[];
  promedio: number | null;
  onMedida: (i: number, v: string) => void;
  onAgregar: () => void;
}) {
  const irregular = fusteIrregular(medidas.map((m) => Number(m) || null));
  const cajaRef = useRef<HTMLDivElement>(null);
  /** «+» deja el foco en la medida nueva, lista para tipear. */
  const agregar = () => {
    onAgregar();
    requestAnimationFrame(() => {
      const campos = cajaRef.current?.querySelectorAll<HTMLInputElement>("input[data-medida]");
      campos?.[campos.length - 1]?.focus();
    });
  };
  return (
    <div ref={cajaRef} className="space-y-1.5 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-semibold text-[var(--text-secondary)]">{titulo}</span>
        <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]" title="Promedio que va al libro">
          {promedio != null ? `${promedio.toFixed(3)} m` : "—"}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {medidas.map((v, i) => (
          <CampoMedida
            key={i}
            valor={v}
            onValor={(x) => onMedida(i, x)}
            aria-label={`${titulo} — medida cruzada ${i + 1}`}
            placeholder={i === 0 ? "1.30" : "1.10"}
            className={`${INPUT_MEDIDA} w-24`}
          />
        ))}
        {medidas.length < 4 && (
          <button
            type="button"
            onClick={agregar}
            className="grid h-10 w-10 place-items-center rounded-lg border border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
            aria-label={`Agregar otra medida cruzada a ${titulo}`}
            title="Agregar otra medida cruzada"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>
      {irregular && (
        <p className="text-xs font-semibold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">
          Las medidas difieren mucho: toma una tercera para el promedio.
        </p>
      )}
    </div>
  );
}

/** «D1 y D2 promediados»: un campo por sección, que va tal cual al libro. */
export function DiametrosPromediados({
  d1,
  d2,
  onD1,
  onD2,
}: {
  d1: string;
  d2: string;
  onD1: (v: string) => void;
  onD2: (v: string) => void;
}) {
  const campos = [
    { rotulo: "D1 · Ø sección mayor", valor: d1, on: onD1, placeholder: "1.20" },
    { rotulo: "D2 · Ø sección menor", valor: d2, on: onD2, placeholder: "0.90" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {campos.map((c) => (
        <label key={c.rotulo} className="block min-w-0 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-2.5">
          <span className="mb-1.5 block text-xs font-semibold text-[var(--text-secondary)]">
            {c.rotulo} <span className="font-normal text-[var(--text-tertiary)]">(m)</span>
          </span>
          <CampoMedida
            valor={c.valor}
            onValor={c.on}
            aria-label={c.rotulo}
            placeholder={c.placeholder}
            className={`${INPUT_MEDIDA} w-full`}
          />
        </label>
      ))}
    </div>
  );
}
