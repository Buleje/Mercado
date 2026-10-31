/**
 * ¿Este papel parece tener vencimiento? (Brandon 31-10: «un vencimiento sin
 * anotar es un aviso que nunca llega»; el cron de avisos mira `expiresAt`.)
 *
 * Sólo mira lo que la lista del drive SÍ trae (nombre, categoría, tipo y, si
 * viene, lo que la IA leyó): sin la descripción. Pura y client-safe.
 *
 * Con la palabra clave en el NOMBRE: un DNI, una licencia, un permiso, un
 * contrato, el SOAT… Los comprobantes, guías, listas, planillas y las fotos de
 * las cámaras nunca entran (las 370 fotos de Blas son carpetas por día).
 */

import { esFotoDeMaquina } from "@/lib/documents/fotos-de-maquina";

/** Etiqueta con que el repaso deja de preguntar por un papel («No vence»). */
export const TAG_NO_VENCE = "no vence";

export interface PapelParaVencer {
  name: string;
  category?: string | null;
  tags?: string[] | null;
  mimeType?: string | null;
  expiresAt?: string | null;
  deletedAt?: string | null;
  ocrMetadata?: Record<string, unknown> | null;
}

export interface ParecePorVencer {
  parece: boolean;
  /** «DNI», «Contrato»… para decirle a Brandon por qué lo propone. */
  motivo: string | null;
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Orden = prioridad del motivo cuando el nombre trae varias palabras. */
const CLAVES: readonly [string, RegExp][] = [
  ["DNI", /\bdni\b|documento nacional de identidad/],
  ["Carné", /\bcarnet\b|\bcarne (de |del )?(sanidad|extranjeria|conducir|conductor|identidad)\b/],
  ["Licencia", /\blicencias?\b/],
  ["Permiso", /\bpermisos?\b/],
  ["Contrato", /\bcontratos?\b/],
  ["SOAT", /\bsoat\b/],
  ["Póliza", /\bpolizas?\b/],
  ["Certificado", /\bcertificad[oa]s?\b/],
  ["Constancia", /\bconstancias?\b/],
  ["Resolución", /\bresolucion(es)?\b/],
  ["Autorización", /\bautorizacion(es)?\b/],
  ["Brevete", /\bbrevete\b/],
  ["Pasaporte", /\bpasaporte\b/],
  ["Título habilitante", /\btitulo habilitante\b/],
  ["Concesión", /\bconcesion(es)?\b/],
  ["Revisión técnica", /\brevision tecnica\b/],
];

/** Lo que se parece pero nunca vence (o aún no es el papel final). */
const NO_VENCE =
  /\b(facturas?|boletas?|guias?|gtf|recibos?|comprobantes?|vouchers?|tickets?|pagos?|depositos?|estado de cuenta|lista de trozas|hoja de firmas|relacion|reportes?|planillas?|catalogo|precios?|borrador|plantilla|solicitud|denuncia)\b/;

const FOTO_DE_CAMARA = /^\d{2}-\d{2}-\d{2} ·/;
const PLANILLA = /spreadsheet|ms-excel|csv/;

/** Lo que la IA leyó del papel (si la grilla lo trae): un comprobante no es vencimiento. */
function vencimientoLeido(meta: Record<string, unknown> | null | undefined): boolean {
  const leido = meta?.vencimientoLeido as { fecha?: string; motivo?: string } | undefined;
  const sug = meta?.sugerencias as { expiresAt?: string } | undefined;
  return !!((leido?.fecha && leido.motivo !== "comprobante") || sug?.expiresAt);
}

export function pareceQueVence(d: PapelParaVencer): ParecePorVencer {
  const no = { parece: false, motivo: null } as const;
  if (esFotoDeMaquina(d) || FOTO_DE_CAMARA.test(d.name)) return no;
  if (PLANILLA.test(d.mimeType ?? "")) return no;
  const nombre = normalizar(d.name);
  if (NO_VENCE.test(nombre)) return no;
  for (const [motivo, re] of CLAVES) if (re.test(nombre)) return { parece: true, motivo };
  if (d.category === "contratos") return { parece: true, motivo: "Contrato" };
  if (vencimientoLeido(d.ocrMetadata)) return { parece: true, motivo: "Vencimiento leído" };
  return no;
}

/** Entra al repaso: parece vencer, vive, no tiene fecha y no se marcó «No vence». */
export function paraRepasarVencimiento(d: PapelParaVencer): boolean {
  if (d.expiresAt || d.deletedAt) return false;
  if ((d.tags ?? []).includes(TAG_NO_VENCE)) return false;
  return pareceQueVence(d).parece;
}
