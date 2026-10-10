"use client";

/**
 * Ordenar y filtrar el catálogo del salón.
 * · Desde 768 px: una fila — «Ordenar por», «Línea» y «Solo disponibles»
 *   (las ofertas son una píldora, arriba).
 * · En el celular: el botón «Filtrar y ordenar» abre una hoja desde abajo
 *   (`BottomSheet` del DS) con todo junto, ofertas incluidas; el resultado
 *   se ve al instante y «Ver N productos» la cierra.
 * Cada cambio va a la URL (lo hace `CatalogoCliente`).
 */
import { useId, useState, type ReactNode } from "react";
import { Check, ChevronDown, SlidersHorizontal } from "@buleje/design-system/icons";
import BottomSheet from "@/components/ui-system/BottomSheet";
import { unidades } from "./destinos";
import { cuantosAjustes, ORDENES, SIN_FILTROS, type Filtros, type Orden } from "./filtros";
import type { Cambiar } from "./Pildoras";

const CAMPO =
  "h-12 appearance-none rounded-full border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] pl-5 pr-11 text-base font-semibold text-[var(--text-primary)] transition hover:border-[var(--text-primary)] focus:border-[var(--text-primary)] focus:outline-none focus:ring-4 focus:ring-[var(--bb-rubor-2)]";

/** Rótulo con `htmlFor` (no envolviendo al select: así el nombre accesible no arrastra el texto de las opciones). */
function Selector({ etiqueta, valor, alCambiar, children }: { etiqueta: string; valor: string; alCambiar: (v: string) => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="whitespace-nowrap text-base text-[var(--text-secondary)]">
        {etiqueta}
      </label>
      <span className="relative">
        <select id={id} value={valor} onChange={(e) => alCambiar(e.target.value)} className={CAMPO}>
          {children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-secondary)]" aria-hidden="true" />
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
      className={`inline-flex h-12 items-center gap-2 rounded-full border-2 px-5 text-base font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] ${
        activo ? "border-[var(--text-primary)] bg-[var(--text-primary)] text-[var(--surface-canvas)]" : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--text-primary)]"
      }`}
    >
      {activo ? <Check className="h-5 w-5" aria-hidden="true" /> : <span className="h-5 w-5 rounded-full border-2 border-[var(--rule-base)]" aria-hidden="true" />}
      {children}
    </button>
  );
}

const OPCION = "flex h-12 cursor-pointer items-center gap-3 rounded-2xl px-3 text-base text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]";
const MARCA = "h-5 w-5 shrink-0 accent-[var(--text-primary)]";

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="border-b border-[var(--rule-soft)] py-3 last:border-b-0">
      <legend className="pb-1 text-sm font-semibold uppercase tracking-[var(--ls-wider)] text-[var(--text-secondary)]">{titulo}</legend>
      {children}
    </fieldset>
  );
}

export function Controles({ f, cambiar, marcas, total }: { f: Filtros; cambiar: Cambiar; marcas: readonly string[]; total: number }) {
  const [hoja, setHoja] = useState(false);
  const ajustes = cuantosAjustes(f);
  const ordenes = ORDENES.map((o) => (
    <option key={o.id} value={o.id}>
      {o.texto}
    </option>
  ));

  return (
    <>
      <div className="hidden flex-wrap items-center gap-x-6 gap-y-3 md:flex">
        <Selector etiqueta="Ordenar por" valor={f.orden} alCambiar={(v) => cambiar({ orden: v as Orden })}>
          {ordenes}
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
        <Interruptor activo={f.disponibles} alCambiar={() => cambiar({ disponibles: !f.disponibles })}>
          Solo disponibles
        </Interruptor>
      </div>

      <button
        type="button"
        onClick={() => setHoja(true)}
        className="inline-flex h-12 items-center gap-2 rounded-full border-2 border-[var(--text-primary)] px-5 text-base font-semibold text-[var(--text-primary)] md:hidden"
      >
        <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
        Filtrar y ordenar
        {ajustes > 0 && (
          <span className="inline-flex h-6 items-center rounded-full bg-[var(--text-primary)] px-2 text-sm font-bold tabular-nums text-[var(--surface-canvas)]">
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
                className="h-12 rounded-full px-4 text-base font-semibold text-[var(--text-primary)] underline underline-offset-4"
              >
                Limpiar
              </button>
              <button type="button" onClick={() => setHoja(false)} className="h-12 flex-1 rounded-full bg-[var(--text-primary)] text-base font-semibold text-[var(--surface-canvas)]">
                Ver {unidades(total)}
              </button>
            </div>
          }
        >
          <Grupo titulo="Ordenar por">
            {ORDENES.map((o) => (
              <label key={o.id} className={OPCION}>
                <input type="radio" name="bb-orden" className={MARCA} checked={f.orden === o.id} onChange={() => cambiar({ orden: o.id })} />
                {o.texto}
              </label>
            ))}
          </Grupo>
          <Grupo titulo="Mostrar solo">
            <label className={OPCION}>
              <input type="checkbox" className={MARCA} checked={f.oferta} onChange={() => cambiar({ oferta: !f.oferta })} />
              Productos en oferta
            </label>
            <label className={OPCION}>
              <input type="checkbox" className={MARCA} checked={f.disponibles} onChange={() => cambiar({ disponibles: !f.disponibles })} />
              Disponibles para pedir hoy
            </label>
          </Grupo>
          {marcas.length > 1 && (
            <Grupo titulo="Línea">
              {[null, ...marcas].map((m) => (
                <label key={m ?? "todas"} className={OPCION}>
                  <input type="radio" name="bb-marca" className={MARCA} checked={f.marca === m} onChange={() => cambiar({ marca: m })} />
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
