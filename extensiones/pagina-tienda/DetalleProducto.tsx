/**
 * Lo que dice el producto en su ficha (ADR-511): la presentación como chip,
 * la descripción y la ficha técnica que el dueño cargó en el panel
 * (`ProductoTienda.ficha`: Ingredientes, Origen, Tamaño…). Sin estado: sirve
 * en el servidor. Lo que falta no se dibuja (sin títulos vacíos).
 */
import { ETIQUETA_PRESENTACION } from "../pagina-musa/presentacion";
import type { FilaFicha } from "./contenido";

/** «1 kg», «Familiar», «500 ml»: junto al nombre. */
export function ChipPresentacion({ texto }: { texto: string }) {
  return (
    <span className="inline-flex max-w-full items-center rounded-[var(--ti-radio-pill)] bg-[var(--ti-suave)] px-3 py-1 text-sm font-medium tabular-nums text-[var(--ti-texto-2)]">
      <span className="sr-only">Presentación: </span>
      <span className="truncate">{texto}</span>
    </span>
  );
}

/** La descripción del dueño, con sus saltos de línea. */
export function Descripcion({ texto }: { texto: string | null }) {
  const limpio = texto?.trim();
  if (!limpio) return null;
  return (
    <div className="mt-6">
      <h2 className="ti-kicker text-[var(--ti-texto-3)]">Descripción</h2>
      <p className="mt-2 max-w-xl whitespace-pre-line break-words text-[length:var(--ti-t-cuerpo)] leading-relaxed text-[var(--ti-texto-2)]">{limpio}</p>
    </div>
  );
}

/** La ficha técnica, sin la fila de presentación (esa ya va en el chip). Sin filas, nada. */
export function FichaTecnica({ filas }: { filas: readonly FilaFicha[] }) {
  const resto = filas.filter((f) => !ETIQUETA_PRESENTACION.test(f.etiqueta) && f.valor.trim());
  if (resto.length === 0) return null;
  return (
    <div className="mt-6">
      <h2 className="ti-kicker text-[var(--ti-texto-3)]">Ficha técnica</h2>
      <dl className="mt-2 divide-y divide-[var(--ti-linea-suave)] border-y border-[var(--ti-linea-suave)]">
        {resto.map((f) => (
          <div key={f.etiqueta} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-3 py-2.5 text-[length:var(--ti-t-chico)] leading-snug">
            <dt className="break-words text-[var(--ti-texto-3)]">{f.etiqueta}</dt>
            <dd className="break-words text-[var(--ti-texto)]">{f.valor}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
