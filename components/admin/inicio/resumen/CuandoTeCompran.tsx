"use client";

import { useChartRegistration } from "@/lib/admin/charts-visibility";
import { cantidad, DIAS_SEMANA, soles, solesEje } from "@/lib/admin/inicio/formato-tablero";
import type { MapaDeHoras } from "./calculos-tablero";
import { DatosEnLinea, TarjetaTablero } from "./TarjetaTablero";

/**
 * «Cuándo te compran»: la plata del período por día de la semana × hora, en
 * un mapa de calor compacto (2026-10-29). Cada celda dice en su `title` la
 * cifra exacta y cuántas ventas; a la derecha, el total de cada día. Con menos
 * de 3 ventas con hora no se dibuja (un mapa de 2 puntos no dice nada).
 */

// Día 0 = lunes en el mapa; DIAS_SEMANA arranca en domingo.
const DIA = [1, 2, 3, 4, 5, 6, 0].map((i) => DIAS_SEMANA[i]);
const CORTO = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

function tinte(v: number, max: number): string {
  if (v <= 0 || max <= 0) return "var(--surface-sunken)";
  // Raíz: una venta grande no apaga a las demás.
  const pct = Math.round(18 + Math.sqrt(v / max) * 82);
  return `color-mix(in oklab, var(--data-5) ${pct}%, var(--surface-sunken))`;
}

export function CuandoTeCompran({ mapa }: { mapa: MapaDeHoras }) {
  const hasData = mapa.registros >= 3;
  const { visible } = useChartRegistration("resumen.cuando", { label: "Cuándo te compran", hasData });
  if (!visible) return null;

  const horas: number[] = [];
  for (let h = mapa.horaDesde; h <= mapa.horaHasta; h++) horas.push(h);
  const iDia = mapa.porDia.indexOf(Math.max(...mapa.porDia));
  const iHora = mapa.porHora.indexOf(Math.max(...mapa.porHora));
  let celda = { d: 0, h: 0, v: 0 };
  mapa.monto.forEach((fila, d) =>
    fila.forEach((v, h) => {
      if (v > celda.v) celda = { d, h, v };
    }),
  );
  const paso = horas.length > 12 ? 3 : horas.length > 6 ? 2 : 1;
  const maxDia = Math.max(0, ...mapa.porDia);

  return (
    <TarjetaTablero
      id="cuando"
      titulo="Cuándo te compran"
      ayuda="Lo cobrado en el período según el día de la semana y la hora de cada venta o pedido. Más oscuro = más plata. Pasa el mouse por una casilla para ver la cifra."
      cifra={celda.v > 0 ? `${CORTO[celda.d]} ${hh(celda.h)}` : null}
      datos={
        <DatosEnLinea
          datos={[
            { label: "Día más fuerte", valor: maxDia > 0 ? DIA[iDia] : null, extra: solesEje(mapa.porDia[iDia]) },
            { label: "Hora más fuerte", valor: mapa.porHora[iHora] > 0 ? hh(iHora) : null, extra: solesEje(mapa.porHora[iHora]) },
            { label: "Ventas con hora", valor: cantidad(mapa.registros) },
          ]}
        />
      }
    >
      <div
        role="img"
        aria-label={`Lo más fuerte: ${DIA[celda.d]} a las ${hh(celda.h)}, ${soles(celda.v)}.`}
        className="grid w-full gap-[2px] text-xs font-semibold text-[var(--text-tertiary)]"
        style={{ gridTemplateColumns: `2.25rem repeat(${horas.length}, minmax(0, 1fr)) 3.75rem` }}
      >
        {mapa.monto.map((fila, d) => (
          <div key={DIA[d]} className="contents">
            <span className="flex items-center">{CORTO[d]}</span>
            {horas.map((h) => (
              <span
                key={h}
                title={`${DIA[d]} ${hh(h)} · ${soles(fila[h])} · ${cantidad(mapa.veces[d][h])} ${mapa.veces[d][h] === 1 ? "venta" : "ventas"}`}
                className="h-5 rounded-[2px]"
                style={{ backgroundColor: tinte(fila[h], mapa.max) }}
              />
            ))}
            <span className="flex items-center justify-end tabular-nums text-[var(--text-secondary)]">
              {mapa.porDia[d] > 0 ? solesEje(mapa.porDia[d]) : ""}
            </span>
          </div>
        ))}
        <span />
        {horas.map((h, i) => (
          <span key={h} className="text-center tabular-nums">
            {i % paso === 0 ? String(h) : ""}
          </span>
        ))}
        <span />
      </div>
    </TarjetaTablero>
  );
}
