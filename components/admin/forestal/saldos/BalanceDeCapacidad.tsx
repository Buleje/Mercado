"use client";

/**
 * Cuánto producto puede llegar a salir de todo lo que la planta tiene hoy.
 *
 * Saldos contesta qué hay en cada lugar —patio, lotes, stock— pero cada número
 * vive en su bloque y en su unidad, así que la pregunta que se hace el dueño
 * antes de comprometer una venta («¿me alcanza?») había que armarla a mano
 * sumando cuatro pantallas.
 *
 * El cálculo y las cuatro fuentes viven en `lib/forestal/capacidad-de-planta.ts`
 * —los leen también el Excel y el PDF—; acá va sólo cómo se ven.
 *
 * Tres cosas que esta tarjeta hace y conviene no deshacer:
 *
 *  1. **Los filtros se cruzan y admiten varios valores.** Cada menú ofrece sólo
 *     lo que se puede combinar con lo ya elegido —los permisos de esa especie,
 *     las guías de ese permiso—, cada opción muestra cuánto hay detrás, y se
 *     pueden tildar varias: tres permisos de los cinco que tienen tornillo.
 *     En cualquier orden: especie primero y permiso después da lo mismo.
 *  2. **Lo que no se puede atribuir queda en cero y lo DICE.** Un cero mudo se
 *     lee como «no hay»; acá significa «no se puede saber sin recorrer la
 *     cadena», que es una respuesta distinta.
 *  3. **El total se declara COTA MÁXIMA.** La rolliza se convierte al 56 %
 *     (ADR-358), que es el techo del rendimiento, no lo que la sierra saca.
 */

import { CardTitle } from "@buleje/design-system";
import { ChevronRight } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { RENDIMIENTO_META } from "@/lib/forestal/loctp-catalogos";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import {
  alternarEnRecorte,
  hayFiltro,
  type BalanceCapacidad,
  type ClaveFiltro,
  type FiltrosCapacidad,
  type FuenteDeCapacidad,
  type OpcionFiltro,
} from "@/lib/forestal/capacidad-de-planta";
import FiltroMulti from "./FiltroMulti";

/** Los tres recortes, con el nombre de su lista de opciones. */
const FILTROS: {
  clave: ClaveFiltro;
  etiqueta: string;
  todos: string;
  lista: "permisos" | "especies" | "guias";
}[] = [
  { clave: "permiso", etiqueta: "Permiso", todos: "Todos los permisos", lista: "permisos" },
  { clave: "especie", etiqueta: "Especie", todos: "Todas las especies", lista: "especies" },
  { clave: "guia", etiqueta: "Guía", todos: "Todas las guías", lista: "guias" },
];

export default function BalanceDeCapacidad({
  balance,
  filtros,
  opciones,
  onFiltros,
  onDetalle,
}: {
  balance: BalanceCapacidad;
  filtros: FiltrosCapacidad;
  opciones?: { permisos: OpcionFiltro[]; especies: OpcionFiltro[]; guias: OpcionFiltro[] };
  /** `prioridad` = el filtro que se acaba de tocar: ése manda si hay que soltar. */
  onFiltros?: (f: FiltrosCapacidad, prioridad?: keyof FiltrosCapacidad) => void;
  onDetalle?: (f: FuenteDeCapacidad) => void;
}) {
  const { fuentes, totalProducto } = balance;
  const hayAlgo = totalProducto > 0 || fuentes.some((f) => f.m3 > 0 || f.filas > 0);
  const conFiltro = hayFiltro(filtros);
  if (!hayAlgo && !conFiltro) return null;

  return (
    <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <p className="mb-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        Capacidad de la planta
      </p>
      <CardTitle
        as="h3"
        className="text-base font-extrabold tracking-tight text-[var(--text-primary)]"
      >
        Cuánto producto puede salir de todo lo que hay hoy
      </CardTitle>
      <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
        Suma las cuatro fuentes de la planta. La rolliza se convierte al{" "}
        {Math.round(RENDIMIENTO_META * 100)} %, que es el <strong>techo</strong> del rendimiento —
        el total es un máximo, no una promesa.
      </p>

      {onFiltros && opciones && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {/* Los otros filtros NO se sueltan al cambiar uno: las opciones de
              cada menú ya salen cruzadas con los demás, así que lo que se puede
              tildar siempre tiene madera detrás. Y si una combinación queda
              imposible —un link viejo, o quitar el filtro que las hacía
              compatibles—, `sanearFiltros` suelta lo que sobra en vez de dejar
              una tarjeta en cero. */}
          {FILTROS.map((f) => (
            <FiltroMulti
              key={f.clave}
              etiqueta={f.etiqueta}
              valores={filtros[f.clave] ?? []}
              opciones={opciones[f.lista]}
              todos={f.todos}
              onAlternar={(v) =>
                onFiltros({ ...filtros, [f.clave]: alternarEnRecorte(filtros[f.clave], v) }, f.clave)
              }
              onLimpiar={() => onFiltros({ ...filtros, [f.clave]: undefined }, f.clave)}
            />
          ))}
          {conFiltro && (
            <button
              type="button"
              onClick={() => onFiltros({})}
              className="text-xs font-bold text-[var(--accent-dark)] underline underline-offset-2 dark:text-[var(--accent)]"
            >
              Quitar filtros
            </button>
          )}
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {fuentes.map((f) => (
          <li
            key={f.clave}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-[var(--rule-soft)] pb-2 last:border-0"
          >
            <span className="w-52 shrink-0 font-bold text-[var(--text-primary)]">{f.label}</span>
            <span className="font-mono tabular-nums text-[var(--text-secondary)]">
              {fmtM3(f.m3)} m³
            </span>
            {f.convertido && (
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                → al {Math.round(RENDIMIENTO_META * 100)} %
              </span>
            )}
            <span className="ml-auto font-mono font-bold tabular-nums text-[var(--text-primary)]">
              {fmtM3(f.enProducto)} m³
            </span>
            {/* El pie tablar es la unidad con la que se vende y se cotiza; el m³
                es la del libro. Las dos juntas evitan la calculadora al lado. */}
            <span className="w-28 shrink-0 text-right font-mono tabular-nums text-[var(--text-tertiary)]">
              {pieTablarDe(f.enProducto).toLocaleString("es-PE")} pt
            </span>
            {/* El botón sólo aparece si hay filas que abrir: un «Ver detalle»
                que abre una tabla vacía enseña a no tocarlo. */}
            <span className="w-24 shrink-0 text-right">
              {onDetalle && f.filas > 0 ? (
                <button
                  type="button"
                  onClick={() => onDetalle(f)}
                  className="inline-flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-bold text-[var(--accent-ink)] hover:bg-[var(--surface-sunken)] dark:text-primary"
                >
                  Detalles ({f.filas})
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              ) : (
                <span className="text-xs text-[var(--text-tertiary)]">—</span>
              )}
            </span>
            {(f.noAtribuible ?? f.detalle) && (
              <span className="w-full text-xs text-[var(--text-tertiary)]">
                {f.noAtribuible ?? f.detalle}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5">
        <span className="font-bold text-[var(--text-primary)]">Capacidad máxima en producto</span>
        <span className="flex items-baseline gap-3">
          <span className="font-mono text-lg font-extrabold tabular-nums text-[var(--text-primary)]">
            {fmtM3(totalProducto)} m³
          </span>
          <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-secondary)]">
            {pieTablarDe(totalProducto).toLocaleString("es-PE")} pt
          </span>
        </span>
      </div>
    </div>
  );
}
