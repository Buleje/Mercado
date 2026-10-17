/**
 * plantacion-tramite — el expediente del Registro de Plantación Forestal (RNPF),
 * normalizado en el servidor. Mismo criterio que `tramites-registro.ts`
 * (ADR-308 §4): el cliente propone, el servidor decide.
 *
 * PURO: sin Prisma ni fetch — se testea sin DB. `lib/db/forest-plantaciones.db.ts`
 * es el único que lo conecta a la base.
 */

import type { EstadoPlantacion, TipoPersona, TipoTramitePlantacion } from "./plantacion-catalogo";
import { geometriaBloque, type VerticeBloque } from "./plantacion-cartografia";

export interface EspecieBloqueInput {
  id?: string;
  nombreComun: string;
  nombreCientifico?: string | null;
  tipoVegetativo?: string | null;
  cantidad?: number | null;
  finalidad?: string | null;
  mesInstalacion?: number | null;
  anioInstalacion?: number | null;
  observaciones?: string | null;
  cites?: boolean;
  citesProcedencia?: string | null;
  situacionActual?: string | null;
  produccionCantidad?: number | null;
  produccionUnidad?: string | null;
}

export interface BloqueInput {
  id?: string;
  numero: number;
  nombre?: string | null;
  superficieHa?: number | null;
  vertices: VerticeBloque[];
  especies: EspecieBloqueInput[];
}

export interface DocumentoPlantacion {
  categoria: string;
  clasificacion: "requerido" | "opcional" | "no_corresponde";
  documentId?: string | null;
  rotulo?: string | null;
}

export interface PlantacionInput {
  id?: string;
  tipoTramite: TipoTramitePlantacion;
  codigoPlantacionSerfor?: string | null;
  estado?: string;

  titularTipoPersona?: TipoPersona | null;
  titularTipoDocumento?: string | null;
  titularNumeroDocumento?: string | null;
  titularRazonSocial?: string | null;
  titularApellidoPaterno?: string | null;
  titularApellidoMaterno?: string | null;
  titularNombres?: string | null;
  titularTelefonoFijo?: string | null;
  titularCelular?: string | null;
  titularEmail?: string | null;
  titularDepartamento?: string | null;
  titularProvincia?: string | null;
  titularDistrito?: string | null;
  titularTipoVia?: string | null;
  titularDireccion?: string | null;
  titularNumero?: string | null;
  titularDocumentoAutorizaUso?: string | null;

  repTiene?: boolean;
  repTipoDocumento?: string | null;
  repNumeroDocumento?: string | null;
  repApellidoPaterno?: string | null;
  repApellidoMaterno?: string | null;
  repNombres?: string | null;
  repTelefonoFijo?: string | null;
  repCelular?: string | null;
  repEmail?: string | null;
  repDepartamento?: string | null;
  repProvincia?: string | null;
  repDistrito?: string | null;
  repTipoVia?: string | null;
  repDireccion?: string | null;
  repNumero?: string | null;

  predioNombre?: string | null;
  predioAreaTotalHa?: number | null;
  predioDepartamento?: string | null;
  predioProvincia?: string | null;
  predioDistrito?: string | null;
  predioSectorAnexo?: string | null;
  predioZonaUtm?: string | null;
  predioEste?: number | null;
  predioNorte?: number | null;
  predioDatum?: string;

  titularidadTipo?: string | null;
  titularidadTipoPersona?: TipoPersona | null;
  titularidadDocumentoTipo?: string | null;
  titularidadDocumentoNumero?: string | null;
  titularidadNombre?: string | null;
  titularidadDocAcreditaTipo?: string | null;
  titularidadDocAcreditaNumero?: string | null;
  titularidadInscripcionSunarp?: string | null;
  titularidadDocAutorizaUso?: string | null;
  posesionarioNombre?: string | null;
  posesionarioDocumentoAcredita?: string | null;
  posesionarioAniosConduccion?: number | null;

  tituloHabilitanteTiene?: boolean;
  tituloHabilitanteTipo?: string | null;
  tituloHabilitanteCodigo?: string | null;

  djLugar?: string | null;
  djFecha?: string | null;
  djTitularNombre?: string | null;
  djDni?: string | null;
  djAceptado?: boolean;

  documentos?: DocumentoPlantacion[];
  notas?: string | null;

  bloques: BloqueInput[];
}

export interface PlantacionRegistro extends Required<Pick<PlantacionInput, "tipoTramite">> {
  id: string;
  codigoInterno: string;
  codigoPlantacionSerfor: string | null;
  estado: EstadoPlantacion;
  datos: PlantacionInput;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

const ESTADOS = new Set(["borrador", "en_elaboracion", "completo", "pendiente_documentos", "listo_presentar"]);

/** Estado válido o `borrador` — nunca se acepta un estado que no existe. */
export function normalizarEstado(estado: string | undefined | null): EstadoPlantacion {
  return ESTADOS.has(estado ?? "") ? (estado as EstadoPlantacion) : "borrador";
}

/**
 * Siguiente código interno del tenant para el AÑO de `hoy`: "RPF-YYYY-NNNN",
 * 4 dígitos, se resetea cada año. SOLO administrativo — nunca se presenta
 * como el código oficial SERFOR (`codigoPlantacionSerfor`, que la ARFFS emite
 * al inscribir y este sistema nunca inventa).
 */
export function siguienteCodigoInterno(codigosExistentes: string[], hoy: Date): string {
  const prefijo = `RPF-${hoy.getUTCFullYear()}-`;
  const usados = codigosExistentes
    .filter((c) => c.startsWith(prefijo))
    .map((c) => Number(c.slice(prefijo.length)))
    .filter((n) => Number.isFinite(n));
  const siguiente = (usados.length ? Math.max(...usados) : 0) + 1;
  return `${prefijo}${String(siguiente).padStart(4, "0")}`;
}

/** Nombre completo del titular — razón social si es jurídica, o apellidos +
 *  nombres si es natural. Nunca inventa un nombre si falta el dato. */
export function nombreTitular(d: PlantacionInput): string {
  if (d.titularTipoPersona === "juridica") return (d.titularRazonSocial ?? "").trim() || "—";
  const partes = [d.titularNombres, d.titularApellidoPaterno, d.titularApellidoMaterno].map((p) => (p ?? "").trim()).filter(Boolean);
  return partes.length ? partes.join(" ") : "—";
}

// ── Avance (Sección 2 del pedido: "Información completada: 72 %") ─────────

const SECCIONES_AVANCE: { peso: number; completa: (d: PlantacionInput) => boolean }[] = [
  { peso: 1, completa: (d) => Boolean(d.titularTipoPersona && (d.titularNumeroDocumento?.trim() || d.titularRazonSocial?.trim()) && d.titularCelular?.trim()) },
  { peso: 1, completa: (d) => Boolean(d.predioNombre?.trim() && d.predioAreaTotalHa && d.predioDepartamento && d.predioDistrito) },
  { peso: 1, completa: (d) => d.bloques.length > 0 },
  { peso: 1, completa: (d) => d.bloques.length > 0 && d.bloques.every((b) => b.vertices.length >= 3) && d.bloques.some((b) => b.especies.length > 0) },
  { peso: 1, completa: (d) => d.bloques.length > 0 && d.bloques.every((b) => b.vertices.length >= 3) },
  {
    peso: 1,
    // `every` en un array vacío da `true` — sin este guard, un trámite en blanco
    // (documentos: []) contaría el paso de documentos como "hecho" sin haberlo
    // ni abierto. Se exige haber RECORRIDO el checklist (length > 0), aunque
    // termine sin ningún requerido pendiente.
    completa: (d) => {
      const docs = d.documentos ?? [];
      if (!docs.length) return false;
      return docs.filter((doc) => doc.clasificacion === "requerido").every((doc) => Boolean(doc.documentId));
    },
  },
  { peso: 1, completa: (d) => Boolean(d.djAceptado) },
];

/** % de avance — heurística por sección, no un dato oficial. Se muestra como
 *  ayuda de llenado ("Información completada: 72 %"), nunca como un campo
 *  que la autoridad exige. */
export function calcularAvance(d: PlantacionInput): number {
  const total = SECCIONES_AVANCE.reduce((a, s) => a + s.peso, 0);
  const hechas = SECCIONES_AVANCE.reduce((a, s) => a + (s.completa(d) ? s.peso : 0), 0);
  return Math.round((hechas / total) * 100);
}

// ── Resumen superior ("8.50 ha | 3 bloques | 4 especies | 5,420 plantas") ──

export interface ResumenPlantacion {
  areaDeclaradaHa: number;
  areaBloquesHa: number;
  numBloques: number;
  numEspecies: number;
  totalPlantas: number;
}

export function calcularResumen(d: PlantacionInput): ResumenPlantacion {
  const areaBloquesHa = d.bloques.reduce((a, b) => a + (b.superficieHa ?? 0), 0);
  const especiesUnicas = new Set(d.bloques.flatMap((b) => b.especies.map((e) => e.nombreComun.trim().toLowerCase())).filter(Boolean));
  const totalPlantas = d.bloques.reduce((a, b) => a + b.especies.reduce((a2, e) => a2 + (e.cantidad ?? 0), 0), 0);
  return {
    areaDeclaradaHa: d.predioAreaTotalHa ?? 0,
    areaBloquesHa: Math.round(areaBloquesHa * 10_000) / 10_000,
    numBloques: d.bloques.length,
    numEspecies: especiesUnicas.size,
    totalPlantas,
  };
}

// ── Validaciones amigables (Sección 15) ────────────────────────────────────

export interface AdvertenciaPlantacion {
  campo: string;
  mensaje: string;
}

/** Nunca borra información — sólo avisa. Los mensajes son los del pedido
 *  original (§15), no genéricos de librería de validación. */
export function validarPlantacion(d: PlantacionInput): AdvertenciaPlantacion[] {
  const avisos: AdvertenciaPlantacion[] = [];

  if (!d.predioAreaTotalHa || d.predioAreaTotalHa <= 0) {
    avisos.push({ campo: "predioAreaTotalHa", mensaje: "Ingrese la superficie de la plantación." });
  }

  d.bloques.forEach((b, i) => {
    if (b.vertices.length > 0 && b.vertices.length < 3) {
      avisos.push({ campo: `bloques.${i}.vertices`, mensaje: `El bloque ${b.numero || i + 1} tiene vértices incompletos.` });
    }
    b.especies.forEach((e, j) => {
      if (!e.mesInstalacion || !e.anioInstalacion) {
        avisos.push({ campo: `bloques.${i}.especies.${j}`, mensaje: `Indique el mes y año de instalación de "${e.nombreComun || "la especie"}".` });
      }
    });
  });

  const { areaDeclaradaHa, areaBloquesHa } = calcularResumen(d);
  if (areaDeclaradaHa > 0 && areaBloquesHa > areaDeclaradaHa) {
    avisos.push({
      campo: "bloques",
      mensaje: `La suma de superficie de los bloques (${areaBloquesHa.toLocaleString("es-PE")} ha) supera el área declarada del predio (${areaDeclaradaHa.toLocaleString("es-PE")} ha).`,
    });
  }

  return avisos;
}

/** Geometría de cada bloque, para el mapa y la revisión — deriva, no guarda. */
export function geometriasDePlantacion(d: PlantacionInput) {
  return d.bloques.map((b) => ({ bloque: b, geometria: geometriaBloque(b.vertices) }));
}

/** Fila liviana de "Mis Registros de Plantación" — sin bloques/vértices. */
export interface PlantacionListItem {
  id: string;
  codigoInterno: string;
  codigoPlantacionSerfor: string | null;
  tipoTramite: string;
  estado: EstadoPlantacion;
  titular: string | null;
  predioNombre: string | null;
  predioDistrito: string | null;
  predioAreaTotalHa: number | null;
  numBloques: number;
  updatedAt: string;
}
