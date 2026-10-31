"use client";

/**
 * AnalisisView — Análisis del módulo Adelantos (ADR-121).
 *
 * 25-10 («Análisis que sí dice algo»): todo llega YA SUMADO del servidor
 * (`GET /api/adelantos/analisis`, cálculo puro en `lib/adelantos/analisis.ts`);
 * la pantalla no suma plata. Los gráficos de antes no decían nada: barras de
 * atraso sin su monto, una curva suavizada que inventaba una «montaña» entre
 * dos meses, un «Top 5» con el nombre cortado y sin montos, y una dona que
 * contaba adelantos (no plata) aun con una sola modalidad. Ahora:
 *  • Atraso con el monto encima de cada barra (misma regla que Cobranza).
 *  • «Cuánto de lo que diste ya volvió», por persona: % recuperado, nombre
 *    completo, lo que te debe y su parte del total (reemplaza al Top 5: quién
 *    debe más va primero).
 *  • «Quién tarda más en devolver»: días promedio por persona.
 *  • «Diste vs Te devolvieron» por mes, en barras con su cifra.
 *  • La modalidad sólo si hay más de una, en plata.
 *  • «Lo que recibiste» (ADR-448) sigue aparte, en la misma moneda elegida.
 * Cada moneda va aparte (toggle si hay más de una; nunca se suman S/ y US$).
 */

import { useState } from "react";
import { SectionTitle, ErrorAlert } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import ActionMenu from "@/components/admin/shared/action-menu";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import TarjetaIndicador from "@/components/admin/por-cobrar/TarjetaIndicador";
import { BarChart3, TrendingDown, TrendingUp, Coins, Clock, FileText, Gauge, MoreHorizontal, PartyPopper, Timer, Layers, ArrowDownToLine } from "@buleje/design-system/icons";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import { button } from "@/components/ui-system/button-variants";
import { fmtMon, EmptyState, SkeletonGrid } from "./shared";
import { useAnalisisAdelantos } from "./analisis/use-analisis";
import { Tarjeta, Muestra } from "./analisis/Tarjeta";
import { AtrasoBarras } from "./analisis/Atraso";
import { PorMes, COLOR_DISTE, COLOR_VOLVIO } from "./analisis/PorMes";
import { VolvioPorPersona, TardaPorPersona } from "./analisis/PorPersona";
import { PorModalidad, LoQueRecibiste } from "./analisis/ModalidadYRecibido";

const ICONO = "h-5 w-5 shrink-0";
const monedaLabel = (c: string) => (c === "USD" ? "US$ Dólares" : c === "PEN" ? "S/ Soles" : c);

/** CSV de los movimientos (todas las monedas, con su columna): es un listado, no un total. */
function exportarCsv(adelantos: DbAdelanto[]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows: (string | number)[][] = [["Fecha", "Tipo", "Persona", "Modalidad", "Detalle", "Monto", "Moneda"]];
  for (const a of adelantos) {
    const persona = a.beneficiario?.nombre ?? "—";
    // 2026-05-26 (P2-3): fallback PEN si una fila antigua tiene moneda null.
    const mon = a.moneda || "PEN";
    if (a.status !== "CANCELADO") rows.push([a.fechaAdelanto.slice(0, 10), "Adelanto", persona, a.modalidad === "CUENTA_CORRIENTE" ? "Cuenta corriente" : "Entregas pactadas", a.notas ?? "", a.montoAdelantado.toFixed(2), mon]);
    for (const e of a.entregas) rows.push([e.fecha.slice(0, 10), "Entrega", persona, "", e.descripcion ?? "", (-e.valor).toFixed(2), mon]);
  }
  const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = `adelantos-movimientos-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click(); URL.revokeObjectURL(url);
}

export function AnalisisView({
  adelantos,
  loading,
}: {
  /** Sólo lo DADO. Para el CSV y para saber cuándo recargar: los totales vienen del servidor. */
  adelantos: DbAdelanto[];
  /** Lo RECIBIDO (ADR-448): el servidor ya lo trae aparte; se acepta para no cambiar al módulo. */
  recibidos?: DbAdelanto[];
  loading: boolean;
}) {
  const { datos, cargando, error, reintentar } = useAnalisisAdelantos(adelantos, !loading);
  const monedas = datos?.monedas ?? [];
  /* Sin elegir = la de mayor volumen (el servidor las manda ordenadas). */
  const [moneda, setMoneda] = useState<string | null>(null);
  const cur = moneda && monedas.includes(moneda) ? moneda : (monedas[0] ?? "PEN");
  const a = datos?.porMoneda[cur] ?? null;

  /* Indicadores plegables (patrón del panel, 11-10): plegados dicen lo propio
     del análisis: el % recuperado y en cuántos días vuelve la plata. */
  const kpis = useKpisPlegables({
    claveMemoria: "adelantos-analisis",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: loading || !a,
    resumen: `${a?.kpi.pct ?? 0}% recuperado`,
    tarjetas: a ? [
      <TarjetaIndicador key="pct" rotulo="% recuperado" valor={`${a.kpi.pct}%`} detalle={a.kpi.diasParaVolver !== null ? `vuelve en ~${a.kpi.diasParaVolver} días en promedio` : "Sin liquidaciones"} icono={Gauge} tono="destacado" />,
      <TarjetaIndicador key="adelantado" rotulo="Diste" valor={fmtMon(a.kpi.adelantado, cur)} detalle="Plata que adelantaste" icono={TrendingDown} />,
      <TarjetaIndicador key="liquidado" rotulo="Te devolvieron" valor={fmtMon(a.kpi.liquidado, cur)} detalle="Recuperado" icono={TrendingUp} />,
      <TarjetaIndicador key="pendiente" rotulo="Te deben" valor={fmtMon(a.kpi.pendiente, cur)} detalle={`${a.kpi.deudores} persona${a.kpi.deudores === 1 ? "" : "s"} con saldo abierto`} icono={Coins} />,
    ] : [],
  });

  if (loading || (cargando && !datos)) return <SkeletonGrid />;
  if (error && !datos) {
    return (
      <ErrorAlert
        title="No se pudo armar el análisis"
        description="Revisa tu conexión y vuelve a intentar."
        action={<button type="button" onClick={reintentar} className={button({ variant: "secondary" })}>Reintentar</button>}
      />
    );
  }
  if (!a) return <EmptyState icon={BarChart3} title="Sin datos" hint="Los gráficos aparecen cuando registres adelantos." />;

  const hayAtraso = a.atraso.some((t) => t.monto > 0);
  const hayMov = a.meses.some((m) => m.diste > 0 || m.devolvieron > 0);

  return (
    <div className="@container space-y-5">
      {/* Título · moneda · Indicadores · «⋯» en UNA fila (patrón del panel). */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Análisis</SectionTitle>
          <InfoTip
            title="Análisis de adelantos"
            what="Cómo vuelve la plata que adelantas: cuánto te deben y con cuánto atraso, cuánto te devolvió cada persona, quién tarda más y lo que diste contra lo que volvió, mes a mes."
            affects={monedas.length > 1 ? `Mostrando ${monedaLabel(cur)}: cada moneda va aparte.` : "Sólo lo que diste; lo que te dieron está en «Lo que recibiste», al pie. Los adelantos anulados no cuentan."}
            example="Si el % recuperado baja mes a mes, estás adelantando más rápido de lo que vuelve."
          />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {monedas.length > 1 && (
            <div className="inline-flex overflow-hidden rounded-xl border border-[var(--rule-base)]" role="group" aria-label="Moneda">
              {monedas.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setMoneda(c)}
                  aria-pressed={cur === c}
                  className={`h-12 px-4 text-sm font-semibold transition-colors ${cur === c ? "bg-primary text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"}`}
                >
                  {c === "USD" ? "US$" : "S/"}
                </button>
              ))}
            </div>
          )}
          {kpis.boton}
          <ActionMenu
            label="Más"
            icon={MoreHorizontal}
            soloIcono
            size="md"
            className="w-12 shrink-0"
            actions={[{ id: "csv", label: "Exportar CSV", hint: "Cada adelanto y cada devolución", icon: FileText, onSelect: () => exportarCsv(adelantos) }]}
          />
        </div>
      </div>

      {kpis.panel}

      {datos?.truncado && <p className="text-sm text-[var(--text-secondary)]">Se cuentan los 500 adelantos más recientes.</p>}

      {a.hayDado ? (
        <>
          <Tarjeta
            titulo="Atraso de lo que te deben"
            icono={<Clock className={`${ICONO} text-[var(--data-warning)]`} aria-hidden />}
            que="Lo que te deben hoy, por cuántos días lleva atrasado. Se mide igual que en Cobranza: contra la fecha que se pactó; si no hay fecha, desde que se dio."
            ejemplo="«61 a 90 días · S/ 19,442.00 · 2 personas»: a esas dos hay que cobrarles primero."
          >
            {hayAtraso ? (
              <AtrasoBarras atraso={a.atraso} moneda={cur} />
            ) : (
              <p className="flex items-center justify-center gap-1.5 py-8 text-center text-base text-[var(--text-tertiary)]">
                <PartyPopper className="h-5 w-5 shrink-0 text-[var(--data-success-500)]" aria-hidden /> Nadie te debe nada en {monedaLabel(cur)}.
              </p>
            )}
          </Tarjeta>

          <div className="grid gap-5 @4xl:grid-cols-2">
            <Tarjeta
              titulo="Cuánto de lo que diste ya volvió"
              icono={<Gauge className={`${ICONO} text-[var(--data-success-500)]`} aria-hidden />}
              que="Por persona: qué parte de lo que le diste ya te devolvió, lo que te debe y qué parte es de todo lo que te deben. Quien más te debe va primero."
              ejemplo="«Te debe S/ 17,000.00 · 0 % volvió · 66 % de lo que te deben»."
            >
              <VolvioPorPersona personas={a.personas} moneda={cur} />
            </Tarjeta>
            <Tarjeta
              titulo="Quién tarda más en devolver"
              icono={<Timer className={`${ICONO} text-[var(--data-warning)]`} aria-hidden />}
              que="Días promedio por persona: en lo que ya pagó, cuánto tardó desde que se le dio; en lo que sigue abierto, cuántos días lleva sin moverse (desde su última devolución o, si no devolvió nada, desde que se le dio)."
              ejemplo="«82 días · 1 abierto, sin moverse hace 82 días»."
            >
              <TardaPorPersona tardanza={a.tardanza} />
            </Tarjeta>
          </div>

          <Tarjeta
            titulo="Diste vs Te devolvieron"
            icono={<BarChart3 className={`${ICONO} text-[var(--text-secondary)]`} aria-hidden />}
            que="Cada mes de los últimos 6: cuánto adelantaste y cuánto te devolvieron, con la cifra encima de cada barra. Los anulados no cuentan."
            ejemplo="Si la barra de «Diste» crece y la de «Te devolvieron» no, se te está acumulando lo que te deben."
            pie={
              <>
                <Muestra color={COLOR_DISTE}>Diste <strong className="font-bold text-[var(--text-primary)]">{fmtMon(a.totalMeses.diste, cur)}</strong></Muestra>
                <Muestra color={COLOR_VOLVIO}>Te devolvieron <strong className="font-bold text-[var(--text-primary)]">{fmtMon(a.totalMeses.devolvieron, cur)}</strong></Muestra>
              </>
            }
          >
            {hayMov ? <PorMes meses={a.meses} moneda={cur} /> : <p className="py-8 text-center text-base text-[var(--text-tertiary)]">Sin movimiento en los últimos 6 meses.</p>}
          </Tarjeta>

          {a.modalidades.length > 1 && (
            <Tarjeta
              titulo="Por modalidad"
              icono={<Layers className={`${ICONO} text-[var(--text-secondary)]`} aria-hidden />}
              que="Cuánta plata diste en cada forma de cobro y cuánto te deben en cada una."
            >
              <PorModalidad modalidades={a.modalidades} moneda={cur} />
            </Tarjeta>
          )}
        </>
      ) : (
        <p className="py-6 text-center text-base text-[var(--text-tertiary)]">No diste adelantos en {monedaLabel(cur)}.</p>
      )}

      {/* Lo que recibiste (ADR-448): plata que el negocio recibió y le debe a otro, lo opuesto de un adelanto. */}
      {a.recibido && (
        <Tarjeta
          titulo="Lo que recibiste"
          icono={<ArrowDownToLine className={`${ICONO} text-[var(--data-info-500)]`} aria-hidden />}
          que="Plata que te prestaron o te pagaron antes de un servicio: la devuelves tú, no al revés. No se mezcla con lo que diste."
        >
          <LoQueRecibiste recibido={a.recibido} moneda={cur} monedaLabel={monedaLabel(cur)} />
        </Tarjeta>
      )}
    </div>
  );
}
