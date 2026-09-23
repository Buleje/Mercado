"use client";

/**
 * El resumen del lote, arriba del micrófono.
 *
 * Antes había que bajar hasta la tabla —o abrir el panel de Resumen— para saber
 * cuánto llevaba medido el lote que se está dictando. Los tres números que
 * decide todo el módulo (m³, pie tablar, piezas) ahora están donde se trabaja,
 * a la vista mientras se carga.
 *
 * Reglas que gobiernan lo que se muestra:
 *
 * 1. **El m³ SALE del pie tablar** (÷424), nunca al revés y nunca de sumar los
 *    m³ ya redondeados de cada fila. Acá no se recalcula nada: llega `totales`,
 *    que el cubicador deriva del PT total. `TOTAL × 424 = PT` tiene que cerrar.
 * 2. **Describe el LOTE ENTERO**, y lo dice. Los filtros viven en la tabla, mucho
 *    más abajo; un resumen que cambiara con ellos, a esta distancia, se leería
 *    como que el lote encogió. Cuando hay un filtro puesto se agrega una línea
 *    con el subtotal, en vez de reemplazar el total (ADR-400).
 * 3. **Sin precio cargado no se inventa un valor.** Se dice «sin precio», nunca
 *    «S/ 0»: un cero finge que la madera no vale nada.
 * 4. **Con el lote vacío no se dibuja.** Seis tarjetas en cero arriba del
 *    micrófono son ruido antes de la primera pieza.
 */

import { useMemo } from "react";
import { Boxes, Ruler, Layers, Coins, Sigma, AlertTriangle, ChevronUp, ChevronDown } from "@buleje/design-system/icons";
import { ORDEN_TIPO, tipoDePieza, tonoTipo, type TipoComercial } from "@/lib/forestal/cubicacion-tipo";
import { medidaSospechosa, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { formatNumber } from "@/lib/format";

export interface TotalesLote {
  piezas: number;
  pt: number;
  m3: number;
}

/** Colores del mix por tipo — los mismos tonos que el chip de la tabla. */
const BARRA_TONO: Record<ReturnType<typeof tonoTipo>, string> = {
  success: "bg-[var(--data-success-500)]",
  info: "bg-[var(--data-info-500)]",
  warning: "bg-[var(--data-warning-500)]",
  neutral: "bg-[var(--text-tertiary)]",
};

export default function CubicadorKpis({
  oculto,
  onOcultar,
  onMostrar,
  rows,
  totales,
  totalesVisibles,
  filtrando,
  valorLote,
  conValor,
  hayPreciosEspecie,
  precio,
  rotuloPrecio,
  avisarRaras,
  fmtPt,
  fmtM3,
  onFiltrarTipo,
}: {
  /** Plegado: queda una tira con los tres números y el botón para traerlo. */
  oculto?: boolean;
  onOcultar?: () => void;
  onMostrar?: () => void;
  rows: PiezaCubicada[];
  totales: TotalesLote;
  /** Lo que queda con el filtro de la tabla puesto — se muestra aparte. */
  totalesVisibles: TotalesLote;
  filtrando: boolean;
  valorLote: number;
  conValor: boolean;
  hayPreciosEspecie: boolean;
  precio: number;
  /**
   * Cómo se puso el precio, ya dicho por quien sabe (ADR-430: «precio de cada
   * cliente», «leyendo…»). Manda sobre el rótulo armado con `precio`.
   */
  rotuloPrecio?: string;
  /** Si el operario apagó el aviso de medidas raras, acá tampoco se avisa. */
  avisarRaras: boolean;
  fmtPt: (v: number) => string;
  fmtM3: (v: number) => string;
  /** Click en un tipo del mix: filtra la tabla por ese tipo. */
  onFiltrarTipo?: (t: TipoComercial) => void;
}) {
  const resumen = useMemo(() => {
    /* Una sola pasada: con 700 filas, seis recorridos separados se notan al
       dictar (este componente se re-renderiza con cada pieza que entra). */
    const porEspecie = new Map<string, number>();
    const porTipo = new Map<TipoComercial, number>();
    const medidas = new Set<string>();
    let raras = 0;
    for (const r of rows) {
      const esp = r.especie?.trim() || "Sin especie";
      porEspecie.set(esp, (porEspecie.get(esp) ?? 0) + r.pieTablar);
      const t = tipoDePieza(r);
      porTipo.set(t, (porTipo.get(t) ?? 0) + r.pieTablar);
      medidas.add(`${r.espesor}x${r.ancho}x${r.largo}`);
      if (medidaSospechosa(r.espesor, r.ancho, r.largo)) raras += r.cantidad;
    }
    const especies = [...porEspecie.entries()].sort((a, b) => b[1] - a[1]);
    const mix = ORDEN_TIPO.filter((t) => porTipo.has(t)).map((t) => ({
      tipo: t,
      pt: porTipo.get(t) ?? 0,
      pct: totales.pt > 0 ? ((porTipo.get(t) ?? 0) / totales.pt) * 100 : 0,
    }));
    return {
      especies,
      dominante: especies[0] ?? null,
      pctDominante: totales.pt > 0 && especies[0] ? (especies[0][1] / totales.pt) * 100 : 0,
      medidas: medidas.size,
      raras,
      mix,
    };
  }, [rows, totales.pt]);

  if (rows.length === 0) return null;

  const nf = (v: number) => formatNumber(v);
  const soles = (v: number) => formatNumber(v, 2);
  const ptPorPieza = totales.piezas > 0 ? totales.pt / totales.piezas : 0;

  /* Plegado se lleva los tres números con él: esconder el resumen no puede
     costar saber cuánto llevas medido, que es justo para lo que está. */
  if (oculto) {
    return (
      <button
        type="button"
        onClick={onMostrar}
        aria-label="Mostrar el resumen del lote"
        className="flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-2.5 text-left transition-colors hover:border-[var(--accent)]"
      >
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
          {fmtM3(totales.m3)} <span className="font-sans text-xs text-[var(--text-tertiary)]">m³</span>
          <span aria-hidden className="text-[var(--rule-base)]">·</span>
          {fmtPt(totales.pt)} <span className="font-sans text-xs text-[var(--text-tertiary)]">PT</span>
          <span aria-hidden className="text-[var(--rule-base)]">·</span>
          {nf(totales.piezas)}{" "}
          <span className="font-sans text-xs text-[var(--text-tertiary)]">
            {totales.piezas === 1 ? "pieza" : "piezas"}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
          <ChevronDown className="h-3.5 w-3.5" aria-hidden /> Ver el resumen
        </span>
      </button>
    );
  }

  return (
    <section
      aria-label="Resumen del lote cubicado"
      className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Lo que llevas medido
        </p>
        <div className="flex items-center gap-3">
          {/* Que el total es el del lote ENTERO se dice acá, no se deduce. */}
          <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
            Todo el lote · {nf(rows.length)} {rows.length === 1 ? "renglón" : "renglones"}
          </p>
          {onOcultar && (
            <button
              type="button"
              onClick={onOcultar}
              title="Ocultar el resumen"
              aria-label="Ocultar el resumen del lote"
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2 py-1 text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
            >
              <ChevronUp className="h-3.5 w-3.5" aria-hidden /> Ocultar
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {/* El m³ va primero y grande: es el número que se declara. */}
        <Kpi
          Icono={Boxes}
          rotulo="Volumen"
          valor={fmtM3(totales.m3)}
          unidad="m³"
          destacado
          sub={`${fmtPt(totales.pt)} PT ÷ 424`}
        />
        <Kpi Icono={Ruler} rotulo="Pie tablar" valor={fmtPt(totales.pt)} unidad="PT" />
        <Kpi
          Icono={Layers}
          rotulo="Piezas"
          valor={nf(totales.piezas)}
          unidad={totales.piezas === 1 ? "pieza" : "piezas"}
          sub={`${nf(resumen.medidas)} ${resumen.medidas === 1 ? "medida distinta" : "medidas distintas"}`}
        />
        <Kpi
          Icono={Coins}
          rotulo="Valor del lote"
          valor={conValor ? `S/ ${soles(valorLote)}` : "—"}
          /* Sin precio no se inventa un número: un «S/ 0» finge que la madera
             no vale nada, y ese cero después se copia a una liquidación. */
          sub={
            rotuloPrecio ??
            (conValor
              ? hayPreciosEspecie
                ? "precio por especie"
                : `S/ ${soles(precio)} por PT`
              : "carga el precio por PT")
          }
          apagado={!conValor}
        />
        <Kpi
          Icono={Sigma}
          rotulo="Especies"
          valor={nf(resumen.especies.length)}
          unidad={resumen.especies.length === 1 ? "especie" : "especies"}
          sub={
            resumen.dominante
              ? `${resumen.dominante[0]} · ${resumen.pctDominante.toFixed(0)} %`
              : undefined
          }
        />
        {/* El promedio delata una medida mal dictada antes que el total: 700
            piezas de 12 PT y una de 900 mueven poco el total y mucho esto. */}
        <Kpi
          Icono={Ruler}
          rotulo="Promedio"
          valor={ptPorPieza.toFixed(2)}
          unidad="PT/pieza"
          sub={`${fmtM3(totales.piezas > 0 ? totales.m3 / totales.piezas : 0)} m³ cada una`}
        />
      </div>

      {/* De qué está hecho el lote, que es lo que fija el precio de venta. */}
      {resumen.mix.length > 1 && (
        <div className="mt-3">
          <div className="flex h-2 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            {resumen.mix.map((m) => (
              <div
                key={m.tipo}
                className={BARRA_TONO[tonoTipo(m.tipo)]}
                style={{ width: `${m.pct}%` }}
                aria-hidden
              />
            ))}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
            {resumen.mix.map((m) => {
              const etiqueta = `${m.tipo} · ${m.pct.toFixed(0)} %`;
              return onFiltrarTipo ? (
                <button
                  key={m.tipo}
                  type="button"
                  onClick={() => onFiltrarTipo(m.tipo)}
                  title={`Ver sólo las piezas de tipo ${m.tipo} en la tabla`}
                  className="inline-flex items-center gap-1.5 rounded text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)] underline decoration-dotted underline-offset-2 transition-colors hover:text-[var(--accent)]"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${BARRA_TONO[tonoTipo(m.tipo)]}`} aria-hidden />
                  {etiqueta}
                </button>
              ) : (
                <span
                  key={m.tipo}
                  className="inline-flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold text-[var(--text-secondary)]"
                >
                  <span className={`h-2 w-2 shrink-0 rounded-full ${BARRA_TONO[tonoTipo(m.tipo)]}`} aria-hidden />
                  {etiqueta}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Lo que queda con el filtro de la tabla puesto. Se AGREGA, no reemplaza:
          el total de arriba sigue siendo el del lote. */}
      {filtrando && (
        <p className="mt-3 border-t border-[var(--rule-soft)] pt-2 text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
          Con el filtro de la tabla: {nf(totalesVisibles.piezas)}{" "}
          {totalesVisibles.piezas === 1 ? "pieza" : "piezas"} · {fmtPt(totalesVisibles.pt)} PT ·{" "}
          {fmtM3(totalesVisibles.m3)} m³
        </p>
      )}

      {/* Una medida fuera de rango entra al total como cualquier otra: si está
          mal dictada, todo lo de arriba está mal. Se avisa acá, donde se ve el
          número, y sólo si el operario dejó el aviso prendido. */}
      {avisarRaras && resumen.raras > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {nf(resumen.raras)} {resumen.raras === 1 ? "pieza tiene" : "piezas tienen"} una medida fuera de
          lo común — revísala antes de declarar el total.
        </p>
      )}
    </section>
  );
}

/**
 * Una tarjeta de KPI. Exportada porque el cubicador de TROZAS usa las mismas:
 * son el mismo tipo de dato en la misma pantalla, y dos tarjetas parecidas pero
 * distintas es lo que hace que un panel se vea desprolijo.
 */
export function Kpi({
  Icono,
  rotulo,
  valor,
  unidad,
  sub,
  destacado,
  apagado,
}: {
  Icono: React.ComponentType<{ className?: string }>;
  rotulo: string;
  valor: string;
  unidad?: string;
  sub?: string;
  destacado?: boolean;
  apagado?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        destacado
          ? "border-[var(--accent)] bg-primary/5"
          : "border-[var(--rule-soft)] bg-[var(--surface-canvas)]"
      }`}
    >
      <p className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
        <Icono className="h-3.5 w-3.5" aria-hidden />
        <span className="truncate">{rotulo}</span>
      </p>
      <p
        className={`mt-1 font-mono text-xl font-extrabold tabular-nums ${
          apagado ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"
        }`}
      >
        {valor}
        {unidad && (
          <span className="ml-1 font-sans text-xs font-bold text-[var(--text-tertiary)]">{unidad}</span>
        )}
      </p>
      {sub && <p className="mt-0.5 truncate text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{sub}</p>}
    </div>
  );
}
