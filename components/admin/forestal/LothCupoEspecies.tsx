/**
 * Cupo por especie: cuánto se taló de cada especie contra lo que se podía.
 *
 * Una fila por especie: árboles talados / censados, m³ talado / cupo, una barra
 * con el % y el veredicto con COLOR + TEXTO (el color solo no le dice nada a
 * quien no distingue rojo de verde, ni a una impresión en blanco y negro). Las
 * excedidas van arriba: es lo primero que hay que mirar.
 *
 * Props puras: recibe las filas ya calculadas (`cupoPorEspecie`) o la entrada
 * cruda (censo + talas + autorizadas) y las calcula. Sin fetch ni estado.
 */

import { useMemo } from "react";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { fmtM3, fmtPct } from "@/lib/forestal/cubicacion-formato";
import {
  cupoPorEspecie,
  ordenarCupos,
  totalesCupo,
  type CupoEspecie,
  type EntradaCupo,
  type VeredictoCupo,
} from "@/lib/forestal/loth-cupo-especie";
import { etiquetaVeredicto as etiqueta } from "@/lib/forestal/loth-cupo-vista";
import { BarraFiltrosTabla, FiltroEnCabecera, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "./filtros-tabla-forestal";

export type LothCupoEspeciesProps = (
  | { filas: readonly CupoEspecie[]; entrada?: never }
  | { entrada: EntradaCupo; filas?: never }
) & {
  /** Por defecto «Cupo por especie». */
  titulo?: string;
  className?: string;
  /**
   * «Cargar lo autorizado» en cada especie que se mide contra el censo (o que
   * no tiene contra qué medirse): el cupo real es el de la resolución. Sin
   * esta prop el botón no aparece (la tabla también se usa donde no se edita).
   */
  onCargarAutorizado?: (especie: string) => void;
};

export const TONO_CUPO: Record<VeredictoCupo, { texto: string; barra: string }> = {
  excedido: { texto: "text-[var(--data-error-ink)]", barra: "bg-[var(--data-error-500)]" },
  cerca: { texto: "text-[var(--data-warning-ink)]", barra: "bg-[var(--data-warning-500)]" },
  ok: { texto: "text-[var(--data-success-ink)]", barra: "bg-[var(--data-success-500)]" },
  sin_cupo: { texto: "text-[var(--text-tertiary)]", barra: "bg-[var(--rule-strong)]" },
};

const NUM = "whitespace-nowrap px-2 py-1.5 text-right font-mono text-xs tabular-nums";

/** El estado como categoría (sin el «+3,337 m³» de la etiqueta, que daría una opción por especie). */
const ESTADO_CUPO: Record<VeredictoCupo, string> = { excedido: "Excedido", cerca: "Cerca del cupo", ok: "En regla", sin_cupo: "Sin cupo" };

const COLUMNAS_CUPO: ColumnaFiltro<CupoEspecie>[] = [
  { id: "especie", label: "Especie", tipo: "multi", valor: (f) => f.especie, clave: (v) => v.toLowerCase() },
  { id: "arboles", label: "Árboles", tipo: "rango", numero: (f) => f.arbolesTalados, unidad: "talados", paso: 1 },
  { id: "talado", label: "m³ talado", tipo: "rango", numero: (f) => f.taladoM3, unidad: "m³", paso: 1 },
  { id: "uso", label: "Uso del cupo", tipo: "rango", numero: (f) => f.pctUsado, unidad: "%", paso: 10 },
  { id: "estado", label: "Estado", tipo: "multi", valor: (f) => (f.veredicto === "sin_cupo" && f.arbolesTalados > 0 ? "Talada sin cupo" : ESTADO_CUPO[f.veredicto]) },
];

function Barra({ f }: { f: CupoEspecie }) {
  if (f.pctUsado == null) return <span className="text-xs text-[var(--text-tertiary)]">—</span>;
  /* La barra llega al 100 % del ancho; el número dice cuánto pasa. */
  const ancho = Math.min(100, Math.max(0, f.pctUsado));
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-2 w-20 overflow-hidden rounded-full bg-[var(--surface-sunken)] sm:w-28"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(f.pctUsado)}
        aria-label={`${f.especie}: ${fmtPct(f.pctUsado)} % del cupo`}
      >
        <div className={`h-full rounded-full ${TONO_CUPO[f.veredicto].barra}`} style={{ width: `${ancho}%` }} />
      </div>
      <span className={`font-mono text-xs tabular-nums ${f.veredicto === "ok" ? "text-[var(--text-secondary)]" : `font-bold ${TONO_CUPO[f.veredicto].texto}`}`}>
        {fmtPct(f.pctUsado)} %
      </span>
    </div>
  );
}

export default function LothCupoEspecies(props: LothCupoEspeciesProps) {
  const { entrada, filas: dadas, titulo = "Cupo por especie", className = "", onCargarAutorizado } = props;
  const filas = useMemo(() => ordenarCupos(dadas ?? (entrada ? cupoPorEspecie(entrada) : [])), [dadas, entrada]);
  const tot = useMemo(() => totalesCupo(filas), [filas]);
  const fl = useFiltrosTabla(filas, COLUMNAS_CUPO);

  return (
    <section className={`rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 ${className}`} data-cupo-especies>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="flex items-center gap-1">
          <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">{titulo}</CardTitle>
          <InfoTip
            title={titulo}
            what="Lo talado de cada especie contra su cupo: el volumen que autoriza el plan o, si el plan no lo trae, lo que estimó el censo. La columna «Cupo» dice cuál se usó."
            affects="Pasarse de 0,010 m³ ya es exceso (la cinta no mide más fino). Desde el 90 % se marca «cerca»."
            example="Tornillo: 2 de 2 árboles, 9,537 de 6,200 m³ censados → 153,8 %, excedido por 3,337 m³."
          />
        </div>
        {filas.length > 0 && (
          <p className="text-xs text-[var(--text-tertiary)]">
            {tot.especies} especies · {fmtM3(tot.taladoM3)} de {fmtM3(tot.censadoM3)} m³ censados
            {tot.excedidas > 0 && (
              <span className="font-bold text-[var(--data-error-ink)]"> · {tot.excedidas} {tot.excedidas === 1 ? "excedida" : "excedidas"}</span>
            )}
            {tot.cerca > 0 && <span className="font-semibold text-[var(--data-warning-ink)]"> · {tot.cerca} cerca</span>}
          </p>
        )}
      </div>

      {filas.length === 0 ? (
        <p className="py-3 text-sm text-[var(--text-secondary)]">Sin censo ni especies autorizadas en este plan.</p>
      ) : (
        <>
        <BarraFiltrosTabla f={fl} className="mb-2" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b border-[var(--rule-base)] align-top text-[length:var(--ts-2xs)] uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                <th scope="col" className="px-2 py-1.5 text-left font-bold">Especie<FiltroEnCabecera id="especie" f={fl} compacto /></th>
                <th scope="col" className="px-2 py-1.5 text-right font-bold">Árboles<FiltroEnCabecera id="arboles" f={fl} compacto /></th>
                <th scope="col" className="px-2 py-1.5 text-right font-bold">m³ talado / cupo<FiltroEnCabecera id="talado" f={fl} compacto /></th>
                <th scope="col" className="px-2 py-1.5 text-left font-bold">Uso<FiltroEnCabecera id="uso" f={fl} compacto /></th>
                <th scope="col" className="px-2 py-1.5 text-left font-bold">Estado<FiltroEnCabecera id="estado" f={fl} compacto /></th>
              </tr>
            </thead>
            <tbody>
              {fl.filtradas.length === 0 && <SinCoincidenciasFila colSpan={5} />}
              {fl.filtradas.map((f) => (
                <tr
                  key={f.clave}
                  data-veredicto={f.veredicto}
                  className={`border-b border-[var(--rule-soft)] last:border-0 ${f.veredicto === "excedido" ? "bg-[var(--data-error-500)]/6" : ""}`}
                >
                  <th scope="row" className="px-2 py-1.5 text-left font-semibold text-[var(--text-primary)]">{f.especie}</th>
                  <td className={`${NUM} text-[var(--text-secondary)]`}>
                    {f.arbolesTalados} / {f.arbolesCensados}
                    {f.talasSinVolumen > 0 && (
                      <span className="block text-[length:var(--ts-2xs)] text-[var(--data-warning-ink)]">{f.talasSinVolumen} sin volumen</span>
                    )}
                  </td>
                  <td className={NUM}>
                    <span className="text-[var(--text-primary)]">{fmtM3(f.taladoM3)}</span>
                    <span className="text-[var(--text-tertiary)]"> / {f.cupoM3 == null ? "—" : fmtM3(f.cupoM3)}</span>
                    {f.fuente && (
                      <span className="block text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                        {f.fuente === "autorizado" ? "autorizado" : "censado"}
                      </span>
                    )}
                    {onCargarAutorizado && f.fuente !== "autorizado" && (
                      <button
                        type="button"
                        onClick={() => onCargarAutorizado(f.especie)}
                        aria-label={`Cargar lo autorizado de ${f.especie}`}
                        title="El cupo se está midiendo contra el censo. Carga los m³ que autoriza la resolución."
                        className="mt-0.5 inline-flex min-h-8 items-center rounded-md px-1 font-sans text-xs font-semibold text-[var(--accent-ink)] underline decoration-dotted underline-offset-2 hover:decoration-solid focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 dark:text-[var(--accent)]"
                        data-cargar-autorizado={f.clave}
                      >
                        Cargar lo autorizado
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-1.5"><Barra f={f} /></td>
                  <td className={`whitespace-nowrap px-2 py-1.5 text-xs font-semibold ${TONO_CUPO[f.veredicto].texto}`}>{etiqueta(f)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      )}
    </section>
  );
}
