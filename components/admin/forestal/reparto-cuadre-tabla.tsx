"use client";

/**
 * Un control del cuadre, con su tabla esperado | obtenido | diferencia | estado.
 *
 * Una sola fila de cabecera con `data-label` en cada `<th>`: a 400 px el shell
 * del admin vuelve la tabla tarjetas solo (`useMobileTableCards`), y dos filas
 * de cabecera le rompían los rótulos (memoria `tabla-con-grupos-de-columnas`).
 * Lo que difiere va primero (ya viene ordenado de `reparto-cuadre.ts`).
 */

import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { ControlCuadre, FilaCuadre, Trio } from "@/lib/forestal/reparto-cuadre";
import EtiquetaCuadre, { ESTADO_CUADRE, IconoEstado, conSigno, fmtTrio } from "./reparto-cuadre-etiqueta";

const TH = "px-1.5 py-1.5 align-bottom text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const TD = "px-1.5 py-1.5 text-right font-mono text-sm tabular-nums";
const GRUPO = "border-l-2 border-[var(--rule-base)]";
const UNIDADES = [["piezas", "Pzas"], ["pt", "PT"], ["m3", "m³"]] as const;

/** Cabecera numérica: el nombre del grupo se derrama desde la primera columna, sin ensancharla. */
function Th({ grupo, label, primera }: { grupo: string; label: string; primera?: boolean }) {
  return (
    <th scope="col" data-label={`${grupo} · ${label}`} className={`${TH} text-right ${primera ? GRUPO : ""}`}>
      {primera
        ? <span className="block w-0 whitespace-nowrap text-left text-[var(--text-secondary)]">{grupo}</span>
        : <><span className="block" aria-hidden>&nbsp;</span><span className="sr-only">{grupo} · </span></>}
      {label}
    </th>
  );
}

function Celdas({ t, omitir, dif, estado }: { t: Trio; omitir?: readonly string[]; dif?: boolean; estado?: FilaCuadre["estado"] }) {
  return (
    <>
      {UNIDADES.map(([k], i) => {
        const v = t[k];
        const dec = k === "piezas" ? 0 : k === "pt" ? 2 : 3;
        const txt = omitir?.includes(k) ? "—" : dif ? conSigno(v, dec) : fmtTrio[k](v);
        const tono = !dif || txt === "0" || txt === "—"
          ? (txt === "0" || txt === "—" ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]")
          : estado === "difiere"
            ? "font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
            : "text-[var(--text-secondary)]";
        return <td key={k} className={`${TD} ${i === 0 ? GRUPO : ""} ${tono}`}>{txt}</td>;
      })}
    </>
  );
}

function Estado({ f }: { f: Pick<FilaCuadre, "estado" | "relacion" | "aviso"> }) {
  const e = ESTADO_CUADRE[f.estado];
  const label = f.aviso
    ? "Mirar"
    : f.relacion === "tope"
      ? (f.estado === "exacto" ? "Cabe" : f.estado === "difiere" ? "Se pasa" : "Redondeo")
      : f.estado === "exacto" ? "Exacto" : e.label;
  const clase = f.aviso ? "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]" : e.clase;
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-0.5 text-xs font-bold ${clase}`}>
      <IconoEstado estado={f.aviso ? "redondeo" : f.estado} />
      {label}
    </span>
  );
}

export default function TablaControl({ control, soloDiferencias }: { control: ControlCuadre; soloDiferencias: boolean }) {
  const filas = soloDiferencias ? control.filas.filter((f) => f.estado !== "exacto" || f.aviso) : control.filas;
  const ocultas = control.filas.length - filas.length;
  const conComo = control.filas.some((f) => f.comoCuadrar);
  return (
    <section id={`cuadre-${control.id}`} className="scroll-mt-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <CardTitle as="h4" className="text-sm font-bold text-[var(--text-primary)]">{control.titulo}</CardTitle>
        <EtiquetaCuadre control={control} />
        <InfoTip
          title={control.titulo}
          what={control.regla}
          affects={<span>Exacto = hasta 0,01 PT y 0,001 m³. Redondeo = el arrastre de redondear cada fila (hasta 0,5 PT y 0,01 m³). Una pieza de diferencia es siempre «Difiere».</span>}
          example={<span>Diferencia = {control.ladoObtenido.toLowerCase()} − {control.ladoEsperado.toLowerCase()}.</span>}
        />
      </div>
      <p className="mb-2 text-sm text-[var(--text-secondary)]">{control.comoCuadrar}</p>
      {/* Una lista vacía sin total (especies sin pareja) ya lo dijo arriba: sin tabla. */}
      {!(control.sinTotal && control.filas.length === 0) && <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label={control.titulo}>
          <thead>
            <tr className="border-b border-[var(--rule-base)]">
              <th scope="col" data-label="Dónde" className={`${TH} text-left`}>Dónde</th>
              {UNIDADES.map(([k, l], i) => <Th key={`e${k}`} grupo={control.ladoEsperado} label={l} primera={i === 0} />)}
              {UNIDADES.map(([k, l], i) => <Th key={`o${k}`} grupo={control.ladoObtenido} label={l} primera={i === 0} />)}
              {UNIDADES.map(([k, l], i) => <Th key={`d${k}`} grupo="Diferencia" label={l} primera={i === 0} />)}
              <th scope="col" data-label="Estado" className={`${TH} ${GRUPO} text-left`}>Estado</th>
              {conComo && <th scope="col" data-label="Cómo cuadrarlo" className={`${TH} text-left`}>Cómo cuadrarlo</th>}
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave} className={`border-b border-[var(--rule-soft)] align-top ${f.estado === "difiere" ? "bg-[var(--data-error-500)]/6" : ""}`}>
                <td className="px-1.5 py-1.5 text-left">
                  <span className="block font-bold text-[var(--text-primary)]">{f.rotulo}</span>
                  {f.nota && <span className="block text-xs text-[var(--text-tertiary)]">{f.nota}</span>}
                </td>
                <Celdas t={f.esperado} omitir={f.omitir} />
                <Celdas t={f.obtenido} />
                <Celdas t={f.diferencia} omitir={f.omitir} dif estado={f.estado} />
                <td className={`px-1.5 py-1.5 text-left ${GRUPO}`}><Estado f={f} /></td>
                {conComo && (
                  <td className="px-1.5 py-1.5 text-left text-sm text-[var(--text-secondary)]" style={{ minWidth: "16rem" }}>
                    {f.comoCuadrar ?? ""}
                  </td>
                )}
              </tr>
            ))}
            {filas.length === 0 && ocultas > 0 && (
              <tr>
                <td colSpan={conComo ? 12 : 11} className="px-1.5 py-2 text-left text-sm text-[var(--text-tertiary)]">
                  {ocultas === 1 ? "La única fila cuadra." : `Las ${ocultas} filas cuadran.`}
                </td>
              </tr>
            )}
          </tbody>
          {!control.sinTotal && (
            <tfoot>
              <tr className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] font-bold">
                <td className="px-1.5 py-1.5 text-left text-[var(--text-primary)]">
                  Total
                  {ocultas > 0 && filas.length > 0 && <span className="block text-xs font-normal text-[var(--text-tertiary)]">{ocultas} filas exactas ocultas</span>}
                </td>
                <Celdas t={control.esperado} omitir={control.omitir} />
                <Celdas t={control.obtenido} />
                <Celdas t={control.diferencia} omitir={control.omitir} dif estado={control.estadoTotal} />
                <td className={`px-1.5 py-1.5 text-left ${GRUPO}`}>
                  {control.relacion === "tope" ? null : <Estado f={{ estado: control.estadoTotal, relacion: "igual" }} />}
                </td>
                {conComo && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>}
    </section>
  );
}
