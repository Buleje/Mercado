"use client";

import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { useChartRegistration } from "@/lib/admin/charts-visibility";
import { hayDatosEnSerie, modoRanking } from "@/lib/admin/inicio/hay-datos";
import { cantidad, COLOR_CONCEPTO, soles } from "@/lib/admin/inicio/formato-tablero";
import { RankingTablero } from "./RankingTablero";
import type { FilaRiesgo } from "./calculos-tablero";
import { plural } from "./kpis-resumen";
import type { ResumenMulti } from "./use-resumen-multi";
import { DatosEnLinea, TarjetaTablero } from "./TarjetaTablero";

/**
 * Tarjetas del stock en el tablero del Resumen (2026-10-29): lo que hay que
 * reponer (agotados primero, después el que está más corto contra su mínimo)
 * y el valor del stock por categoría. Las dos son la foto de HOY, no del rango.
 */

const HREF_REPONER = "/admin?tab=inventario&filter=critical";
/** 5 filas: con 7 la tarjeta medía 479 px y estiraba la de la caja a su lado. */
const CATEGORIAS_A_LA_VISTA = 5;

function FilaDeRiesgo({ f }: { f: FilaRiesgo }) {
  const pct = f.minimo > 0 ? Math.min(100, (f.stock / f.minimo) * 100) : 0;
  return (
    <li className="py-1.5">
      <div className="flex items-baseline gap-2 text-sm">
        <span className="min-w-0 flex-1 truncate font-semibold text-[var(--text-primary)]" title={f.producto}>
          {f.producto}
        </span>
        {f.agotado ? (
          <span className="shrink-0 font-extrabold text-[var(--data-error-ink)]">Agotado</span>
        ) : (
          <span className="shrink-0 font-bold tabular-nums text-[var(--data-warning-ink)]">
            {cantidad(f.stock)} <span className="font-medium text-[var(--text-tertiary)]">de {cantidad(f.minimo)}</span>
          </span>
        )}
      </div>
      <div
        className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]"
        title={`Quedan ${cantidad(f.stock)}; el mínimo es ${cantidad(f.minimo)}`}
        aria-hidden
      >
        <span
          className="block h-full rounded-full"
          style={{
            width: `${f.agotado ? 100 : Math.max(4, pct)}%`,
            backgroundColor: f.agotado ? "var(--data-error-500)" : "var(--data-warning-500)",
            opacity: f.agotado ? 0.35 : 1,
          }}
        />
      </div>
    </li>
  );
}

export function StockEnRiesgo({ r }: { r: ResumenMulti }) {
  const { filas, total } = r.riesgo;
  const { visible } = useChartRegistration("resumen.riesgo", { label: "Por reponer", hasData: total > 0 });
  if (!visible || total === 0) return null;
  const agotados = r.invKpis.sinStock;
  return (
    <TarjetaTablero
      id="riesgo"
      titulo="Por reponer"
      ayuda="Productos agotados o en su stock mínimo (el de cada producto o, si no tiene, el mínimo general de Inventario). Los agotados van primero."
      cifra={plural(total, "producto", "productos")}
      cifraTono="aviso"
      datos={
        <DatosEnLinea
          datos={[
            { label: "Agotados", valor: agotados > 0 ? cantidad(agotados) : null },
            { label: "En su mínimo", valor: r.invKpis.criticos > 0 ? cantidad(r.invKpis.criticos) : null },
          ]}
        />
      }
      pie={
        <EnlacePanel href={HREF_REPONER} className="inline-flex min-h-12 items-center">
          {total > filas.length ? `Ver los ${cantidad(total)} en Inventario` : "Ver en Inventario"}
        </EnlacePanel>
      }
    >
      <ul className="divide-y divide-[var(--rule-soft)]">
        {filas.map((f) => (
          <FilaDeRiesgo key={f.producto} f={f} />
        ))}
      </ul>
    </TarjetaTablero>
  );
}

export function InventarioPorCategoria({ r, className }: { r: ResumenMulti; className?: string }) {
  const porValor = hayDatosEnSerie(r.inventario, ["valor"]);
  const modo = modoRanking(r.inventario, porValor ? "valor" : "skus");
  const { visible } = useChartRegistration("resumen.inventario", {
    label: porValor ? "Valor del stock por categoría" : "Productos por categoría",
    hasData: modo !== "oculto",
  });
  if (!visible || modo === "oculto") return null;
  const k = r.invKpis;
  return (
    <TarjetaTablero
      id="inventario"
      className={className}
      pie={
        r.inventario.length > CATEGORIAS_A_LA_VISTA ? (
          <EnlacePanel href="/admin?tab=inventario" className="inline-flex min-h-12 items-center">
            {`y ${plural(r.inventario.length - CATEGORIAS_A_LA_VISTA, "categoría más", "categorías más")} en Inventario`}
          </EnlacePanel>
        ) : undefined
      }
      titulo={porValor ? "Valor del stock por categoría" : "Productos por categoría"}
      ayuda="Stock × costo de cada producto activo, hoy, agrupado por categoría (las 5 de más valor). Los productos sin costo cargado no suman al valor."
      cifra={porValor ? soles(k.valor) : plural(k.skus, "producto", "productos")}
      datos={
        <DatosEnLinea
          datos={[
            { label: "Productos", valor: porValor ? cantidad(k.skus) : null },
            { label: "Sin costo", valor: k.sinCosto > 0 ? cantidad(k.sinCosto) : null },
          ]}
        />
      }
    >
      <RankingTablero
        data={r.inventario}
        nombre={(f) => f.categoria}
        valor={(f) => (porValor ? f.valor : f.skus)}
        formato={porValor ? "soles" : "cantidad"}
        color={COLOR_CONCEPTO.stock}
        detalle={(f) => `${plural(f.skus, "producto", "productos")} · ${cantidad(f.stock)} en stock`}
        max={CATEGORIAS_A_LA_VISTA}
      />
    </TarjetaTablero>
  );
}
