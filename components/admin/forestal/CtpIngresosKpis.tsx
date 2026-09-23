"use client";

/**
 * CtpIngresosKpis — la fila de KPIs de la pestaña Ingresos.
 *
 * Los números no son sólo decoración: cada tarjeta es el filtro que la explica.
 * "Pendientes validar: 4" y después buscar los 4 a mano en la tabla era el
 * camino largo de lo mismo — ahora la tarjeta ES el atajo, y se ve hundida
 * cuando su filtro está puesto.
 *
 * **Por qué se parte en dos** (medido 2026-09-10, período real): de seis
 * tarjetas, CUATRO estaban en cero ocupando el mismo tamaño que el volumen del
 * período. Lo que pide trabajo (validar, registro tardío, origen faltante, sin
 * costo) baja a `BarraDeuda`, que sólo dibuja lo que es > 0 y sigue filtrando
 * la tabla; arriba quedan las cifras que describen el período pase lo que pase.
 *
 * **2026-09-13 — de 2 tarjetas a 8** (Brandon: «KPIs más variados y de mejor
 * calidad»). Medido antes de construir, sobre el tenant forestal real: 24
 * ingresos, 197.65 m³, 3 proveedores —**uno trae el 68.6 %**—, 12 especies, y
 * **24 de 24 sin costo**. `stats()` ya calculaba la mitad de eso y la pantalla
 * no lo decía. Cada tarjeta nueva contesta una pregunta distinta del dueño:
 *   · ¿de quién dependo?          → concentración de proveedor
 *   · ¿qué madera entra?          → especie principal y su reparto
 *   · ¿qué tan buena es la troza? → m³ y pie tablar por pieza MEDIDA
 *   · ¿a qué ritmo entra?         → la curva diaria del volumen
 *   · ¿llego a tiempo al libro?   → días hábiles de la guía al registro vs plazo
 *   · ¿cuánto me cuesta el m³?    → sólo sobre lo valorizado; si no hay, es deuda
 *   · ¿aguanto una fiscalización? → el eslabón más débil de la trazabilidad
 * Todas salen de `lib/forestal/ctp-ingresos-kpis.ts`, corridas igual sobre el
 * período anterior para el delta.
 *
 * CITES NO es deuda: una especie protegida con su permiso es legal y no resta
 * en el score de cumplimiento (`ctp-compliance.ts`). Por eso, cuando aparece,
 * es una tarjeta informativa y nunca una pastilla roja.
 */

import { AlertCircle, Boxes, Clock, PackageOpen, Route, Store, Tag, TreePine, TrendingUp } from "@buleje/design-system/icons";
import CtpKpi, { DesgloseSimple } from "./CtpKpi";
import BarraDeuda, { type DeudaItem } from "@/components/admin/shared/BarraDeuda";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import { limaDateKey } from "@/lib/utils";
import { PLAZO_REGISTRO_DIAS } from "@/lib/forestal/ctp-compliance";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import {
  costoDelPeriodo,
  repartoDeVolumen,
  serieDiariaCompleta,
  trazabilidad,
  trozaPromedio,
  type Reparto,
} from "@/lib/forestal/ctp-ingresos-kpis";
import { CtpKpisPlegables, type WoodEntryStats } from "./ctp-shared";
import CtpKpiFiltros, { camposDeIngresos, notaDeFiltros } from "./CtpKpiFiltros";
import type { CtpFacetasActivas } from "./CtpIngresosFiltros";
import { productLabel } from "./ctp-shared";
import { formatCurrency, formatNumber } from "@/lib/format";

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
   * EUDR inerte.
   */
  sinOrigenOn: boolean;
  onSinOrigen: () => void;
  /** Ingresos sin costo cargado: lo que deja al margen sin base (ADR-135). */
  sinCostoOn?: boolean;
  onSinCosto?: () => void;
  /** El período, para completar los días sin ingreso de la curva. */
  period?: CtpPeriod;
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

const nf = (n: number) => formatNumber(n);
const soles = (n: number) => `${formatCurrency(n)}`;

/** ¿La columna tiene un filtro puesto? Acepta el formato viejo de un solo string. */
const filtrada = (v: string | readonly string[] | undefined) =>
  Array.isArray(v) ? v.length > 0 : Boolean(v);

/**
 * Un solo tono en escalones, de la mayor a la menor, y «otras» en gris.
 *
 * No es una paleta categórica a propósito: la identidad la dicen las
 * etiquetas, no el color. Con cuatro tonos distintos, filtrar por un proveedor
 * repintaría a los demás y el color dejaría de significar algo.
 */
const ESCALONES = ["bg-primary", "bg-primary/70", "bg-primary/45", "bg-primary/25"];

/**
 * La parte de cada uno sobre el total, en una barra de 8px.
 *
 * Sólo `span`: vive dentro del `subValue` del `StatCard`, que es un `Caption`.
 * Decorativa (`aria-hidden`): el nombre y el porcentaje van escritos al lado.
 */
function BarraReparto({ reparto }: { reparto: Reparto }) {
  return (
    <span aria-hidden className="mt-1.5 flex h-2 w-full gap-[2px] overflow-hidden rounded-full">
      {reparto.tramos.map((t, i) => (
        <span
          key={t.value}
          className={`block h-full min-w-[3px] basis-0 ${ESCALONES[i] ?? ESCALONES[ESCALONES.length - 1]}`}
          style={{ flexGrow: t.pct }}
        />
      ))}
      {reparto.otras && (
        <span className="block h-full min-w-[3px] basis-0 bg-[var(--rule-base)]" style={{ flexGrow: reparto.otras.pct }} />
      )}
    </span>
  );
}

/** Los tres eslabones de la cadena de custodia, cada uno con su barra. */
function Eslabones({ eslabones }: { eslabones: NonNullable<ReturnType<typeof trazabilidad>>["eslabones"] }) {
  return (
    <div className="space-y-2">
      {eslabones.map((e) => (
        <div key={e.clave}>
          <div className="flex items-baseline justify-between gap-2 text-[length:var(--ts-xs)]">
            <span className="font-bold text-[var(--text-secondary)]">{e.label}</span>
            <span className="shrink-0 whitespace-nowrap tabular-nums text-[var(--text-tertiary)]">
              {nf(e.con)} de {nf(e.total)} · {e.pct.toFixed(0)} %
            </span>
          </div>
          <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <div
              className={`h-full rounded-full ${e.pct >= 100 ? "bg-primary" : "bg-[var(--data-warning-500)]"}`}
              style={{ width: `${Math.max(2, e.pct)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

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
  sinCostoOn = false,
  onSinCosto,
  period,
  facetas,
  onFacetas,
}: CtpIngresosKpisProps) {
  const vol = stats ? Number(stats.totalVolumeM3) : 0;
  const volPrevio = statsPrevios ? Number(statsPrevios.totalVolumeM3) : 0;

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

  /* Las cuentas nuevas, hoy y un período atrás — la MISMA función en los dos. */
  const provHoy = stats ? repartoDeVolumen(stats.providers, vol, 3) : null;
  const provAntes = statsPrevios ? repartoDeVolumen(statsPrevios.providers, volPrevio, 3) : null;
  const espHoy = stats ? repartoDeVolumen(stats.species, vol, 4) : null;
  const trozaHoy = stats ? trozaPromedio(stats) : null;
  const trozaAntes = statsPrevios ? trozaPromedio(statsPrevios) : null;
  const costoHoy = stats ? costoDelPeriodo(stats) : null;
  const costoAntes = statsPrevios ? costoDelPeriodo(statsPrevios) : null;
  const trazHoy = stats ? trazabilidad(stats) : null;
  const trazAntes = statsPrevios ? trazabilidad(statsPrevios) : null;
  const ritmo = stats
    ? serieDiariaCompleta(stats.serieDiaria, period?.from ?? null, period?.to ?? null, limaDateKey())
    : null;
  const registroProm = stats?.registroDiasHabilesProm ?? null;
  const registroMax = stats?.registroDiasHabilesMax ?? null;

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
      title: "Ingresos cargados que todavía no entraron al saldo. Toca para ver sólo estos.",
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
      title: `Se registraron después de los ${PLAZO_REGISTRO_DIAS} días hábiles que pide la RDE D000025-2023`,
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
  /* Nuevo (2026-09-13): el período real tenía 24 de 24 ingresos sin costo y no
     lo decía ningún número. No traba el libro —SERFOR no pide precios— pero
     sin costo lo que salga de esa madera no puede mostrar margen. */
  if (stats?.sinCostoCount) {
    deudas.push({
      key: "sin-costo",
      valor: nf(stats.sinCostoCount),
      label: "sin costo",
      hint: sinCostoOn
        ? "filtrando por estos"
        : `${Number(stats.sinCostoM3 ?? 0).toFixed(2)} m³ sin valorizar`,
      tono: "warning",
      title: "Sin costo cargado, el margen de lo que salga de esta madera no se puede calcular. Toca para ver sólo estos.",
      onClick: onSinCosto,
    });
  }

  const tarjetas = [
    <CtpKpi
      key="ingresos"
      label="Ingresos del período"
      value={stats ? nf(stats.totalCount) : "—"}
      subValue={stats ? `${nf(stats.totalPieces)} piezas` : undefined}
      icon={Boxes}
      actual={stats?.totalCount}
      previo={statsPrevios ? statsPrevios.totalCount : undefined}
      etiquetaPrevio={etiquetaPrevio}
    />,
    <CtpKpi
      key="volumen"
      label="Volumen del período"
      value={stats ? `${vol.toFixed(2)} m³` : "—"}
      /* El pie tablar al lado del m³: es la unidad con la que el aserradero
         piensa lo que entró. Y cuántos días entró madera: 197 m³ en 3 días no
         es lo mismo que en 20. */
      subValue={
        stats
          ? `${nf(pieTablarDe(vol))} pt` +
            (ritmo ? ` · ${ritmo.diasConIngreso} de ${ritmo.diasDelPeriodo} días con ingreso` : "") +
            " · ver por especie"
          : undefined
      }
      icon={TreePine}
      actual={stats?.totalVolumeM3}
      previo={statsPrevios ? statsPrevios.totalVolumeM3 : undefined}
      etiquetaPrevio={etiquetaPrevio}
      /* La curva del período día por día, con los días sin madera en cero. */
      serie={ritmo?.serie}
      onClick={onVolumen}
      filtrando={dashboardOn}
    />,
  ];

  /* ¿De quién dependo? Si ya se filtró por proveedor la pregunta no aplica:
     el que elegiste es el 100 %. */
  if (provHoy?.principal && !filtrada(facetas.provider)) {
    tarjetas.push(
      <CtpKpi
        key="concentracion"
        label="Proveedor principal"
        value={`${provHoy.principal.pct.toFixed(1)} %`}
        subValue={
          <>
            {/* El nombre se trunca, el conteo no: «3 pro…» no dice nada. */}
            <span className="flex min-w-0 gap-1">
              <span className="min-w-0 truncate" title={provHoy.principal.value}>{provHoy.principal.value}</span>
              <span className="shrink-0">· {provHoy.distintos} proveedor{provHoy.distintos === 1 ? "" : "es"}</span>
            </span>
            <BarraReparto reparto={provHoy} />
          </>
        }
        icon={Store}
        actual={provHoy.principal.pct}
        previo={statsPrevios ? (provAntes?.principal?.pct ?? null) : undefined}
        etiquetaPrevio={etiquetaPrevio}
        /* Más concentración es más riesgo: si ese proveedor falla, se para el
           patio. Y es un porcentaje: la diferencia va en puntos. */
        tono="inverso"
        deltaEn="puntos"
        desglose={
          <DesgloseSimple
            filas={stats?.providers ?? []}
            onElegir={(v) => onFacetas({ ...facetas, provider: [v] })}
          />
        }
        desgloseLabel="Por proveedor · toca uno para filtrar"
      />,
    );
  }

  if (espHoy?.principal && !filtrada(facetas.species)) {
    tarjetas.push(
      <CtpKpi
        key="especie"
        label="Especie principal"
        value={`${espHoy.principal.pct.toFixed(1)} %`}
        subValue={
          <>
            <span className="flex min-w-0 gap-1">
              <span className="min-w-0 truncate" title={espHoy.principal.value}>{espHoy.principal.value}</span>
              <span className="shrink-0">· {espHoy.distintos} especie{espHoy.distintos === 1 ? "" : "s"}</span>
            </span>
            <BarraReparto reparto={espHoy} />
          </>
        }
        icon={Tag}
        /* Sin delta: que el tornillo pase de 31 a 40 % no es bueno ni malo, y
           una flecha verde o roja haría creer que sí. */
        tono="neutral"
        desglose={
          <DesgloseSimple
            filas={stats?.species ?? []}
            onElegir={(v) => onFacetas({ ...facetas, species: [v] })}
          />
        }
        desgloseLabel="Por especie · toca una para filtrar"
      />,
    );
  }

  if (trozaHoy) {
    tarjetas.push(
      <CtpKpi
        key="troza"
        label="Troza promedio"
        value={`${trozaHoy.m3PorTroza.toFixed(3)} m³`}
        subValue={`${nf(trozaHoy.ptPorTroza)} pt por pieza · ${nf(trozaHoy.piezas)} ${
          trozaHoy.fuente === "trozas" ? "trozas medidas" : "piezas declaradas"
        }`}
        icon={PackageOpen}
        /* Trozas más grandes rinden más tabla por m³: subir es buena noticia. */
        actual={trozaHoy.m3PorTroza}
        previo={statsPrevios ? (trozaAntes?.m3PorTroza ?? null) : undefined}
        etiquetaPrevio={etiquetaPrevio}
      />,
    );
  }

  if (registroProm !== null) {
    const fuera = registroMax !== null && registroMax > PLAZO_REGISTRO_DIAS;
    tarjetas.push(
      <CtpKpi
        key="registro"
        label="Tiempo de registro"
        value={`${registroProm.toFixed(1)} día${registroProm === 1 ? "" : "s"}`}
        subValue={`hábiles de la guía al libro · plazo ${PLAZO_REGISTRO_DIAS}${
          registroMax !== null ? ` · el más lento ${registroMax}` : ""
        }`}
        icon={Clock}
        /* Tardar más es peor; y si alguna guía pasó el plazo el número se pinta
           en ámbar aunque el promedio esté bien — el promedio no la esconde. */
        tono="inverso"
        emphasis={fuera ? "warning" : undefined}
        actual={registroProm}
        previo={statsPrevios ? (statsPrevios.registroDiasHabilesProm ?? null) : undefined}
        etiquetaPrevio={etiquetaPrevio}
      />,
    );
  }

  if (costoHoy) {
    tarjetas.push(
      <CtpKpi
        key="costo"
        label="Costo por m³"
        value={soles(costoHoy.porM3)}
        subValue={`${soles(costoHoy.total)} · ${costoHoy.pctValorizado.toFixed(0)} % del volumen valorizado`}
        icon={TrendingUp}
        /* Pagar más por m³ es peor para el aserradero. */
        tono="inverso"
        actual={costoHoy.porM3}
        previo={statsPrevios ? (costoAntes?.porM3 ?? null) : undefined}
        etiquetaPrevio={etiquetaPrevio}
      />,
    );
  }

  if (trazHoy) {
    const completo = trazHoy.minimo.pct >= 100;
    tarjetas.push(
      <CtpKpi
        key="trazabilidad"
        label="Trazabilidad"
        value={`${trazHoy.minimo.pct.toFixed(0)} %`}
        subValue={
          completo
            ? `trozas, origen y constancia en los ${nf(trazHoy.minimo.total)}`
            : `el eslabón más débil: ${trazHoy.minimo.label.toLowerCase()} (${nf(trazHoy.minimo.con)} de ${nf(trazHoy.minimo.total)})`
        }
        icon={Route}
        emphasis={completo ? "success" : "warning"}
        actual={trazHoy.minimo.pct}
        previo={statsPrevios ? (trazAntes?.minimo.pct ?? null) : undefined}
        etiquetaPrevio={etiquetaPrevio}
        deltaEn="puntos"
        desglose={<Eslabones eslabones={trazHoy.eslabones} />}
        desgloseLabel="Ver los tres eslabones"
      />,
    );
  }

  /* CITES se queda arriba, y sólo cuando hay: es un dato del período, no una falta. */
  if (stats?.citesCount) {
    tarjetas.push(
      <CtpKpi
        key="cites"
        label="Especies CITES"
        value={nf(stats.citesCount)}
        subValue={`${Number(stats.citesVolumeM3).toFixed(2)} m³ protegidos · ${citesOn ? "filtrando" : "ver"}`}
        icon={AlertCircle}
        actual={stats.citesCount}
        previo={statsPrevios ? statsPrevios.citesCount : undefined}
        etiquetaPrevio={etiquetaPrevio}
        /* Ni buena ni mala noticia: una especie protegida CON permiso es legal y
           no resta en el score. Pintarla de rojo al subir enseñaría a esconder
           madera que está en regla. */
        tono="neutral"
        onClick={onCites}
        filtrando={citesOn}
      />,
    );
  }

  const panel = (
    /* Todas detrás del botón «Indicadores» (Brandon, 2026-09-03). */
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
            /* Las piezas sólo si el papel las declara: un «0 piezas» al lado de
               las trozas cargadas se lee como un error de la pantalla. */
            (stats.totalPieces > 0 ? ` · ${nf(stats.totalPieces)} piezas` : "") +
            (stats.byStatus.pendiente > 0 ? ` · ${nf(stats.byStatus.pendiente)} por validar` : "") +
            (stats.lateCount > 0 ? ` · ${nf(stats.lateCount)} fuera de plazo` : "")
          : "Leyendo el período…"
      }
      tarjetas={tarjetas}
    />
  );

  return (
    <div className="space-y-2">
      {panel}
      <BarraDeuda items={deudas} vacio="Todo el período está validado, a tiempo, con su origen y con costo." />
    </div>
  );
}
