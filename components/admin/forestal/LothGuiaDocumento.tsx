"use client";

/**
 * (1)(2)(3)(4) de la GTF del despacho del Libro TH: el N° del talonario del
 * titular, las fechas y la autoridad. Sale de `LothGuiaDatos` (16-10-2026) para
 * que la cabecera de plantillas entre sin pasar las 300 líneas.
 *
 * Con la cara del talonario (16-10-2026): sin franja, como en el papel —el
 * (2), el (3) y el (4) van entre la cabecera de la imprenta y «DATOS DEL
 * ORIGEN»—; el estado y «Usar el que sigue» quedan en una línea fina arriba.
 */

import { casilleroGtf2024 } from "@/lib/forestal/ctp-gtf-formato";
import { avisoDeOtroTitular, type TalonarioDelPlan } from "@/lib/forestal/loth-guia-despacho";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import type { DespachoGuiaLoth } from "./hooks/use-despacho-guia-loth";
import { CLASE_FALTA, EstadoBloque } from "./ctp-guia-piezas";
import { Btn, Field, I } from "./ctp-shared";

const vacio = (v: string | null | undefined) => !v?.trim();
const falta = (v: string | null | undefined) => (vacio(v) ? CLASE_FALTA : "");
const AVISO_NUMERO =
  "rounded-lg border border-[var(--data-warning-500)]/50 bg-[var(--data-warning-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-warning-ink)] dark:bg-[var(--data-warning-500)]/10";

/** Qué se sabe del talonario, en una línea para el ⓘ del N°. */
function ayudaDelNumero(t: TalonarioDelPlan | null): string {
  if (!t?.serie) {
    return "El plan de estas trozas no dice su departamento: escribe el N° entero de tu talonario (019-001-0000065). Carga la región en el plan y la serie sale sola.";
  }
  const donde = t.region
    ? ` es la de ${t.region.departamento} (${t.region.codigo}, el ubigeo del departamento${t.region.deducidoDe ? `, que se sacó del ${t.region.deducidoDe} que dice el plan` : ""})`
    : " sale de tu última guía";
  const ultimo = t.propuesta?.ultimo;
  if (ultimo) {
    return `La serie ${t.serie}${donde}. Sigue a la ${ultimo.numero}${ultimo.fecha ? ` del ${etiquetaLarga(ultimo.fecha)}` : ""}, la última de este titular. Confírmalo con el talonario que tienes en la mano.`;
  }
  const fuera = t.fueraDeSerie ? ` Su última guía en el sistema, la ${t.fueraDeSerie.numero}, es de otra serie.` : "";
  return `La serie ${t.serie}${donde}. Es la primera guía de este titular en esa serie: escribe sólo el N° impreso en tu talonario (65 queda ${t.serie}-0000065). Las siguientes se proponen solas.${fuera}`;
}

/** (1)(2)(3)(4): el número del talonario, las fechas y la autoridad. */
export default function LothGuiaDocumento({ g }: { g: DespachoGuiaLoth }) {
  const { datos, setDatos, numero: n, talonario: t } = g;
  const propuesta = t?.propuesta?.gtf ?? null;
  const otraRegion = n.revision?.otraRegion ?? null;
  const faltan = [
    vacio(g.gtfNumber) ? (n.invalido ? "N° de GTF válido" : "N° de GTF") : n.revision?.repetida ? "N° de GTF sin usar" : "",
    vacio(g.emision) ? "Fecha de expedición" : "",
  ].filter(Boolean);
  return (
    <section aria-label="Documento: autoridad, fechas y N°" className="border-b border-[var(--gtf-tinta)]">
      <div className="flex min-h-9 flex-wrap items-center gap-2 px-3 pt-2">
        <EstadoBloque faltan={faltan} />
        {propuesta && propuesta !== g.gtfNumber.trim() && (
          <Btn size="sm" variant="ghost" className="ml-auto" onClick={() => g.setGtfNumber(propuesta)}>
            Usar el que sigue: <b className="font-mono tabular-nums">{propuesta}</b>
          </Btn>
        )}
      </div>
      <div className="grid grid-cols-1 gap-x-3 gap-y-2.5 px-3 pb-3 pt-1 sm:grid-cols-12 sm:[&_label]:min-h-6">
      <Field span={12} label="Autoridad Regional Forestal y de Fauna Silvestre (ARFFS)" casillero={casilleroGtf2024("2")} hint="La ARFFS competente. Sale del plan de manejo de las trozas.">
        <input
          type="text"
          className={`${I} ${falta(datos.guia.autoridad)}`}
          value={datos.guia.autoridad}
          onChange={(e) => setDatos((p) => ({ ...p, guia: { ...p.guia, autoridad: e.target.value } }))}
          placeholder="ATFFS Selva Central"
        />
      </Field>
      <Field span={4} label="Fecha de Expedición" casillero={casilleroGtf2024("3")} required>
        <input type="date" className={`${I} ${falta(g.emision)}`} value={g.emision} onChange={(e) => g.setEmision(e.target.value)} />
      </Field>
      <Field span={4} label="Fecha de Vencimiento" casillero={casilleroGtf2024("4")} hint="La fija la ARFFS por ruta y distancia. Se propone la de siempre y se corrige acá.">
        <input
          type="date"
          className={I}
          value={datos.traslado.fechaFin}
          onChange={(e) => setDatos((p) => ({ ...p, traslado: { ...p.traslado, fechaFin: e.target.value } }))}
        />
      </Field>
      <Field span={4} label="N° de GTF" casillero={casilleroGtf2024("numeroGtf")} required hint={ayudaDelNumero(t)}>
        <div className="grid gap-1">
          {n.libre ? (
            <input
              type="text"
              aria-label="N° de GTF, entero"
              className={`${I} font-mono tabular-nums ${falta(g.gtfNumber)}`}
              value={n.texto}
              onChange={(e) => n.escribir(e.target.value)}
              placeholder={n.serie ? `${n.serie}-0000001` : "019-001-0000001"}
            />
          ) : (
            <div
              className={`flex h-11 items-stretch overflow-hidden rounded-xl border-[1.5px] border-[var(--gtf-linea)] bg-[var(--surface-raised)] focus-within:border-[var(--gtf-tinta)] focus-within:ring-2 focus-within:ring-[var(--gtf-franja)] ${falta(g.gtfNumber)}`}
            >
              <span
                title={t?.region ? `Serie de ${t.region.departamento} (${t.region.codigo})` : undefined}
                className="flex items-center border-r border-[var(--gtf-linea)] bg-[var(--gtf-franja)] px-2.5 font-mono text-sm font-bold tabular-nums text-[var(--gtf-tinta)]"
              >
                {n.serie}-
              </span>
              <input
                type="text"
                inputMode="numeric"
                aria-label={`N° de GTF: correlativo del talonario, serie ${n.serie}`}
                className="min-w-0 flex-1 bg-transparent px-2.5 font-mono text-sm tabular-nums text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                value={n.texto}
                onChange={(e) => n.escribir(e.target.value)}
                placeholder="N° impreso"
              />
            </div>
          )}
          <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-secondary)]">
            {!n.libre && g.gtfNumber && (
              <span>
                Sale <b className="font-mono tabular-nums text-[var(--text-primary)]">{g.gtfNumber}</b>
              </span>
            )}
            {n.invalido && <span className="font-semibold text-[var(--data-warning-ink)]">Escribe sólo el N° impreso (65)</span>}
            {n.serie && (
              <Btn size="sm" variant="ghost" className="ml-auto h-7 px-1.5 text-xs" onClick={() => n.cambiarSerie(!n.libre)}>
                {n.libre ? `Usar la serie ${n.serie}` : "Otra serie"}
              </Btn>
            )}
          </div>
          {otraRegion && t?.region && (
            <p role="status" className={AVISO_NUMERO}>
              Es de {otraRegion.departamento ?? "otra región"} ({otraRegion.codigo}) y el plan está en {t.region.departamento} ({t.region.codigo}). Al registrar se te pide confirmarlo.
            </p>
          )}
          {n.revision?.repetida && (
            <p role="alert" className="rounded-lg border border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
              Ya usaste este N° en la guía {n.revision.repetida.numero}
              {n.revision.repetida.fuente === "despacho_anulado" ? " (anulada)" : ""}: un N° del talonario va una sola vez.
            </p>
          )}
          {!n.revision?.repetida && n.revision?.deOtroTitular && (
            <p role="status" className={AVISO_NUMERO}>
              {avisoDeOtroTitular(n.revision.deOtroTitular)}
            </p>
          )}
          {!n.revision?.repetida && n.revision?.deSerfor && (
            <p role="status" className="text-xs text-[var(--text-secondary)]">
              Ese N° ya figura como guía de SERFOR de este titular ({n.revision.deSerfor.fuente === "ingreso" ? "ingresada al Libro CTP" : "guardada"}): si es esa misma guía, adelante.
            </p>
          )}
        </div>
      </Field>
      </div>
    </section>
  );
}
