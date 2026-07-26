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
import { claveEmision, siguienteLibre, type AnexoEmitido } from "./anexo04-registro";

/** Lo que el despacho del Libro CTP declara amparar con esa GTF. */
export interface DeclaradoEnLibro {
  cantidad: number;
  /** Unidad de la línea del libro: "pt" | "m3" (otras no se comparan). */
  unidad: string | null;
  /** Piezas declaradas en la guía, si la línea las trae. */
  piezas?: number | null;
}

/** Tolerancia de redondeo: por debajo de esto, anexo y guía son lo mismo. */
const TOLERANCIA = 0.005; // 0,5 %

/** Contexto de la emisión: contra qué se coteja el papel que se va a firmar. */
export interface ContextoEmision {
  /** Línea de despacho desde la que se emite. */
  declarado?: DeclaradoEnLibro | null;
  /** Anexos ya emitidos del tenant (N° repetido y volumen ya amparado). */
  emitidos?: AnexoEmitido[];
  /** Despacho actual: acumula sólo los anexos de ESA guía. */
  ctpEntryId?: string;
  /** Ficha legal del CTP: el papel debe salir a nombre de lo registrado. */
  ficha?: IdentidadCtp | null;
}

export type NivelAviso = "error" | "aviso";

/** Campos que un aviso puede corregir solo. */
export type CampoSugerible = "numero" | "empresa" | "firmante" | "documento";

/** Identidad legal del CTP, como está registrada ante la ARFFS. */
export interface IdentidadCtp {
  razonSocial?: string;
  representante?: string;
  representanteDni?: string;
}

export interface AvisoAnexo04 {
  nivel: NivelAviso;
  /** Qué falta o qué llama la atención, en una línea y en criollo. */
  mensaje: string;
  /** Arreglo de un click, cuando el aviso tiene una respuesta obvia. */
  sugerencia?: { campo: CampoSugerible; valor: string; label: string };
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
  ctx: ContextoEmision = {},
): AvisoAnexo04[] {
  const { declarado, emitidos = [], ctpEntryId, ficha } = ctx;
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

  avisos.push(...cotejarConLibro(anexo, piezas, declarado, otrosDelDespacho(datos, emitidos, ctpEntryId)));
  avisos.push(...numeroRepetido(datos, emitidos));
  avisos.push(...discrepanciasConFicha(datos, ficha));

  return avisos.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "error" ? -1 : 1));
}

/**
 * Coteja lo que suma el anexo contra lo que la línea de despacho declara amparar.
 *
 * Por MÁS es ERROR y por menos es aviso, a propósito: un anexo que detalla más
 * madera de la que dice la guía es exactamente el hueco por donde se blanquea
 * volumen (misma lógica que los invariantes del Libro — `≤`, nunca `==`). Que
 * detalle de menos es corriente y legítimo: el despacho puede llevar producto
 * que no pasó por el cubicador.
 */
function cotejarConLibro(
  anexo: Anexo04,
  piezas: PiezaCubicada[],
  declarado: DeclaradoEnLibro | null | undefined,
  otros: AnexoEmitido[],
): AvisoAnexo04[] {
  if (!declarado || piezas.length === 0) return [];
  const unidad = (declarado.unidad ?? "").toLowerCase();
  if (unidad !== "pt" && unidad !== "m3") return [];   // sin unidad comparable, no se inventa
  const guia = Number(declarado.cantidad);
  if (!Number.isFinite(guia) || guia <= 0) return [];

  const avisos: AvisoAnexo04[] = [];
  const n = (v: number) => v.toLocaleString("es-PE", { maximumFractionDigits: 3 });

  const enAnexo = unidad === "pt" ? anexo.totalPt : anexo.totalM3;
  const dif = enAnexo - guia;
  const u = unidad === "pt" ? "PT" : "m³";
  if (Math.abs(dif) / guia > TOLERANCIA) {
    avisos.push(dif > 0
      ? { nivel: "error", mensaje: `El anexo detalla ${n(enAnexo)} ${u} y la guía declara ${n(guia)} ${u}: está amparando ${n(dif)} ${u} de más.` }
      : { nivel: "aviso", mensaje: `El anexo detalla ${n(enAnexo)} ${u} de los ${n(guia)} ${u} de la guía (faltan ${n(-dif)} ${u}).` });
  }

  // Σ de TODOS los anexos de esa guía ≤ lo declarado. Un anexo solo puede
  // cerrar perfecto y aun así duplicar volumen si ya se emitió otro antes.
  if (otros.length > 0) {
    const previo = otros.reduce((sum, a) => sum + (unidad === "pt" ? a.totalPt : a.totalM3), 0);
    const acumulado = previo + enAnexo;
    if ((acumulado - guia) / guia > TOLERANCIA) {
      avisos.push({
        nivel: "error",
        mensaje: `Esta guía ya tiene ${otros.length} anexo${otros.length === 1 ? "" : "s"} por ${n(previo)} ${u}: entre todos amparan ${n(acumulado)} ${u} de los ${n(guia)} ${u} declarados.`,
      });
    }
  }

  // Las piezas se cuentan, no se miden: acá no hay redondeo que tolerar.
  const piezasGuia = Number(declarado.piezas);
  if (Number.isFinite(piezasGuia) && piezasGuia > 0 && anexo.totalPiezas !== piezasGuia) {
    const difP = anexo.totalPiezas - piezasGuia;
    avisos.push(difP > 0
      ? { nivel: "error", mensaje: `El anexo lista ${n(anexo.totalPiezas)} piezas y la guía declara ${n(piezasGuia)}: ${n(difP)} de más.` }
      : { nivel: "aviso", mensaje: `El anexo lista ${n(anexo.totalPiezas)} de las ${n(piezasGuia)} piezas de la guía (faltan ${n(-difP)}).` });
  }

  return avisos;
}

/**
 * Otros anexos ya emitidos para el MISMO despacho, sin contar la versión previa
 * de este mismo papel: re-bajar un anexo corregido no puede acusarse a sí mismo
 * (la bandeja hace upsert por N° + GTF, así que esa fila es este documento).
 */
function otrosDelDespacho(datos: DatosAnexo04, emitidos: AnexoEmitido[], ctpEntryId?: string): AnexoEmitido[] {
  if (!ctpEntryId) return [];
  const propia = claveEmision(datos.numero, datos.gtf);
  return emitidos.filter((a) => a.ctpEntryId === ctpEntryId && claveEmision(a.numero, a.gtf) !== propia);
}

/**
 * El (1) N° identifica al documento: repetirlo en otra guía deja dos papeles
 * distintos con el mismo número, y ninguna ARFFS lo perdona.
 */
function numeroRepetido(datos: DatosAnexo04, emitidos: AnexoEmitido[]): AvisoAnexo04[] {
  const numero = datos.numero.trim().toLowerCase();
  if (!numero) return [];
  const choque = emitidos.find(
    (a) => a.numero.trim().toLowerCase() === numero && a.gtf.trim().toLowerCase() !== datos.gtf.trim().toLowerCase(),
  );
  if (!choque) return [];
  const libre = siguienteLibre(datos.numero, emitidos, datos.gtf);
  return [{
    nivel: "error",
    mensaje: `El N° ${datos.numero} ya se usó en la GTF ${choque.gtf || "(sin GTF)"}.`,
    ...(libre !== datos.numero
      ? { sugerencia: { campo: "numero" as const, valor: libre, label: `Usar ${libre}` } }
      : {}),
  }];
}

/**
 * Compara la cabecera del anexo con la Ficha legal del CTP. Es AVISO, no error:
 * un CTP puede tener nombre comercial distinto del registrado, o firmar un
 * apoderado. Pero que el papel salga a nombre de otro sin que nadie lo note es
 * justo lo que un fiscalizador marca — y se arregla de un click.
 */
function discrepanciasConFicha(datos: DatosAnexo04, ficha?: IdentidadCtp | null): AvisoAnexo04[] {
  if (!ficha) return [];
  const igual = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const avisos: AvisoAnexo04[] = [];

  const par = (
    campo: CampoSugerible,
    actual: string,
    registrado: string | undefined,
    queEs: string,
  ) => {
    if (!registrado?.trim() || !actual.trim() || igual(actual, registrado)) return;
    avisos.push({
      nivel: "aviso",
      mensaje: `${queEs} del anexo ("${actual.trim()}") no coincide con la ficha del CTP ("${registrado.trim()}").`,
      sugerencia: { campo, valor: registrado.trim(), label: `Usar ${registrado.trim()}` },
    });
  };

  par("empresa", datos.empresa, ficha.razonSocial, "La razón social");
  par("firmante", datos.firmante, ficha.representante, "El emisor (14)");
  par("documento", datos.documento, ficha.representanteDni, "El documento (15)");
  return avisos;
}

/** ¿Se puede presentar tal como está? (sin errores; los avisos no invalidan). */
export const anexoPresentable = (avisos: AvisoAnexo04[]): boolean =>
  !avisos.some((a) => a.nivel === "error");
