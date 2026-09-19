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
import { computeEudrReadiness, hasParcela, type LatLng, type LothParcela, type OpForEudr } from "@/lib/forestal/loth-geo";
import { dominantZone, zoneLabel } from "@/lib/forestal/loth-utm";
import { viaMeta, type LothCartografia } from "@/lib/forestal/loth-cartografia";
import { analizarPoa, CATEGORIA_COLOR, CATEGORIA_LABEL, type PoaConfig } from "@/lib/forestal/loth-poa";
import { evaluarPlano } from "@/lib/forestal/loth-plano-checklist";
import type { LegendItem } from "../LothMapaChrome";
import {
  toGeo,
  toCenso,
  CENSO_ESTADO_COLOR,
  CENSO_ESTADO_LABEL,
  PARCELA_COLOR,
  SECTION_COLOR,
  SECTION_LABEL,
  type CensusTreeDTO,
} from "../loth-mapa-shared";
import type { CaratulaMapa, EspeciePlanMapa, PlanActivoMapa } from "./use-loth-mapa-datos";

function toOps(entries: LothEntryDTO[]): OpForEudr[] {
  return entries.map((e) => ({
    section: e.section,
    lat: e.gpsLat != null ? Number(e.gpsLat) : null,
    lng: e.gpsLng != null ? Number(e.gpsLng) : null,
    cites: e.cites,
    status: e.status,
  }));
}

interface Deps {
  raw: LothEntryDTO[] | null;
  trees: CensusTreeDTO[];
  planSpecies: EspeciePlanMapa[];
  poaConfig: PoaConfig;
  parcela: LothParcela;
  plan: PlanActivoMapa | null;
  caratula: CaratulaMapa | null;
  carto: LothCartografia;
  showCenso: boolean;
  showGrid: boolean;
  hidden: Set<string>;
}

export function useLothMapaDerivados(d: Deps) {
  const { raw, trees, planSpecies, poaConfig, parcela, plan, caratula, carto, showCenso, showGrid, hidden } = d;

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
  const geoShown = useMemo(() => geoAll.filter((g) => !hidden.has(g.section)), [geoAll, hidden]);
  const readiness = useMemo(() => computeEudrReadiness(raw ? toOps(raw) : [], parcela), [raw, parcela]);
  const declarada = hasParcela(parcela);

  /** Entradas de leyenda del censo: por categoría POA si la hay, si no por estado. */
  const censoCategorias = useMemo(() => {
    const out = new Map<string, { cat?: (typeof censoAll)[number]["categoria"]; estado: string }>();
    for (const t of censoAll) out.set(t.categoria ?? `estado:${t.estado}`, { cat: t.categoria, estado: t.estado });
    return [...out.values()];
  }, [censoAll]);

  const legendItems = useMemo<LegendItem[]>(
    () => [
      ...(declarada ? [{ label: "Área de aprovechamiento", color: PARCELA_COLOR, shape: "poly" as const }] : []),
      ...(showCenso
        ? censoCategorias.map((c) =>
            c.cat
              ? { label: `Censo · ${CATEGORIA_LABEL[c.cat]}`, color: CATEGORIA_COLOR[c.cat], shape: "tree" as const }
              : { label: `Censo · ${CENSO_ESTADO_LABEL[c.estado] ?? c.estado}`, color: CENSO_ESTADO_COLOR[c.estado] ?? "#15803d", shape: "tree" as const },
          )
        : []),
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
    [declarada, showCenso, censoCategorias, sectionsPresent, hidden, showGrid, carto.vias],
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
    legendItems,
    zonaSugerida,
    checkPlano,
    totalPuntos: geoAll.length + censoAll.length,
  };
}

export type LothMapaDerivados = ReturnType<typeof useLothMapaDerivados>;
