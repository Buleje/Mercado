"use client";

/**
 * Columna «Resumen» del modal «Guardar cubicación» (Brandon 24-10: «bien
 * detallado un resumen tipo especie, y otros resúmenes»). Lo que se va a
 * guardar, con el precio de cada pieza: totales arriba y una tabla a la vez
 * (por especie, especie × tipo, tipo, largo, medida o dueño). Mismas tablas y
 * mismas cuentas que la sección Resúmenes (`agruparOficial`).
 */
import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Boxes, ChevronDown, Coins, Layers, Ruler, Scale } from "@buleje/design-system/icons";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import { fmtM3, fmtPct, fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { agruparOficial, resumenPorEspecie, type DimensionResumen } from "@/lib/forestal/cubicacion-resumen";
import { formatNumber } from "@/lib/format";
import { button } from "@/components/ui-system/button-variants";
import { KpiResumen, TablaGrupos } from "./resumen-tabla";

type Vista = Extract<DimensionResumen, "especie" | "tipo" | "largo" | "medida" | "dueno"> | "especie-tipo";
const VISTAS: { v: Vista; label: string; col: string }[] = [
  { v: "especie", label: "Por especie", col: "Especie" },
  { v: "especie-tipo", label: "Especie × tipo", col: "Tipo" },
  { v: "tipo", label: "Por tipo", col: "Tipo" },
  { v: "largo", label: "Por largo", col: "Largo" },
  { v: "medida", label: "Por medida", col: "Medida" },
  { v: "dueno", label: "Por dueño", col: "Dueño" },
];
const CHIP = "h-10 rounded-xl border px-3 text-sm font-bold transition-colors";
const CHIP_ON = "border-[var(--accent)] bg-[var(--accent)] text-white";
const CHIP_OFF = "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]";
const PLEGAR = button({ variant: "secondary", className: "h-11 min-w-0 gap-2 rounded-xl px-3 text-sm font-bold tabular-nums lg:hidden" });
const PILL = "rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[var(--text-secondary)]";

export default function ResumenDeGuardar({ rows, precioDe, conValor }: {
  rows: PiezaCubicada[];
  precioDe: (p: PiezaCubicada) => number;
  conValor: boolean;
}) {
  const [vista, setVista] = useState<Vista>("especie");
  const porEspecie = useMemo(() => agruparOficial(rows, "especie", precioDe), [rows, precioDe]);
  const tabla = useMemo(
    () => (vista === "especie" ? porEspecie : vista === "especie-tipo" ? null : agruparOficial(rows, vista, precioDe)),
    [vista, porEspecie, rows, precioDe],
  );
  const bloques = useMemo(() => (vista === "especie-tipo" ? resumenPorEspecie(rows, precioDe) : []), [vista, rows, precioDe]);
  const { total } = porEspecie;
  const promedio = total.pieTablar > 0 ? total.valor / total.pieTablar : 0;
  const [abierto, setAbierto] = useState(false);
  const col = VISTAS.find((x) => x.v === vista)?.col ?? "Grupo";

  return (
    /* En la PC el resumen queda a la vista mientras bajas por los datos y el precio. */
    <section aria-labelledby="cubg-resumen" data-resumen-guardar className="order-first min-w-0 space-y-3 lg:order-none lg:sticky lg:top-0 lg:self-start">
      {/* En el celular el resumen va ARRIBA y plegado: una línea; al tocarla se despliega. */}
      <div className="flex items-center justify-between gap-2">
        <CardTitle as="h3" id="cubg-resumen">Resumen</CardTitle>
        <button type="button" aria-expanded={abierto} aria-controls="cubg-resumen-cuerpo" onClick={() => setAbierto((a) => !a)}
          data-accion="resumen-plegable"
          className={PLEGAR}>
          <span className="truncate">
            {formatNumber(total.cantidad)} pzas · {fmtPt(total.pieTablar)} PT · {conValor ? `S/ ${fmtSoles(total.valor)}` : "sin precio"}
          </span>
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
        </button>
      </div>
      <div id="cubg-resumen-cuerpo" className={abierto ? "space-y-3" : "hidden space-y-3 lg:block"}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <KpiResumen label="Piezas" value={formatNumber(total.cantidad)} icon={Boxes} />
        <KpiResumen label="Pie tablar" value={fmtPt(total.pieTablar)} unidad="PT" icon={Ruler} />
        <KpiResumen label="Volumen" value={fmtM3(total.m3)} unidad="m³" icon={Scale} />
        <KpiResumen label="S/ por PT (promedio)" value={conValor ? `S/ ${formatNumber(promedio, { min: 2, max: 2 })}` : "—"} icon={Layers}
          hint="Importe ÷ pie tablar del lote." />
        {/* El importe es la cifra por la que se abre la ventana: con dos columnas no se corta («S/ 2,266.…»). */}
        <div className="col-span-2">
          <KpiResumen label="Importe" value={conValor ? `S/ ${fmtSoles(total.valor)}` : "Sin precio"} icon={Coins} destacado
            hint={`PT × precio de cada pieza (vista previa) · ${porEspecie.grupos.length} ${porEspecie.grupos.length === 1 ? "especie" : "especies"}.`} />
        </div>
      </div>

      <div role="group" aria-label="Ver el resumen" className="flex flex-wrap gap-1.5">
        {VISTAS.map(({ v, label }) => (
          <button key={v} type="button" aria-pressed={vista === v} onClick={() => setVista(v)}
            className={`${CHIP} ${vista === v ? CHIP_ON : CHIP_OFF}`}>
            {label}
          </button>
        ))}
      </div>

      {tabla ? (
        <TablaGrupos grupos={tabla.grupos} total={tabla.total} primeraCol={col} conValor={conValor} esTipo={vista === "tipo"}
          compacta caption={`Resumen ${VISTAS.find((x) => x.v === vista)?.label.toLowerCase()}`} />
      ) : (
        <div className="space-y-3">
          {bloques.map((b) => (
            <div key={b.especie} className="space-y-1.5 rounded-2xl border border-[var(--rule-base)] p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <CardTitle as="h4" className="text-sm font-bold">{b.especie}</CardTitle>
                <span className="flex flex-wrap items-center gap-1.5 font-mono text-sm tabular-nums">
                  <span className={PILL}>{b.total.cantidad} pzas</span>
                  <span className={PILL}>{fmtPt(b.total.pieTablar)} PT</span>
                  {total.pieTablar > 0 && <span className={PILL}>{fmtPct((b.total.pieTablar / total.pieTablar) * 100)}%</span>}
                  {conValor && <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">S/ {fmtSoles(b.total.valor)}</span>}
                </span>
              </div>
              <TablaGrupos grupos={b.tipos} total={b.total} primeraCol="Tipo" conValor={conValor} esTipo compacta caption={`Tipos de ${b.especie}`} />
            </div>
          ))}
        </div>
      )}
      </div>
    </section>
  );
}
