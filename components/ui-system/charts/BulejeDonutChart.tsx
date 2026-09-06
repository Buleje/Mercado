"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { SERIES_PALETTE } from "./palette";
import { ChartTooltip } from "./ChartTooltip";

interface DataPoint {
  name: string;
  value: number;
}

interface Props {
  data: DataPoint[];
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  label?: React.ReactNode;
  format?: (value: number | string) => string;
  /**
   * Rampa propia, en el orden de `data`. Cuando las rebanadas son tajadas de
   * UNA magnitud ordenada (no categorías distintas), lo correcto es una rampa
   * de un solo hue: la paleta categórica por defecto sugiere identidades que
   * no existen. Se cicla si faltan pasos.
   */
  colors?: ReadonlyArray<string>;
  /** Nombre accesible del gráfico — sin esto es un SVG mudo. */
  ariaLabel?: string;
  /**
   * Ancho fijo en px. Con esto el gráfico se dibuja SIN medir el contenedor.
   *
   * `ResponsiveContainer` necesita que su padre tenga un ancho resuelto en el
   * momento de montar; dentro de un flex —y al redimensionar la ventana— llega
   * a medir 0 y la dona queda como un hueco: el número del centro visible y
   * ningún sector. Cuando el alto ya es fijo (siempre lo es acá) y el ancho
   * también se conoce, medir no aporta nada y sólo agrega ese modo de falla.
   */
  width?: number;
}

/**
 * BulejeDonutChart — Editorial donut.
 * Max 5 segmentos. Paleta mono+accent. Etiqueta central opcional.
 */
export function BulejeDonutChart({
  data,
  height = 200,
  innerRadius = 60,
  outerRadius = 85,
  label,
  format,
  colors,
  ariaLabel,
  width,
}: Props) {
  const paleta = colors?.length ? colors : SERIES_PALETTE;
  const grafico = (
    <PieChart {...(width ? { width, height } : {})}>
      <Pie
        data={data}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        paddingAngle={2}
        dataKey="value"
        stroke="none"
        isAnimationActive
        animationDuration={500}
      >
        {data.map((_, i) => (
          <Cell key={i} fill={paleta[i % paleta.length]} />
        ))}
      </Pie>
      <Tooltip content={<ChartTooltip format={format} />} />
    </PieChart>
  );
  return (
    <div className="relative" style={{ height, width }} role="img" aria-label={ariaLabel}>
      {width ? (
        grafico
      ) : (
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          {grafico}
        </ResponsiveContainer>
      )}
      {label && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {label}
        </div>
      )}
    </div>
  );
}
