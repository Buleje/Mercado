"use client";

/**
 * El formulario de las opciones de una pieza, armado desde su JSON Schema
 * (`campos-de-schema.ts`). Sólo pinta y avisa los cambios; qué es válido lo
 * decide el servidor al guardar.
 */
import { useId, useState } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { Campo } from "./campos-de-schema";

type Valores = Record<string, unknown>;

interface Props {
  campos: readonly Campo[];
  valores: Valores;
  onCambio: (clave: string, valor: unknown) => void;
}

const ENTRADA =
  "w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-base text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none";

function Rotulo({ htmlFor, campo }: { htmlFor?: string; campo: Campo }) {
  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={htmlFor} className="text-sm font-bold text-[var(--text-primary)]">
        {campo.rotulo}
      </label>
      {campo.ayuda && <InfoTip title={campo.rotulo} what={campo.ayuda} side="bottom" />}
    </div>
  );
}

/** Con su propio texto: si se re-armara desde la lista, un Enter al final se perdería antes de escribir la línea nueva. */
function CampoLista({ campo, valor, onCambio }: { campo: Extract<Campo, { tipo: "lista" }>; valor: unknown; onCambio: (v: unknown) => void }) {
  const id = useId();
  const [texto, setTexto] = useState(() => (Array.isArray(valor) ? (valor as string[]).join("\n") : ""));
  const rango = [campo.min !== undefined ? `mínimo ${campo.min}` : null, campo.max !== undefined ? `máximo ${campo.max}` : null].filter(Boolean).join(", ");
  return (
    <div className="space-y-1.5">
      <Rotulo htmlFor={id} campo={campo} />
      <textarea
        id={id}
        rows={Math.min(8, Math.max(3, texto.split("\n").length + 1))}
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          onCambio(e.target.value.split("\n").map((l) => l.trim()).filter(Boolean));
        }}
        className={`${ENTRADA} py-2`}
      />
      <p className="text-sm text-[var(--text-secondary)]">Uno por línea{rango ? ` (${rango})` : ""}.</p>
    </div>
  );
}

function CampoDe({ campo, valor, onCambio }: { campo: Campo; valor: unknown; onCambio: (v: unknown) => void }) {
  const id = useId();

  switch (campo.tipo) {
    case "texto":
      return (
        <div className="space-y-1.5">
          <Rotulo htmlFor={id} campo={campo} />
          {campo.largo ? (
            <textarea id={id} rows={3} maxLength={campo.max} value={String(valor ?? "")} onChange={(e) => onCambio(e.target.value)} className={`${ENTRADA} py-2`} />
          ) : (
            <input id={id} type="text" maxLength={campo.max} value={String(valor ?? "")} onChange={(e) => onCambio(e.target.value)} className={`${ENTRADA} h-11`} />
          )}
        </div>
      );
    case "numero":
      return (
        <div className="space-y-1.5">
          <Rotulo htmlFor={id} campo={campo} />
          <input
            id={id}
            type="number"
            inputMode="decimal"
            min={campo.min}
            max={campo.max}
            step={campo.entero ? 1 : "any"}
            value={typeof valor === "number" ? valor : ""}
            onChange={(e) => onCambio(e.target.value === "" ? undefined : Number(e.target.value))}
            className={`${ENTRADA} h-11`}
          />
        </div>
      );
    case "booleano":
      return (
        <label className="flex min-h-11 cursor-pointer items-center gap-3">
          <input type="checkbox" checked={valor === true} onChange={(e) => onCambio(e.target.checked)} className="h-5 w-5 accent-[var(--accent)]" />
          <span className="text-sm font-bold text-[var(--text-primary)]">{campo.rotulo}</span>
          {campo.ayuda && <InfoTip title={campo.rotulo} what={campo.ayuda} side="bottom" />}
        </label>
      );
    case "elegir":
      return (
        <div className="space-y-1.5">
          <Rotulo htmlFor={id} campo={campo} />
          <select id={id} value={String(valor ?? "")} onChange={(e) => onCambio(e.target.value)} className={`${ENTRADA} h-11`}>
            {campo.opciones.map((o) => (
              <option key={o.valor} value={o.valor}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>
      );
    case "varias": {
      const marcadas = Array.isArray(valor) ? (valor as string[]) : [];
      const alternar = (v: string) => {
        const quedan = marcadas.includes(v) ? marcadas.filter((m) => m !== v) : [...marcadas, v];
        // En el orden del catálogo: así el Excel sale siempre con las columnas en el mismo orden.
        onCambio(campo.opciones.map((o) => o.valor).filter((x) => quedan.includes(x)));
      };
      return (
        <fieldset className="space-y-1.5">
          <legend className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
            {campo.rotulo}
            {campo.ayuda && <InfoTip title={campo.rotulo} what={campo.ayuda} side="bottom" />}
          </legend>
          <div className="grid gap-x-4 sm:grid-cols-2">
            {campo.opciones.map((o) => (
              <label key={o.valor} className="flex min-h-11 cursor-pointer items-center gap-3 text-base text-[var(--text-primary)]">
                <input type="checkbox" checked={marcadas.includes(o.valor)} onChange={() => alternar(o.valor)} className="h-5 w-5 accent-[var(--accent)]" />
                {o.rotulo}
              </label>
            ))}
          </div>
        </fieldset>
      );
    }
    case "lista":
      return <CampoLista campo={campo} valor={valor} onCambio={onCambio} />;
  }
}

export function FormularioOpciones({ campos, valores, onCambio }: Props) {
  return (
    <div className="space-y-5">
      {campos.map((c) => (
        <CampoDe key={c.clave} campo={c} valor={valores[c.clave]} onCambio={(v) => onCambio(c.clave, v)} />
      ))}
    </div>
  );
}
