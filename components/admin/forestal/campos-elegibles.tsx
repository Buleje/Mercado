"use client";

/**
 * Campos que se ELIGEN en vez de tipearse, compartidos por el Libro TH y el
 * Directorio.
 *
 * Brandon (2026-09-21): «en los campos que son para rellenar, donde se pueda
 * poner opciones, que sea más fácil». No es una preferencia estética — es lo
 * que el dato muestra: la región de un plan real dice «Constitucion» (una
 * ciudad, no un departamento) y la misma autoridad forestal está escrita de
 * tres formas distintas entre las fichas y los permisos del tenant («GERFOR
 * Ucayali», «ATFFS SELVA CENTRAL», «ATFFS SELVA CENTRAL - SEDE PUERTO
 * BERMUDEZ»). Un campo libre garantiza que el segundo documento no se escriba
 * como el primero, y dos grafías del mismo dato no se cruzan en ninguna
 * consulta.
 *
 * Dónde hay lista cerrada verificable se usa (los 25 departamentos del Perú,
 * `lib/peru-ubigeo`). Donde no —no existe un catálogo oficial de ARFFS que se
 * pueda verificar entero— se ofrece **lo que este negocio ya escribió**, con
 * «Otra…» siempre a mano: el módulo no inventa datos oficiales.
 *
 * Reciben `className` porque el input del Libro (`cls`) y el del Directorio
 * (`I`) tienen alturas distintas y cada pantalla conserva la suya.
 */

import { useMemo, useState } from "react";
import { X as XIcon } from "@buleje/design-system/icons";
import { listDepartamentos } from "@/lib/peru-ubigeo";

/** Los 25 departamentos, más el valor guardado aunque no sea uno de ellos. */
export function SelectRegion({
  valor,
  onCambio,
  className,
  id,
}: {
  valor: string;
  onCambio: (v: string) => void;
  className: string;
  id?: string;
}) {
  const deps = useMemo(() => listDepartamentos().map((d) => d.nombre), []);
  /* Un valor viejo que no es un departamento no se borra en silencio: se
     muestra y se puede corregir. Borrarlo sería perder lo que alguien cargó. */
  const opciones = !valor || deps.includes(valor) ? deps : [valor, ...deps];
  return (
    <select id={id} className={className} value={valor} onChange={(e) => onCambio(e.target.value)}>
      <option value="">Elegir…</option>
      {opciones.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  );
}

/**
 * Elegir de lo ya escrito, o escribir algo nuevo.
 *
 * Una lista cerrada mentiría y un campo libre deja escribir lo mismo de tres
 * formas. El desplegable ofrece lo usado —ordenado por cuántas veces se
 * escribió— y «Otra…» abre el campo libre sin perder el camino de vuelta.
 */
export function SelectConOtra({
  valor,
  opciones,
  textoOtra,
  placeholder,
  onCambio,
  className,
  id,
}: {
  valor: string;
  opciones: readonly string[];
  textoOtra: string;
  placeholder?: string;
  onCambio: (v: string) => void;
  className: string;
  id?: string;
}) {
  const conocido = opciones.includes(valor);
  const [libre, setLibre] = useState(Boolean(valor) && !conocido);

  if (libre || opciones.length === 0) {
    return (
      <div className="flex items-center gap-1.5">
        <input
          id={id}
          type="text"
          className={className}
          value={valor}
          placeholder={placeholder}
          onChange={(e) => onCambio(e.target.value)}
        />
        {opciones.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setLibre(false);
              onCambio("");
            }}
            title="Volver a la lista"
            aria-label="Volver a la lista"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[var(--rule-base)] text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <XIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  }
  return (
    <select
      id={id}
      className={className}
      value={valor}
      onChange={(e) => {
        if (e.target.value === "__otra__") {
          setLibre(true);
          onCambio("");
          return;
        }
        onCambio(e.target.value);
      }}
    >
      <option value="">Elegir…</option>
      {opciones.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value="__otra__">{textoOtra}</option>
    </select>
  );
}
