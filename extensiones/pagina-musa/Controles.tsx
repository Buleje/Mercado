"use client";

/**
 * Ordenar y filtrar el catálogo de Musa.
 * · Desde 768 px: a la derecha de las píldoras — «Ordenar por», «Línea» (si
 *   hay más de una) y «Solo disponibles» (sólo si algún producto lleva
 *   existencias: Musa vende por preventa y encargo, sin stock que filtrar).
 * · En el celular: el botón «Filtrar y ordenar» abre una hoja desde abajo
 *   (`BottomSheet` del DS) con todo junto; el resultado se ve al instante y
 *   «Ver N productos» la cierra.
 * «Mayor descuento» sale sólo si hay alguna rebaja real (historial de precios).
 * Cada cambio va a la URL (lo hace `CatalogoCliente`).
 */
import { useId, useState, type ReactNode } from "react";
import { Check, ChevronDown, SlidersHorizontal } from "@buleje/design-system/icons";
import BottomSheet from "@/components/ui-system/BottomSheet";
import { unidades } from "./destinos";
import { cuantosAjustes, ORDENES, SIN_FILTROS, type Filtros, type Orden } from "./filtros";
import type { Cambiar } from "./Pildoras";

/** Qué controles tienen sentido con los productos de hoy. */
export interface OpcionesControles {
  existencias: boolean;
  descuentos: boolean;
}

const CAMPO =
  "mu-foco h-12 appearance-none rounded-[var(--mu-radio-control)] border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-4 pr-10 text-[length:var(--mu-t-boton)] font-semibold text-[var(--text-primary)] transition-colors duration-200 hover:border-[var(--text-primary)]";

/** Rótulo con `htmlFor` (no envolviendo al select: así el nombre accesible no arrastra el texto de las opciones). */
function Selector({ etiqueta, valor, alCambiar, children }: { etiqueta: string; valor: string; alCambiar: (v: string) => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="mu-kicker whitespace-nowrap text-[var(--text-tertiary)]">
        {etiqueta}
      </label>
      <span className="relative">
        <select id={id} value={valor} onChange={(e) => alCambiar(e.target.value)} className={CAMPO}>
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)]" aria-hidden="true" />
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
      className={`mu-foco inline-flex h-12 items-center gap-2 rounded-[var(--mu-radio-control)] border px-4 text-[length:var(--mu-t-boton)] font-semibold transition-colors duration-200 ${
        activo ? "border-[var(--mu-boton-fondo)] bg-[var(--mu-boton-fondo)] text-[var(--mu-boton-texto)]" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--text-primary)]"
      }`}
    >
      {activo ? <Check className="h-4 w-4" aria-hidden="true" /> : <span className="h-4 w-4 rounded-full border border-[var(--rule-base)]" aria-hidden="true" />}
      {children}
    </button>
  );
}

const OPCION = "flex h-12 cursor-pointer items-center gap-3 rounded-[var(--mu-radio-control)] px-3 text-base text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]";
const MARCA = "h-5 w-5 shrink-0 accent-[var(--mu-boton-fondo)]";

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="border-b border-[var(--rule-soft)] py-3 last:border-b-0">
      <legend className="mu-kicker pb-1 text-[var(--text-secondary)]">{titulo}</legend>
      {children}
    </fieldset>
  );
}

export function Controles({
  f,
  cambiar,
  marcas,
  total,
  opciones = { existencias: true, descuentos: true },
}: {
  f: Filtros;
  cambiar: Cambiar;
  marcas: readonly string[];
  total: number;
  opciones?: OpcionesControles;
}) {
  const [hoja, setHoja] = useState(false);
  const ajustes = cuantosAjustes(f);
  const ordenes = ORDENES.filter((o) => o.id !== "descuento" || opciones.descuentos || f.orden === "descuento");
  const opcionesOrden = ordenes.map((o) => (
    <option key={o.id} value={o.id}>
      {o.texto}
    </option>
  ));

  return (
    <>
      <div className="hidden flex-wrap items-center gap-x-5 gap-y-3 md:flex">
        <Selector etiqueta="Ordenar por" valor={f.orden} alCambiar={(v) => cambiar({ orden: v as Orden })}>
          {opcionesOrden}
        </Selector>
        {marcas.length > 1 && (
          <Selector etiqueta="Línea" valor={f.marca ?? ""} alCambiar={(v) => cambiar({ marca: v || null })}>
            <option value="">Todas</option>
            {marcas.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Selector>
        )}
        {(opciones.existencias || f.disponibles) && (
          <Interruptor activo={f.disponibles} alCambiar={() => cambiar({ disponibles: !f.disponibles })}>
            Solo disponibles
          </Interruptor>
        )}
      </div>

      <button
        type="button"
        onClick={() => setHoja(true)}
        className="mu-foco inline-flex h-12 items-center gap-2 rounded-[var(--mu-radio-control)] border border-[var(--text-primary)] px-4 text-[length:var(--mu-t-boton)] font-semibold text-[var(--text-primary)] md:hidden"
      >
        <SlidersHorizontal className="h-[18px] w-[18px]" aria-hidden="true" />
        Filtrar y ordenar
        {ajustes > 0 && (
          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-[var(--mu-contador-fondo)] px-1.5 text-sm font-semibold tabular-nums text-[var(--mu-contador-texto)]">
            {ajustes}
            <span className="sr-only"> puestos</span>
          </span>
        )}
      </button>

      {/* La hoja del DS va en z-50 y el cupón de bienvenida de la tienda en 7000 (le tapaba «Ver N productos»):
          este contenedor fijo, sin tamaño, la sube a la capa `z-system`. */}
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
                className="mu-foco h-12 rounded-full px-4 text-base font-semibold text-[var(--text-primary)] underline underline-offset-4"
              >
                Limpiar
              </button>
              <button type="button" onClick={() => setHoja(false)} className="mu-foco h-12 flex-1 rounded-full bg-[var(--mu-boton-fondo)] text-base font-semibold text-[var(--mu-boton-texto)]">
                Ver {unidades(total)}
              </button>
            </div>
          }
        >
          <Grupo titulo="Ordenar por">
            {ordenes.map((o) => (
              <label key={o.id} className={OPCION}>
                <input type="radio" name="mu-orden" className={MARCA} checked={f.orden === o.id} onChange={() => cambiar({ orden: o.id })} />
                {o.texto}
              </label>
            ))}
          </Grupo>
          {(opciones.descuentos || opciones.existencias || f.oferta || f.disponibles) && (
            <Grupo titulo="Mostrar solo">
              {(opciones.descuentos || f.oferta) && (
                <label className={OPCION}>
                  <input type="checkbox" className={MARCA} checked={f.oferta} onChange={() => cambiar({ oferta: !f.oferta })} />
                  Productos en oferta
                </label>
              )}
              {(opciones.existencias || f.disponibles) && (
                <label className={OPCION}>
                  <input type="checkbox" className={MARCA} checked={f.disponibles} onChange={() => cambiar({ disponibles: !f.disponibles })} />
                  Disponibles para pedir hoy
                </label>
              )}
            </Grupo>
          )}
          {marcas.length > 1 && (
            <Grupo titulo="Línea">
              {[null, ...marcas].map((m) => (
                <label key={m ?? "todas"} className={OPCION}>
                  <input type="radio" name="mu-marca" className={MARCA} checked={f.marca === m} onChange={() => cambiar({ marca: m })} />
                  {m ?? "Todas las líneas"}
                </label>
              ))}
            </Grupo>
          )}
        </BottomSheet>
      </div>
    </>
  );
}
