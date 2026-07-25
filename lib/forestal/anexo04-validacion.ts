/**
 * anexo04-validacion — el checklist ANTES de emitir. Un ANEXO N° 04 sin GTF, sin
 * numerar o sin firmante es papel que la ARFFS devuelve, y el operario se entera
 * en ventanilla (a 3 horas de camino del aserradero).
 *
 * NO bloquea la descarga a propósito: el formato oficial se puede imprimir en
 * blanco para llenarlo a mano, y ese es un uso legítimo. Avisa, que es distinto.
 *
 * PURO: sin DOM. Los "errores" son lo que invalida el documento; los "avisos"
 * son lo que un fiscalizador va a preguntar.
 */
import { toInches, toFeet, type PiezaCubicada } from "./cubicacion";
import type { Anexo04, DatosAnexo04 } from "./anexo04-serfor";

export type NivelAviso = "error" | "aviso";

export interface AvisoAnexo04 {
  nivel: NivelAviso;
  /** Qué falta o qué llama la atención, en una línea y en criollo. */
  mensaje: string;
}

/** Bloques sin especie identificada (el anexo pide (4) Especie sí o sí). */
const bloquesSinEspecie = (anexo: Anexo04): number =>
  anexo.hojas.reduce((a, h) => a + h.bloques.filter((b) => b.especie === "SIN ESPECIE").length, 0);

/**
 * Medida que un fiscalizador cuestionaría. OJO: NO se reusa `medidaSospechosa`
 * de la voz — esa exige largo ≥ 2 pies porque está calibrada para atrapar
 * dictados mal entendidos, y marcaría como rara la **paquetería corta de 1,5
 * pies** que aparece en las GTF reales. Un checklist que llora en falso enseña
 * a ignorarlo. Acá sólo se marca lo físicamente incoherente.
 */
const medidaCuestionable = (e: number, a: number, l: number): boolean =>
  e > a ||                       // más gruesa que ancha: casi siempre está dada vuelta
  e <= 0 || a <= 0 || l <= 0 ||  // no existe
  e > 12 || a > 30 || l > 30;    // fuera de lo que sale de un aserradero

/** Piezas con medidas cuestionables: no invalidan el anexo, pero se revisan. */
function piezasRaras(piezas: PiezaCubicada[]): number {
  return piezas.filter((p) =>
    medidaCuestionable(
      toInches(p.espesor, p.uEspesor),
      toInches(p.ancho, p.uAncho),
      toFeet(p.largo, p.uLargo),
    ),
  ).length;
}

/**
 * Revisa el anexo tal como se va a imprimir. Devuelve la lista de avisos en
 * orden de gravedad (errores primero).
 */
export function validarAnexo04(
  datos: DatosAnexo04,
  anexo: Anexo04,
  piezas: PiezaCubicada[],
): AvisoAnexo04[] {
  const avisos: AvisoAnexo04[] = [];
  const vacio = (v: string | undefined) => !v || !v.trim();

  if (piezas.length === 0) {
    avisos.push({ nivel: "error", mensaje: "No hay medidas cargadas: la hoja va a salir en blanco." });
  }
  if (vacio(datos.gtf)) {
    avisos.push({ nivel: "error", mensaje: "Falta la (2) GTF N°: el anexo ampara una guía, sin ella no vale." });
  }
  if (vacio(datos.numero)) {
    avisos.push({ nivel: "error", mensaje: "Falta el (1) N° del anexo." });
  }
  if (vacio(datos.firmante)) {
    avisos.push({ nivel: "error", mensaje: "Falta el (14) nombre del emisor que firma." });
  }
  if (vacio(datos.documento)) {
    avisos.push({ nivel: "aviso", mensaje: "Falta el (15) documento de identidad del emisor." });
  }
  if (vacio(datos.cargo)) {
    avisos.push({ nivel: "aviso", mensaje: "Falta el (16) cargo que desempeña el emisor." });
  }
  if (vacio(datos.empresa)) {
    avisos.push({ nivel: "aviso", mensaje: "Falta la razón social del CTP emisor." });
  }

  const sinEspecie = bloquesSinEspecie(anexo);
  if (sinEspecie > 0) {
    avisos.push({
      nivel: "error",
      mensaje: `${sinEspecie} bloque${sinEspecie === 1 ? "" : "s"} sin (4) Especie: asigná la especie a esas piezas.`,
    });
  }

  const raras = piezasRaras(piezas);
  if (raras > 0) {
    avisos.push({
      nivel: "aviso",
      mensaje: `${raras} medida${raras === 1 ? "" : "s"} fuera de lo común: revisá antes de firmar.`,
    });
  }

  if (piezas.length > 0 && anexo.totalM3 <= 0) {
    avisos.push({ nivel: "error", mensaje: "El (3) volumen total dio 0: revisá las medidas." });
  }

  return avisos.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "error" ? -1 : 1));
}

/** ¿Se puede presentar tal como está? (sin errores; los avisos no invalidan). */
export const anexoPresentable = (avisos: AvisoAnexo04[]): boolean =>
  !avisos.some((a) => a.nivel === "error");
