"use client";

/**
 * Un indicador del Libro CTP: la cifra, contra qué se compara, y qué hay detrás.
 *
 * Medido el 2026-09-10 sobre los 93 `StatCard` del módulo forestal: 89 usaban
 * `subValue`, **8 usaban `delta` y ninguno `sparkline`**. O sea: el libro decía
 * «15.17 m³» sin contestar nunca la única pregunta que se hace un dueño al
 * leerlo — *¿es mucho?*. Un número solo no se puede juzgar; un número contra el
 * mes anterior sí.
 *
 * No es una tarjeta nueva: envuelve el `StatCard` del DS (que ya sabe dibujar
 * delta, tendencia y curva) y le pone encima lo único que es del libro:
 *
 *  1. **De dónde sale el delta.** Del MISMO cálculo corrido sobre el período
 *     anterior — nunca de una fórmula paralela del backend. Si el KPI y su
 *     delta salieran de dos cuentas distintas, tarde o temprano discuten y no
 *     hay forma de saber cuál miente.
 *  2. **Qué significa subir.** Producir más es bueno; tener más merma, más
 *     guías fuera de plazo o más madera sin origen es malo; y un rendimiento
 *     con tope legal (ADR-358) no es ninguna de las dos cosas.
 *  3. **Qué hay detrás.** El reparto por especie, permiso o proveedor se abre
 *     dentro de la misma tarjeta en vez de obligar a filtrar a mano para
 *     descubrirlo.
 *
 * Lo que NO hace: inventar una comparación. Sin período anterior —histórico
 * completo, primer mes del libro, o un previo en cero— no hay delta y se dice
 * por qué. Un «+100 %» contra cero es un artefacto de dividir, no una lectura.
 */

import { useId, useState, type ReactNode } from "react";
import { StatCard } from "@buleje/design-system";
import { ChevronDown } from "@buleje/design-system/icons";
import type { LucideIcon } from "@buleje/design-system/icons";
import { variacionPct } from "@/lib/forestal/movimiento-libro";

/**
 * Qué quiere decir que este número suba.
 *
 * `inverso` no es un detalle de color: en un libro forestal la mitad de las
 * cifras que importan son deudas —merma, fuera de plazo, sin cuadrar, sin
 * origen— y pintarlas de verde cuando crecen enseña exactamente lo contrario
 * de lo que hay que aprender.
 */
export type TonoKpi = "direccional" | "inverso" | "neutral";

/** Cómo se expresa la diferencia contra el período anterior. */
export type DeltaEn = "porcentaje" | "puntos";

export interface CtpKpiProps {
  label: string;
  /** Lo que se lee en grande, ya formateado para una persona. */
  value: ReactNode;
  subValue?: ReactNode;
  icon?: LucideIcon;
  /**
   * El número crudo de hoy y el mismo número del período anterior.
   *
   * Los dos o ninguno: con `previo` en `undefined` la tarjeta se dibuja como
   * siempre, sin comparación y sin hueco.
   */
  actual?: number | null;
  previo?: number | null;
  /** Cómo se llama el lapso con el que se compara: «julio de 2026». */
  etiquetaPrevio?: string | null;
  tono?: TonoKpi;
  /**
   * `puntos` para lo que YA es un porcentaje: de 53 % a 56 % son **3 puntos**,
   * no «+5.7 %». Decir el porcentaje de un porcentaje es el error clásico y
   * acá importa, porque el rendimiento se compara contra un tope legal.
   */
  deltaEn?: DeltaEn;
  /** La serie del período para la curva al pie (mínimo 2 puntos con algo > 0). */
  serie?: number[];
  /** El reparto que hay detrás del número. Se abre dentro de la tarjeta. */
  desglose?: ReactNode;
  /** Qué dice el botón que lo abre. */
  desgloseLabel?: string;
  onClick?: () => void;
  /** Esta tarjeta está filtrando la tabla: se le pone el anillo del acento. */
  filtrando?: boolean;
  /**
   * `compact` por default y no `default`: en el Libro CTP las tarjetas viven
   * arriba de la tabla, que es a lo que se entra. Medido en su momento: cuatro
   * KPIs de padding generoso son media pantalla que no se ve del trabajo.
   */
  density?: "compact" | "default" | "comfortable";
  className?: string;
}

/** El anillo de «esta tarjeta manda sobre la tabla» (mismo que CtpSeccionKpis). */
const ANILLO = "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--surface-canvas)]";

const POLARIDAD: Record<TonoKpi, "normal" | "inverse" | "neutral"> = {
  direccional: "normal",
  inverso: "inverse",
  neutral: "neutral",
};

/**
 * La diferencia contra el período anterior, o `null` si no se puede afirmar.
 *
 * Exportada para poder probarla sola: es la cuenta de la que cuelga cada flecha
 * verde o roja de las siete pestañas.
 */
export function deltaDeKpi(
  actual: number | null | undefined,
  previo: number | null | undefined,
  en: DeltaEn = "porcentaje",
): number | null {
  if (typeof actual !== "number" || typeof previo !== "number") return null;
  if (!Number.isFinite(actual) || !Number.isFinite(previo)) return null;
  /* Puntos: la resta directa, redondeada a un decimal. Es lo correcto cuando
     las dos cifras ya son porcentajes — y además funciona con previo en cero,
     donde el porcentaje no puede decir nada. */
  if (en === "puntos") return Math.round((actual - previo) * 10) / 10;
  return variacionPct(actual, previo);
}

export default function CtpKpi({
  label,
  value,
  subValue,
  icon,
  actual,
  previo,
  etiquetaPrevio,
  tono = "direccional",
  deltaEn = "porcentaje",
  serie,
  desglose,
  desgloseLabel = "Ver el desglose",
  onClick,
  filtrando = false,
  density = "compact",
  className,
}: CtpKpiProps) {
  const [abierto, setAbierto] = useState(false);
  const panelId = useId();

  const delta = deltaDeKpi(actual, previo, deltaEn);
  /* Se intentó comparar y no se pudo: eso se DICE. El hueco mudo hace pensar
     que la tarjeta se rompió, y peor: deja creer que no cambió nada. */
  const seIntento = typeof actual === "number" && previo !== undefined;
  const etiqueta =
    delta !== null
      ? `vs ${etiquetaPrevio ?? "el período anterior"}`
      : seIntento
        ? previo === null
          ? "sin período anterior con que comparar"
          : "el período anterior estuvo en cero"
        : undefined;

  /* La curva necesita dos puntos y algo distinto de cero: una línea plana en el
     piso ocupa el mismo lugar y no dice nada. */
  const curva = serie && serie.length >= 2 && serie.some((v) => v > 0) ? serie : undefined;

  const tarjeta = (
    <StatCard
      label={label}
      value={value}
      subValue={subValue}
      icon={icon}
      delta={delta ?? undefined}
      deltaLabel={etiqueta}
      deltaPolarity={POLARIDAD[tono]}
      sparkline={curva ? { data: curva } : undefined}
      density={density}
      onClick={onClick}
      className={[
        filtrando ? ANILLO : "",
        /* Con desglose la tarjeta y su cajón son UNA caja: sin esto se ven dos
           rectángulos apilados y el de abajo parece de otra cosa. */
        desglose ? "border-b-0 rounded-b-none" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    />
  );

  if (!desglose) return tarjeta;

  return (
    <div className="flex h-full flex-col">
      {tarjeta}
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-expanded={abierto}
        aria-controls={panelId}
        className="flex items-center justify-between gap-2 border border-t-0 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-2 text-left text-[length:var(--ts-xs)] font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] print:hidden"
      >
        {abierto ? "Ocultar el desglose" : desgloseLabel}
        <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
      </button>
      {abierto && (
        <div
          id={panelId}
          className="flex-1 border border-t-0 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-3"
        >
          {desglose}
        </div>
      )}
    </div>
  );
}

/** Una fila del reparto que hay detrás de una cifra. */
export interface FilaDesglose {
  value: string;
  count: number;
  volumeM3?: number | null;
}

/**
 * El reparto detrás del número, en barras proporcionales.
 *
 * Es la respuesta a «¿de qué se compone?» sin salir de la tarjeta. Hasta ahora
 * el dato existía —son las mismas facetas que llenan los desplegables— pero
 * para verlo había que filtrar de a una y anotar los totales a mano.
 *
 * Muestra las mayores y dice cuántas quedaron afuera. No las esconde: decir
 * «y 6 más» es distinto de recortar en silencio, que es como una pantalla
 * termina afirmando que hay tres especies cuando hay nueve.
 */
export function DesgloseSimple({
  filas,
  unidad = "m³",
  tope = 6,
  onElegir,
  vacio = "Sin nada que repartir en el período",
}: {
  filas: FilaDesglose[];
  /** Qué mide `volumeM3`. Si las filas no lo traen, se reparte por `count`. */
  unidad?: string;
  tope?: number;
  /** Tocar una fila puede filtrar la vista por ese valor. */
  onElegir?: (value: string) => void;
  vacio?: string;
}) {
  const porPeso = (f: FilaDesglose) => (typeof f.volumeM3 === "number" ? f.volumeM3 : f.count);
  const ordenadas = [...filas].sort((a, b) => porPeso(b) - porPeso(a));
  if (ordenadas.length === 0) {
    return <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">{vacio}</p>;
  }
  const mostradas = ordenadas.slice(0, tope);
  const resto = ordenadas.length - mostradas.length;
  const mayor = porPeso(mostradas[0]) || 1;
  const total = ordenadas.reduce((a, f) => a + porPeso(f), 0);
  const hayVolumen = ordenadas.some((f) => typeof f.volumeM3 === "number");

  return (
    <div className="space-y-1.5">
      {mostradas.map((f) => {
        const peso = porPeso(f);
        const pct = total > 0 ? (peso / total) * 100 : 0;
        const Fila = onElegir ? "button" : "div";
        return (
          <Fila
            key={f.value}
            {...(onElegir ? { type: "button" as const, onClick: () => onElegir(f.value) } : {})}
            className={`block w-full text-left ${onElegir ? "cursor-pointer" : ""}`}
          >
            <span className="flex items-baseline justify-between gap-2 text-[length:var(--ts-xs)]">
              <span className="truncate font-bold text-[var(--text-secondary)]">{f.value}</span>
              <span className="shrink-0 tabular-nums text-[var(--text-tertiary)]">
                {hayVolumen && typeof f.volumeM3 === "number"
                  ? `${Number(f.volumeM3).toFixed(2)} ${unidad}`
                  : f.count.toLocaleString("es-PE")}
                <span className="ml-1.5">{pct.toFixed(0)} %</span>
              </span>
            </span>
            <span className="mt-0.5 block h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
              <span
                className="block h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${Math.max(2, (peso / mayor) * 100)}%` }}
              />
            </span>
          </Fila>
        );
      })}
      {resto > 0 && (
        <p className="pt-0.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
          y {resto} más, por debajo de {Number(porPeso(mostradas[mostradas.length - 1])).toFixed(2)} {hayVolumen ? unidad : ""}
        </p>
      )}
    </div>
  );
}
