/**
 * loth-mapa-tala-varios — «Elegir varios» del mapa: adapta el censo que ya
 * carga el mapa (`CensusTreeDTO`) y las líneas del libro (`LothEntryDTO`) al
 * MISMO cruce que usa «Ver censo» (`prepararArboles` + `resumirUsoDelCenso`
 * de `loth-censo-uso`), para que la planilla de tala en tanda vea la misma
 * disponibilidad y los mismos reparos aunque se entre desde el mapa.
 *
 * Puro: sin React, sin DOM. Lo usa `useLothMapaTalaVarios`.
 */

import {
  prepararArboles,
  resumirUsoDelCenso,
  type ArbolCensoTala,
  type ArbolParaElegir,
  type LineaParaUso,
} from "@/lib/forestal/loth-censo-uso";
import type { LothEntryDTO } from "@/lib/forestal/loth-constants";
import type { PoaConfig } from "@/lib/forestal/loth-poa";
import type { CensusTreeDTO } from "./loth-mapa-shared";

const num = (v: string | number | null | undefined): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** El árbol del censo tal como lo trae el mapa, en la forma que pide `prepararArboles`. */
export function aArbolCensoTala(t: CensusTreeDTO): ArbolCensoTala {
  return {
    id: t.id,
    treeCode: t.treeCode,
    speciesCommon: t.speciesCommon,
    speciesScientific: t.speciesScientific?.trim() || null,
    speciesNative: t.speciesNative?.trim() || null,
    cites: Boolean(t.cites),
    dapM: num(t.dapM),
    hcM: num(t.alturaComercialM),
    volM3: num(t.volumenEstimadoM3),
    utmZona: t.utmZona ?? null,
    utmX: num(t.utmX),
    utmY: num(t.utmY),
    condicion: t.condicion?.trim() || null,
    // El mapa no trae la nota de campo del censo (no la necesita para pintar):
    // no es un dato que se pierda, la ficha del mapa nunca la mostró.
    notes: null,
    estadoCenso: t.estado ?? "en_pie",
  };
}

/** Una línea del libro, en la forma que pide `resumirUsoDelCenso`. */
export function lineaDeEntry(e: LothEntryDTO): LineaParaUso {
  return {
    section: e.section,
    lineNo: e.lineNo,
    entryDate: e.entryDate,
    treeCode: e.treeCode,
    trozaCode: e.trozaCode,
    volumeM3: num(e.volumeM3),
  };
}

/**
 * El censo del mapa cruzado con el libro: el MISMO `ArbolParaElegir` que
 * arma «Ver censo» (`useCensoDeTala`), leído de lo que el mapa YA cargó
 * (`useLothMapaDatos`) — sin una segunda consulta al servidor. `raw` trae
 * anulados (`includeAnnulled=1`): sólo cuentan las líneas vigentes.
 */
export function arbolesDelMapaParaElegir(
  trees: readonly CensusTreeDTO[],
  raw: readonly LothEntryDTO[] | null,
  poaConfig: PoaConfig,
): ArbolParaElegir[] {
  const vigentes = (raw ?? []).filter((e) => e.status !== "anulado");
  const usos = resumirUsoDelCenso(vigentes.map(lineaDeEntry));
  return prepararArboles(trees.map(aArbolCensoTala), usos, poaConfig);
}

/** «Talar los 3 elegidos» — la misma frase que ofrece «Ver censo». */
export function etiquetaTalarVarios(n: number): string {
  if (n === 0) return "Talar los elegidos";
  if (n === 1) return "Talar el elegido";
  return `Talar los ${n} elegidos`;
}
