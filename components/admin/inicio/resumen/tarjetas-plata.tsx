"use client";

import { useChartRegistration } from "@/lib/admin/charts-visibility";
import { hayTendencia, modoRanking } from "@/lib/admin/inicio/hay-datos";
import { cantidad, COLOR_CONCEPTO, soles } from "@/lib/admin/inicio/formato-tablero";
import { BarrasPorDia, Leyenda, type Serie } from "./graficos-resumen";
import { RankingTablero } from "./RankingTablero";
import { detalleCompra, plural } from "./kpis-resumen";
import type { ResumenMulti } from "./use-resumen-multi";
import { DatosEnLinea, TarjetaTablero } from "./TarjetaTablero";

/**
 * Tarjetas de plata del tablero del Resumen (2026-10-29): caja (lo que entró y
 * salió cada día), compras por proveedor y clientes por día. Mismos datos y
 * mismos ids de «Gráficos» que los bloques plegables de antes.
 */

const SERIES_CAJA: Serie[] = [
  { key: "ingresos", nombre: "Entró", color: COLOR_CONCEPTO.cajaEntra },
  { key: "egresos", nombre: "Salió", color: COLOR_CONCEPTO.cajaSale },
];
const SERIES_CLIENTES: Serie[] = [
  { key: "nuevos", nombre: "Nuevos", color: COLOR_CONCEPTO.clientes },
  { key: "recurrentes", nombre: "Ya te conocían", color: COLOR_CONCEPTO.anterior },
];

export function TarjetaCaja({ r, className }: { r: ResumenMulti; className?: string }) {
  const hasData = hayTendencia(r.caja, ["ingresos", "egresos"]);
  const { visible } = useChartRegistration("resumen.caja", { label: "Plata que entró y salió", hasData });
  if (!visible || !hasData) return null;
  const k = r.cajaKpis;
  return (
    <TarjetaTablero
      id="caja"
      className={className}
      titulo="Plata que entró y salió"
      ayuda="Entró = ventas y pedidos cobrados. Salió = compras a proveedores. Pasa el mouse por un día para ver las dos cifras."
      cifra={soles(k.neto)}
      cifraTono={k.neto < 0 ? "mal" : "bien"}
      datos={
        <DatosEnLinea
          datos={[
            { label: "Entró", valor: soles(k.ingresos) },
            { label: "Salió", valor: soles(k.egresos) },
            { label: "Por pagar", valor: k.pendientePagar > 0 ? soles(k.pendientePagar) : null },
          ]}
        />
      }
    >
      <Leyenda series={SERIES_CAJA} />
      <BarrasPorDia data={r.caja} series={SERIES_CAJA} formato="soles" alto={160} estirar />
    </TarjetaTablero>
  );
}

export function TarjetaCompras({ r }: { r: ResumenMulti }) {
  const modo = modoRanking(r.compras, "monto");
  const { visible } = useChartRegistration("resumen.compras", {
    label: "Compras por proveedor",
    hasData: modo !== "oculto",
  });
  if (!visible || modo === "oculto") return null;
  const k = r.compKpis;
  // `comprasPorProveedor` ya trae el top 7; el resto se nombra al pie.
  const extra = Math.max(0, k.provActivos - r.compras.length);
  const filas = r.compras;
  return (
    <TarjetaTablero
      id="compras"
      titulo="Compras por proveedor"
      ayuda="Lo que compraste en el período a cada proveedor, con sus órdenes y lo que falta pagar. La barra de fondo los compara con el primero."
      cifra={soles(k.total)}
      datos={
        <DatosEnLinea
          datos={[
            { label: "Órdenes", valor: cantidad(k.ordenes) },
            { label: "Proveedores", valor: cantidad(k.provActivos) },
            { label: "Sin pagar", valor: k.pendiente > 0 ? soles(k.pendiente) : null },
          ]}
        />
      }
      pie={extra > 0 ? `y ${plural(extra, "proveedor más", "proveedores más")}` : undefined}
    >
      <RankingTablero
        data={filas}
        nombre={(f) => f.proveedor}
        valor={(f) => f.monto}
        formato="soles"
        color={COLOR_CONCEPTO.compras}
        detalle={detalleCompra}
      />
    </TarjetaTablero>
  );
}

export function TarjetaClientes({ r, className }: { r: ResumenMulti; className?: string }) {
  const hasData = hayTendencia(r.clientes, ["nuevos", "recurrentes"]);
  const { visible } = useChartRegistration("resumen.clientes", { label: "Clientes por día", hasData });
  if (!visible || !hasData) return null;
  const k = r.cliKpis;
  return (
    <TarjetaTablero
      id="clientes"
      className={className}
      titulo="Clientes por día"
      ayuda="Nuevos = se registraron ese día. Ya te conocían = compraron ese día y ya estaban registrados."
      cifra={plural(k.nuevos, "nuevo", "nuevos")}
      datos={
        <DatosEnLinea
          datos={[
            { label: "Compraron", valor: k.activos > 0 ? cantidad(k.activos) : null },
            { label: "Clientes en total", valor: cantidad(k.total) },
          ]}
        />
      }
    >
      <Leyenda series={SERIES_CLIENTES} />
      <BarrasPorDia data={r.clientes} series={SERIES_CLIENTES} formato="cantidad" apiladas alto={160} estirar />
    </TarjetaTablero>
  );
}
