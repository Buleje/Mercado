"use client";

/**
 * Un punto del traslado desarmado: dirección + departamento, provincia y
 * distrito del padrón. Abajo, el texto que sale impreso (`componerPunto`).
 *
 * Lo comparten las dos guías que emite el sistema —la del bosque (Libro TH) y la
 * de salida de la planta (Libro CTP)—: el formato de SERFOR es el mismo y el
 * casillero también, «JR. X, Constitución, OXAPAMPA, PASCO».
 */

import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { componerPunto, type UbicacionTraslado } from "@/lib/forestal/ctp-gtf-datos";
import CtpUbigeoSelects from "./CtpUbigeoSelects";
import { CLASE_FALTA } from "./ctp-guia-piezas";
import { Field, I } from "./ctp-shared";

/** Los casilleros del ubigeo que están vacíos, en el orden del formulario. */
function ubigeoQueFalta(v: UbicacionTraslado): string[] {
  return (["departamento", "provincia", "distrito"] as const).filter((k) => !v[k]?.trim());
}

export default function PuntoTraslado({
  titulo,
  ayuda,
  requerido,
  valor,
  onChange,
  acciones,
  dondeSeCarga,
  className = "sm:col-span-12 xl:col-span-6",
}: {
  titulo: string;
  ayuda: string;
  requerido?: boolean;
  valor: UbicacionTraslado;
  onChange: (v: Partial<UbicacionTraslado>) => void;
  acciones?: React.ReactNode;
  /**
   * Si viene, el ubigeo se exige completo: los casilleros vacíos se marcan y se
   * dice cuáles faltan y dónde se carga («en la Ficha del CTP»). Sin esto (el
   * Libro TH) el punto se ve como siempre.
   */
  dondeSeCarga?: string;
  /** Cuánto ocupa en la grilla del bloque (por defecto, fila entera y a dos en pantallas grandes). */
  className?: string;
}) {
  const impreso = componerPunto(valor);
  const faltan = dondeSeCarga ? ubigeoQueFalta(valor) : [];
  return (
    <fieldset className={`m-0 min-w-0 rounded-xl border border-[var(--rule-soft)] p-2.5 ${className}`}>
      <legend className="sr-only">{titulo}</legend>
      <div className="mb-2 flex min-h-8 flex-wrap items-center gap-x-2 gap-y-1">
        <span aria-hidden="true" className="text-sm font-semibold text-[var(--text-primary)]">
          {titulo}
          {requerido && <span className="ml-1 text-[var(--data-error-600)]">*</span>}
        </span>
        <InfoTip title={titulo} what={ayuda} ariaLabel={`Ayuda: ${titulo}`} />
        {acciones && <div className="ml-auto">{acciones}</div>}
      </div>
      <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 sm:grid-cols-12 sm:[&_label]:min-h-6">
        <Field span={12} label="Dirección">
          <input
            type="text"
            className={`${I} ${requerido && !impreso.trim() ? CLASE_FALTA : ""}`}
            value={valor.direccion}
            onChange={(e) => onChange({ direccion: e.target.value })}
          />
        </Field>
        <CtpUbigeoSelects span={4} valor={valor} onChange={(v) => onChange(v)} marcarFaltas={Boolean(dondeSeCarga)} />
      </div>
      {faltan.length > 0 && (
        <p className="mt-2 text-xs font-semibold text-[var(--data-warning-ink)]">
          Falta · {faltan.join(", ")} · {dondeSeCarga}
        </p>
      )}
      {impreso && (
        <p className="mt-2 truncate text-xs text-[var(--text-secondary)]" title={impreso}>
          Sale impreso: <span className="text-[var(--text-primary)]">{impreso}</span>
        </p>
      )}
    </fieldset>
  );
}
