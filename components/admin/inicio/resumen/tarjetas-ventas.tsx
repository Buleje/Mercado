"use client";

import { useChartRegistration } from "@/lib/admin/charts-visibility";
import { hayDatosEnSerie, hayTendencia, modoRanking } from "@/lib/admin/inicio/hay-datos";
import { cantidad, COLOR_CONCEPTO, fechaConDia, porcentaje, soles, solesEje } from "@/lib/admin/inicio/formato-tablero";
import { BarrasPorDia, type Serie } from "./graficos-resumen";
import { RankingTablero } from "./RankingTablero";
import type { FilaMetodo } from "./calculos-tablero";
import type { FilaProducto } from "./calculos-resumen";
import { plural } from "./kpis-resumen";
import { DatosEnLinea, TarjetaTablero } from "./TarjetaTablero";

/**
 * Tarjetas de venta del tablero del Resumen (2026-10-29): el ritmo por día,
 * lo más vendido con su margen y cómo te pagan. Cada una se registra en
 * «Gráficos» con el id de siempre (las preferencias guardadas se respetan).
 */

export interface DiaDeVenta {
  day: string;
  iso: string;
  ventas: number;
}

const SERIE_VENTAS: Serie[] = [{ key: "ventas", nombre: "Vendiste", color: COLOR_CONCEPTO.ventas }];

/**
 * «Ventas por día»: barras del período con la línea del promedio y los datos
 * que la leen. Las barras vienen de `/api/admin/overview` redondeadas a soles
 * enteros por tramo: el promedio sale del TOTAL exacto (`total`), no de sumar
 * las barras, y el mejor día se muestra sin céntimos.
 */
export function VentasPorDia({
  dias,
  total,
  porHoras,
  diasPorTramo,
  rango,
  className,
}: {
  dias: DiaDeVenta[];
  /** Lo vendido exacto del período (`hero.totalRange`). */
  total: number;
  porHoras: boolean;
  /** 1 = una barra por día; >1 en rangos largos (el servidor arma ≤14 tramos). */
  diasPorTramo: number;
  rango: string;
  className?: string;
}) {
  const conTendencia = hayTendencia(dias, ["ventas"]);
  const { visible } = useChartRegistration("resumen.ventas-por-dia", {
    label: porHoras ? "Ventas por horario" : "Ventas por día",
    hasData: conTendencia,
  });
  if (!hayDatosEnSerie(dias, ["ventas"])) return null;

  const promedio = total / Math.max(1, dias.length);
  const conVenta = dias.filter((d) => d.ventas > 0).length;
  let mejor: DiaDeVenta | null = null;
  for (const d of dias) if (d.ventas > 0 && (!mejor || d.ventas > mejor.ventas)) mejor = d;
  const deRango = rango === "el período" ? "del período" : `de ${rango}`;
  const porTramos = !porHoras && diasPorTramo > 1;
  const titulo = porHoras
    ? `Ventas ${deRango} por horario`
    : porTramos
      ? `Ventas ${deRango}, cada ${diasPorTramo} días`
      : `Ventas ${deRango} por día`;

  return (
    <TarjetaTablero
      id="ventas-por-dia"
      className={className}
      titulo={titulo}
      ayuda={
        porHoras
          ? "Lo cobrado en cada tramo de 4 horas del día. Pasa el mouse por una barra para ver la cifra."
          : `Lo cobrado ${porTramos ? `cada ${diasPorTramo} días` : "cada día"} del período; la línea punteada es el promedio (con venta o sin ella). Las barras van en soles enteros. Pasa el mouse por una barra para ver la cifra.`
      }
      datos={
        <DatosEnLinea
          datos={
            porHoras
              ? [
                  { label: "Mejor horario", valor: mejor ? mejor.day.replace("h", ":00") : null, extra: mejor ? solesEje(mejor.ventas) : undefined },
                  { label: "Tramos con venta", valor: `${conVenta} de ${dias.length}` },
                ]
              : [
                  { label: porTramos ? "Promedio por tramo" : "Promedio por día", valor: soles(promedio) },
                  {
                    label: porTramos ? "Mejor tramo" : "Mejor día",
                    valor: mejor ? (porTramos ? `desde el ${fechaConDia(mejor.iso)}` : fechaConDia(mejor.iso)) : null,
                    extra: mejor ? solesEje(mejor.ventas) : undefined,
                  },
                  { label: porTramos ? "Tramos con venta" : "Días con venta", valor: `${conVenta} de ${dias.length}` },
                ]
          }
        />
      }
    >
      {visible && conTendencia && (
        <BarrasPorDia
          data={dias}
          series={SERIE_VENTAS}
          formato="soles"
          alto={170}
          promedio={porHoras ? null : promedio}
          estirar
        />
      )}
    </TarjetaTablero>
  );
}

/** «Lo que más vendiste»: top 7 por plata, con unidades y lo que te quedó de cada uno. */
export function LoMasVendido({ productos }: { productos: FilaProducto[] }) {
  const modo = modoRanking(productos, "unidades", 1);
  const { visible } = useChartRegistration("resumen.productos", {
    label: "Lo que más vendiste",
    hasData: modo !== "oculto",
  });
  if (!visible || modo === "oculto") return null;

  const ingresos = productos.reduce((s, r) => s + r.ingresos, 0);
  const conCosto = productos.filter((r) => !r.margenIncompleto);
  const vendidoConCosto = conCosto.reduce((s, r) => s + r.ingresos, 0);
  const margen = conCosto.reduce((s, r) => s + r.margen, 0);
  const sinCosto = productos.length - conCosto.length;
  const unidades = productos.reduce((s, r) => s + r.unidades, 0);
  const detalle = (f: FilaProducto) => {
    const u = plural(f.unidades, "unidad", "unidades");
    if (f.margenIncompleto) return `${u} · sin costo cargado`;
    const pct = f.ingresos > 0 ? (f.margen / f.ingresos) * 100 : 0;
    return `${u} · te quedó ${soles(f.margen)} (${porcentaje(pct)})`;
  };

  return (
    <TarjetaTablero
      id="productos"
      titulo="Lo que más vendiste"
      ayuda="Los 7 productos que más plata te dejaron en el período, con sus unidades y lo que te quedó de cada uno (venta − costo). La barra de fondo los compara con el primero."
      cifra={soles(ingresos)}
      datos={
        <DatosEnLinea
          datos={[
            { label: "Unidades", valor: cantidad(unidades) },
            { label: "Te quedó", valor: vendidoConCosto > 0 ? soles(margen) : null },
            {
              label: "Margen",
              valor: vendidoConCosto > 0 ? porcentaje((margen / vendidoConCosto) * 100) : null,
              extra: sinCosto > 0 ? `(${cantidad(sinCosto)} sin costo)` : undefined,
            },
          ]}
        />
      }
    >
      <RankingTablero
        data={productos}
        nombre={(f) => f.producto}
        valor={(f) => f.ingresos}
        formato="soles"
        color={COLOR_CONCEPTO.ventas}
        detalle={detalle}
      />
    </TarjetaTablero>
  );
}

/** «0 %» mentía para S/ 0.10 de S/ 295: lo que no llega al 1 % se escribe «<1 %». */
const pctCorto = (pct: number) => (pct > 0 && pct < 1 ? "<1%" : porcentaje(pct));

/** «Cómo te pagan»: una barra al 100 % por medio de pago y la tabla corta de cada uno. */
export function ComoTePagan({ metodos }: { metodos: FilaMetodo[] }) {
  const { visible } = useChartRegistration("resumen.pagos", {
    label: "Cómo te pagan",
    hasData: metodos.length > 0,
  });
  if (!visible || metodos.length === 0) return null;
  const veces = metodos.reduce((s, m) => s + m.veces, 0);

  return (
    <TarjetaTablero
      id="pagos"
      titulo="Cómo te pagan"
      ayuda="Lo cobrado en el período por medio de pago (pedidos y ventas del mostrador). Si una venta no anotó el medio, cuenta como efectivo."
      cifra={plural(veces, "cobro", "cobros")}
    >
      <div className="mb-3 flex h-4 w-full overflow-hidden rounded-[3px] bg-[var(--surface-sunken)]" aria-hidden>
        {metodos.map((m) => (
          <span
            key={m.clave}
            title={`${m.metodo} · ${soles(m.total)} · ${pctCorto(m.pct)}`}
            className="h-full"
            style={{ width: `${m.pct}%`, backgroundColor: m.color }}
          />
        ))}
      </div>
      <ul className="divide-y divide-[var(--rule-soft)] text-sm">
        {metodos.map((m) => (
          <li key={m.clave} className="flex items-center gap-2 py-1.5">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: m.color }} aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-semibold text-[var(--text-primary)]">{m.metodo}</span>
              <span className="block truncate font-medium tabular-nums text-[var(--text-tertiary)]">
                {plural(m.veces, "vez", "veces")}
              </span>
            </span>
            <span className="shrink-0 font-bold tabular-nums text-[var(--text-secondary)]">{pctCorto(m.pct)}</span>
            <span className="w-24 shrink-0 text-right font-extrabold tabular-nums text-[var(--text-primary)]">
              {soles(m.total)}
            </span>
          </li>
        ))}
      </ul>
    </TarjetaTablero>
  );
}
