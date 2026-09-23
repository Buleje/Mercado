"use client";

/**
 * Dónde queda el área del plan, con el detalle que pide el expediente.
 *
 * El plan sólo guardaba `region` — y en un plan real del tenant esa región
 * decía «Constitucion», que es una ciudad. Ahora la región se elige de los 25
 * departamentos y **la provincia y el distrito se encadenan** a ella: no hay
 * forma de guardar una provincia que no pertenezca a ese departamento.
 *
 * El sector y la cuenca quedan libres a propósito: en la selva el punto se
 * nombra por el caserío o la quebrada, y no hay lista oficial que los contenga
 * a todos. Mejor un texto honesto que un desplegable que obligue a elegir mal.
 */

import { useMemo } from "react";
import { distritosDeProvinciaNombre, provinciasDeDepartamentoNombre } from "@/lib/peru-ubigeo";
import { SelectRegion } from "./campos-elegibles";
import { Field, cls } from "./loth-plan-ui";

export interface Ubicacion {
  region: string;
  provincia: string;
  distrito: string;
  sector: string;
  cuenca: string;
}

export default function LothPlanFormUbicacion({
  valores,
  onCambio,
}: {
  valores: Ubicacion;
  onCambio: (cambios: Partial<Ubicacion>) => void;
}) {
  const provincias = useMemo(() => provinciasDeDepartamentoNombre(valores.region), [valores.region]);
  const distritos = useMemo(
    () => distritosDeProvinciaNombre(valores.region, valores.provincia),
    [valores.region, valores.provincia],
  );

  return (
    <>
      <Field label="Región">
        {/* Cambiar de departamento invalida la provincia y el distrito que había:
            se limpian en vez de quedar apuntando a otra parte del país. */}
        <SelectRegion
          className={cls}
          valor={valores.region}
          onCambio={(region) => onCambio({ region, provincia: "", distrito: "" })}
        />
      </Field>
      <Field label="Provincia">
        <select
          className={cls}
          value={valores.provincia}
          disabled={provincias.length === 0}
          onChange={(e) => onCambio({ provincia: e.target.value, distrito: "" })}
        >
          <option value="">{provincias.length === 0 ? "Elegí la región primero" : "Elegir…"}</option>
          {/* Una provincia guardada que no pertenece a esta región se muestra
              igual: borrarla en silencio sería perder lo que alguien cargó. */}
          {valores.provincia && !provincias.some((p) => p.nombre === valores.provincia) && (
            <option value={valores.provincia}>{valores.provincia}</option>
          )}
          {provincias.map((p) => (
            <option key={p.code} value={p.nombre}>
              {p.nombre}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Distrito">
        <select
          className={cls}
          value={valores.distrito}
          disabled={distritos.length === 0}
          onChange={(e) => onCambio({ distrito: e.target.value })}
        >
          <option value="">{distritos.length === 0 ? "Elegí la provincia primero" : "Elegir…"}</option>
          {valores.distrito && !distritos.some((d) => d.nombre === valores.distrito) && (
            <option value={valores.distrito}>{valores.distrito}</option>
          )}
          {distritos.map((d) => (
            <option key={d.code} value={d.nombre}>
              {d.nombre}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Sector o caserío">
        <input
          type="text"
          value={valores.sector}
          onChange={(e) => onCambio({ sector: e.target.value })}
          placeholder="Cómo se llama el paraje"
          className={cls}
        />
      </Field>
      <Field label="Cuenca o microcuenca">
        <input
          type="text"
          value={valores.cuenca}
          onChange={(e) => onCambio({ cuenca: e.target.value })}
          placeholder="Como la nombra el plan aprobado"
          className={cls}
        />
      </Field>
    </>
  );
}
