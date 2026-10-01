"use client";

/**
 * Los indicadores de «Trozas disponibles», plegables y recordados
 * (`ctp-kpis-v2:trozas-disponibles`).
 *
 * UN criterio (revisión 2026-09-27): las cifras principales son EN EL PATIO
 * —libres + en lote— y cierran con la fila «Total» de «Por permiso» y de «Por
 * especie». Lo sin recepcionar tiene SU tarjeta y no se suma a ninguna otra.
 * Sin comparación contra el mes pasado: el patio es lo que hay HOY, no un flujo
 * del período (memoria `kpi-contra-que-se-compara`).
 */

import type { ReactNode } from "react";
import {
  Calculator,
  Clock,
  FileStack,
  Inbox,
  Layers,
  PackageOpen,
  Ruler,
  TreePine,
  Unlock,
} from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { DIAS_ANEJA } from "@/lib/forestal/trozas-disponibles";
import type { TramoDias } from "@/lib/forestal/patio-resumen";
import CtpKpi, { DesgloseSimple } from "./CtpKpi";
import { useKpisPlegables } from "./kpis-plegables";
import type { EstadoTrozasDisponibles } from "./hooks/use-trozas-disponibles";

const nf = (n: number) => formatNumber(n);
const plural = (n: number, uno: string, varios: string) => `${nf(n)} ${n === 1 ? uno : varios}`;
/** «Añejas» = los tres tramos desde 15 días (la escala única del patio). */
const TRAMOS_ANEJOS: TramoDias[] = ["16a30", "31a60", "mas60"];

export function useKpisTrozasDisponibles(
  e: EstadoTrozasDisponibles,
  filtrosActivos: number,
  filtros?: ReactNode,
) {
  const r = e.resumen;
  const enPatio = e.especies.filter((x) => x.trozas > 0);
  const lider = enPatio[0] ?? null;
  const reparto = enPatio.map((x) => ({ value: x.especie, count: x.trozas, volumeM3: x.m3 }));
  const soloSinRecepcionar =
    e.filtro.estado.length === 1 && e.filtro.estado[0] === "sin-recepcionar";
  const soloLibres = e.filtro.estado.length === 1 && e.filtro.estado[0] === "libre";
  const soloAnejas =
    e.filtro.tramos.length === TRAMOS_ANEJOS.length &&
    TRAMOS_ANEJOS.every((t) => e.filtro.tramos.includes(t));
  const sr = r.sinRecepcionar;
  /* Todavía no hay una cifra REAL: ni la primera carga terminó ni, si falló,
     trajo algo. Antes se leía «0 trozas · Sin trozas» igual que un patio
     de verdad vacío (mismo bug que Productos disponibles, 27-09). */
  const sinDatosAun = (e.cargando || e.error != null) && e.vivas.length === 0;

  const resumen = sinDatosAun
    ? e.cargando
      ? "Leyendo el patio…"
      : "No se pudo leer el patio"
    : r.enPatio.trozas === 0 && sr.trozas === 0
      ? "Sin trozas"
      : `${plural(r.enPatio.trozas, "troza", "trozas")} en el patio · ${fmtM3(r.enPatio.m3)} m³` +
        (sr.trozas > 0 ? ` · ${nf(sr.trozas)} sin recepcionar` : "");

  return useKpisPlegables({
    claveMemoria: "trozas-disponibles",
    alto: "md",
    resumen,
    filtrosActivos,
    sinDatosAun,
    filtros,
    tarjetas: [
      <CtpKpi
        key="trozas"
        label="Trozas en el patio"
        value={nf(r.enPatio.trozas)}
        subValue={`${nf(r.libres.trozas)} libres · ${plural(r.enLote.trozas, "en lote", "en lotes")}`}
        icon={PackageOpen}
        desglose={
          reparto.length > 0 ? (
            <DesgloseSimple filas={reparto} onElegir={(v) => e.alternar("especie", v)} />
          ) : undefined
        }
        desgloseLabel="Por especie"
      />,
      <CtpKpi
        key="m3"
        label="Volumen en el patio (m³)"
        value={fmtM3(r.enPatio.m3)}
        subValue={`${fmtM3(r.libres.m3)} m³ libres hoy`}
        icon={TreePine}
        emphasis="neutral"
      />,
      <CtpKpi
        key="pt"
        label="Pies tablares"
        value={`≈${nf(r.enPatio.pt)}`}
        subValue="Del patio, aserrable al 56 %"
        icon={Calculator}
        emphasis="neutral"
      />,
      <CtpKpi
        key="libres"
        label="Libres para la sierra"
        value={nf(r.libres.trozas)}
        subValue={`${fmtM3(r.libres.m3)} m³ · sin lote`}
        icon={Unlock}
        onClick={() => e.poner("estado", soloLibres ? [] : ["libre"])}
        filtrando={soloLibres}
      />,
      /* APARTE: no suma a ninguna otra tarjeta. */
      <CtpKpi
        key="sin-recepcionar"
        label="Sin recepcionar"
        value={nf(sr.trozas)}
        subValue={`${fmtM3(sr.m3)} m³ · ${plural(sr.guias, "guía", "guías")} · no suman arriba`}
        icon={Inbox}
        emphasis="neutral"
        onClick={() => e.poner("estado", soloSinRecepcionar ? [] : ["sin-recepcionar"])}
        filtrando={soloSinRecepcionar}
      />,
      <CtpKpi
        key="anejas"
        label="Añejas"
        value={nf(r.anejas.trozas)}
        subValue={
          r.masVieja
            ? `${DIAS_ANEJA} días o más · la más vieja ${nf(r.masVieja.dias)} días`
            : `${DIAS_ANEJA} días o más en el patio`
        }
        icon={Clock}
        /* Neutral: el ámbar del número no llega a 3:1 sobre blanco (axe, 24-09). */
        emphasis="neutral"
        onClick={() => e.setTramos(soloAnejas ? [] : TRAMOS_ANEJOS)}
        filtrando={soloAnejas}
      />,
      <CtpKpi
        key="permisos"
        label="Permisos en el patio"
        value={nf(r.permisos)}
        subValue={
          (sr.permisosSolo > 0 ? `+${nf(sr.permisosSolo)} solo sin recepcionar · ` : "") +
          (r.sinPermiso > 0 ? `${plural(r.sinPermiso, "troza", "trozas")} sin permiso · ` : "") +
          `${plural(r.guias, "guía", "guías")} · ${plural(r.proveedores, "proveedor", "proveedores")}`
        }
        icon={FileStack}
        emphasis="neutral"
      />,
      /* ¿Palo grueso o menudo? Cambia el rendimiento esperado (venía de Consumos). */
      <CtpKpi
        key="calibre"
        label="Calibre"
        value={r.promedioM3 != null ? `${fmtM3(r.promedioM3)} m³` : "—"}
        subValue={
          r.promedioM3 == null
            ? "Ninguna troza en el patio"
            : `Promedio por troza · la mayor ${fmtM3(r.mayorM3 ?? 0)} m³`
        }
        icon={Ruler}
        emphasis="neutral"
      />,
      <CtpKpi
        key="especies"
        label="Especies en el patio"
        value={nf(r.especies)}
        subValue={
          (lider ? `${lider.especie}: ${lider.pctM3} % del m³` : "Sin especie declarada") +
          (sr.especiesSolo > 0 ? ` · +${nf(sr.especiesSolo)} solo sin recepcionar` : "")
        }
        icon={Layers}
        desglose={
          reparto.length > 0 ? (
            <DesgloseSimple filas={reparto} onElegir={(v) => e.alternar("especie", v)} />
          ) : undefined
        }
        desgloseLabel="Cuánto hay de cada una"
      />,
    ],
  });
}
