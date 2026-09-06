/**
 * plantacion-catalogo — los catálogos del Registro de Plantación Forestal (RNPF).
 *
 * Grounded contra D.S. N°020-2015-MINAGRI (Reglamento para la Gestión de las
 * Plantaciones Forestales y los Sistemas Agroforestales) y los Lineamientos
 * RNPF-SERFOR (verificados 2026-08-21, `serfor-osinfor-compliance`). Las
 * FINALIDADES son la Definición "g" del Reglamento, textual — no se inventan
 * categorías. El catálogo de especies es de apoyo (autocompletar nombre
 * científico): abierto, el operador puede escribir cualquier nombre común que
 * no esté acá — nunca una lista cerrada.
 *
 * PURO: sin React, sin fetch, sin DOM.
 */

export type TipoPersona = "natural" | "juridica";
export type TipoTramitePlantacion = "inscripcion" | "actualizacion";
export type EstadoPlantacion =
  | "borrador"
  | "en_elaboracion"
  | "completo"
  | "pendiente_documentos"
  | "listo_presentar";

export const ESTADOS_PLANTACION: { key: EstadoPlantacion; label: string; tono: "muted" | "info" | "warning" | "success" }[] = [
  { key: "borrador", label: "Borrador", tono: "muted" },
  { key: "en_elaboracion", label: "En elaboración", tono: "info" },
  { key: "pendiente_documentos", label: "Pendiente de documentos", tono: "warning" },
  { key: "completo", label: "Completo", tono: "success" },
  { key: "listo_presentar", label: "Listo para presentar", tono: "success" },
];

export const TIPOS_DOCUMENTO_IDENTIDAD = [
  { value: "dni", label: "DNI" },
  { value: "ce", label: "Carné de extranjería" },
  { value: "ruc", label: "RUC" },
  { value: "pasaporte", label: "Pasaporte" },
] as const;

export const TIPOS_VIA = [
  "Avenida", "Calle", "Jirón", "Pasaje", "Carretera", "Trocha", "Kilómetro", "Otro",
] as const;

/**
 * Finalidad de la plantación — Definición "g" del D.S. N°020-2015-MINAGRI:
 * "…fines de producción de madera o productos forestales diferentes a la
 * madera, de protección, de restauración ecológica, de recreación, de
 * provisión de servicios ambientales o cualquier combinación de los
 * anteriores." + el propio Reglamento incluye los sistemas agroforestales
 * dentro del alcance de "plantaciones forestales" (art. IV, Alcance).
 */
export const FINALIDADES_PLANTACION = [
  { value: "produccion_madera", label: "Producción de madera" },
  { value: "produccion_no_maderable", label: "Producción de productos forestales diferentes a la madera" },
  { value: "proteccion", label: "Protección" },
  { value: "restauracion_ecologica", label: "Restauración ecológica" },
  { value: "recreacion", label: "Recreación" },
  { value: "servicios_ambientales", label: "Provisión de servicios ambientales" },
  { value: "sistema_agroforestal", label: "Sistema agroforestal" },
  { value: "combinada", label: "Combinación de finalidades" },
] as const;

/** Sólo aplica cuando la finalidad es "Sistema agroforestal" — la clasificación
 *  que trae el propio Formato N°01 (sección 3, columna "Tipo"). */
export const TIPOS_SISTEMA_AGROFORESTAL = [
  "Árboles en asociación con cultivos",
  "Huertos caseros mixtos",
  "Árboles dispersos en potreros",
  "Cultivos en callejones",
  "Árboles para sombra de cultivos",
  "Taungya",
  "Cortina rompevientos",
  "Cercos vivos",
] as const;

export const TIPOS_VEGETATIVOS = [
  "Plantón a raíz desnuda",
  "Plantón en bolsa/envase",
  "Estaca",
  "Semilla directa (siembra directa)",
  "Brinzal",
  "Otro",
] as const;

export const TIPOS_TITULARIDAD_PREDIO = [
  { value: "propietario", label: "Propietario" },
  { value: "inversionista", label: "Inversionista" },
  { value: "posesionario", label: "Posesionario (costa/sierra, D.L. N°1283)" },
  { value: "otro", label: "Otro supuesto reconocido por la normativa" },
] as const;

/** Título VII/VIII del D.S. N°020-2015-MINAGRI. */
export const TIPOS_TITULO_HABILITANTE = [
  { value: "cesion_uso_agroforestal", label: "Cesión en uso para sistemas agroforestales" },
  { value: "concesion_plantaciones", label: "Concesión para plantaciones forestales" },
] as const;

/** Documentos que acreditan la propiedad del predio (Lineamientos RNPF §"De las
 *  consideraciones para los documentos que acreditan la propiedad"). */
export const TIPOS_DOCUMENTO_PROPIEDAD = [
  "Partida registral",
  "Escritura pública",
  "Minuta",
  "Título de propiedad",
  "Contrato de compraventa",
  "Sucesión intestada",
  "Anticipo de legítima",
  "Dación en pago",
  "Donación",
  "Otro documento que acredite transferencia",
] as const;

/** Categorías de documentación sustentatoria (Sección 6 requisitos, Lineamientos
 *  RNPF) — la clasificación por trámite decide cuáles son requeridos. */
export const CATEGORIAS_DOCUMENTO_PLANTACION = [
  { key: "mapa_ubicacion", label: "Mapa o croquis de ubicación del predio y del área de la plantación" },
  { key: "doc_propiedad", label: "Documento que acredite el derecho de propiedad sobre el predio" },
  { key: "doc_conduccion", label: "Documento que acredite la conducción directa del área (posesión)" },
  { key: "doc_autorizacion_uso", label: "Documento que autoriza el uso del área, cuando el titular de la plantación no es el titular del predio" },
  { key: "carta_poder", label: "Carta poder / documento de representación legal" },
  { key: "acta_asamblea_comunal", label: "Acta de asamblea comunal (comunidades nativas o campesinas)" },
  { key: "titulo_habilitante", label: "Copia del título habilitante (cesión en uso o concesión)" },
] as const;

export type ClasificacionDocumento = "requerido" | "opcional" | "no_corresponde";

/** Especie del catálogo: nombre común → científico + si es CITES (verificado,
 *  no supuesto). El operador SIEMPRE puede editar o escribir una especie que
 *  no está acá — esto es apoyo, no una lista cerrada (§10 del pedido). */
export interface EspecieCatalogo {
  comun: string;
  cientifico: string;
  /** Sólo `true` para especies con listado CITES verificado (Caoba: Apéndice
   *  II desde 1992; Cedro: Apéndice III Perú desde 2017). Ante duda, `false` —
   *  un falso positivo desinforma tanto como un falso negativo. */
  cites?: boolean;
}

export const CATALOGO_ESPECIES: EspecieCatalogo[] = [
  { comun: "Tornillo", cientifico: "Cedrelinga cateniformis" },
  { comun: "Bolaina blanca", cientifico: "Guazuma crinita" },
  { comun: "Capirona", cientifico: "Calycophyllum spruceanum" },
  { comun: "Cedro", cientifico: "Cedrela odorata", cites: true },
  { comun: "Caoba", cientifico: "Swietenia macrophylla", cites: true },
  { comun: "Teca", cientifico: "Tectona grandis" },
  { comun: "Eucalipto", cientifico: "Eucalyptus globulus" },
  { comun: "Pino", cientifico: "Pinus patula" },
  { comun: "Shihuahuaco", cientifico: "Dipteryx micrantha" },
  { comun: "Tahuarí", cientifico: "Handroanthus serratifolius" },
  { comun: "Marupa", cientifico: "Simarouba amara" },
  { comun: "Lupuna", cientifico: "Ceiba pentandra" },
  { comun: "Palo balsa", cientifico: "Ochroma pyramidale" },
  { comun: "Cumala", cientifico: "Virola sebifera" },
  { comun: "Moena", cientifico: "Ocotea spp." },
  { comun: "Pijuayo", cientifico: "Bactris gasipaes" },
  { comun: "Copoazú", cientifico: "Theobroma grandiflorum" },
];

/** Busca por nombre común (case/tilde-insensitive) — la misma clave que ya usa
 *  el LO-TH para cruzar especies (`claveEspecie`, `loth-constants.ts`). */
export function buscarEnCatalogo(nombreComun: string): EspecieCatalogo | undefined {
  const q = nombreComun
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  if (!q) return undefined;
  return CATALOGO_ESPECIES.find((e) => {
    const k = e.comun.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
    return k === q;
  });
}

/** Sugerencias para el combobox — coincidencia parcial, tope razonable. */
export function sugerirEspecies(query: string, limit = 8): EspecieCatalogo[] {
  const q = query
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
  if (!q) return CATALOGO_ESPECIES.slice(0, limit);
  return CATALOGO_ESPECIES.filter((e) =>
    e.comun.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().includes(q),
  ).slice(0, limit);
}
