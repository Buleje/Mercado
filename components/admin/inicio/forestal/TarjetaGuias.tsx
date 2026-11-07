"use client";

import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { fmtMonedas } from "@/components/admin/adelantos/shared";
import { valorConDato } from "@/lib/admin/inicio/hay-datos";
import { formatNumber } from "@/lib/format";
import type { InicioForestal } from "@/lib/forestal/inicio-forestal";
import { DatosEnLinea, TarjetaTablero } from "../resumen/TarjetaTablero";
import { guiasVigentes } from "../use-forestal-inicio";
import { CTP, LOTH, plural, PuntoLeyenda, TINTA } from "./comun";

/* Completa = turquesa (como lo producido), le falta algo = coral de aviso,
   anulada = la regla: no es madera que se movió. */
const COMPLETA = TINTA.producto;
const INCOMPLETA = "var(--data-warning-500)";
const ANULADA = "var(--rule-strong)";

/**
 * Las guías del período (2026-10-31): cuántas salieron, cuántas están
 * completas y qué falta revisar. Las del CTP vienen de `resumirGuias` (la
 * pantalla «Guías emitidas»); las del Libro TH, de sus GTF. Sin ninguna guía
 * vigente ni anulada, la tarjeta no se dibuja.
 */
export function TarjetaGuias({ data }: { data: Pick<InicioForestal, "ctp" | "loth"> }) {
  const g = guiasVigentes(data);
  const vigentes = g.ctp + g.th;
  if (vigentes === 0 && g.anuladas === 0) return null;
  const c = data.ctp?.guias;
  const completas = c?.completas ?? 0;
  const incompletas = c?.incompletas ?? 0;
  const anuladasCtp = c?.anuladas ?? 0;
  const conDetalle = c?.completas != null && completas + incompletas + anuladasCtp > 0;
  const sinVerificar = c?.sinVerificar ?? 0;
  const sinOrigen = c?.sinOrigen ?? 0;

  return (
    <TarjetaTablero
      id="forestal-guias"
      titulo="Guías del período"
      ayuda="Guías vigentes del período: las de salida del CTP (pantalla «Guías emitidas») y las GTF del Libro TH. Completa = tiene todo lo que pide SERFOR; las anuladas no suman. «Sin verificar» y «sin origen» son las mismas marcas de esa pantalla."
      cifra={formatNumber(vigentes)}
      datos={
        <DatosEnLinea
          datos={[
            { label: "CTP", valor: data.ctp ? formatNumber(g.ctp) : null },
            { label: "Libro TH", valor: data.loth ? formatNumber(g.th) : null },
            { label: "Anuladas", valor: g.anuladas > 0 ? formatNumber(g.anuladas) : null },
          ]}
        />
      }
      pie={
        <span className="flex flex-wrap gap-x-4">
          {data.ctp && (
            <EnlacePanel href={`${CTP}&vista=despacho&sub=guias`} className="inline-flex min-h-11 items-center">
              Ver guías emitidas
            </EnlacePanel>
          )}
          {data.loth && (
            <EnlacePanel href={`${LOTH}&vista=gtf`} className="inline-flex min-h-11 items-center">
              Ver GTF del Libro TH
            </EnlacePanel>
          )}
        </span>
      }
    >
      {conDetalle && (
        <div className="space-y-1.5">
          {/* La barra es sólo del CTP (el Libro TH no marca completas): con los dos
              libros, «Anuladas» de arriba suma ambos y la de abajo no. */}
          {data.loth && <p className="text-xs font-semibold text-[var(--text-tertiary)]">Las del CTP</p>}
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-[var(--radius-xs)]" aria-hidden>
            {completas > 0 && <span style={{ flexGrow: completas, background: COMPLETA }} />}
            {incompletas > 0 && <span style={{ flexGrow: incompletas, background: INCOMPLETA }} />}
            {anuladasCtp > 0 && <span style={{ flexGrow: anuladasCtp, background: ANULADA }} />}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <PuntoLeyenda color={COMPLETA} texto="Completas" detalle={formatNumber(completas)} />
            {incompletas > 0 && <PuntoLeyenda color={INCOMPLETA} texto="Les falta algo" detalle={formatNumber(incompletas)} />}
            {anuladasCtp > 0 && <PuntoLeyenda color={ANULADA} texto="Anuladas" detalle={formatNumber(anuladasCtp)} />}
          </ul>
        </div>
      )}
      {(sinVerificar > 0 || sinOrigen > 0) && (
        <ul className="mt-2 space-y-0.5 text-sm font-semibold text-[var(--data-warning-ink)]">
          {sinVerificar > 0 && <li>{plural(sinVerificar, "guía sin verificar", "guías sin verificar")}</li>}
          {sinOrigen > 0 && <li>{plural(sinOrigen, "guía con madera sin origen", "guías con madera sin origen")}</li>}
        </ul>
      )}
    </TarjetaTablero>
  );
}

/**
 * Lo que te deben hoy por adelantos (saldo del módulo Adelantos), cada moneda
 * por su lado (ADR-118: nunca se suman entre monedas). Es foto de hoy.
 */
export function TarjetaAdelantos({ adelantos }: { adelantos: InicioForestal["adelantos"] }) {
  const conSaldo = (adelantos ?? []).filter((a) => valorConDato(a.saldoPendiente));
  if (conSaldo.length === 0) return null;
  const abiertos = conSaldo.reduce((a, x) => a + x.abiertos, 0);
  return (
    <TarjetaTablero
      id="forestal-adelantos"
      titulo="Adelantos por cobrar"
      ayuda="El saldo de hoy del módulo Adelantos: lo que te falta cobrar de los adelantos abiertos, cada moneda por su lado. No depende del período."
      cifra={fmtMonedas(Object.fromEntries(conSaldo.map((a) => [a.moneda, a.saldoPendiente])))}
      pie={
        <EnlacePanel href="/admin?tab=adelantos" className="inline-flex min-h-11 items-center">
          Ver adelantos
        </EnlacePanel>
      }
    >
      <DatosEnLinea datos={[{ label: "Abiertos", valor: formatNumber(abiertos) }]} />
    </TarjetaTablero>
  );
}
