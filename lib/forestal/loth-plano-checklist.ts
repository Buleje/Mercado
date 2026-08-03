/**
 * loth-plano-checklist — los requisitos del plano del expediente, evaluados
 * contra los datos reales del libro.
 *
 * "Este suele ser el punto donde más expedientes tienen problemas": el mapa se
 * arma, se imprime, y recién en mesa de partes alguien nota que falta la zona
 * UTM o el cuadro de coordenadas. Esta lista deja de ser un papel al lado del
 * monitor y pasa a ser un chequeo que el módulo corre solo, con el camino para
 * resolver cada faltante.
 *
 * PURO y client-safe: lo consumen el panel del mapa y la lámina imprimible, así
 * que los dos dicen exactamente lo mismo.
 */

import { hasPredio, type LothCartografia } from "./loth-cartografia";
import { centroid, hasParcela, polygonAreaHa, type LatLng, type LothParcela } from "./loth-geo";
import { pointInPolygon } from "./loth-geo";

export interface RequisitoPlano {
  id: string;
  /** El requisito tal como lo pide el expediente. */
  label: string;
  cumple: boolean;
  /** Qué se encontró (o qué falta), en una línea. */
  detalle: string;
  /** Dónde se resuelve, con el nombre del control real de la pantalla. */
  comoResolver?: string;
  /**
   * `false` = el módulo lo garantiza siempre (norte, escala, datum): se listan
   * para que el que arma el expediente pueda tildarlos, no porque puedan faltar.
   */
  accionable: boolean;
}

export interface ChecklistPlano {
  requisitos: RequisitoPlano[];
  cumplidos: number;
  total: number;
  /** Los que faltan Y dependen de cargar algo. */
  pendientes: RequisitoPlano[];
  listo: boolean;
}

export interface UbicacionPlano {
  distrito?: string | null;
  provincia?: string | null;
  departamento?: string | null;
}

const lleno = (v: string | null | undefined): boolean => Boolean((v ?? "").trim());

/** El área declarada tiene que caer DENTRO del predio: es lo que se revisa. */
export function verticesFueraDelPredio(area: LatLng[], predio: LatLng[]): number {
  if (predio.length < 3) return 0;
  return area.filter((v) => !pointInPolygon(v, predio)).length;
}

export function evaluarPlano(opts: {
  parcela: LothParcela;
  cartografia: LothCartografia;
  ubicacion: UbicacionPlano | null;
  /** Zona UTM resuelta para la lámina (la calcula `loth-utm` desde el centroide). */
  zonaUtm: string | null;
}): ChecklistPlano {
  const { parcela, cartografia, ubicacion, zonaUtm } = opts;
  const area = parcela.vertices ?? [];
  const conArea = hasParcela(parcela);
  const predio = cartografia.predio;
  const conPredio = hasPredio(predio);
  const u = ubicacion ?? {};

  const areaHa = conArea ? polygonAreaHa(area) : 0;
  const predioHa = conPredio ? polygonAreaHa(predio.vertices) : 0;
  const fuera = conArea && conPredio ? verticesFueraDelPredio(area, predio.vertices) : 0;

  const faltaUbicacion = [
    ["nombre del predio", predio.nombre],
    ["sector", predio.sector],
    ["comunidad", predio.comunidad],
    ["distrito", u.distrito],
    ["provincia", u.provincia],
    ["departamento", u.departamento],
  ]
    .filter(([, v]) => !lleno(v as string))
    .map(([k]) => k as string);

  const requisitos: RequisitoPlano[] = [
    {
      id: "predio",
      label: "Polígono completo del predio",
      cumple: conPredio,
      detalle: conPredio
        ? `${predio.vertices.length} vértices · ${predioHa.toFixed(2)} ha`
        : "No se levantó el contorno del inmueble.",
      comoResolver: "Mapa → Dibujar → Predio (o pegar el cuadro de coordenadas).",
      accionable: true,
    },
    {
      id: "area",
      label: "Polígono exacto del área de aprovechamiento",
      cumple: conArea,
      detalle: conArea ? `${area.length} vértices · ${areaHa.toFixed(2)} ha` : "No se dibujó el área.",
      comoResolver: "Mapa → Dibujar → Área.",
      accionable: true,
    },
    {
      id: "contenido",
      label: "El área declarada cae dentro del predio",
      cumple: conArea && conPredio && fuera === 0,
      detalle: !conPredio
        ? "Sin el contorno del predio no se puede verificar."
        : fuera === 0
          ? "Todos los vértices del área caen dentro del predio."
          : `${fuera} vértice(s) del área quedan FUERA del predio.`,
      comoResolver: "Corregí el contorno que corresponda antes de imprimir.",
      accionable: true,
    },
    {
      id: "vertices-utm",
      label: "Coordenadas UTM de cada vértice",
      cumple: conArea,
      detalle: conArea
        ? `La lámina imprime el cuadro con los ${area.length} vértices${conPredio ? ` y los ${predio.vertices.length} del predio` : ""}.`
        : "Salen del polígono: sin polígono no hay cuadro.",
      accionable: true,
    },
    {
      id: "datum",
      label: "Datum WGS 84",
      cumple: true,
      detalle: "Todo el módulo trabaja en WGS 84; la lámina lo declara en el cajetín.",
      accionable: false,
    },
    {
      id: "zona",
      label: "Zona UTM correspondiente",
      cumple: Boolean(zonaUtm),
      detalle: zonaUtm ? `Zona ${zonaUtm}, derivada del centroide.` : "Se resuelve al dibujar el polígono.",
      accionable: true,
    },
    {
      id: "superficie",
      label: "Superficie en hectáreas",
      cumple: conArea,
      detalle: conArea
        ? conPredio
          ? `Área ${areaHa.toFixed(2)} ha · predio ${predioHa.toFixed(2)} ha`
          : `Área ${areaHa.toFixed(2)} ha (falta la del predio)`
        : "Se calcula del polígono.",
      accionable: true,
    },
    {
      id: "norte",
      label: "Norte",
      cumple: true,
      detalle: "Rosa de los vientos en la lámina y en el mapa.",
      accionable: false,
    },
    {
      id: "escala",
      label: "Escala",
      cumple: true,
      detalle: "Escala numérica y gráfica, ajustadas al encuadre de la lámina.",
      accionable: false,
    },
    {
      id: "accesos",
      label: "Vías de acceso",
      cumple: cartografia.vias.length > 0 || cartografia.accesos.length > 0,
      detalle:
        cartografia.vias.length > 0 || cartografia.accesos.length > 0
          ? `${cartografia.vias.length} vía(s) dibujada(s) · ${cartografia.accesos.length} tramo(s) en el cuadro de acceso.`
          : "No hay vías dibujadas ni tramos declarados.",
      comoResolver: "Mapa → Dibujar → Vía, y el cuadro ACCESO en el panel de contexto.",
      accionable: true,
    },
    {
      id: "ubicacion",
      label: "Nombre del predio, sector, comunidad, distrito, provincia y departamento",
      cumple: faltaUbicacion.length === 0,
      detalle:
        faltaUbicacion.length === 0
          ? "Los seis datos están cargados."
          : `Falta: ${faltaUbicacion.join(" · ")}.`,
      comoResolver: "Nombre/sector/comunidad en el panel del predio; el resto en la carátula del libro.",
      accionable: true,
    },
    {
      id: "cuadro",
      label: "Cuadro de coordenadas",
      cumple: conArea,
      detalle: conArea ? "Va al pie de la lámina de ubicación." : "Necesita el polígono.",
      accionable: true,
    },
    {
      id: "centroide",
      label: "Ubicación del centroide",
      cumple: conArea && centroid(area) !== null,
      detalle: conArea ? "Marcado en el mapa y en el cajetín, en UTM." : "Se calcula del polígono.",
      accionable: true,
    },
  ];

  const cumplidos = requisitos.filter((r) => r.cumple).length;
  return {
    requisitos,
    cumplidos,
    total: requisitos.length,
    pendientes: requisitos.filter((r) => !r.cumple && r.accionable),
    listo: cumplidos === requisitos.length,
  };
}
