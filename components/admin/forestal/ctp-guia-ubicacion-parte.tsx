"use client";

/**
 * Los casilleros de ubicación de una parte de la GTF (propietario, punto de
 * partida, destinatario). Se mudó de `ctp-guia-bloques.tsx` el 16-10-2026 para
 * que ese archivo no pase de 300 líneas; allá queda re-exportado.
 */

import { Field, I, useEstiloFormulario, type CampoSpan } from "./ctp-shared";
import CtpUbigeoSelects from "./CtpUbigeoSelects";
import { CLASE_NO_APLICA } from "./ctp-guia-piezas";
import type { ParteEditable } from "./ctp-guia-bloques";

/**
 * Casilleros de ubicación: departamento (17)(26), provincia (18)(27), distrito
 * (19)(28) y —sólo el destinatario— la zona. Van sueltos y no dentro de la
 * dirección porque el control pide uno por uno.
 */
export function UbicacionDeParte({
  parte,
  onChange,
  conZona,
  span = 4,
  spanZona = 4,
  casilleros,
}: {
  parte: ParteEditable;
  onChange: (v: Partial<ParteEditable>) => void;
  /** El destinatario tiene «Zona» en el formato; el propietario no. */
  conZona?: boolean;
  /** Ancho de cada lista. A 2 de 12 («Departame…», «Elige el») no se leían. */
  span?: 2 | 3 | 4 | 6;
  spanZona?: CampoSpan;
  /** Los números de departamento, provincia y distrito en el formato 2024. */
  casilleros?: readonly [string | undefined, string | undefined, string | undefined];
}) {
  const zonaNoAplica = !parte.zona?.trim();
  /* En papel la Zona —que el formato 2024 no imprime— va DESPUÉS del ubigeo. */
  const zonaAlFinal = useEstiloFormulario() === "papel";
  const zona = conZona && (
    <Field
      span={spanZona}
      label="Zona"
      hint={zonaNoAplica ? "No aplica: sólo si la dirección usa sector o caserío" : "Sector o caserío"}
    >
      <input
        type="text"
        className={`${I} ${zonaNoAplica ? CLASE_NO_APLICA : ""}`}
        placeholder={zonaNoAplica ? "no aplica" : undefined}
        value={parte.zona ?? ""}
        onChange={(e) => onChange({ zona: e.target.value })}
      />
    </Field>
  );
  return (
    <>
      {!zonaAlFinal && zona}
      <CtpUbigeoSelects
        span={span}
        casilleros={casilleros}
        valor={{ departamento: parte.departamento, provincia: parte.provincia, distrito: parte.distrito }}
        onChange={onChange}
      />
      {zonaAlFinal && zona}
    </>
  );
}
