/**
 * paquetes-de-jornada — los grupos de una jornada del reparto como paquetes
 * del Libro (uno por grupo). Vivía en `use-registrar-jornadas` ("use client");
 * se movió acá tal cual para que el servidor del Recorrido del permiso
 * (ADR-519) arme los mismos paquetes que la pantalla. PURO.
 */

import { presentacionSugerida, productoDelTipoComercial } from "./loctp-catalogos";
import { sugerirCodigoPaquete } from "./produccion-paquetes";
import { aCm, aMetros } from "./medida-cabe-en-troza";
import type { AsignacionGrupo, AsignacionMedida } from "./cubicacion-reparto";

/* Las tres a 2 decimales: es lo que guarda la base (`espesorCm`/`anchoCm`/`largoM`
   son `Decimal(…,2)`). Mostrar 3,048 m y guardar 3,05 dejaba la pantalla
   distinta de lo guardado. */
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Las medidas de la pieza tipo en las unidades del paquete del Libro (cm y m).
 * La cubicación las trae en las SUYAS (`uEspesor`/`uAncho`/`uLargo`: casi
 * siempre pulgadas y pies): pasarlas tal cual dejó en QA un paquete
 * «2 cm × 8 cm × 10 m» que era un 2"×8"×10'. Unidad desconocida = `null`
 * (no se adivina), como en `aCm`/`aMetros`.
 */
export function medidasDelPaquete(m: AsignacionMedida | undefined): { espesorCm: number | null; anchoCm: number | null; largoM: number | null } {
  if (!m) return { espesorCm: null, anchoCm: null, largoM: null };
  const espesor = aCm(m.espesor, m.uEspesor);
  const ancho = aCm(m.ancho, m.uAncho);
  const largo = aMetros(m.largo, m.uLargo);
  return {
    espesorCm: espesor == null ? null : r2(espesor),
    anchoCm: ancho == null ? null : r2(ancho),
    largoM: largo == null ? null : r2(largo),
  };
}

/** Un paquete tal como lo pide `declarar_produccion` / `ampliar_produccion`. */
export interface PaqueteParaLibro {
  codigo: string;
  productType: string;
  presentacion: string | null;
  cantidad: number;
  volumenM3: number;
  espesorCm: number | null;
  anchoCm: number | null;
  largoM: number | null;
  observations: string | null;
}

/**
 * Los grupos de una jornada (o de un complemento) como paquetes del Libro:
 * uno por grupo, con un código nuevo reservado en `reservados` para que dos
 * pedidos seguidos no repitan número.
 */
export function paquetesDeGrupos(
  grupos: readonly AsignacionGrupo[],
  fecha: string,
  existentes: readonly string[],
  reservados: string[],
): PaqueteParaLibro[] {
  return grupos.map((g) => {
    const codigo = sugerirCodigoPaquete(existentes, { hoy: new Date(`${fecha}T12:00:00`), ocupados: reservados });
    reservados.push(codigo);
    /* Una medida por grupo es lo común; con varias se declara la primera y el
       resto queda en la observación, porque el paquete del libro tiene UN
       juego de medidas. */
    const medidas = medidasDelPaquete(g.medidas[0]);
    /* El libro se escribe con el nombre del CATÁLOGO, no con el del patio:
       «Comercial» entraba tal cual y la presentación quedaba vacía porque el
       catálogo busca «MADERA ASERRADA (COMERCIAL)». */
    const producto = productoDelTipoComercial(g.label) ?? g.label;
    return {
      codigo,
      productType: producto,
      presentacion: presentacionSugerida(producto) ?? null,
      cantidad: g.piezas,
      volumenM3: g.m3,
      ...medidas,
      observations:
        g.medidas.length > 1 ? `Medidas: ${g.medidas.map((x) => `${x.medida} (${x.piezas})`).join(", ")}` : null,
    };
  });
}

