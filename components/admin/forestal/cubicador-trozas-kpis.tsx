"use client";

/**
 * El patio de un vistazo, antes del micrófono — el mismo lugar y el mismo
 * lenguaje que en el cubicador de aserrada. Con el patio vacío no se dibuja:
 * seis tarjetas en cero antes de la primera troza son ruido.
 *
 * En Oxapampina todo va en PT y sin m³; el cotejo con la GTF (que declara m³)
 * no se muestra: no se compara pie tablar con metros cúbicos.
 */
import { AlertTriangle, Boxes, Layers, Ruler, Scale, Sigma } from "@buleje/design-system/icons";
import { PT_POR_M3 } from "@/lib/forestal/cubicacion";
import { UNIDADES_FORMULA, type FormulaTrozas, type ResumenDelPatio } from "@/lib/forestal/cubicacion-trozas-formula";
import { formatNumber } from "@/lib/format";
import { Kpi } from "./cubicador-kpis";

export default function KpisPatioTrozas({
  formula,
  totales,
  resumen,
  cmpGtf,
  sospechosas,
}: {
  formula: FormulaTrozas;
  totales: { trozas: number; volumen: number };
  resumen: ResumenDelPatio;
  cmpGtf: { deltaM3: number; deltaPct: number } | null;
  sospechosas: number;
}) {
  const u = UNIDADES_FORMULA[formula];
  const ox = formula === "oxapampina";
  const fmtVol = (v: number) => formatNumber(v, u.decimales);
  const porTroza = totales.trozas > 0 ? totales.volumen / totales.trozas : 0;
  return (
    <section
      aria-label="Resumen del patio de trozas"
      className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
          Lo que llevas cubicado
        </p>
        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">Todo el patio · {u.nombre}</p>
      </div>
      <div className={`grid grid-cols-2 gap-3 sm:grid-cols-3 ${ox ? "xl:grid-cols-4" : "xl:grid-cols-5"}`}>
        <Kpi
          Icono={Boxes}
          rotulo="Volumen"
          valor={fmtVol(totales.volumen)}
          unidad={u.volumen}
          destacado
          sub={ox ? "pie tablar Oxapampa" : `${formatNumber(Math.round(totales.volumen * PT_POR_M3))} PT equivalentes`}
        />
        <Kpi
          Icono={Layers}
          rotulo="Trozas"
          valor={formatNumber(totales.trozas)}
          unidad={totales.trozas === 1 ? "troza" : "trozas"}
          sub={`${fmtVol(porTroza)} ${u.volumen} cada una`}
        />
        <Kpi
          Icono={Sigma}
          rotulo="Especies"
          valor={String(resumen.especies.length)}
          unidad={resumen.especies.length === 1 ? "especie" : "especies"}
          sub={resumen.dominante ? `${resumen.dominante[0]} · ${resumen.pctDominante.toFixed(0)} %` : undefined}
        />
        <Kpi
          Icono={Ruler}
          rotulo="Ø promedio"
          valor={resumen.diametroMedio.toFixed(1)}
          unidad={u.diametro}
          sub={`largo medio ${resumen.largoMedio.toFixed(2)} ${u.largo}`}
        />
        {/* El cotejo contra la guía es el dato de compliance de esta pantalla:
            si el patio no coincide con lo declarado, se resuelve ANTES de
            firmar el ingreso. Sin GTF cargada se dice, no se inventa un cero. */}
        {!ox && (
          <Kpi
            Icono={Scale}
            rotulo="Contra la GTF"
            valor={cmpGtf ? `${cmpGtf.deltaM3 > 0 ? "+" : ""}${fmtVol(cmpGtf.deltaM3)}` : "—"}
            unidad={cmpGtf ? "m³" : undefined}
            apagado={!cmpGtf}
            sub={cmpGtf ? `${cmpGtf.deltaPct > 0 ? "+" : ""}${cmpGtf.deltaPct} % contra la guía` : "pon los m³ de la guía"}
          />
        )}
      </div>

      {sospechosas > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          {sospechosas === 1 ? "Una troza tiene" : `${sospechosas} trozas tienen`} medidas fuera de rango — revísalas
          antes de cerrar el ingreso.
        </p>
      )}
    </section>
  );
}
