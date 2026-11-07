"use client";

/**
 * «Margen del mes» dentro de Guardadas (Brandon 24-10): el margen de cada
 * camión del mes (el mismo «Margen del camión» del detalle) juntado por
 * comunidad o por comprador. El mes es el de la `fecha` de la cubicación. Un
 * camión sin precio de compra (o de venta) no entra en la suma: la tabla lo
 * cuenta aparte en vez de poner 0. Sólo admin, dueño y superadmin (dice lo
 * que se pagó a la comunidad). Plegable y recordado; plegado deja la cifra.
 */
import { CardTitle, DataTable } from "@buleje/design-system";
import { ChevronDown, ChevronUp, Coins, RefreshCw } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useMiRol } from "@/hooks/use-mi-rol";
import { fmtPct, fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { veElMargen } from "@/lib/forestal/cubicacion-margen";
import { nombreDelMes, type SumaDelMargen } from "@/lib/forestal/cubicacion-margen-mes";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import type { PorFicha } from "@/lib/forestal/cubicacion-por-ficha";
import type { VolumenDeGuia } from "@/lib/forestal/cubicacion-rendimiento-guia";
import { formatNumber } from "@/lib/format";
import { conSigno } from "./cubicador-detalle-ficha";
import { useMargenDelMes } from "./hooks/use-margen-del-mes";
import { PIE_COMO_TABLA } from "./loth-kardex-estilos";
import { CELDAS_FLEX_EN_FILA, HOJA_MOVIL } from "./loth-tablero-estilos";

const OPCIONES: readonly { id: PorFicha; label: string }[] = [
  { id: "comunidad", label: "Por comunidad" },
  { id: "comprador", label: "Por comprador" },
];

/* `hoja-grilla` hereda la alineación en el celular: las cifras se quedan a la derecha. */
const NUM = "text-right max-sm:text-right! font-mono tabular-nums";
/** La 1.ª columna queda fija al desplazar a lo ancho en el celular (opaca: tapa lo que pasa por debajo). */
const FIJA_MOVIL = "max-sm:sticky max-sm:left-0 max-sm:z-[1] max-sm:bg-[var(--surface-raised)] max-sm:text-left!";
/* Texto chico de color: `-ink` (el -700 da 4,13:1 sobre blanco); su valor oscuro vive en `.dark`. */
const GANA = "text-[var(--data-success-ink)]";
const PIERDE = "text-[var(--data-warning-ink)]";
const tonoDe = (n: number) => (n > 0 ? GANA : n < 0 ? PIERDE : "text-[var(--text-primary)]");
const AVISO_LINEA = "rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-3 py-2 text-sm text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/12";

const camionesDe = (s: SumaDelMargen) =>
  s.conMargen === s.camiones ? formatNumber(s.camiones) : `${formatNumber(s.conMargen)} de ${formatNumber(s.camiones)}`;
const fueraDe = (s: SumaDelMargen) =>
  s.fuera.map((f) => `${f.nombre} (sin precio de ${f.falta})`).join(" · ") || undefined;

/** Las cifras de una fila: sólo de los camiones que entran; «—» si no entra ninguno (no 0). */
function Cifras({ s }: { s: SumaDelMargen }) {
  const hay = s.conMargen > 0;
  return (
    <>
      <td className={NUM} title={s.conMargen === s.camiones ? undefined : `Entran ${s.conMargen} de los ${s.camiones} camiones`}>{camionesDe(s)}</td>
      <td className={NUM}>{hay ? fmtPt(s.pt) : "—"}</td>
      <td className={NUM}>{hay ? fmtSoles(s.venta) : "—"}</td>
      <td className={NUM}>{hay ? fmtSoles(s.compra) : "—"}</td>
      <td className={`${NUM} ${hay ? `font-bold ${tonoDe(s.margen)}` : ""}`} title={s.derivados ? `${s.derivados} con un derivado (≈)` : undefined}>
        {hay ? `${s.derivados ? "≈ " : ""}${conSigno(s.margen, fmtSoles)}` : "—"}
      </td>
      <td className={`${NUM} ${hay ? tonoDe(s.margen) : ""}`}>{hay && s.pct !== null ? `${fmtPct(s.pct)} %` : "—"}</td>
      <td className={`${NUM} ${s.sinCompra ? `font-bold ${PIERDE}` : "text-[var(--text-tertiary)]"}`} title={fueraDe(s)}>
        {s.sinCompra ? formatNumber(s.sinCompra) : "—"}
      </td>
    </>
  );
}

function Resumen({ s, mes }: { s: SumaDelMargen; mes: string }) {
  if (s.camiones === 0) return <>En {nombreDelMes(mes)} no hay cubicaciones guardadas.</>;
  return (
    <>
      {nombreDelMes(mes)}:{" "}
      {s.conMargen > 0 ? (
        <span className={`font-mono font-extrabold tabular-nums ${tonoDe(s.margen)}`}>
          {s.derivados ? "≈ " : ""}S/ {conSigno(s.margen, fmtSoles)}{s.pct !== null && ` (${fmtPct(s.pct)} %)`}
        </span>
      ) : (
        <span className="font-semibold text-[var(--text-primary)]">sin margen todavía</span>
      )}{" "}
      de {camionesDe(s)} {s.camiones === 1 ? "camión" : "camiones"}
      {s.sinCompra > 0 && <> · <span className={`font-semibold ${PIERDE}`}>{s.sinCompra} sin precio de compra</span></>}
    </>
  );
}

function MargenDelMesBloque({ lista, guias, cargandoGuias }: Props) {
  const [abierto, setAbierto] = useLocalStorage("cubicador-margen-mes-abierto", true);
  const { lectura, resultado: r, tope, mes, setMes, meses, por, setPor, recargar } = useMargenDelMes(lista, guias, cargandoGuias);
  const quien = por === "comunidad" ? "Comunidad" : "Comprador";

  return (
    <section aria-label="Margen del mes" className="space-y-3 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <CardTitle as="h3" className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <Coins className="h-5 w-5 text-[var(--accent)]" aria-hidden /> Margen del mes
        </CardTitle>
        <InfoTip
          what="Lo que ganaste en el mes: el «Margen del camión» de cada cubicación guardada con fecha de ese mes, sumado por comunidad o por comprador."
          affects="Es un derivado de las cuentas y del precio anotado a mano, no mueve plata. El camión sin precio de compra (o de venta) no entra en la suma: se cuenta aparte. Si el lote tiene su compra registrada, manda ésa sobre el precio a mano. Sale de las 200 cuentas de madera más nuevas."
          example="San Luis: 2 camiones, 3.900 PT, venta S/ 9.750, compra S/ 7.020 → margen +S/ 2.730 (28 %)."
        />
        <button
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
          className={button({ variant: "secondary", size: "md", className: "ml-auto gap-1.5 px-3" })}
        >
          {abierto ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
          {abierto ? "Plegar" : "Ver margen"}
        </button>
      </div>

      {lectura.estado === "cargando" && <p role="status" className="text-sm text-[var(--text-secondary)]">Buscando las compras y las ventas en las cuentas…</p>}
      {lectura.estado === "error" && (
        <p role="alert" className={`flex flex-wrap items-center gap-2 ${AVISO_LINEA}`}>
          {lectura.mensaje} Sin las cuentas no hay margen.
          <button type="button" onClick={recargar} className={button({ variant: "secondary", size: "md", className: "ml-auto gap-1.5 px-3" })}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
          </button>
        </p>
      )}

      {r && !abierto && <p className="text-sm text-[var(--text-secondary)]" data-margen-mes-plegado><Resumen s={r.total} mes={mes} /></p>}

      {r && abierto && (
        <>
          <div className="flex flex-wrap items-center gap-1.5">
            <select
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              aria-label="Mes del margen"
              className="h-10 min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-semibold text-[var(--text-primary)] focus:border-[var(--accent)]"
            >
              {meses.map((m) => <option key={m} value={m}>{nombreDelMes(m)}</option>)}
            </select>
            <div role="group" aria-label="Cómo juntar el margen" className="flex flex-wrap gap-1.5">
              {OPCIONES.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setPor(o.id)}
                  aria-pressed={por === o.id}
                  className={button({ variant: por === o.id ? "accent" : "secondary", size: "md", className: "px-4" })}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={recargar} title="Volver a leer las cuentas" aria-label="Volver a leer las cuentas" className={button({ variant: "secondary", size: "md", className: "ml-auto px-3" })}>
              <RefreshCw className="h-4 w-4" aria-hidden />
            </button>
          </div>

          {tope && (
            <p role="status" className={AVISO_LINEA}>
              Llegaron las 200 cuentas de madera más nuevas y puede haber más viejas: el margen de un camión antiguo puede faltar o salir con otra compra o venta que la de su lote. Revisa su «Ver detalle».
            </p>
          )}
          {lectura.estado === "lista" && lectura.sinBeneficiarios && (
            <p role="status" className={AVISO_LINEA}>No pude leer las personas de Adelantos: las compras atadas a una comunidad sólo por su persona no entran.</p>
          )}
          {cargandoGuias && <p role="status" className="text-sm text-[var(--text-secondary)]">Leyendo las guías para pasar la troza a PT…</p>}

          {r.total.camiones === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--rule-base)] py-6 text-center text-sm text-[var(--text-secondary)]">
              En {nombreDelMes(mes)} no hay cubicaciones guardadas.
            </p>
          ) : (
            <div data-margen-mes>
              {/* En el celular sigue siendo planilla (se desplaza en su caja), no tarjetas de ~320 px por fila. */}
              {/* El borde y el scroll los pone la caja del DataTable (con un borde propio salía doble). */}
              <DataTable className={`w-full min-w-[720px] ${HOJA_MOVIL} ${CELDAS_FLEX_EN_FILA} ${PIE_COMO_TABLA}`} wrapperClassName="max-h-[22rem] overflow-y-auto">
                <caption className="sr-only">Margen de {nombreDelMes(mes)} {por === "comunidad" ? "por comunidad" : "por comprador"}</caption>
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th scope="col" className="text-left max-sm:sticky max-sm:left-0 max-sm:z-[11]">{quien}</th>
                    <th scope="col" className="text-right">Camiones</th>
                    <th scope="col" className="text-right">PT</th>
                    <th scope="col" className="text-right">Venta S/</th>
                    <th scope="col" className="text-right">Compra S/</th>
                    <th scope="col" className="text-right">
                      <span className="inline-flex items-center gap-1">
                        Margen S/
                        <InfoTip
                          what="Venta − compra de los camiones que tienen las dos, con la misma cuenta del «Margen del camión»."
                          affects="«≈» = lleva un derivado: compra de troza pasada a PT con el rendimiento de la GTF, o venta todavía sin cobrar (el precio del cubicador)."
                          example="≈ +1.326,60: un camión con la compra en m³ de troza convertida con el 52 % de su guía."
                        />
                      </span>
                    </th>
                    <th scope="col" className="text-right">%</th>
                    <th scope="col" className="text-right">Sin precio de compra</th>
                  </tr>
                </thead>
                <tbody>
                  {r.filas.map((f) => (
                    <tr key={f.clave} data-fila-margen={f.clave}>
                      <td className={`${FIJA_MOVIL} min-w-0 font-semibold ${f.sin ? "italic text-[var(--text-secondary)]" : "text-[var(--text-primary)]"}`}>{f.etiqueta}</td>
                      <Cifras s={f} />
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold" data-fila-margen="total">
                    <td className={`${FIJA_MOVIL} text-left`}>Total</td>
                    <Cifras s={r.total} />
                  </tr>
                </tfoot>
              </DataTable>
            </div>
          )}

          {(r.total.sinCompra > 0 || r.total.sinVenta > 0) && (
            <p className="text-sm text-[var(--text-secondary)]" title={fueraDe(r.total)}>
              {r.total.sinCompra > 0 && <>{r.total.sinCompra} sin precio de compra no {r.total.sinCompra === 1 ? "entra" : "entran"} en la suma: ábrelos con «Ver detalle» y anota su precio. </>}
              {r.total.sinVenta > 0 && <>{r.total.sinVenta} sin precio de venta {r.total.sinCompra > 0 ? "tampoco" : "no entra en la suma"}: se guardó sin precio y su venta no está valorizada.</>}
            </p>
          )}
          {(r.total.aMano > 0 || r.total.respaldo > 0) && (
            <p className="text-sm text-[var(--text-secondary)]" data-margen-mes-a-mano={r.total.aMano} data-margen-mes-respaldo={r.total.respaldo}>
              {r.total.aMano > 0 && <>{r.total.aMano} con precio de compra a mano. </>}
              {r.total.respaldo > 0 && <>{r.total.respaldo} con precio a mano que no se usa: ya está registrada la compra de su lote y manda ésa.</>}
            </p>
          )}
        </>
      )}
    </section>
  );
}

type Props = {
  /** TODAS las guardadas (no lo filtrado): el mes se elige acá. */
  lista: readonly CubicacionRegistro[];
  guias: ReadonlyMap<string, VolumenDeGuia>;
  cargandoGuias: boolean;
};

/** Sólo admin y dueño (`veElMargen`, la misma lista del servidor): los demás ni piden las cuentas. */
export function MargenDelMes(props: Props) {
  const rol = useMiRol();
  if (!veElMargen(rol)) return null;
  return <MargenDelMesBloque {...props} />;
}
