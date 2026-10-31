/**
 * «Ordenar mi Archivo» (22-10): mira los papeles y las carpetas y PROPONE
 * arreglos. No escribe nada: el dueño elige cuáles aplicar y el servidor
 * vuelve a calcular este mismo plan antes de tocar algo (no le cree al cliente).
 *
 * Lo que propone:
 *  - Nombres claros: sin la ruta pegada («A/B/x.docx» → «x.docx», de una
 *    subida de carpeta vieja), sin extensión repetida, sin guiones bajos ni
 *    espacios de más, MAYÚSCULAS sostenidas en tipo oración (las siglas se
 *    quedan: GTF, DNI, LT…) y, a una foto de cámara o escáner sin nombre
 *    («IMG_2034», «documento (3)»), el que sale de lo que el análisis ya leyó.
 *    La extensión se queda: en el Archivo el nombre es el del archivo.
 *  - Basura: candados de Office («~$…»), Thumbs.db, desktop.ini, 0 bytes.
 *  - Carpetas vacías DE VERDAD (sin papeles —tampoco en la papelera— ni
 *    subcarpetas), nunca las que el sistema crea solo ni las de hoy.
 *  - Repetidos: del grupo con el MISMO contenido queda el más nuevo.
 *  - Lo que la IA sugirió al leer (carpeta / vencimiento), como una sección más.
 *
 * Puro y sin dependencias de servidor: lo usan la ruta y sus tests.
 */

import { CARPETA_ENTIDAD } from "@/lib/documentos/enlaces-entidad";
import { CARPETA_PERSONAS } from "@/lib/camaras/personas";
import { CARPETA_ASISTENCIA } from "@/lib/rrhh/asistencia-fotos";
import { CARPETA_GUIAS } from "@/lib/forestal/documentos-guia";
import { RAIZ_DRIVE_LOTH } from "@/lib/forestal/plan-documentos-tipos";

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Lo que el análisis del papel ya guardó (`ocrMetadata`) y sirve para nombrarlo. */
export interface PistasDelPapel {
  descripcionUsuario?: string | null;
  resumen?: string | null;
  /** `structured.docType`: factura, boleta, contrato… */
  tipo?: string | null;
  numero?: string | null;
  emisor?: string | null;
}

export interface PapelParaOrdenar {
  id: string;
  name: string;
  size: number;
  folderId: string | null;
  /** ISO */
  uploadedAt: string;
  /** El rol lo ve (y por eso puede renombrarlo o mandarlo a la papelera). */
  tocable: boolean;
  /** El rol puede cambiarlo de carpeta (no tiene permisos que se abrirían al moverlo). */
  movible?: boolean;
  /** Atado a algo (guía, cliente, enlace compartido…): nunca va a la papelera. */
  protegido?: boolean;
  tieneVencimiento?: boolean;
  pistas?: PistasDelPapel | null;
  /** `ocrMetadata.sugerencias` de la IA. */
  sugerencia?: { folderId?: string | null; expiresAt?: string | null } | null;
  /** Quién lo ve (sus roles y los de su cadena), comparable: "" = todos los del panel. */
  puerta?: string;
}

export interface CarpetaParaOrdenar {
  id: string;
  name: string;
  parentId: string | null;
  /** Documentos adentro CONTANDO la papelera y las fotos de las cámaras. */
  documentos: number;
  subcarpetas: number;
  /** ISO */
  creadaEn: string;
  /** El rol la ve. */
  visible: boolean;
  /** El rol la puede borrar (la ve y, si tiene permisos, es encargado o más). */
  borrable: boolean;
  /** Tiene un enlace vivo: alguien de afuera la puede estar usando. */
  compartida?: boolean;
  /** El rol podría volver a sacar de acá un papel suelto que entre (para que «Deshacer» funcione). */
  sacable?: boolean;
}

export interface EntradaOrden {
  papeles: readonly PapelParaOrdenar[];
  carpetas: readonly CarpetaParaOrdenar[];
  /** Grupos de ids con el MISMO contenido (SHA-256 comprobado en el servidor). */
  identicos?: readonly (readonly string[])[];
  /** Sugerencias de la IA que ya descartaste. */
  descartadas?: ReadonlySet<string>;
  ahora?: Date;
}

export type TipoPropuesta = "nombre" | "basura" | "carpeta" | "duplicado" | "ia";

export interface Propuesta {
  /** «nombre:<docId>», «carpeta:<folderId>»… estable entre dos cálculos del plan. */
  id: string;
  tipo: TipoPropuesta;
  /** Id del papel o de la carpeta. */
  objetoId: string;
  antes: string;
  /** Nombre nuevo, o lo que pasa («A la papelera»). */
  despues: string;
  /** Por qué, en simple: «tenía la ruta de una carpeta pegada». */
  motivo: string;
  /** «CCNN Santa Rosa › 09» o «Sin carpeta». */
  donde: string;
  /** ia: carpeta a la que va y fecha de vencimiento (ISO) que se anota. */
  folderId?: string;
  expiresAt?: string;
}

export interface PlanOrden {
  propuestas: Propuesta[];
  conteo: Record<TipoPropuesta, number>;
}

// ── Nombres ──────────────────────────────────────────────────────────────────

/** Siglas que se escriben en mayúscula (se respetan y, si vienen en minúscula, se suben). */
const SIGLAS = new Set([
  "GTF", "DNI", "RUC", "LT", "CCNN", "SERFOR", "SUNAT", "SUNARP", "OSINFOR", "IGV", "SOAT",
  "ATFFS", "ARFFS", "PMF", "PGMF", "POA", "DEMA", "CTP", "LPC", "LRE", "SAC", "EIRL", "SRL", "PDF",
]);

/** Palabras cortas que NO son siglas aunque vengan en mayúscula («DE», «Y»). */
const PALABRAS_CORTAS = new Set([
  "A", "AL", "DE", "DEL", "EL", "EN", "LA", "LAS", "LO", "LOS", "Y", "E", "O", "U", "UN", "UNA",
  "POR", "CON", "SIN", "SU", "SUS", "MI", "QUE", "ES", "SE", "NO", "SI", "PARA",
  "YA", "LE", "ME", "TE", "NI", "TU", "VA", "HA", "HE", "OS", "NOS", "LES",
]);

const EXTENSION = /\.([a-z][a-z0-9]{0,4})$/i;
const CARACTERES_PROHIBIDOS = /[\\/:*?"<>|]+/g;
const LARGO_MAXIMO = 120;

/** Nombre de cámara, escáner o «sin título»: dice cómo se creó, no qué es. */
const SIN_SENTIDO: readonly RegExp[] = [
  /^(img|image|imagen|dsc|dscn|dcim|pxl|mvimg|vid|photo|foto|pic|p)[\s-]*\d[\d\s-]*(wa\d+)?$/i,
  /^img[\s-]\d{8}[\s-]wa\d+$/i,
  /^whatsapp (image|imagen|document|documento|video)\b.*$/i,
  /^(scan|scanned|scanner|escaneo|escaneado|escanear|camscanner)\b[\s\d().:-]*$/i,
  /^(documento|document|doc|archivo|file|nuevo documento|new document|sin t[ií]tulo|untitled|captura( de pantalla)?|screenshot|screen shot)\b[\s\d().:-]*$/i,
  /^\d[\d\s.:()-]*$/,
];

export function esNombreSinSentido(base: string): boolean {
  const b = base.trim();
  return b.length > 0 && SIN_SENTIDO.some((re) => re.test(b));
}

/** Parte un nombre en base + extensión (en minúscula), sin la extensión repetida. */
export function partirExtension(nombre: string): { base: string; ext: string; repetida: boolean } {
  const m = nombre.match(EXTENSION);
  if (!m) return { base: nombre, ext: "", repetida: false };
  const ext = m[1].toLowerCase();
  let base = nombre.slice(0, -m[0].length);
  let repetida = false;
  const sufijo = `.${ext}`;
  while (base.toLowerCase().endsWith(sufijo) && base.length > sufijo.length) {
    base = base.slice(0, -sufijo.length);
    repetida = true;
  }
  return { base, ext, repetida };
}

const tieneLetras = (t: string) => t.toUpperCase() !== t.toLowerCase();
const esMayuscula = (t: string) => tieneLetras(t) && t === t.toUpperCase();
const sinVocales = (t: string) => !/[AEIOUÁÉÍÓÚÜ]/i.test(t);
const limpiarBorde = (t: string) => t.replace(/[^\p{L}\p{N}]/gu, "");

/** ¿La palabra se queda en mayúscula al pasar a tipo oración? */
function sigueEnMayuscula(tok: string): boolean {
  const pura = limpiarBorde(tok).toUpperCase();
  if (!pura) return true;
  if (SIGLAS.has(pura)) return true;
  if (/\d/.test(tok)) return true; // «19-SEC», «F001-123»
  // Una o dos letras que no son palabra: inicial («Juan D») o sigla («QA», «SA», «TI»).
  if (pura.length <= 2) return !PALABRAS_CORTAS.has(pura);
  if (PALABRAS_CORTAS.has(pura)) return false;
  return pura.length <= 5 && sinVocales(pura); // «CCNN», «PLT»
}

/** Palabra «de verdad» (no sigla, sin dígitos, dos letras o más) para medir si el nombre GRITA. */
const esPalabra = (tok: string) => {
  const pura = limpiarBorde(tok);
  return pura.length >= 2 && !/\d/.test(pura) && tieneLetras(pura) && !sigueEnMayuscula(tok);
};

/**
 * «CARTA DE EMSION GUIA SERFOR GTF 1-2-3-4» → «Carta de emsion guia SERFOR GTF 1-2-3-4».
 * Sólo si grita de verdad: tres palabras o más, todas en mayúscula. «GTF 2
 * CHIVIS ANULADA» (dos) se queda: ahí la mayúscula suele ser un nombre propio.
 */
export function aTipoOracion(base: string): string {
  const toks = base.split(" ");
  const palabras = toks.filter(esPalabra);
  if (palabras.length < 3 || !palabras.every(esMayuscula)) return base;
  const bajada = toks.map((t) => (sigueEnMayuscula(t) ? t : t.toLowerCase())).join(" ");
  return mayusculaInicial(bajada);
}

function mayusculaInicial(t: string): string {
  const i = t.search(/\p{L}/u);
  return i < 0 ? t : t.slice(0, i) + t[i].toUpperCase() + t.slice(i + 1);
}

/** «gtf» suelto → «GTF». Sólo palabras enteras de la lista. */
function subirSiglas(base: string): string {
  return base
    .split(" ")
    .map((t) => {
      const pura = limpiarBorde(t);
      return pura && SIGLAS.has(pura.toUpperCase()) && pura !== pura.toUpperCase()
        ? t.replace(pura, pura.toUpperCase())
        : t;
    })
    .join(" ");
}

/** Recorta en la primera frase y en una palabra entera. */
function primeraFrase(texto: string, max = 60): string {
  let t = texto
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(este|esta|el|la)\s+(documento|archivo|imagen|foto|papel)\s+(es|muestra|contiene|corresponde a)\s+(un|una|el|la)?\s*/i, "");
  t = t.split(/[.;:\n]/)[0]?.trim() ?? "";
  if (t.length > max) {
    const corte = t.slice(0, max);
    const esp = corte.lastIndexOf(" ");
    t = (esp > 20 ? corte.slice(0, esp) : corte).replace(/[\s,–—-]+$/, "");
  }
  return t.replace(CARACTERES_PROHIBIDOS, " ").replace(/\s+/g, " ").trim();
}

const TIPOS_DOC: Record<string, string> = {
  factura: "Factura", boleta: "Boleta", recibo: "Recibo", contrato: "Contrato",
  guia: "Guía", cotizacion: "Cotización", carta: "Carta",
};

/** El nombre que se puede armar con lo que el análisis ya leyó (sin IA nueva). */
export function nombreDesdePistas(p: PistasDelPapel | null | undefined): string | null {
  if (!p) return null;
  const propia = p.descripcionUsuario?.trim();
  if (propia) return mayusculaInicial(primeraFrase(propia)) || null;
  const tipo = p.tipo ? TIPOS_DOC[p.tipo.trim().toLowerCase()] : undefined;
  if (tipo && (p.numero?.trim() || p.emisor?.trim())) {
    const partes = [tipo, p.numero?.trim(), p.emisor?.trim()].filter(Boolean).join(" ");
    return primeraFrase(partes, LARGO_MAXIMO) || null;
  }
  const resumen = p.resumen?.trim();
  if (resumen) return mayusculaInicial(primeraFrase(resumen)) || null;
  return null;
}

/**
 * El nombre limpio de un papel y por qué, o `null` si ya está bien (o si es
 * de cámara y no hay de dónde sacar uno mejor: «IMG 2034» no es un arreglo).
 */
export function limpiarNombre(
  nombre: string,
  pistas?: PistasDelPapel | null,
): { nombre: string; motivos: string[] } | null {
  const motivos: string[] = [];
  const segmentos = nombre.split(/[\\/]+/).map((s) => s.trim()).filter(Boolean);
  let resto = segmentos.at(-1) ?? nombre.trim();
  if (segmentos.length > 1) motivos.push("tenía la ruta de una carpeta pegada");

  const { base: crudo, ext, repetida } = partirExtension(resto);
  if (repetida) motivos.push("la extensión estaba repetida");
  let base = crudo;
  if (base.includes("_")) {
    base = base.replace(/_+/g, " ");
    motivos.push("tenía guiones bajos");
  }
  const juntado = base.replace(/\s{2,}/g, " ").replace(/^[\s.,_–—-]+|[\s.,_–—-]+$/g, "");
  if (juntado !== base && !motivos.includes("tenía guiones bajos")) motivos.push("tenía espacios de más");
  base = juntado;

  if (esNombreSinSentido(base)) {
    const sugerido = nombreDesdePistas(pistas);
    if (!sugerido) return null;
    base = sugerido;
    motivos.length = 0;
    motivos.push("era un nombre de cámara o escáner; sale de lo que dice el papel");
  } else {
    const oracion = aTipoOracion(base);
    if (oracion !== base) motivos.push("estaba todo en mayúsculas");
    const conSiglas = subirSiglas(oracion);
    if (conSiglas !== oracion && !motivos.includes("estaba todo en mayúsculas")) motivos.push("siglas en mayúscula");
    // «denuncia_extravio_gtf» era un nombre de máquina: pasa a tipo oración.
    base = motivos.includes("tenía guiones bajos") ? mayusculaInicial(conSiglas) : conSiglas;
  }

  base = base.replace(CARACTERES_PROHIBIDOS, " ").replace(/\s+/g, " ").trim().slice(0, LARGO_MAXIMO).trim();
  if (!base) return null;
  if (ext && /[A-Z]/.test(resto.slice(-ext.length)) && motivos.length === 0) motivos.push("extensión en minúscula");
  resto = ext ? `${base}.${ext}` : base;
  if (resto === nombre) return null;
  return { nombre: resto, motivos: motivos.length ? motivos : ["nombre más claro"] };
}

/** «x.pdf» libre en la carpeta, o «x (2).pdf», «x (3).pdf»… */
export function nombreLibre(nombre: string, ocupados: ReadonlySet<string>): string {
  if (!ocupados.has(nombre.toLowerCase())) return nombre;
  const { base, ext } = partirExtension(nombre);
  for (let n = 2; n < 1000; n++) {
    const prueba = ext ? `${base} (${n}).${ext}` : `${base} (${n})`;
    if (!ocupados.has(prueba.toLowerCase())) return prueba;
  }
  return nombre;
}

// ── Basura ───────────────────────────────────────────────────────────────────

const BASURA: readonly { re: RegExp; motivo: string }[] = [
  { re: /^~\$/, motivo: "candado temporal de Word o Excel (se crea al abrirlo)" },
  { re: /^\.~lock\./i, motivo: "candado temporal de LibreOffice" },
  { re: /^thumbs\.db$/i, motivo: "miniaturas de Windows" },
  { re: /^desktop\.ini$/i, motivo: "ajuste de carpeta de Windows" },
  { re: /^\.ds_store$/i, motivo: "ajuste de carpeta de Mac" },
  { re: /^\._/, motivo: "copia oculta de Mac" },
];

/** Por qué un archivo es basura, o `null`. */
export function motivoBasura(nombre: string, size: number): string | null {
  const ultimo = nombre.split(/[\\/]+/).filter(Boolean).at(-1) ?? nombre;
  const hit = BASURA.find((b) => b.re.test(ultimo.trim()));
  if (hit) return hit.motivo;
  return size === 0 ? "está vacío (0 bytes)" : null;
}

// ── Carpetas del sistema ─────────────────────────────────────────────────────

const plegar = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();

/**
 * Carpetas raíz que el código crea solo (y vuelve a buscar por nombre): borrar
 * una vacía hace que la próxima foto, papel de WhatsApp o pago la recree, o
 * peor, que un enlace la busque y no la encuentre. Todo lo que cuelga de ellas
 * también se respeta.
 */
export const RAICES_DEL_SISTEMA: readonly string[] = [
  CARPETA_PERSONAS[0], // «Cámaras» (Personas, Asistencia)
  CARPETA_ASISTENCIA[0],
  "Llegó por WhatsApp", // lib/whatsapp/archivar-papel.ts (server-only)
  CARPETA_GUIAS,
  RAIZ_DRIVE_LOTH, // «Libro TH»: las carpetas del plan son su lista de papeles (forest-plan-documentos.db.ts)
  ...Object.values(CARPETA_ENTIDAD).map((r) => r[0]),
];
const RAICES = new Set(RAICES_DEL_SISTEMA.map(plegar));

/** Carpetas que nacieron hace menos de esto se respetan: la acabas de crear para llenarla. */
const RESPIRO_CARPETA_MS = 24 * 3600_000;

// ── Plan ─────────────────────────────────────────────────────────────────────

const ORDEN_TIPOS: readonly TipoPropuesta[] = ["nombre", "basura", "carpeta", "duplicado", "ia"];

export function planOrdenar(e: EntradaOrden): PlanOrden {
  const ahora = (e.ahora ?? new Date()).getTime();
  const carpetas = new Map(e.carpetas.map((c) => [c.id, c]));
  const papeles = new Map(e.papeles.map((p) => [p.id, p]));

  const ruta = (folderId: string | null): string[] => {
    const partes: string[] = [];
    const vistas = new Set<string>();
    let id = folderId;
    while (id && !vistas.has(id) && vistas.size < 200) {
      vistas.add(id);
      const c = carpetas.get(id);
      if (!c) break;
      partes.unshift(c.name);
      id = c.parentId;
    }
    return partes;
  };
  const donde = (folderId: string | null) => (folderId ? ruta(folderId).join(" › ") || "Sin carpeta" : "Sin carpeta");

  const propuestas: Propuesta[] = [];
  const aLaPapelera = new Set<string>();

  // 1. Basura (va primero: lo que se tira no se renombra).
  for (const p of e.papeles) {
    if (!p.tocable || p.protegido) continue;
    const motivo = motivoBasura(p.name, p.size);
    if (!motivo) continue;
    aLaPapelera.add(p.id);
    propuestas.push({
      id: `basura:${p.id}`, tipo: "basura", objetoId: p.id,
      antes: p.name, despues: "A la papelera", motivo, donde: donde(p.folderId),
    });
  }

  // 2. Repetidos: del grupo idéntico queda el más nuevo (o el atado a algo: una
  //    GTF del casillero no se tira porque llegó otra igual; o el que tiene
  //    vencimiento: es el que avisa). Sólo entre copias que ve la MISMA gente:
  //    tirar la de otra puerta le quitaría el papel a alguien que hoy lo ve. Lo
  //    atado y lo que tiene vencimiento nunca va a la papelera.
  for (const grupo of e.identicos ?? []) {
    const porPuerta = new Map<string, PapelParaOrdenar[]>();
    for (const id of grupo) {
      const p = papeles.get(id);
      if (!p || !p.tocable || aLaPapelera.has(p.id)) continue;
      const k = p.puerta ?? "";
      porPuerta.set(k, [...(porPuerta.get(k) ?? []), p]);
    }
    for (const copias of porPuerta.values()) {
      if (copias.length < 2) continue;
      const porFecha = [...copias].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
      const queda = porFecha.find((p) => p.protegido) ?? porFecha.find((p) => p.tieneVencimiento) ?? porFecha[0];
      const porque = queda.protegido ? "está atado a algo" : queda.tieneVencimiento ? "tiene vencimiento" : "es el más nuevo";
      for (const p of porFecha) {
        if (p === queda || p.protegido || p.tieneVencimiento) continue;
        aLaPapelera.add(p.id);
        propuestas.push({
          id: `duplicado:${p.id}`, tipo: "duplicado", objetoId: p.id,
          antes: p.name, despues: "A la papelera",
          motivo: `es igual a «${queda.name}» (${donde(queda.folderId)}), que se queda porque ${porque}`,
          donde: donde(p.folderId),
        });
      }
    }
  }

  // 3. Nombres. Ocupados = TODOS los nombres actuales de la carpeta (también los
  //    que el rol no ve y los que van a la papelera, porque podés destildarlos)
  //    + los nombres nuevos ya repartidos: así cualquier combinación de
  //    casillas que apliques nunca deja dos iguales.
  const ocupados = new Map<string, Set<string>>();
  const nuevoNombre = new Map<string, string>();
  const clave = (f: string | null) => f ?? "";
  for (const p of e.papeles) {
    const s = ocupados.get(clave(p.folderId)) ?? new Set<string>();
    s.add(p.name.toLowerCase());
    ocupados.set(clave(p.folderId), s);
  }
  for (const p of e.papeles) {
    if (!p.tocable || aLaPapelera.has(p.id)) continue;
    const limpio = limpiarNombre(p.name, p.pistas);
    if (!limpio) continue;
    const enCarpeta = ocupados.get(clave(p.folderId)) ?? new Set<string>();
    const propios = new Set([...enCarpeta].filter((n) => n !== p.name.toLowerCase()));
    const final = nombreLibre(limpio.nombre, propios);
    if (final === p.name) continue;
    enCarpeta.add(final.toLowerCase());
    ocupados.set(clave(p.folderId), enCarpeta);
    nuevoNombre.set(p.id, final);
    propuestas.push({
      id: `nombre:${p.id}`, tipo: "nombre", objetoId: p.id,
      antes: p.name, despues: final, motivo: limpio.motivos.join(" · "), donde: donde(p.folderId),
    });
  }

  // 4. Carpetas vacías de verdad. La que la IA eligió para un papel no está
  //    vacía: está esperando (proponer las dos cosas haría que una rompa la otra).
  const esperandoPapel = new Set(
    e.papeles.flatMap((p) => (p.sugerencia?.folderId && !e.descartadas?.has(p.id) ? [p.sugerencia.folderId] : [])),
  );
  for (const c of e.carpetas) {
    if (!c.visible || !c.borrable || c.compartida || esperandoPapel.has(c.id)) continue;
    if (c.documentos > 0 || c.subcarpetas > 0) continue;
    const creada = Date.parse(c.creadaEn);
    if (Number.isFinite(creada) && ahora - creada < RESPIRO_CARPETA_MS) continue;
    const camino = ruta(c.id);
    if (RAICES.has(plegar(camino[0] ?? c.name))) continue;
    propuestas.push({
      id: `carpeta:${c.id}`, tipo: "carpeta", objetoId: c.id,
      antes: c.name, despues: "Se borra", motivo: "no tiene papeles ni subcarpetas",
      donde: camino.slice(0, -1).join(" › ") || "Archivo",
    });
  }

  // 5. Lo que la IA ya sugirió (carpeta para lo suelto, vencimiento para lo que no tiene).
  for (const p of e.papeles) {
    const s = p.sugerencia;
    if (!s || !p.tocable || aLaPapelera.has(p.id) || e.descartadas?.has(p.id)) continue;
    const destino = s.folderId && !p.folderId && p.movible !== false ? carpetas.get(s.folderId) : undefined;
    // Allá no puede haber otro con su nombre (ni con el nuevo que le toca en
    // «Nombres»): dos iguales en una carpeta, nunca. Y que «Deshacer» lo pueda
    // volver a sacar (un rol sin permisos no saca nada de una carpeta con roles).
    const suyos = [p.name, nuevoNombre.get(p.id)].filter((n): n is string => !!n).map((n) => n.toLowerCase());
    const enDestino = destino ? (ocupados.get(clave(destino.id)) ?? new Set<string>()) : null;
    const carpeta =
      destino?.visible && destino.sacable !== false && enDestino && !suyos.some((n) => enDestino.has(n)) ? destino : undefined;
    if (carpeta && enDestino) {
      for (const n of suyos) enDestino.add(n);
      ocupados.set(clave(carpeta.id), enDestino);
    }
    const vence = s.expiresAt && !p.tieneVencimiento && !Number.isNaN(Date.parse(s.expiresAt)) ? s.expiresAt : undefined;
    if (!carpeta && !vence) continue;
    const partes = [
      carpeta ? `mover a «${ruta(carpeta.id).join(" › ")}»` : null,
      vence ? `vence el ${fechaCorta(vence)}` : null,
    ].filter(Boolean);
    propuestas.push({
      id: `ia:${p.id}`, tipo: "ia", objetoId: p.id,
      antes: p.name, despues: partes.join(" · "), motivo: "la IA lo leyó al subirlo",
      donde: donde(p.folderId),
      ...(carpeta ? { folderId: carpeta.id } : {}),
      ...(vence ? { expiresAt: vence } : {}),
    });
  }

  propuestas.sort(
    (a, b) =>
      ORDEN_TIPOS.indexOf(a.tipo) - ORDEN_TIPOS.indexOf(b.tipo) ||
      a.donde.localeCompare(b.donde, "es") ||
      a.antes.localeCompare(b.antes, "es"),
  );
  const conteo = { nombre: 0, basura: 0, carpeta: 0, duplicado: 0, ia: 0 } as Record<TipoPropuesta, number>;
  for (const p of propuestas) conteo[p.tipo]++;
  return { propuestas, conteo };
}

/** «15/01/2027» (fecha de Lima: el vencimiento se guarda a mediodía UTC). */
function fechaCorta(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

/** «7 nombres para limpiar», «1 archivo basura»… para el aviso y el modal. */
export function textoConteo(tipo: TipoPropuesta, n: number): string {
  const uno = n === 1;
  switch (tipo) {
    case "nombre": return uno ? "1 nombre para limpiar" : `${n} nombres para limpiar`;
    case "basura": return uno ? "1 archivo basura" : `${n} archivos basura`;
    case "carpeta": return uno ? "1 carpeta vacía" : `${n} carpetas vacías`;
    case "duplicado": return uno ? "1 repetido" : `${n} repetidos`;
    case "ia": return uno ? "1 sugerencia de la IA" : `${n} sugerencias de la IA`;
  }
}
