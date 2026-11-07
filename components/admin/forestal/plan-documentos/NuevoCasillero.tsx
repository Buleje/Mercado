"use client";

/**
 * Agregar un documento esperado a una carpeta: nombre, para qué es y si se
 * pide en todos los planes o sólo en éste. Es un campo `archivo` (ADR-467): no
 * se escribe, se llena subiendo el papel.
 */

import { useId, useState } from "react";
import { Check, Loader2, X as XIcon } from "@buleje/design-system/icons";
import { claveDesdeNombre } from "@/lib/campos-personalizados";
import { BOTON_PRIMARIO, BOTON_SUAVE, CAMPO_AYUDA, CAMPO_INPUT, CAMPO_LABEL } from "@/components/admin/shared/campos-personalizados-ui";

export interface CasilleroNuevoInput {
  nombre: string;
  descripcion: string;
  soloEstePlan: boolean;
}

export default function NuevoCasillero({
  existentes,
  onCrear,
  onCancelar,
}: {
  /** Los nombres que ya hay en la carpeta: dos iguales harían elegir al azar. */
  existentes: readonly string[];
  onCrear: (input: CasilleroNuevoInput) => Promise<string | null>;
  onCancelar: () => void;
}) {
  const id = useId();
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [soloEstePlan, setSoloEstePlan] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function crear() {
    const limpio = nombre.trim();
    if (limpio.length < 2 || !claveDesdeNombre(limpio)) {
      setAviso("Ponle un nombre de al menos dos letras: es lo que se va a ver en la carpeta.");
      return;
    }
    if (existentes.some((n) => claveDesdeNombre(n) === claveDesdeNombre(limpio))) {
      setAviso(`Ya hay un documento «${limpio}» en esta carpeta.`);
      return;
    }
    setGuardando(true);
    const error = await onCrear({ nombre: limpio, descripcion, soloEstePlan });
    setGuardando(false);
    if (error) setAviso(error);
  }

  return (
    <div className="rounded-xl border-[1.5px] border-[var(--accent)] bg-[var(--surface-raised)] p-3">
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 @min-[34rem]:grid-cols-2">
        <div className="min-w-0">
          <label htmlFor={`${id}-nombre`} className={CAMPO_LABEL}>
            Qué documento es
          </label>
          <input
            id={`${id}-nombre`}
            className={CAMPO_INPUT}
            value={nombre}
            maxLength={60}
            placeholder="Contrato de compraventa"
            onChange={(e) => setNombre(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void crear();
              }
            }}
          />
        </div>
        <div className="min-w-0">
          <label htmlFor={`${id}-para`} className={CAMPO_LABEL}>
            Para qué es
          </label>
          <input
            id={`${id}-para`}
            className={CAMPO_INPUT}
            value={descripcion}
            maxLength={300}
            placeholder="El que firmó el titular con la comunidad"
            onChange={(e) => setDescripcion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.preventDefault();
            }}
          />
        </div>
        <fieldset className="min-w-0 @min-[34rem]:col-span-2">
          <legend className={CAMPO_LABEL}>Dónde se pide</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {[
              { v: false, t: "En todos los planes" },
              { v: true, t: "Sólo en este plan" },
            ].map((o) => (
              <label key={String(o.v)} className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                <input
                  type="radio"
                  name={`${id}-alcance`}
                  checked={soloEstePlan === o.v}
                  onChange={() => setSoloEstePlan(o.v)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                {o.t}
              </label>
            ))}
          </div>
          <p className={CAMPO_AYUDA}>Se llena subiendo el papel: PDF, foto, Word o Excel.</p>
        </fieldset>
      </div>
      {aviso && (
        <p role="alert" className="mt-2 text-xs font-semibold text-[var(--data-error-ink)]">
          {aviso}
        </p>
      )}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" className={BOTON_SUAVE} onClick={onCancelar}>
          <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
          Cancelar
        </button>
        <button type="button" className={BOTON_PRIMARIO} disabled={guardando} onClick={() => void crear()}>
          {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : <Check className="h-3.5 w-3.5" aria-hidden="true" />}
          Agregar documento
        </button>
      </div>
    </div>
  );
}
