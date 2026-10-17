"use client";

/**
 * useLothMapaDerivados — lo que el mapa del Libro TH CALCULA con lo cargado:
 * los puntos dibujables, el censo pintado por categoría del POA, el
 * cumplimiento EUDR, la leyenda, la zona UTM sugerida y el checklist del plano.
 *
 * Puro cómputo (useMemo): nada acá pide ni guarda nada. El checklist del plano
 * sale de acá porque lo leen DOS lugares —el bloque «Plano del expediente» y
 * el camino de impresión— y tienen que decir lo mismo.
 */

import { useMemo } from "react";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import { computeEudrReadiness, hasParcela, pointInPolygon, type LatLng, type LothParcela, type OpForEudr } from "@/lib/forestal/loth-geo";
import { areaDeSuPlan, readinessPorPermiso, type AreaEudr } from "@/lib/forestal/loth-eudr-print";
import { dominantZone, zoneLabel } from "@/lib/forestal/loth-utm";
import { viaMeta, type LothCartografia } from "@/lib/forestal/loth-cartografia";
import { analizarPoa, type PoaConfig } from "@/lib/forestal/loth-poa";
import { CLASE_ARBOL_LABEL, CLASE_ARBOL_TOKEN, CLASES_ARBOL, claseDelArbol } from "@/lib/forestal/loth-mapa-arboles";
import { evaluarPlano } from "@/lib/forestal/loth-plano-checklist";
import type { LegendItem } from "../LothMapaChrome";
import {
  toGeo,
  toCenso,
  PARCELA_COLOR,
  SECTION_COLOR,
  SECTION_LABEL,
  type CensusTreeDTO,
  type GeoEntry,
} from "../loth-mapa-shared";
import type { CaratulaMapa, EspeciePlanMapa, PlanActivoMapa } from "./use-loth-mapa-datos";

function toOps(entries: LothEntryDTO[]): (OpForEudr & { planId: string | null })[] {
  return entries.map((e) => ({
    planId: e.planId ?? null,
    section: e.section,
    lat: e.gpsLat != null ? Number(e.gpsLat) : null,
    lng: e.gpsLng != null ? Number(e.gpsLng) : null,
    cites: e.cites,
    status: e.status,
  }));
}

/**
 * Con «Todos» (ADR-462): cada operación contra el área de SU permiso, la misma
 * regla de la DDS (`areaDeSuPlan`). `dentro: null` = su permiso no tiene área ni
 * hay una del negocio. Las áreas = la del negocio + la de cada permiso.
 */
export function medirContraSuArea(geo: readonly GeoEntry[], areas: readonly AreaEudr[]): GeoEntry[] {
  return geo.map((g) => {
    const a = areaDeSuPlan(g.planId, areas);
    return { ...g, dentro: a ? pointInPolygon([g.lat, g.lng], a.parcela.vertices) : null };
  });
}

/** Un punto sin permiso conocido (un árbol del censo) está «fuera» sólo si hay áreas y no cae en ninguna. */
export function fueraDeTodasLasAreas(punto: LatLng, areas: readonly AreaEudr[]): boolean {
  const conArea = areas.filter((a) => hasParcela(a.parcela));
  return conArea.length > 0 && !conArea.some((a) => pointInPolygon(punto, a.parcela.vertices));
}

interface Deps {
  raw: LothEntryDTO[] | null;
  trees: CensusTreeDTO[];
  planSpecies: EspeciePlanMapa[];
  poaConfig: PoaConfig;
  parcela: LothParcela;
  /** Sólo con «Todos»: las áreas de cada permiso (con área). `undefined` = un solo alcance, un área. */
  areasPermisos?: AreaEudr[];
  plan: PlanActivoMapa | null;
  caratula: CaratulaMapa | null;
  carto: LothCartografia;
  showCenso: boolean;
  showGrid: boolean;
  hidden: Set<string>;
}

export function useLothMapaDerivados(d: Deps) {
  const { raw, trees, planSpecies, poaConfig, parcela, areasPermisos, plan, caratula, carto, showCenso, showGrid, hidden } = d;

  const geoAll = useMemo(() => (raw ? toGeo(raw) : []), [raw]);
  const censoBase = useMemo(() => toCenso(trees), [trees]);
  /**
   * El mapa pinta cada árbol por su categoría del POA (aprovechable, semillero,
   * bajo DMC): el mismo criterio legal que el cuadro del Plan de Manejo, para
   * que en campo se vea de un golpe qué se puede tumbar.
   */
  const censoAll = useMemo(() => {
    if (censoBase.length === 0) return censoBase;
    const analisis = analizarPoa({
      trees: censoBase.map((t) => ({
        id: t.id,
        treeCode: t.code,
        speciesCommon: t.species,
        // El censo del mapa guarda el DAP sólo si vino en el DTO original.
        dapM: t.dapM,
        volumenEstimadoM3: t.volumeM3,
        estado: t.estado,
      })),
      species: planSpecies.map((s) => ({
        speciesCommon: s.speciesCommon,
        volumenAutorizadoM3: Number(s.volumenAutorizadoM3 ?? 0),
        arbolesAutorizados: s.arbolesAutorizados,
      })),
      areaHa: plan?.areaHa ?? null,
      config: poaConfig,
    });
    const cat = new Map(analisis.arboles.map((a) => [a.id, a.categoria]));
    return censoBase.map((t) => ({ ...t, categoria: cat.get(t.id) }));
  }, [censoBase, planSpecies, plan, poaConfig]);

  const censoShown = useMemo(() => (showCenso ? censoAll : []), [showCenso, censoAll]);
  const sectionsPresent = useMemo(() => Array.from(new Set(geoAll.map((g) => g.section))), [geoAll]);
  /** Con «Todos»: la del negocio + la de cada permiso (null = un solo área). */
  const areasMedidas = useMemo<AreaEudr[] | null>(
    () => (areasPermisos ? [{ planId: null, nombre: "Negocio", parcela }, ...areasPermisos] : null),
    [areasPermisos, parcela],
  );
  const geoShown = useMemo(() => {
    const visibles = geoAll.filter((g) => !hidden.has(g.section));
    return areasMedidas ? medirContraSuArea(visibles, areasMedidas) : visibles;
  }, [geoAll, hidden, areasMedidas]);
  const readiness = useMemo(
    () => (areasMedidas ? readinessPorPermiso(raw ? toOps(raw) : [], areasMedidas) : computeEudrReadiness(raw ? toOps(raw) : [], parcela)),
    [raw, parcela, areasMedidas],
  );
  const declarada = hasParcela(parcela);

  /**
   * Leyenda del censo: una fila por CONDICIÓN presente (forma + color, la del
   * regente o, si no la trae, la del POA). Lo que pasó después —talado,
   * trozado, despachado, en el CTP— lo pone la leyenda de etapas del libro
   * (`useLothMapaArboles().leyendaEtapas`), que sabe lo que el censo no.
   * Es lo que dibuja `use-loth-canvas-arboles`.
   */
  const censoLeyenda = useMemo<LegendItem[]>(() => {
    const clases = new Set(censoAll.map((t) => claseDelArbol(t)));
    return CLASES_ARBOL.filter((c) => clases.has(c)).map((c) => ({
      label: CLASE_ARBOL_LABEL[c],
      color: CLASE_ARBOL_TOKEN[c],
      shape: "arbol" as const,
      clase: c,
      estado: "en_pie",
    }));
  }, [censoAll]);

  const legendItems = useMemo<LegendItem[]>(
    () => [
      ...(declarada ? [{ label: "Área de aprovechamiento", color: PARCELA_COLOR, shape: "poly" as const }] : []),
      ...(showCenso ? censoLeyenda : []),
      ...sectionsPresent
        .filter((s) => !hidden.has(s))
        .map((s) => ({ label: SECTION_LABEL[s] ?? s, color: SECTION_COLOR[s] ?? "#334155", shape: "dot" as const })),
      ...[...new Map(carto.vias.map((v) => [viaMeta(v.tipo).label, viaMeta(v.tipo).color])).entries()].map(([label, color]) => ({
        label,
        color,
        shape: "line" as const,
      })),
      ...(showGrid ? [{ label: "Cuadrícula UTM (WGS 84)", color: "#64748b", shape: "grid" as const }] : []),
    ],
    [declarada, showCenso, censoLeyenda, sectionsPresent, hidden, showGrid, carto.vias],
  );

  /** Zona UTM sugerida al importar: la del polígono o la del censo. */
  const zonaSugerida = useMemo(() => {
    const ref = parcela.vertices.length ? parcela.vertices : censoAll.map((t): LatLng => [t.lat, t.lng]);
    if (ref.length === 0) return "18L";
    return zoneLabel(dominantZone(ref), ref[0][0] < 0);
  }, [parcela.vertices, censoAll]);

  /**
   * El checklist del plano, vivo: lo lee el bloque del plano y también el
   * camino de impresión, así que los dos dicen lo mismo.
   */
  const checkPlano = useMemo(
    () =>
      evaluarPlano({
        parcela,
        cartografia: carto,
        ubicacion: {
          distrito: caratula?.distrito ?? null,
          provincia: caratula?.provincia ?? null,
          departamento: caratula?.departamento ?? plan?.region ?? null,
        },
        zonaUtm: zonaSugerida,
      }),
    [parcela, carto, caratula, plan, zonaSugerida],
  );

  return {
    geoAll,
    censoAll,
    censoShown,
    sectionsPresent,
    geoShown,
    readiness,
    declarada,
    areasMedidas,
    legendItems,
    zonaSugerida,
    checkPlano,
    totalPuntos: geoAll.length + censoAll.length,
  };
}

export type LothMapaDerivados = ReturnType<typeof useLothMapaDerivados>;
