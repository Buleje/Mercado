"use client";

/**
 * Las cifras del patio (ADR-345).
 *
 * Cuando el apartado que se está mirando es la pila, los cuatro números de
 * arriba tienen que hablar de la pila: cuánta madera hay, de qué es, cuánta se
 * puede mandar hoy a la sierra y hace cuánto que está parada. Antes esa franja
 * mostraba siempre lo del cuadro —los consumos ya registrados— y se leía "3
 * consumos" con treinta trozas delante.
 *
 * Se calculan sobre lo FILTRADO, igual que el pie de la tabla: dos cifras para
 * la misma madera que no coinciden enseñan a no mirar ninguna.
 */

import { Clock, FileStack, Layers, PackageOpen, Ruler, TreePine } from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import { CtpKpisPlegables } from "./ctp-shared";
import { DIAS_PATIO_ANEJO, type ResumenPatio } from "@/lib/forestal/patio-resumen";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { pieTablarAserrableDe } from "@/lib/forestal/cubicacion";
import { RENDIMIENTO_META } from "@/lib/forestal/loctp-catalogos";

const nf = (n: number) => n.toLocaleString("es-PE");

export default function CtpPatioKpis({
  resumen,
}: {
  resumen: ResumenPatio;
  /** Cuántas piezas tiene el patio sin filtrar. Ya no se usa acá —el resumen de
   *  especies que la necesitaba se sacó (Brandon, 2026-09-01): agrupar la
   *  tabla por especie/guía/permiso dice lo mismo, sin duplicar la cuenta. */
  totalSinFiltrar?: number;
}) {
  const r = resumen;
  const lider = r.porEspecie[0] ?? null;

  return (
    /* Todas detrás del botón «Indicadores» (Brandon, 2026-09-03); el titular
       —cuántas trozas y cuántos m³— viaja en la línea de resumen. */
    <CtpKpisPlegables
      claveMemoria="consumos-patio"
      resumen={
        r.piezas === 0
          ? "Sin madera esperando"
          : `${nf(r.piezas)} trozas · ${fmtM3(r.volumenM3)} m³ · ${nf(r.libres)} libres` +
            (r.anejas > 0 ? ` · ${nf(r.anejas)} añejas` : "")
      }
      tarjetas={[
        <StatCard
          key="piezas"
          density="compact"
          label="Trozas en el patio"
          value={nf(r.piezas)}
          subValue={
            r.piezas === 0
              ? "Sin madera esperando"
              : `${nf(r.libres)} libres · ${nf(r.apartadas)} en lotes` +
                (r.bloqueadas > 0 ? ` · ${nf(r.bloqueadas)} bloqueadas` : "")
          }
          icon={PackageOpen}
          emphasis="neutral"
        />,
        /* La unidad va en el rótulo: con «m³» pegado, los tres decimales del
           libro parten el número en dos renglones y estiran toda la fila. */
        <StatCard
          key="volumen"
          density="compact"
          label="Volumen en patio (m³)"
          value={fmtM3(r.volumenM3)}
          subValue={`≈${nf(pieTablarAserrableDe(r.volumenM3, RENDIMIENTO_META))} pt aserrables (56%) · ${fmtM3(r.volumenLibreM3)} libres hoy`}
          icon={TreePine}
          emphasis="success"
        />,
        <StatCard
          key="especies"
          density="compact"
          label="Especies en la pila"
          value={nf(r.especies)}
          subValue={
            lider ? `${lider.especie} · ${lider.pctVolumen}% del volumen` : "Sin especie declarada"
          }
          icon={Layers}
          emphasis="neutral"
        />,
        /* La pregunta que nadie hace hasta que la madera se manchó: ¿hace cuánto
           que está parada? El promedio escondería justo la pieza vieja. */
        <StatCard
          key="espera"
          density="compact"
          label="Espera en el patio"
          value={r.esperaMaxDias != null ? `${nf(r.esperaMaxDias)} d` : "—"}
          subValue={
            r.esperaMaxDias == null
              ? "Sin fecha de recepción"
              : r.anejas > 0
                ? `${nf(r.anejas)} pza · ${DIAS_PATIO_ANEJO} días o más`
                : `Ninguna pasa los ${DIAS_PATIO_ANEJO} días`
          }
          icon={Clock}
          emphasis={r.anejas > 0 ? "warning" : "neutral"}
        />,
        /**
         * De cuántos papeles cuelga esta pila.
         *
         * El dato lo devolvía `resumenPatio` desde siempre y no se mostraba en
         * ningún lado: es la pregunta del fiscalizador —¿cuántas guías y
         * cuántos títulos sostienen la madera que hay parada?— y la que dice si
         * el patio es de una sola carga o de diez guías mezcladas.
         */
        <StatCard
          key="papeles"
          density="compact"
          label="Guías en la pila"
          value={nf(r.guias)}
          subValue={
            r.guias === 0
              ? "Ninguna pieza declara su guía"
              : `${nf(r.permisos)} título${r.permisos === 1 ? "" : "s"} habilitante${r.permisos === 1 ? "" : "s"} · ${nf(r.proveedores)} proveedor${r.proveedores === 1 ? "" : "es"}`
          }
          icon={FileStack}
          emphasis={r.guias === 0 && r.piezas > 0 ? "warning" : "neutral"}
        />,
        /**
         * ¿Es pila de palo grueso o de menudo? Cambia el rendimiento esperado y
         * qué sierra conviene. `promedioM3`/`mayorM3` también venían calculados
         * y sin usar.
         */
        <StatCard
          key="calibre"
          density="compact"
          label="Calibre de la pila"
          value={r.promedioM3 != null ? `${fmtM3(r.promedioM3)} m³` : "—"}
          subValue={
            r.promedioM3 == null
              ? "Ninguna pieza trae volumen"
              : `promedio por troza · la mayor ${fmtM3(r.mayorM3 ?? 0)} m³`
          }
          icon={Ruler}
          emphasis="neutral"
        />,
      ]}
    />
  );
}
