"use client";

/**
 * CtpIngresosKpis — la fila de KPIs de la pestaña Ingresos.
 *
 * Los números no son sólo decoración: cada tarjeta es el filtro que la explica.
 * "Pendientes validar: 4" y después buscar los 4 a mano en la tabla era el
 * camino largo de lo mismo — ahora la tarjeta ES el atajo, y se ve hundida
 * cuando su filtro está puesto.
 *
 * "Fuera de plazo" es nueva: el dato (`stats.lateCount`) se calculaba en DB
 * desde siempre pero sólo aparecía en la tira de pendientes del shell y en el
 * Excel; acá vive al lado de las otras cifras del período y filtra la tabla.
 *
 * **Por qué se parte en dos** (medido 2026-09-10, período real): de seis
 * tarjetas, CUATRO estaban en cero —«Fuera de plazo 0», «Sin código de origen
 * 0», «CITES 0»— ocupando el mismo tamaño que el volumen del período. Lo que
 * pide trabajo (validar, registro tardío, origen faltante) baja a `BarraDeuda`,
 * que sólo dibuja lo que es > 0 y sigue filtrando la tabla igual que la tarjeta;
 * arriba quedan las dos cifras que describen el período pase lo que pase.
 *
 * CITES NO es deuda: una especie protegida con su permiso es legal y no resta
 * en el score de cumplimiento (`ctp-compliance.ts`). Por eso, cuando aparece,
 * es una tarjeta informativa y nunca una pastilla roja.
 */

import { AlertCircle, Boxes, TreePine } from "@buleje/design-system/icons";
import CtpKpi, { DesgloseSimple } from "./CtpKpi";
import BarraDeuda, { type DeudaItem } from "@/components/admin/shared/BarraDeuda";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import { CtpKpisPlegables, type WoodEntryStats } from "./ctp-shared";
import CtpKpiFiltros, { camposDeIngresos, notaDeFiltros } from "./CtpKpiFiltros";
import type { CtpFacetasActivas } from "./CtpIngresosFiltros";
import { productLabel } from "./ctp-shared";

export interface CtpIngresosKpisProps {
  stats: WoodEntryStats | null;
  /**
   * Los MISMOS agregados del período anterior, con los mismos filtros.
   * Sin ellos las tarjetas se dibujan como siempre, sin comparación.
   */
  statsPrevios?: WoodEntryStats | null;
  etiquetaPrevio?: string | null;
  /** Filtro de estado activo (para marcar "Pendientes" como hundida). */
  statusFilter: string;
  citesOn: boolean;
  lateOn: boolean;
  onStatus: (status: string) => void;
  onCites: () => void;
  onLate: () => void;
  /** La tarjeta de volumen abre/cierra el desglose por especie. */
  onVolumen: () => void;
  dashboardOn: boolean;
  /**
   * Ingresos vigentes sin código de origen — el agujero que deja la pestaña
   * EUDR inerte. El dato (`stats.sinOrigenCount`) y su filtro existían desde
   * siempre, pero el filtro vivía escondido en el panel y no había cifra: nadie
   * mira un problema que no está en ningún número.
   */
  sinOrigenOn: boolean;
  onSinOrigen: () => void;
  /**
   * Los filtros que recortan estas cifras (ADR-400).
   *
   * Son las MISMAS facetas que filtran la tabla: el servidor calcula los
   * agregados sobre el conjunto filtrado (`stats()` comparte el `where` con
   * `list()`), así que el volumen de arriba y las filas de abajo no pueden
   * decir cosas distintas.
   */
  facetas: CtpFacetasActivas;
  onFacetas: (f: CtpFacetasActivas) => void;
}

const nf = (n: number) => n.toLocaleString("es-PE");

export default function CtpIngresosKpis({
  stats,
  statsPrevios,
  etiquetaPrevio,
  statusFilter,
  citesOn,
  lateOn,
  onStatus,
  onCites,
  onLate,
  onVolumen,
  dashboardOn,
  sinOrigenOn,
  onSinOrigen,
  facetas,
  onFacetas,
}: CtpIngresosKpisProps) {
  const vol = stats ? Number(stats.totalVolumeM3) : 0;

  /**
   * Los desplegables que gobiernan las cifras.
   *
   * Salen del helper que comparten la BANDEJA y el ARCHIVO de GTF: los dos
   * miran el mismo conjunto con los mismos filtros de servidor, y dos listas de
   * campos se desincronizan a la primera faceta nueva.
   */
  const campos = camposDeIngresos({ stats, facetas, onFacetas, productLabel });
  const activos = campos.filter((c) => c.valor).length;
  const nota = notaDeFiltros(campos);

  /**
   * Lo que pide trabajo, fuera de la grilla y sólo si existe.
   *
   * Cada pastilla hace EXACTAMENTE lo que hacía su tarjeta: pone el filtro y se
   * marca cuando está puesto. Lo que cambia es que un cero ya no ocupa una
   * tarjeta entera diciendo «todo al día» — eso lo dice la barra en una línea.
   */
  const deudas: DeudaItem[] = [];
  if (stats?.byStatus.pendiente) {
    deudas.push({
      key: "pendientes",
      valor: nf(stats.byStatus.pendiente),
      label: "por validar",
      hint: statusFilter === "pendiente" ? "filtrando por estos" : "no computan como existencia",
      tono: "warning",
      title: "Ingresos cargados que todavía no entraron al saldo. Tocá para ver sólo estos.",
      onClick: () => onStatus(statusFilter === "pendiente" ? "" : "pendiente"),
    });
  }
  if (stats?.lateCount) {
    deudas.push({
      key: "plazo",
      valor: nf(stats.lateCount),
      label: "fuera de plazo",
      hint: lateOn ? "filtrando por estos" : "registro tardío",
      tono: "warning",
      title: "Se registraron después de los 2 días hábiles que pide la RDE D000025-2023",
      onClick: onLate,
    });
  }
  if (stats?.sinOrigenCount) {
    deudas.push({
      key: "sin-origen",
      valor: nf(stats.sinOrigenCount),
      label: "sin código de origen",
      hint: sinOrigenOn ? "filtrando por estos" : "sin parcela, EUDR queda inerte",
      tono: "error",
      title: "Sin código de origen no se puede armar la trazabilidad EUDR",
      onClick: onSinOrigen,
    });
  }

  const panel = (
    /* Todas detrás del botón «Indicadores» (Brandon, 2026-09-03). El carrusel
       mobile que tenían acá dejó de hacer falta: escondidas no empujan la lista,
       y abiertas usan la misma grilla que el resto del libro. */
    <CtpKpisPlegables
      claveMemoria="ingresos"
      filtrosActivos={activos}
      filtros={
        <CtpKpiFiltros
          campos={campos}
          onLimpiar={() =>
            onFacetas({ ...facetas, species: undefined, permiso: undefined, provider: undefined, product: undefined })
          }
          nota={nota}
        />
      }
      resumen={
        stats
          ? `${nf(stats.totalCount)} ingreso${stats.totalCount === 1 ? "" : "s"} · ${vol.toFixed(2)} m³` +
            /* Las piezas sólo si el papel las declara: un «0 piezas» acá al
               lado de las 78 trozas cargadas del archivo se lee como un error
               de la pantalla, y son dos cosas distintas (lo que dice la guía vs.
               la lista de trozas del detalle). */
            (stats.totalPieces > 0 ? ` · ${nf(stats.totalPieces)} piezas` : "") +
            (stats.byStatus.pendiente > 0 ? ` · ${nf(stats.byStatus.pendiente)} por validar` : "") +
            (stats.lateCount > 0 ? ` · ${nf(stats.lateCount)} fuera de plazo` : "")
          : "Leyendo el período…"
      }
      tarjetas={[
        <CtpKpi
          key="ingresos"
          label="Ingresos del período"
          value={stats ? nf(stats.totalCount) : "—"}
          subValue={stats ? `${nf(stats.totalPieces)} piezas` : undefined}
          icon={Boxes}
          actual={stats?.totalCount}
          previo={statsPrevios ? statsPrevios.totalCount : undefined}
          etiquetaPrevio={etiquetaPrevio}
          desglose={
            stats?.providers?.length
              ? <DesgloseSimple filas={stats.providers.map((f) => ({ value: f.value, count: f.count, volumeM3: f.volumeM3 }))} />
              : undefined
          }
          desgloseLabel="Por proveedor"
        />,
        <CtpKpi
          key="volumen"
          label="Volumen del período"
          value={stats ? `${vol.toFixed(2)} m³` : "—"}
          /* El pie tablar al lado del m³, como en el resto del libro: es la
             unidad con la que el aserradero piensa lo que entró. */
          subValue={stats ? `${nf(pieTablarDe(vol))} pt · ${stats.speciesCount} especies · ver desglose` : undefined}
          icon={TreePine}
          actual={stats?.totalVolumeM3}
          previo={statsPrevios ? statsPrevios.totalVolumeM3 : undefined}
          etiquetaPrevio={etiquetaPrevio}
          /* Sin `desglose` propio a propósito: el clic ya abre el reparto por
             especie GRANDE, con su gráfico. Dos desgloses del mismo dato en la
             misma tarjeta es la duplicación que este módulo ya sufrió. */
          onClick={onVolumen}
          filtrando={dashboardOn}
        />,
        /* Las tarjetas de deuda —pendientes, fuera de plazo, sin código de
           origen— se fueron a la barra de abajo. CITES se queda arriba, y sólo
           cuando hay: es un dato del período, no una falta. */
        ...(stats?.citesCount
          ? [
              <CtpKpi
                key="cites"
                label="Especies CITES"
                value={nf(stats.citesCount)}
                subValue={`${Number(stats.citesVolumeM3).toFixed(2)} m³ protegidos · ${citesOn ? "filtrando" : "ver"}`}
                icon={AlertCircle}
                actual={stats.citesCount}
                previo={statsPrevios ? statsPrevios.citesCount : undefined}
                etiquetaPrevio={etiquetaPrevio}
                /* Ni buena ni mala noticia: una especie protegida CON permiso es
                   legal y no resta en el score (`ctp-compliance.ts`). Pintarla
                   de rojo al subir enseñaría a esconder madera que está en regla. */
                tono="neutral"
                onClick={onCites}
                filtrando={citesOn}
              />,
            ]
          : []),
      ]}
    />
  );

  return (
    <div className="space-y-2">
      {panel}
      <BarraDeuda items={deudas} vacio="Todo el período está validado, a tiempo y con su origen declarado." />
    </div>
  );
}
