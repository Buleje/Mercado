"use client";

/**
 * «Cuánto salió de cada comunidad / de cada comprador» dentro de Guardadas
 * (Brandon 24-10). Una tabla por comunidad (CCNN de origen) o por comprador con
 * lo que se congeló al guardar; tocar una fila deja la lista de tarjetas sólo
 * con esa comunidad/comprador. El resumen es de lo que se ve (buscador y
 * especie ya aplicados); plegable y recordado como los indicadores del panel.
 */
import { CardTitle, DataTable } from "@buleje/design-system";
import { BarChart3, ChevronDown, ChevronUp, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { fmtM3, fmtPct, fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import type { RendimientoDeFicha } from "@/lib/forestal/cubicacion-guia-resumen";
import { totalDeFilas, type FilaPorFicha, type PorFicha } from "@/lib/forestal/cubicacion-por-ficha";
import { formatNumber } from "@/lib/format";

const OPCIONES: readonly { id: PorFicha; label: string; plural: string }[] = [
  { id: "comunidad", label: "Por comunidad", plural: "comunidades" },
  { id: "comprador", label: "Por comprador", plural: "compradores" },
];

const NUM = "text-right font-mono tabular-nums";
const TXT_OK = "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]";
const TXT_AVISO = "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";

/** La celda «Rinde» de una comunidad: % con el color contra la meta, «—» si no hay guía de troza leída. */
function CeldaRinde({ r, cargando }: { r: RendimientoDeFicha | undefined; cargando: boolean }) {
  if (!r || r.pct === null) return <td className={NUM} title={cargando ? "Leyendo las guías…" : "Sin guardadas con GTF de troza"}>{cargando ? "…" : "—"}</td>;
  const tono = r.veredicto === "bueno" ? TXT_OK : TXT_AVISO;
  return (
    <td
      className={`${NUM} font-bold ${tono}`}
      title={`${fmtM3(r.m3Aserrado)} m³ aserrados de ${fmtM3(r.m3Troza)} m³ de troza (${r.guias} ${r.guias === 1 ? "guía" : "guías"})`}
    >
      {fmtPct(r.pct)} %
    </td>
  );
}

export function ResumenPorFicha({ por, onPor, filas, elegida, onElegir, rinde, cargandoRinde = false }: {
  por: PorFicha;
  onPor: (p: PorFicha) => void;
  filas: FilaPorFicha[];
  /** La clave de la fila que filtra la lista (o null). */
  elegida: string | null;
  onElegir: (clave: string | null) => void;
  /** Rendimiento por clave de fila (sólo «Por comunidad»); `null` = sin columna. */
  rinde?: ReadonlyMap<string, RendimientoDeFicha> | null;
  cargandoRinde?: boolean;
}) {
  const [abierto, setAbierto] = useLocalStorage("cubicador-guardadas-resumen-abierto", true);
  const total = totalDeFilas(filas);
  const conValor = total.valor > 0;
  const opcion = OPCIONES.find((o) => o.id === por) ?? OPCIONES[0];
  const filaElegida = filas.find((f) => f.clave === elegida);
  const conDato = filas.filter((f) => !f.sin).length;

  return (
    <section aria-label="Resumen de lo guardado" className="space-y-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <BarChart3 className="h-5 w-5 text-[var(--accent)]" aria-hidden /> Cuánto salió de cada {por === "comunidad" ? "comunidad" : "comprador"}
        </CardTitle>
        <InfoTip
          what="Las cubicaciones que se ven, juntadas por la comunidad de origen o por el comprador de su ficha, con lo que se guardó de cada una."
          affects="Tocar una fila deja abajo sólo esas cubicaciones. Las que se guardaron antes de tener ficha van en «Sin …». El m³ sale del PT total ÷ 424."
          example="«Comunidad Nativa San Luis»: 4 cubicaciones, 6 200 PT, 14,6 m³ y S/ 18 600."
        />
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className={button({ variant: "secondary", size: "md", className: "ml-auto gap-1.5 px-3" })}
        >
          {abierto ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
          {abierto ? "Plegar" : "Ver resumen"}
        </button>
      </div>

      {!abierto ? (
        <p className="text-sm text-[var(--text-secondary)]">
          {conDato} {opcion.plural}
          <span className="font-mono font-extrabold tabular-nums text-[var(--text-primary)]">
            {" "}· {fmtPt(total.pieTablar)} PT · {fmtM3(total.m3)} m³{conValor && <> · S/ {fmtSoles(total.valor)}</>}
          </span>
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <div role="group" aria-label="Cómo juntar las cubicaciones" className="flex flex-wrap gap-1.5">
              {OPCIONES.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => onPor(o.id)}
                  aria-pressed={por === o.id}
                  className={button({ variant: por === o.id ? "accent" : "secondary", size: "md", className: "px-4" })}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {filaElegida && (
              <button
                type="button"
                onClick={() => onElegir(null)}
                className={button({ variant: "secondary", size: "md", className: "max-w-full gap-1.5 px-3" })}
                aria-label={`Quitar el filtro ${filaElegida.etiqueta}`}
              >
                <span className="truncate">{filaElegida.etiqueta}</span> <X className="h-4 w-4 shrink-0" aria-hidden />
              </button>
            )}
          </div>

          <div className="max-h-[22rem] overflow-auto rounded-xl border border-[var(--rule-base)]">
            <DataTable className="w-full min-w-[600px]">
              <caption className="sr-only">Lo guardado {opcion.label.toLowerCase()}</caption>
              <thead className="sticky top-0 z-10">
                <tr>
                  <th scope="col" className="text-left">{por === "comunidad" ? "Comunidad" : "Comprador"}</th>
                  <th scope="col" className="text-right">Cub.</th>
                  <th scope="col" className="text-right">Piezas</th>
                  <th scope="col" className="text-right">PT</th>
                  <th scope="col" className="text-right">m³</th>
                  <th scope="col" className="text-right">S/</th>
                  {rinde && (
                    <th scope="col" className="text-right">
                      <span className="inline-flex items-center gap-1">
                        Rinde
                        <InfoTip
                          what="Cuánto rindió la comunidad: m³ aserrado (PT ÷ 424, sólo de las especies que trae cada guía) ÷ m³ de troza de sus guías GTF. Cada guía cuenta una vez."
                          affects="Verde si llega a la meta de 56 %. «—» si ninguna guardada de la comunidad tiene GTF de troza. Es un derivado, no la corrida real (esa se declara en Producción)."
                          example="2 guardadas de la guía 001-0000120 (2,761 m³ de troza) con 1 100 PT (2,594 m³) rinden 94 %."
                        />
                      </span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filas.map((f) => {
                  const activa = f.clave === elegida;
                  return (
                    <tr key={f.clave} className={activa ? "bg-primary/10" : undefined}>
                      <td className="min-w-0">
                        <button
                          type="button"
                          onClick={() => onElegir(activa ? null : f.clave)}
                          aria-pressed={activa}
                          title={activa ? "Quitar el filtro" : "Ver sólo estas cubicaciones"}
                          className={`min-h-10 w-full text-left font-semibold hover:underline ${f.sin ? "italic text-[var(--text-secondary)]" : "text-[var(--text-primary)]"}`}
                        >
                          {f.etiqueta}
                        </button>
                      </td>
                      <td className={NUM}>{formatNumber(f.cubicaciones)}</td>
                      <td className={NUM}>{formatNumber(f.piezas)}</td>
                      <td className={NUM}>{fmtPt(f.pieTablar)}</td>
                      <td className={NUM}>{fmtM3(f.m3)}</td>
                      <td className={NUM}>{f.valor > 0 ? fmtSoles(f.valor) : "—"}</td>
                      {rinde && <CeldaRinde r={rinde.get(f.clave)} cargando={cargandoRinde} />}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td>Total</td>
                  <td className={NUM}>{formatNumber(total.cubicaciones)}</td>
                  <td className={NUM}>{formatNumber(total.piezas)}</td>
                  <td className={NUM}>{fmtPt(total.pieTablar)}</td>
                  <td className={NUM}>{fmtM3(total.m3)}</td>
                  <td className={NUM}>{conValor ? fmtSoles(total.valor) : "—"}</td>
                  {rinde && <td />}
                </tr>
              </tfoot>
            </DataTable>
          </div>
        </>
      )}
    </section>
  );
}
