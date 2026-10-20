"use client";

/**
 * Buscar, ordenar y filtrar el catálogo de la tienda (ADR-511; los de Musa sin
 * sus «líneas» fijas).
 * · El buscador filtra mientras escribes (sin ir al servidor). Muestra lo que
 *   vino en `?q=`, así quien buscó desde el encabezado ve su búsqueda y la
 *   corrige ahí mismo.
 * · Desde 768 px, a la derecha: «Ordenar por», «Marca» (si hay más de una) y
 *   «Solo disponibles» (sólo si el negocio carga existencias: sin ellas no hay
 *   nada que filtrar y nunca se dice «agotado»).
 * · En el celular: «Filtrar y ordenar» abre una hoja desde abajo (`BottomSheet`
 *   del DS) con todo junto; «Ver N productos» la cierra.
 * «Mayor descuento» sale sólo si hay alguna rebaja real.
 */
import { useId, useState, type ReactNode } from "react";
import { Check, ChevronDown, Search, SlidersHorizontal, X } from "@buleje/design-system/icons";
import BottomSheet from "@/components/ui-system/BottomSheet";
import { cuantosAjustes, ORDENES, SIN_FILTROS, type Filtros, type Orden } from "./filtros";
import type { Cambiar } from "./CatalogoPildoras";
import { unidades } from "./ui";

/** Qué controles tienen sentido con los productos de hoy. */
export interface OpcionesControles {
  existencias: boolean;
  descuentos: boolean;
}

const CAMPO =
  "ti-foco h-12 appearance-none rounded-[var(--ti-radio-control)] border border-[var(--ti-linea)] bg-[var(--ti-fondo)] pl-4 pr-10 text-[length:var(--ti-t-boton)] font-semibold text-[var(--ti-texto)] transition-colors duration-[var(--ti-dur-corto)] hover:border-[var(--ti-texto)]";

/** El buscador del catálogo: lupa, el texto y una «×» para borrar. */
export function Buscador({ q, cambiar, nombre }: { q: string; cambiar: Cambiar; nombre: string }) {
  const id = useId();
  return (
    <div role="search" className="relative w-full md:max-w-[22rem]">
      <label htmlFor={id} className="sr-only">
        Buscar en {nombre}
      </label>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--ti-texto-3)]" aria-hidden="true" />
      <input
        id={id}
        type="search"
        enterKeyHint="search"
        autoComplete="off"
        value={q}
        maxLength={80}
        onChange={(e) => cambiar({ q: e.target.value })}
        placeholder="¿Qué buscas hoy?"
        className="ti-foco h-12 w-full rounded-[var(--ti-radio-pill)] border border-[var(--ti-linea)] bg-[var(--ti-fondo)] pl-11 pr-12 text-base text-[var(--ti-texto)] placeholder:text-[var(--ti-texto-3)] [&::-webkit-search-cancel-button]:hidden"
      />
      {q && (
        <button
          type="button"
          onClick={() => cambiar({ q: "" })}
          aria-label="Borrar la búsqueda"
          className="ti-foco absolute right-0 top-0 inline-flex h-12 w-12 items-center justify-center rounded-full text-[var(--ti-texto-2)] hover:text-[var(--ti-texto)]"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

/** Rótulo con `htmlFor` (no envolviendo al select: así el nombre accesible no arrastra el texto de las opciones). */
function Selector({ etiqueta, valor, alCambiar, children }: { etiqueta: string; valor: string; alCambiar: (v: string) => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="ti-kicker whitespace-nowrap text-[var(--ti-texto-3)]">
        {etiqueta}
      </label>
      <span className="relative">
        <select id={id} value={valor} onChange={(e) => alCambiar(e.target.value)} className={CAMPO}>
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ti-texto-2)]" aria-hidden="true" />
      </span>
    </div>
  );
}

function Interruptor({ activo, alCambiar, children }: { activo: boolean; alCambiar: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={alCambiar}
      className={`ti-foco inline-flex h-12 items-center gap-2 rounded-[var(--ti-radio-control)] border px-4 text-[length:var(--ti-t-boton)] font-semibold transition-colors duration-[var(--ti-dur-corto)] ${
        activo ? "border-[var(--ti-acento)] bg-[var(--ti-acento)] text-[var(--ti-sobre-acento)]" : "border-[var(--ti-linea)] bg-[var(--ti-fondo)] text-[var(--ti-texto)] hover:border-[var(--ti-texto)]"
      }`}
    >
      {activo ? <Check className="h-4 w-4" aria-hidden="true" /> : <span className="h-4 w-4 rounded-full border border-[var(--ti-linea)]" aria-hidden="true" />}
      {children}
    </button>
  );
}

const OPCION = "flex h-12 cursor-pointer items-center gap-3 rounded-[var(--ti-radio-control)] px-3 text-base text-[var(--ti-texto)] hover:bg-[var(--ti-suave)]";
const MARCA = "h-5 w-5 shrink-0 accent-[var(--ti-acento)]";

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="border-b border-[var(--ti-linea-suave)] py-3 last:border-b-0">
      <legend className="ti-kicker pb-1 text-[var(--ti-texto-2)]">{titulo}</legend>
      {children}
    </fieldset>
  );
}

export function Controles({ f, cambiar, marcas, total, opciones }: { f: Filtros; cambiar: Cambiar; marcas: readonly string[]; total: number; opciones: OpcionesControles }) {
  const [hoja, setHoja] = useState(false);
  const ajustes = cuantosAjustes(f);
  const ordenes = ORDENES.filter((o) => o.id !== "descuento" || opciones.descuentos || f.orden === "descuento");
  const verExistencias = opciones.existencias || f.disponibles;

  return (
    <>
      <div className="hidden flex-wrap items-center justify-end gap-x-5 gap-y-3 md:flex">
        <Selector etiqueta="Ordenar por" valor={f.orden} alCambiar={(v) => cambiar({ orden: v as Orden })}>
          {ordenes.map((o) => (
            <option key={o.id} value={o.id}>
              {o.texto}
            </option>
          ))}
        </Selector>
        {marcas.length > 1 && (
          <Selector etiqueta="Marca" valor={f.marca ?? ""} alCambiar={(v) => cambiar({ marca: v || null })}>
            <option value="">Todas</option>
            {marcas.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Selector>
        )}
        {verExistencias && (
          <Interruptor activo={f.disponibles} alCambiar={() => cambiar({ disponibles: !f.disponibles })}>
            Solo disponibles
          </Interruptor>
        )}
      </div>

      <button
        type="button"
        onClick={() => setHoja(true)}
        className="ti-foco inline-flex h-12 shrink-0 items-center gap-2 rounded-[var(--ti-radio-control)] border border-[var(--ti-texto)] px-4 text-[length:var(--ti-t-boton)] font-semibold text-[var(--ti-texto)] md:hidden"
      >
        <SlidersHorizontal className="h-[18px] w-[18px]" aria-hidden="true" />
        <span>
          Filtrar<span className="max-[379px]:sr-only"> y ordenar</span>
        </span>
        {ajustes > 0 && (
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--ti-acento)] px-1.5 text-sm font-semibold tabular-nums text-[var(--ti-sobre-acento)]">
            {ajustes}
            <span className="sr-only"> puestos</span>
          </span>
        )}
      </button>

      {/* La hoja del DS va en z-50 y los avisos de la tienda más arriba: este contenedor fijo, sin tamaño, la sube a `z-system`. */}
      <div className="fixed z-system">
        <BottomSheet
          open={hoja}
          onClose={() => setHoja(false)}
          title="Filtrar y ordenar"
          size="full"
          className="md:hidden"
          footer={
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => cambiar({ orden: SIN_FILTROS.orden, marca: null, oferta: false, disponibles: false })}
                className="ti-foco h-12 rounded-[var(--ti-radio-control)] px-4 text-base font-semibold text-[var(--ti-texto)] underline underline-offset-4"
              >
                Limpiar
              </button>
              <button type="button" onClick={() => setHoja(false)} className="ti-foco h-12 flex-1 rounded-[var(--ti-radio-control)] bg-[var(--ti-acento)] text-base font-semibold text-[var(--ti-sobre-acento)]">
                Ver {unidades(total)}
              </button>
            </div>
          }
        >
          <Grupo titulo="Ordenar por">
            {ordenes.map((o) => (
              <label key={o.id} className={OPCION}>
                <input type="radio" name="ti-orden" className={MARCA} checked={f.orden === o.id} onChange={() => cambiar({ orden: o.id })} />
                {o.texto}
              </label>
            ))}
          </Grupo>
          {(opciones.descuentos || f.oferta || verExistencias) && (
            <Grupo titulo="Mostrar solo">
              {(opciones.descuentos || f.oferta) && (
                <label className={OPCION}>
                  <input type="checkbox" className={MARCA} checked={f.oferta} onChange={() => cambiar({ oferta: !f.oferta })} />
                  Productos en oferta
                </label>
              )}
              {verExistencias && (
                <label className={OPCION}>
                  <input type="checkbox" className={MARCA} checked={f.disponibles} onChange={() => cambiar({ disponibles: !f.disponibles })} />
                  Disponibles para pedir hoy
                </label>
              )}
            </Grupo>
          )}
          {marcas.length > 1 && (
            <Grupo titulo="Marca">
              {[null, ...marcas].map((m) => (
                <label key={m ?? "todas"} className={OPCION}>
                  <input type="radio" name="ti-marca" className={MARCA} checked={f.marca === m} onChange={() => cambiar({ marca: m })} />
                  {m ?? "Todas las marcas"}
                </label>
              ))}
            </Grupo>
          )}
        </BottomSheet>
      </div>
    </>
  );
}
