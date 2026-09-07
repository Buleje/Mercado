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
 *  1. **Los filtros se encadenan.** Permiso → especie → guía, y cada opción
 *     muestra cuánto hay detrás. Elegir un permiso no debería obligar a adivinar
 *     qué especies tiene.
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
import type {
  BalanceCapacidad,
  FiltrosCapacidad,
  FuenteDeCapacidad,
  OpcionFiltro,
} from "@/lib/forestal/capacidad-de-planta";

const SELECT =
  "h-9 w-56 max-w-full rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-sm font-medium text-[var(--text-primary)]";

/** Un filtro con sus opciones; cada una dice cuánta madera tiene detrás. */
function Filtro({
  etiqueta,
  valor,
  opciones,
  todos,
  onChange,
}: {
  etiqueta: string;
  valor: string;
  opciones: OpcionFiltro[];
  todos: string;
  onChange: (v: string) => void;
}) {
  /* Se dibuja si hay opciones O si ya hay un valor puesto: con un filtro que
     llegó por la URL y el patio todavía cargando, las opciones están vacías y
     sin esto el filtro quedaba invisible — imposible de ver y de quitar. */
  if (opciones.length === 0 && !valor) return null;
  const conocido = opciones.some((o) => o.valor === valor);
  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        {etiqueta}
      </span>
      <select value={valor} onChange={(e) => onChange(e.target.value)} className={SELECT}>
        <option value="">{todos}</option>
        {/* Un valor que no está entre las opciones (link viejo, o datos que
            aún no llegaron) se muestra igual: un select en blanco con un
            filtro activo es un filtro fantasma. */}
        {valor && !conocido && <option value={valor}>{valor}</option>}
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.valor} · {fmtM3(o.m3)} m³ ({o.piezas})
          </option>
        ))}
      </select>
    </label>
  );
}

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
  onFiltros?: (f: FiltrosCapacidad) => void;
  onDetalle?: (f: FuenteDeCapacidad) => void;
}) {
  const { fuentes, totalProducto } = balance;
  const hayAlgo = totalProducto > 0 || fuentes.some((f) => f.m3 > 0 || f.filas > 0);
  const conFiltro = Boolean(filtros.permiso || filtros.especie || filtros.guia);
  if (!hayAlgo && !conFiltro) return null;

  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
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
          {/* Encadenados: al cambiar el permiso se sueltan especie y guía,
              porque la especie elegida puede no existir en el permiso nuevo y
              un filtro que no matchea nada se ve igual que «no hay madera». */}
          <Filtro
            etiqueta="Permiso"
            valor={filtros.permiso ?? ""}
            opciones={opciones.permisos}
            todos="Todos los permisos"
            onChange={(permiso) => onFiltros({ permiso: permiso || undefined })}
          />
          <Filtro
            etiqueta="Especie"
            valor={filtros.especie ?? ""}
            opciones={opciones.especies}
            todos="Todas las especies"
            onChange={(especie) =>
              onFiltros({ ...filtros, especie: especie || undefined, guia: undefined })
            }
          />
          <Filtro
            etiqueta="Guía"
            valor={filtros.guia ?? ""}
            opciones={opciones.guias}
            todos="Todas las guías"
            onChange={(guia) => onFiltros({ ...filtros, guia: guia || undefined })}
          />
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
