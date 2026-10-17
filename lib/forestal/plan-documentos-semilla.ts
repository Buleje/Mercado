/**
 * lib/forestal/plan-documentos-semilla.ts — lo que se escribe la PRIMERA vez y
 * dónde queda (ADR-467, Documentos del plan de manejo).
 *
 * Dos cosas puras, sin Prisma ni fetch, para poder probarlas sin base:
 *
 * 1. **La semilla**: las cuatro carpetas que se le sugieren a un negocio
 *    («Registro de plantación / Resolución», «Jefe / representante», «Títulos
 *    de propiedad», «Otros») con los papeles que se esperan en cada una. Se
 *    escribe UNA vez por negocio, en el primer `preparar`; desde ahí la
 *    plantilla es del negocio y el código no la vuelve a tocar.
 * 2. **El armado**: cómo se llama la carpeta raíz de un plan en el Drive y cómo
 *    se juntan carpetas, casilleros y archivos en la vista con «lo que falta».
 *
 * El contrato (tipos, etiquetas, Zod) vive en `plan-documentos-tipos.ts` y no
 * se edita desde acá.
 */
import { claveDesdeNombre } from "@/lib/campos-personalizados";
import { SIN_TITULAR, segmentoDeCarpeta } from "@/lib/forestal/documentos-guia";
import {
  FORMULARIO_CARPETAS_PLAN,
  RAIZ_DRIVE_LOTH,
  TIPO_ARCHIVO,
  TIPO_CARPETA,
  estadoDeCasillero,
  formularioDeCarpeta,
  type ArchivoDelPlan,
  type CarpetaDelPlan,
  type CarpetaSemilla,
  type CasilleroArchivo,
  type ResumenDocumentosPlan,
} from "@/lib/forestal/plan-documentos-tipos";

// ── 1. La semilla ───────────────────────────────────────────────────────────

/**
 * La plantilla sugerida (tabla del ADR-467). El N° y la fecha de la resolución
 * NO son campos: ya viven en el plan (`resolucionNumber`/`resolucionDate`) y
 * pedirlos de nuevo sería tener dos respuestas para la misma pregunta.
 */
export const SEMILLA_CARPETAS_PLAN: readonly CarpetaSemilla[] = [
  {
    clave: "resolucion",
    nombre: "Registro de plantación / Resolución",
    descripcion: "La resolución que aprobó el plan o la constancia del registro de plantación.",
    archivos: [
      {
        nombre: "Resolución o constancia de registro",
        descripcion: "El papel con sello y firma de la autoridad forestal.",
      },
    ],
    campos: [],
  },
  {
    clave: "jefe",
    nombre: "Jefe / representante (DNI, actas, poderes)",
    descripcion: "Los papeles de quien firma por el titular: jefe de la comunidad o representante legal.",
    archivos: [
      {
        nombre: "DNI del jefe o representante",
        descripcion: "Frente y dorso. Si vence, pon la fecha en el archivo y te avisamos antes.",
      },
      {
        nombre: "Acta de elección o asamblea",
        descripcion: "El acta que lo nombra jefe o que autoriza el aprovechamiento.",
      },
      {
        nombre: "Vigencia de poder",
        descripcion: "La que emite Registros Públicos. Vence: pon la fecha para que avise.",
      },
    ],
    campos: [{ nombre: "Cargo", tipo: "texto", descripcion: "Jefe, presidente, apoderado…" }],
  },
  {
    clave: "titulos",
    nombre: "Títulos de propiedad",
    descripcion: "El título del predio o lo que prueba la posesión.",
    archivos: [
      {
        nombre: "Título de propiedad o constancia de posesión",
        descripcion: "El título inscrito, o la constancia si todavía no hay título.",
      },
    ],
    campos: [
      {
        nombre: "N° de partida registral",
        tipo: "texto",
        descripcion: "El número de la partida en Registros Públicos (SUNARP).",
      },
    ],
  },
  {
    clave: "otros",
    nombre: "Otros",
    descripcion: "Lo que no entra en las demás carpetas.",
    archivos: [],
    campos: [],
  },
];

/** Una fila de `CampoPersonalizado` lista para `createMany` (sin tenant ni autor). */
export interface FilaSemilla {
  formulario: string;
  clave: string;
  nombre: string;
  descripcion: string | null;
  tipo: string;
  orden: number;
}

/**
 * La semilla, aplanada a las filas que se escriben: una `carpeta` por cada
 * carpeta, y dentro de su formulario los casilleros `archivo` primero y
 * después los campos que se llenan a mano. Todas PERMANENTES
 * (`soloParaRegistroId = null`): la semilla es lo que aparece en todos los
 * planes.
 */
export function filasDeSemilla(semilla: readonly CarpetaSemilla[] = SEMILLA_CARPETAS_PLAN): FilaSemilla[] {
  const filas: FilaSemilla[] = [];
  semilla.forEach((c, i) => {
    filas.push({
      formulario: FORMULARIO_CARPETAS_PLAN,
      clave: c.clave,
      nombre: c.nombre,
      descripcion: c.descripcion || null,
      tipo: TIPO_CARPETA,
      orden: i + 1,
    });
    const formulario = formularioDeCarpeta(c.clave);
    let orden = 0;
    for (const a of c.archivos) {
      filas.push({
        formulario,
        clave: claveDesdeNombre(a.nombre),
        nombre: a.nombre,
        descripcion: a.descripcion || null,
        tipo: TIPO_ARCHIVO,
        orden: ++orden,
      });
    }
    for (const campo of c.campos) {
      filas.push({
        formulario,
        clave: claveDesdeNombre(campo.nombre),
        nombre: campo.nombre,
        descripcion: campo.descripcion || null,
        tipo: campo.tipo,
        orden: ++orden,
      });
    }
  });
  return filas;
}

// ── 2. Dónde queda: la carpeta del plan en el Drive ─────────────────────────

/**
 * Largo máximo de la clave de una carpeta.
 *
 * La etiqueta de máquina es `plan-carpeta:<clave>` y el contrato la quiere en
 * ≤40 caracteres (el Drive corta las etiquetas ahí): 40 − 13 = 27.
 */
export const MAX_CLAVE_CARPETA = 27;

/** La clave de una carpeta nueva, derivada del nombre y con el tope de la etiqueta. */
export function claveDeCarpeta(nombre: string): string {
  return claveDesdeNombre(nombre).slice(0, MAX_CLAVE_CARPETA).replace(/-+$/g, "");
}

/** Lo mínimo del plan que hace falta para ubicarlo en el Drive. */
export interface PlanParaCarpeta {
  id: string;
  planType: string;
  planNumber: string | null;
  resolucionNumber: string | null;
  titularName: string;
}

/**
 * El nombre de la carpeta raíz de un plan: su N° («19-SEC-REG-PLT-2025-096»,
 * con la `/` ya cambiada por `-`, que en el Drive es separador de rutas).
 * Sin N°, el de la resolución; sin ninguno, el tipo y el final del id — nunca
 * vacío, porque dos planes sin N° del mismo titular se pisarían.
 */
export function nombreCarpetaDelPlan(plan: PlanParaCarpeta): string {
  return (
    segmentoDeCarpeta(plan.planNumber) ||
    segmentoDeCarpeta(plan.resolucionNumber) ||
    segmentoDeCarpeta(`${plan.planType} sin número ${plan.id.slice(-6)}`)
  );
}

/**
 * La variante del nombre cuando esa carpeta ya es de OTRO plan (mismo titular
 * y mismo N°). Se corta antes de sumar el sufijo: `segmentoDeCarpeta` recorta
 * a 80 y se comería justo lo que los distingue.
 */
export function nombreCarpetaDesambiguada(plan: PlanParaCarpeta): string {
  const base = nombreCarpetaDelPlan(plan).slice(0, 70).trim();
  return segmentoDeCarpeta(`${base} · ${plan.id.slice(-6)}`);
}

/** `["Libro TH", "<titular>", "<N° del plan>"]` — cada tramo ≤80 y sin `/`. */
export function rutaPropuestaDelPlan(plan: PlanParaCarpeta): [string, string, string] {
  return [RAIZ_DRIVE_LOTH, segmentoDeCarpeta(plan.titularName) || SIN_TITULAR, nombreCarpetaDelPlan(plan)];
}

// ── 3. El armado de la vista ────────────────────────────────────────────────

/** Una fila de la plantilla (`tipo: "carpeta"`) como la lee el armado. */
export interface PlantillaCarpetaFila {
  id: string;
  clave: string;
  nombre: string;
  soloParaRegistroId: string | null;
  orden: number;
}

/** Un casillero `archivo` como lo lee el armado. */
export type CampoArchivoFila = CasilleroArchivo["campo"];

/** Una subcarpeta real de la raíz del plan. */
export interface CarpetaDriveFila {
  id: string;
  name: string;
  tags: readonly string[];
}

/** Un documento vivo de alguna subcarpeta del plan. */
export interface DocumentoFila {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  expiresAt: Date | null;
  uploadedAt: Date;
  folderId: string | null;
  tags: readonly string[];
}

/** La clave de una carpeta leída de su etiqueta `plan-carpeta:`, o null. */
export function claveDeEtiquetas(tags: readonly string[]): string | null {
  const t = tags.find((x) => x.startsWith("plan-carpeta:"));
  const clave = t?.slice("plan-carpeta:".length).trim();
  return clave ? clave : null;
}

/** El casillero al que pertenece un documento (etiqueta `campo:`), o null. */
export function campoDeEtiquetas(tags: readonly string[]): string | null {
  const t = tags.find((x) => x.startsWith("campo:"));
  const id = t?.slice("campo:".length).trim();
  return id ? id : null;
}

/**
 * Clave de una subcarpeta hecha a mano en el Drive (sin plantilla). No va a la
 * base: sirve para que la pantalla la nombre al editarla o adoptarla.
 */
export const claveDeCarpetaSuelta = (folderId: string): string => `carpeta-${folderId}`;
export const folderIdDeClaveSuelta = (clave: string): string | null =>
  clave.startsWith("carpeta-") ? clave.slice("carpeta-".length) || null : null;

function aArchivo(d: DocumentoFila, campoId: string | null): ArchivoDelPlan {
  return {
    documentId: d.id,
    nombre: d.name,
    mimeType: d.mimeType,
    size: d.size,
    expiresAt: d.expiresAt ? d.expiresAt.toISOString() : null,
    uploadedAt: d.uploadedAt.toISOString(),
    campoId,
  };
}

/** El orden de siempre: por `orden`, y a igual orden por nombre. Los temporales, al final. */
function porOrden<T extends { orden: number; nombre: string; soloParaRegistroId: string | null }>(a: T, b: T): number {
  const temporalA = a.soloParaRegistroId != null ? 1 : 0;
  const temporalB = b.soloParaRegistroId != null ? 1 : 0;
  return temporalA - temporalB || a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es");
}

export interface EntradaArmado {
  planId: string;
  /** `limaDateKey()`: a las 20:00 de Pucallpa el UTC ya es mañana. */
  hoy: string;
  /** Plantilla ACTIVA que aplica a este plan (permanentes + temporales suyas). */
  plantilla: readonly PlantillaCarpetaFila[];
  /** Casilleros `archivo` ACTIVOS que aplican a este plan, de cualquier carpeta. */
  camposArchivo: readonly CampoArchivoFila[];
  /** Subcarpetas directas de la raíz del plan (vacío si todavía no se preparó). */
  carpetasDrive: readonly CarpetaDriveFila[];
  documentos: readonly DocumentoFila[];
  /** folderId → cuántas subcarpetas tiene adentro. */
  subcarpetasPorCarpeta: ReadonlyMap<string, number>;
}

/**
 * Junta la plantilla con lo que hay de verdad en el Drive.
 *
 * · Cada carpeta de la plantilla busca su carpeta real por la etiqueta
 *   `plan-carpeta:<clave>`. El nombre que se ve es el del Drive (el dueño pudo
 *   renombrarla ahí); si nadie la renombró, el de la plantilla, que conserva la
 *   `/` que el Drive no admite.
 * · Las subcarpetas sin plantilla aparecen al final, con `plantillaId: null`,
 *   para que se puedan adoptar. Nada del Drive queda escondido.
 * · Un documento entra a un casillero sólo si su etiqueta `campo:` es de un
 *   casillero de ESA carpeta; si no, queda en «sueltos» de su carpeta.
 */
export function armarCarpetas(e: EntradaArmado): CarpetaDelPlan[] {
  const porClave = new Map<string, CarpetaDriveFila>();
  for (const f of e.carpetasDrive) {
    const clave = claveDeEtiquetas(f.tags);
    // Si dos carpetas tuvieran la misma etiqueta, gana la primera: la otra
    // queda como suelta y se ve, en vez de desaparecer.
    if (clave && !porClave.has(clave)) porClave.set(clave, f);
  }
  const docsPorCarpeta = new Map<string, DocumentoFila[]>();
  for (const d of e.documentos) {
    if (!d.folderId) continue;
    const lista = docsPorCarpeta.get(d.folderId) ?? [];
    lista.push(d);
    docsPorCarpeta.set(d.folderId, lista);
  }
  const casillerosDe = (clave: string): CampoArchivoFila[] =>
    e.camposArchivo.filter((c) => c.formulario === formularioDeCarpeta(clave)).sort(porOrden);

  const armar = (o: {
    clave: string;
    nombre: string;
    carpeta: CarpetaDriveFila | null;
    plantillaId: string | null;
    soloEstePlan: boolean;
    orden: number;
  }): CarpetaDelPlan => {
    const docs = o.carpeta ? (docsPorCarpeta.get(o.carpeta.id) ?? []) : [];
    const campos = casillerosDe(o.clave);
    const ids = new Set(campos.map((c) => c.id));
    const casilleros: CasilleroArchivo[] = campos.map((campo) => {
      const archivos = docs
        .filter((d) => campoDeEtiquetas(d.tags) === campo.id)
        .map((d) => aArchivo(d, campo.id))
        .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
      const vencimientos = archivos
        .map((a) => a.expiresAt)
        .filter((x): x is string => Boolean(x))
        .sort();
      return {
        campo,
        estado: estadoDeCasillero(archivos, e.hoy),
        archivos,
        venceEl: vencimientos[0] ?? null,
      };
    });
    const sueltos = docs
      .filter((d) => {
        const campoId = campoDeEtiquetas(d.tags);
        return !campoId || !ids.has(campoId);
      })
      .map((d) => aArchivo(d, null))
      .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    return {
      clave: o.clave,
      nombre: o.nombre,
      folderId: o.carpeta?.id ?? null,
      plantillaId: o.plantillaId,
      soloEstePlan: o.soloEstePlan,
      orden: o.orden,
      casilleros,
      sueltos,
      subcarpetas: o.carpeta ? (e.subcarpetasPorCarpeta.get(o.carpeta.id) ?? 0) : 0,
    };
  };

  const usadas = new Set<string>();
  const deLaPlantilla = [...e.plantilla].sort(porOrden).map((t) => {
    const carpeta = porClave.get(t.clave) ?? null;
    if (carpeta) usadas.add(carpeta.id);
    const renombrada = carpeta && carpeta.name !== segmentoDeCarpeta(t.nombre);
    return armar({
      clave: t.clave,
      nombre: renombrada ? carpeta.name : t.nombre,
      carpeta,
      plantillaId: t.id,
      soloEstePlan: t.soloParaRegistroId != null,
      orden: t.orden,
    });
  });

  const sinPlantilla = e.carpetasDrive
    .filter((f) => !usadas.has(f.id))
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
    .map((f, i) =>
      armar({
        clave: claveDeCarpetaSuelta(f.id),
        nombre: f.name,
        carpeta: f,
        plantillaId: null,
        soloEstePlan: true,
        orden: 10_000 + i,
      }),
    );

  return [...deLaPlantilla, ...sinPlantilla];
}

/**
 * «Lo que falta», contado por casillero. `cargados` = esperados − faltan: un
 * papel vencido o por vencer ESTÁ cargado (hay que renovarlo, no buscarlo), y
 * se cuenta además en su columna.
 */
export function resumirCarpetas(carpetas: readonly CarpetaDelPlan[]): ResumenDocumentosPlan {
  const casilleros = carpetas.flatMap((c) => c.casilleros);
  const faltan = casilleros.filter((c) => c.estado === "falta").length;
  return {
    esperados: casilleros.length,
    cargados: casilleros.length - faltan,
    faltan,
    vencenPronto: casilleros.filter((c) => c.estado === "vence_pronto").length,
    vencidos: casilleros.filter((c) => c.estado === "vencido").length,
  };
}
