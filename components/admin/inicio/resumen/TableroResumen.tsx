"use client";

import type { OverviewData } from "@/lib/admin/overview-tipos";
import { cifrasDeLaTira } from "./cifras-tira";
import { CuandoTeCompran } from "./CuandoTeCompran";
import { GrillaTablero, PilaTablero } from "./TarjetaTablero";
import { TiraDeCifras } from "./TiraDeCifras";
import { InventarioPorCategoria, StockEnRiesgo } from "./tarjetas-stock";
import { TarjetaCaja, TarjetaClientes, TarjetaCompras } from "./tarjetas-plata";
import { ComoTePagan, LoMasVendido, VentasPorDia, type DiaDeVenta } from "./tarjetas-ventas";
import type { ResumenMulti } from "./use-resumen-multi";

/**
 * El tablero de Inicio › Resumen (2026-10-29, Brandon: «gráficos de alto nivel
 * y detallados, compactos, que se vea toda la información»). Arriba la tira de
 * cifras del período; debajo las tarjetas, por importancia: cómo van las
 * ventas y cómo te pagan → qué se vende, cuándo y qué falta reponer → la plata
 * que entró y salió, compras, stock y clientes.
 *
 * Reemplaza al hero de `TodayHub`, a «Cómo van tus días» y a los cinco bloques
 * plegables de `InicioMultiCharts`: mismos datos y mismos ids de «Gráficos»,
 * sin casillas «—» (una tarjeta sin dato no se dibuja). Lo que se retiró del
 * Resumen: arrastrar los bloques para reordenarlos y plegarlos.
 */
export function TableroResumen({
  data,
  resumen,
  preset,
  dias,
  porHoras,
  diasPorTramo,
  rango,
}: {
  data: OverviewData;
  resumen: ResumenMulti;
  preset: string;
  dias: DiaDeVenta[];
  porHoras: boolean;
  diasPorTramo: number;
  rango: string;
}) {
  const { cifras, sinMovimiento } = cifrasDeLaTira(data, resumen, preset);
  return (
    <div className="space-y-3" data-tablero-resumen="">
      <TiraDeCifras
        cifras={cifras}
        sinMovimiento={resumen.fallo ? [] : sinMovimiento}
        insight={data.insight}
        generatedAt={data.generatedAt}
      />
      <GrillaTablero>
        <VentasPorDia
          dias={dias}
          total={data.hero.totalRange ?? data.hero.totalToday ?? 0}
          porHoras={porHoras}
          diasPorTramo={diasPorTramo}
          rango={rango}
          className="@2xl:col-span-2"
        />
        {/* Las dos cortas, apiladas al lado de las ventas: sin aire muerto en la fila. */}
        <PilaTablero>
          <ComoTePagan metodos={resumen.metodos} />
          <StockEnRiesgo r={resumen} />
        </PilaTablero>
        <LoMasVendido productos={resumen.productos} />
        <CuandoTeCompran mapa={resumen.mapaHoras} />
        <TarjetaCompras r={resumen} />
        <TarjetaCaja r={resumen} className="@2xl:col-span-2" />
        {/* A 2 columnas, ancho completo: si no, queda sola con un hueco al lado. */}
        <InventarioPorCategoria r={resumen} className="@2xl:col-span-2 @4xl:col-span-1" />
        <TarjetaClientes r={resumen} className="@2xl:col-span-2 @4xl:col-span-3" />
      </GrillaTablero>
    </div>
  );
}
