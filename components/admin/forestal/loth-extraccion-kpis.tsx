"use client";

/**
 * Los seis indicadores de «Extracción» (ADR-454 §3), plegables y recordados
 * (`ctp-kpis-v2:loth-extraccion`). Cada uno dice contra qué se compara en su
 * segunda línea, y el ⓘ explica qué es, qué afecta y un ejemplo.
 *
 * Lo que pide trabajo (talados sin trozar, semilleros, exceso) NO está acá:
 * va a los avisos (memoria `deuda-no-es-indicador`).
 */

import type { ReactNode } from "react";
import { Activity, CalendarClock, Gauge, Layers, TreePine, Warehouse } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatDate, formatNumber } from "@/lib/format";
import type { ExtraccionResponse } from "@/lib/forestal/loth-extraccion-tipos";
import CtpKpi from "./CtpKpi";
import { useKpisPlegables } from "./kpis-plegables";
import { fm3, fpct, plural } from "./loth-extraccion-shared";

const fecha = (iso: string | null) => (iso ? formatDate(iso, { soloFecha: true }) : "—");

/**
 * La segunda línea de la tarjeta: la comparación y su ⓘ, en la misma línea.
 * La alerta va ACÁ, en texto `-ink`, y no en el color del número: el
 * `emphasis="warning"` del StatCard pinta el valor a 2,03:1 en claro (axe 29-09).
 */
function Linea({ children, titulo, what, affects, example, alerta = false }: {
  children: ReactNode;
  titulo: string;
  what: string;
  affects: string;
  example: string;
  alerta?: boolean;
}) {
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1">
      <span className={alerta ? "font-semibold text-[var(--data-warning-ink)]" : undefined}>{children}</span>
      <InfoTip title={titulo} what={what} affects={affects} example={example} side="bottom" />
    </span>
  );
}

export function useKpisExtraccion(d: ExtraccionResponse | null, cargando: boolean, error: string | null) {
  const k = d?.kpis;
  const sinDatosAun = !d && (cargando || error != null);
  const resumen = !k
    ? cargando
      ? "Leyendo el libro y el censo…"
      : "Sin datos"
    : `${fpct(k.extraido.pct)} extraído · ${fm3(k.porTalar.m3)} m³ por talar`;

  const trozadoM3 = d?.total.trozado.m3 ?? 0;
  const pctMonte = k && trozadoM3 > 0 ? (k.trozasEnElMonte.m3 / trozadoM3) * 100 : null;
  /* Diez puntos detrás del plazo corrido: no se llega a talar todo antes del cierre. */
  const atrasado = k != null && k.extraido.pct != null && k.extraido.plazoPct != null && k.extraido.pct + 10 < k.extraido.plazoPct;
  const etiquetaAnterior = d?.anterior ? `${fecha(d.anterior.desde)} – ${fecha(d.anterior.hasta)}` : null;

  const tarjetas = !k
    ? Array.from({ length: 6 }, (_, i) => <span key={i} />)
    : [
        <CtpKpi
          key="extraido"
          label="Extraído del censo"
          value={fpct(k.extraido.pct)}
          icon={Gauge}
          emphasis="neutral"
          subValue={
            <Linea
              alerta={atrasado}
              titulo="Extraído del censo"
              what="Lo talado dividido entre lo aprobado según censo."
              affects="Si va detrás del plazo corrido, no alcanzas a talar todo antes del cierre."
              example={`Talaste ${fm3(k.extraido.taladoM3)} de ${fm3(k.extraido.baseM3)} m³.`}
            >
              {k.extraido.plazoPct != null
                ? `${atrasado ? "detrás del plazo" : "plazo corrido"} ${fpct(k.extraido.plazoPct)}`
                : "sin plazo: el plan no tiene vigencia"}
            </Linea>
          }
        />,
        <CtpKpi
          key="por-talar"
          label="Por talar (m³)"
          value={fm3(k.porTalar.m3)}
          icon={TreePine}
          emphasis="neutral"
          subValue={
            <Linea
              titulo="Por talar"
              what="Lo aprobado según censo menos lo ya talado."
              affects="Es la madera que todavía puedes sacar de este permiso."
              example={`${plural(k.porTalar.arbolesEnPie, "árbol", "árboles")} en pie · ≈ ${formatNumber(k.porTalar.ptAserrableRef)} pt aserrables.`}
            >
              {plural(k.porTalar.arbolesEnPie, "árbol en pie", "árboles en pie")} · ≈ {formatNumber(k.porTalar.ptAserrableRef)} pt
            </Linea>
          }
        />,
        <CtpKpi
          key="ritmo"
          label="Ritmo de tala"
          value={k.ritmoSemanal.m3 != null ? `${fm3(k.ritmoSemanal.m3)} m³/sem` : "Sin ritmo"}
          icon={Activity}
          emphasis="neutral"
          actual={k.ritmoSemanal.m3 ?? undefined}
          previo={k.ritmoSemanal.m3 != null ? k.ritmoSemanal.anteriorM3 : undefined}
          etiquetaPrevio={etiquetaAnterior}
          subValue={
            <Linea
              titulo="Ritmo de tala"
              what="Lo talado en el período dividido entre sus semanas."
              affects="Con este ritmo se calcula cuándo se agota lo que queda."
              example="Con menos de 14 días con tala, todavía no hay ritmo."
            >
              {k.ritmoSemanal.m3 != null ? "del período elegido" : (k.ritmoSemanal.motivoSinDato ?? "sin tala en el período")}
            </Linea>
          }
        />,
        <CtpKpi
          key="agota"
          label="Se agota el"
          value={k.agotamiento.fecha ? fecha(k.agotamiento.fecha) : "—"}
          icon={CalendarClock}
          emphasis="neutral"
          subValue={
            <Linea
              alerta={k.agotamiento.llegaAlCierre === false}
              titulo="Se agota el"
              what="El día en que se acabaría lo que queda, al ritmo de hoy."
              affects="Si cae después del cierre del permiso, no alcanzas a sacarlo todo."
              example="Quedan 60 m³ y talas 5 por semana: 12 semanas."
            >
              {k.agotamiento.fecha
                ? k.agotamiento.vigenciaHasta
                  ? `${k.agotamiento.llegaAlCierre ? "antes" : "después"} del cierre · ${fecha(k.agotamiento.vigenciaHasta)}`
                  : "el plan no tiene vigencia"
                : (k.agotamiento.motivoSinDato ?? "sin ritmo para proyectar")}
            </Linea>
          }
        />,
        <CtpKpi
          key="monte"
          label="Trozas en el monte"
          value={formatNumber(k.trozasEnElMonte.n)}
          icon={Layers}
          emphasis="neutral"
          subValue={
            <Linea
              titulo="Trozas en el monte"
              what="Trozas que no salieron ni se consumieron."
              affects="Madera en el bosque expuesta a robo y a que se pique."
              example={
                k.trozasEnElMonte.diasMasVieja != null
                  ? `La más vieja lleva ${plural(k.trozasEnElMonte.diasMasVieja, "día", "días")} trozada.`
                  : "Dos trozas de Copaiba esperando el camión."
              }
            >
              {fm3(k.trozasEnElMonte.m3)} m³{pctMonte != null ? ` · ${fpct(pctMonte)} de lo trozado` : ""}
            </Linea>
          }
        />,
        <CtpKpi
          key="planta"
          label="Llegó a planta"
          value={k.llegoAPlanta.pct != null ? fpct(k.llegoAPlanta.pct) : "—"}
          icon={Warehouse}
          emphasis="neutral"
          subValue={
            <Linea
              titulo="Llegó a planta"
              what="Trozas recibidas en el CTP dividido entre las despachadas."
              affects="Lo que falta está en camino o no se recibió en el libro del CTP."
              example="Despachaste 4 trozas y el CTP recibió 3: 75 %."
            >
              {k.llegoAPlanta.despachadas > 0
                ? `${formatNumber(k.llegoAPlanta.recibidas)} de ${plural(k.llegoAPlanta.despachadas, "troza despachada", "trozas despachadas")}`
                : "sin despacho todavía"}
            </Linea>
          }
        />,
      ];

  return useKpisPlegables({ claveMemoria: "loth-extraccion", tarjetas, resumen, sinDatosAun, alto: "sm" });
}
