/**
 * descripcion-schema — el contrato de "qué es este documento", en un solo lugar.
 *
 * Lo comparten los dos caminos que describen un archivo: el que LEE texto
 * (PDF/Word/Excel/txt, `analyze-document.ts`) y el que MIRA una foto
 * (`vision-describe.ts`). Tener un solo schema y un solo prompt evita que la
 * descripción de una boleta escaneada salga con otra forma que la de la misma
 * boleta en PDF —y que la búsqueda encuentre una y no la otra.
 */
import { z } from "zod";

export const StructuredSchema = z
  .object({
    docType: z.string().max(40).nullish(),
    ruc: z.string().max(20).nullish(),
    razonSocial: z.string().max(160).nullish(),
    numero: z.string().max(40).nullish(),
    fecha: z.string().max(20).nullish(),
    moneda: z.string().max(8).nullish(),
    total: z.union([z.number(), z.string()]).nullish(),
    igv: z.union([z.number(), z.string()]).nullish(),
  })
  .partial();

export const EntitiesSchema = z
  .object({
    people: z.array(z.string().max(80)).max(12).default([]),
    orgs: z.array(z.string().max(80)).max(12).default([]),
    places: z.array(z.string().max(80)).max(12).default([]),
    dates: z.array(z.string().max(40)).max(12).default([]),
    amounts: z.array(z.string().max(40)).max(12).default([]),
  })
  .partial();

/**
 * Tolerante a propósito: un modelo chico (los que corren en tu propia máquina)
 * suele acertar la descripción y equivocarse en un campo anidado. Si el schema
 * fuera estricto, un `entities` mal formado tiraría a la basura TODO el
 * análisis —incluida la descripción, que es lo único imprescindible—. Cada
 * campo secundario cae solo a su valor vacío con `.catch()`.
 */
export const ResultSchema = z.object({
  summary: z.string().catch(""),
  description: z.string().catch(""),
  keyFacts: z.array(z.string()).max(14).catch([]),
  tags: z.array(z.string()).max(14).catch([]),
  entities: EntitiesSchema.nullish().catch(null),
  structured: StructuredSchema.nullish().catch(null),
  /** Sólo el camino de visión lo devuelve: el texto que se ve en la foto. */
  ocrText: z.string().nullish().catch(null),
  sugerencia: z
    .object({
      carpeta: z.string().max(120).nullish(),
      vencimiento: z.string().max(20).nullish(),
    })
    .nullish()
    .catch(null),
});

/** ¿El análisis sirve para algo? Sin texto ni descripción, no. */
export function tieneAlgoUtil(r: ResultadoDescripcion): boolean {
  return !!(r.description?.trim() || r.summary?.trim() || r.ocrText?.trim());
}

export type StructuredData = z.infer<typeof StructuredSchema>;
export type DocEntities = z.infer<typeof EntitiesSchema>;
export type ResultadoDescripcion = z.infer<typeof ResultSchema>;

/** Aplana las entidades en una lista de términos (para buscar). */
export function flattenEntities(e: DocEntities | null | undefined): string[] {
  if (!e) return [];
  return [
    ...(e.people ?? []), ...(e.orgs ?? []), ...(e.places ?? []),
    ...(e.dates ?? []), ...(e.amounts ?? []),
  ].filter(Boolean);
}

/**
 * El prompt. `modo: "vision"` cambia dos cosas: pide transcribir el texto que se
 * ve (la foto no trae texto extraíble) y habla de "esta imagen" en vez de "este
 * documento". Todo lo demás —sobre todo la descripción rica, que es lo que
 * después hace que el archivo aparezca al buscarlo— es idéntico.
 */
export function promptDeDescripcion(opts: {
  modo: "texto" | "vision";
  carpetas: string[];
  texto?: string;
}): string {
  const listaCarpetas = opts.carpetas.length > 0
    ? `\nCarpetas disponibles del drive: ${opts.carpetas.map((c) => `"${c}"`).join(", ")}.`
    : "";
  const campoOcr = opts.modo === "vision"
    ? ', "ocrText": "<TODO el texto legible de la imagen, tal cual aparece>"'
    : "";
  const cabecera = opts.modo === "vision"
    ? "Sos un archivista experto. Mirá esta foto/escaneo de un documento de una bodega/negocio peruano"
    : "Sos un archivista experto. Analizá a fondo este documento de una bodega/negocio peruano";

  return `${cabecera} y devolvé SOLO un objeto JSON válido (sin markdown, sin texto extra) con esta forma:
{"summary": "<resumen en 1-2 frases>", "description": "<DESCRIPCIÓN DETALLADA Y BUSCABLE en 3-5 frases: qué tipo de documento es, quiénes son las partes involucradas, fechas clave, montos, el propósito y cualquier dato que alguien podría usar para encontrarlo después. Escribí en español, natural y completo.>", "keyFacts": ["<dato clave con su valor, ej. 'Renta: S/1500 mensuales'>", ...máximo 12], "tags": ["<etiqueta corta en minúscula; incluí tipo, partes, tema>", ...máximo 12], "entities": {"people": ["<personas mencionadas>"], "orgs": ["<empresas/organizaciones>"], "places": ["<direcciones/lugares>"], "dates": ["<fechas relevantes>"], "amounts": ["<montos, ej. 'S/1500'>"]}, "structured": {"docType": "<factura|boleta|recibo|contrato|guia|cotizacion|carta|otro>", "ruc": "<RUC 11 dígitos o null>", "razonSocial": "<emisor o null>", "numero": "<nº o null>", "fecha": "<AAAA-MM-DD o null>", "moneda": "<PEN|USD o null>", "total": <número o null>, "igv": <número o null>}${campoOcr}, "sugerencia": {"carpeta": "<el nombre EXACTO de UNA de las carpetas disponibles si el documento claramente pertenece ahí, o null>", "vencimiento": "<AAAA-MM-DD si el documento tiene fecha de vencimiento, fin de vigencia o caducidad, o null>"}}

La "description" es lo más importante: tiene que ser rica en términos para que el documento aparezca en búsquedas por nombre de persona, empresa, lugar, fecha o tema. En "structured" completá solo si es un comprobante; si no, structured en null. Montos como número sin símbolo.${listaCarpetas} En "sugerencia.carpeta" solo un nombre de esa lista o null; en "vencimiento" SOLO la fecha en que el documento deja de valer (no fechas de emisión).${
    opts.texto ? `\n\nDocumento:\n${opts.texto}` : ""
  }`;
}
