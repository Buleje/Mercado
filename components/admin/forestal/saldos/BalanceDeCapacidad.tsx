"use client";

/**
 * Cuánto producto puede llegar a salir de todo lo que la planta tiene hoy.
 *
 * Saldos contesta qué hay en cada lugar —patio, lotes, stock— pero cada número
 * vive en su bloque y en su unidad, así que la pregunta que se hace el dueño
 * antes de comprometer una venta («¿me alcanza?») había que armarla a mano
 * sumando cuatro pantallas.
 *
 * Las cuatro fuentes, de la más lejana a la más lista:
 *
 *   1. POR RECEPCIONAR — madera anotada en el libro que todavía no llegó o no
 *      se validó. Es la más incierta: puede no aparecer.
 *   2. TROZAS EN PATIO — rolliza libre, sin lote y sin bloqueo.
 *   3. LOTES — lo que sus corridas todavía admiten declarar bajo el tope.
 *   4. PRODUCTOS TERMINADOS — stock ya aserrado, listo para despachar.
 *
 * ⚠️ LO QUE ESTE NÚMERO NO ES. Las tres primeras son rolliza; la cuarta es
 * producto. Para poder sumarlas, la rolliza se convierte al 56 % (ADR-358), que
 * es el TECHO del rendimiento, no lo que la sierra saca de verdad —el
 * rendimiento real de los lotes de esta planta viene por debajo—. Así que el
 * total es una COTA MÁXIMA: «no más de esto», nunca «esto es lo que va a
 * haber». Se dice en la tarjeta, no en una nota al pie.
 */

import { CardTitle } from "@buleje/design-system";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { RENDIMIENTO_META } from "@/lib/forestal/loctp-catalogos";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";

export interface FuenteDeCapacidad {
  clave: "porRecepcionar" | "patio" | "lotes" | "productos";
  label: string;
  /** m³ tal como están hoy (rolliza o producto, según la fuente). */
  m3: number;
  /** m³ de producto que representan. Rolliza convertida al 56 %; producto, igual. */
  enProducto: number;
  /** `true` si su valor pasó por la conversión — la tarjeta lo marca. */
  convertido: boolean;
  detalle?: string;
}

export interface BalanceCapacidad {
  fuentes: FuenteDeCapacidad[];
  totalProducto: number;
}

/** Las cuatro fuentes y el techo que suman. Pura: la usan la pantalla y el reporte. */
export function calcularBalance(input: {
  porRecepcionarM3: number;
  patioM3: number;
  patioPiezas: number;
  restaLotesM3: number;
  productosM3: number;
  productosDetalle?: string;
  /**
   * `true` cuando se está mirando UN permiso.
   *
   * Los productos terminados no se pueden atribuir a un título habilitante sin
   * recorrer la cadena corrida→lote→troza→ingreso, así que con un permiso
   * elegido esa fila queda en cero y lo DICE. Repartirlos por prorrateo sería
   * inventar de qué permiso salió cada tablón, que es justo lo que el libro
   * existe para no hacer.
   */
  filtrado?: boolean;
}): BalanceCapacidad {
  const r4 = (v: number) => Math.round(v * 10000) / 10000;
  const aProducto = (m3: number) => r4(m3 * RENDIMIENTO_META);

  const fuentes: FuenteDeCapacidad[] = [
    {
      clave: "porRecepcionar",
      label: "Por recepcionar",
      m3: r4(input.porRecepcionarM3),
      enProducto: aProducto(input.porRecepcionarM3),
      convertido: true,
      detalle: "Anotada en el libro, todavía no llegó o no se validó",
    },
    {
      clave: "patio",
      label: "Trozas en el patio",
      m3: r4(input.patioM3),
      enProducto: aProducto(input.patioM3),
      convertido: true,
      detalle: `${input.patioPiezas} ${input.patioPiezas === 1 ? "pieza libre" : "piezas libres"}, sin lote ni bloqueo`,
    },
    {
      clave: "lotes",
      label: "Lo que los lotes admiten",
      m3: r4(input.restaLotesM3),
      /* YA es producto: es cuánto más se puede DECLARAR bajo el tope, no
         rolliza esperando. Convertirlo otra vez sería aplicar el 56 % dos
         veces sobre la misma madera. */
      enProducto: r4(input.restaLotesM3),
      convertido: false,
      detalle: "Al 56 % menos lo ya declarado",
    },
    {
      clave: "productos",
      label: "Productos terminados",
      m3: input.filtrado ? 0 : r4(input.productosM3),
      enProducto: input.filtrado ? 0 : r4(input.productosM3),
      convertido: false,
      detalle: input.filtrado
        ? "No se puede atribuir a un permiso sin recorrer la cadena — se cuenta sólo en «todos los permisos»"
        : (input.productosDetalle ?? "Stock listo para despachar"),
    },
  ];

  return { fuentes, totalProducto: r4(fuentes.reduce((a, f) => a + f.enProducto, 0)) };
}

export default function BalanceDeCapacidad({
  balance,
  permisos = [],
  permiso = "",
  onPermiso,
}: {
  balance: BalanceCapacidad;
  /** Los títulos habilitantes que hay en la planta, para acotar la capacidad. */
  permisos?: string[];
  permiso?: string;
  onPermiso?: (p: string) => void;
}) {
  const { fuentes, totalProducto } = balance;
  if (totalProducto <= 0 && fuentes.every((f) => f.m3 <= 0)) return null;

  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <p className="mb-1 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        Capacidad de la planta
      </p>
      <CardTitle as="h3" className="text-base font-extrabold tracking-tight text-[var(--text-primary)]">
        Cuánto producto puede salir de todo lo que hay hoy
      </CardTitle>
      <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
        Suma las cuatro fuentes de la planta. La rolliza se convierte al{" "}
        {Math.round(RENDIMIENTO_META * 100)} %, que es el <strong>techo</strong> del rendimiento — el total es un
        máximo, no una promesa.
      </p>

      {onPermiso && permisos.length > 0 && (
        <label className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
            Título habilitante
          </span>
          <select
            value={permiso}
            onChange={(e) => onPermiso(e.target.value)}
            className="h-9 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-sm font-medium text-[var(--text-primary)]"
          >
            <option value="">Todos los permisos</option>
            {permisos.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          {permiso && (
            <span className="text-[var(--text-tertiary)]">
              Sólo la madera de este permiso. El producto terminado no entra: no se puede atribuir sin recorrer la
              cadena.
            </span>
          )}
        </label>
      )}

      <ul className="mt-4 space-y-2">
        {fuentes.map((f) => (
          <li
            key={f.clave}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 border-b border-[var(--rule-soft)] pb-2 last:border-0"
          >
            <span className="min-w-[11rem] font-bold text-[var(--text-primary)]">{f.label}</span>
            <span className="font-mono tabular-nums text-[var(--text-secondary)]">{fmtM3(f.m3)} m³</span>
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
            {f.detalle && <span className="w-full text-xs text-[var(--text-tertiary)]">{f.detalle}</span>}
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
