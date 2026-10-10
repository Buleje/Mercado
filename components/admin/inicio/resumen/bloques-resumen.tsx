import { DashboardSection } from "../_shared";
import { hayDatosEnSerie, hayTendencia, modoRanking } from "@/lib/admin/inicio/hay-datos";
import { cantidad, COLOR_CONCEPTO } from "@/lib/admin/inicio/formato-tablero";
import {
  BarrasPorDia,
  BarrasRanking,
  ConCifras,
  Leyenda,
  RankingCorto,
  type Serie,
} from "./graficos-resumen";
import { detalleCompra, kpisDelResumen, plural } from "./kpis-resumen";
import type { ResumenMulti } from "./use-resumen-multi";

/**
 * Los cinco bloques del Resumen de Inicio (caja, lo más vendido, compras,
 * inventario, clientes), cada uno con su «¿tiene datos?» calculado con la
 * regla única de `lib/admin/inicio/hay-datos`:
 *  - serie por día: hace falta tendencia (2+ días con valor);
 *  - ranking: 0 filas → oculto · 1-2 → lista corta · 3+ → barras.
 * `InicioMultiCharts` decide dónde va cada uno (fila o «sin datos»).
 */

const SERIES_CAJA: Serie[] = [
  { key: "ingresos", nombre: "Entró", color: COLOR_CONCEPTO.cajaEntra },
  { key: "egresos", nombre: "Salió", color: COLOR_CONCEPTO.cajaSale },
];
const SERIES_CLIENTES: Serie[] = [
  { key: "nuevos", nombre: "Nuevos", color: COLOR_CONCEPTO.clientes },
  { key: "recurrentes", nombre: "Ya te conocían", color: COLOR_CONCEPTO.anterior },
];

export function bloquesDelResumen(resumen: ResumenMulti, rango: string) {
  const { caja, inventario, compras, clientes, productos } = resumen;
  const {
    caja: kpisCaja,
    productos: kpisProductos,
    compras: kpisCompras,
    inventario: kpisInventario,
    clientes: kpisClientes,
  } = kpisDelResumen(resumen);

  const cajaConDatos = hayTendencia(caja, ["ingresos", "egresos"]);
  const modoProductos = modoRanking(productos, "unidades");
  const modoCompras = modoRanking(compras, "monto");
  const invPorValor = hayDatosEnSerie(inventario, ["valor"]);
  const modoInventario = modoRanking(inventario, invPorValor ? "valor" : "skus");
  const clientesConDatos = hayTendencia(clientes, ["nuevos", "recurrentes"]);

  const bloques = {
    caja: {
      conDatos: cajaConDatos,
      nodo: (
        <DashboardSection
          chartId="resumen.caja"
          hasData={cajaConDatos}
          kicker={`Caja · ${rango}`}
          title="Plata que entró y salió"
        >
          <ConCifras kpis={kpisCaja}>
            <Leyenda series={SERIES_CAJA} />
            <BarrasPorDia data={caja} series={SERIES_CAJA} formato="soles" alto={190} />
          </ConCifras>
        </DashboardSection>
      ),
    },
    productos: {
      conDatos: modoProductos !== "oculto",
      nodo: (
        <DashboardSection
          chartId="resumen.productos"
          hasData={modoProductos !== "oculto"}
          kicker={`Productos · ${rango}`}
          title="Lo que más vendiste"
        >
          <ConCifras kpis={kpisProductos}>
            {modoProductos === "lista" ? (
              <RankingCorto
                data={productos}
                nombre={(f) => f.producto}
                valor={(f) => f.ingresos}
                formato="soles"
                color={COLOR_CONCEPTO.ventas}
                sub={(f) => plural(f.unidades, "unidad", "unidades")}
              />
            ) : (
              <BarrasRanking
                data={productos}
                nombre={(f) => f.producto}
                valor="ingresos"
                serie="Vendiste"
                color={COLOR_CONCEPTO.ventas}
                formato="soles"
                detalle={(f) => plural(f.unidades, "unidad", "unidades")}
              />
            )}
          </ConCifras>
        </DashboardSection>
      ),
    },
    compras: {
      conDatos: modoCompras !== "oculto",
      nodo: (
        <DashboardSection
          chartId="resumen.compras"
          hasData={modoCompras !== "oculto"}
          kicker={`Compras · ${rango}`}
          title="Compras por proveedor"
        >
          <ConCifras kpis={kpisCompras}>
            {modoCompras === "lista" ? (
              <RankingCorto
                data={compras}
                nombre={(f) => f.proveedor}
                valor={(f) => f.monto}
                formato="soles"
                color={COLOR_CONCEPTO.compras}
                sub={(f) => detalleCompra(f)}
              />
            ) : (
              <BarrasRanking
                data={compras}
                nombre={(f) => f.proveedor}
                valor="monto"
                serie="Compraste"
                color={COLOR_CONCEPTO.compras}
                formato="soles"
                detalle={detalleCompra}
              />
            )}
          </ConCifras>
        </DashboardSection>
      ),
    },
    inventario: {
      conDatos: modoInventario !== "oculto",
      nodo: (
        <DashboardSection
          chartId="resumen.inventario"
          hasData={modoInventario !== "oculto"}
          kicker="Inventario · hoy"
          title={invPorValor ? "Valor del stock por categoría" : "Productos por categoría"}
        >
          <ConCifras kpis={kpisInventario}>
            {modoInventario === "lista" ? (
              <RankingCorto
                data={inventario}
                nombre={(f) => f.categoria}
                valor={(f) => (invPorValor ? f.valor : f.skus)}
                formato={invPorValor ? "soles" : "cantidad"}
                color={COLOR_CONCEPTO.stock}
                sub={(f) => plural(f.skus, "producto", "productos")}
              />
            ) : (
              <BarrasRanking
                data={inventario}
                nombre={(f) => f.categoria}
                valor={invPorValor ? "valor" : "skus"}
                serie={invPorValor ? "Valor" : "Productos"}
                color={COLOR_CONCEPTO.stock}
                formato={invPorValor ? "soles" : "cantidad"}
                detalle={(f) =>
                  `${plural(f.skus, "producto", "productos")} · ${cantidad(f.stock)} en stock`
                }
              />
            )}
          </ConCifras>
        </DashboardSection>
      ),
    },
    clientes: {
      conDatos: clientesConDatos,
      nodo: (
        <DashboardSection
          chartId="resumen.clientes"
          hasData={clientesConDatos}
          kicker={`Clientes · ${rango}`}
          title="Clientes por día"
        >
          <ConCifras kpis={kpisClientes}>
            <Leyenda series={SERIES_CLIENTES} />
            <BarrasPorDia
              data={clientes}
              series={SERIES_CLIENTES}
              formato="cantidad"
              apiladas
              alto={200}
            />
          </ConCifras>
        </DashboardSection>
      ),
    },
  };
  return bloques;
}

export type BloquesResumen = ReturnType<typeof bloquesDelResumen>;
