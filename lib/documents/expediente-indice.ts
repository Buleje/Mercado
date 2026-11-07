/**
 * Expediente en un clic (22-10) — la parte pura: qué entra, en qué orden y en
 * qué página empieza cada papel. Sin pdf-lib ni base: lo prueba
 * `__tests__/documentos-expediente.test.ts` y lo usan el armado del PDF
 * (`expediente-pdf.ts`) y el plan que el modal muestra antes de armar.
 */

/** Cómo entra un papel: sus páginas, una imagen por página, o sólo en el índice. */
export type TipoPapel = "pdf" | "imagen" | "no-imprimible";

/** Un papel del plan: lo que el modal lista antes de armar. */
export interface PapelDelPlan {
  id: string;
  nombre: string;
  carpeta: string;
  tipo: TipoPapel;
  vence: string | null;
  vencido: boolean;
  bytes: number;
}

/** Qué entra al expediente y dónde queda (respuesta de `soloPlan`). */
export interface PlanExpediente {
  tituloSugerido: string;
  papeles: PapelDelPlan[];
  /** Carpeta donde queda el PDF (null = raíz del Archivo). */
  destinoId: string | null;
  /** Tamaño de lo que se une (PDFs e imágenes), en bytes. */
  bytesImprimibles: number;
}

/** Una fila del índice del PDF armado. */
export interface FilaDelIndice {
  n: number;
  nombre: string;
  carpeta: string;
  vence: string | null;
  /** Página donde empieza; null = no entró al PDF (ver `motivo`). */
  pagina: number | null;
  paginas: number;
  motivo: "no-imprimible" | "no-se-pudo-leer" | null;
}

/** Tope de papeles por expediente: más que esto no lo revisa nadie de una. */
export const MAX_PAPELES_EXPEDIENTE = 60;
/** Tope de lo que se baja del almacenamiento para armar (suma de los archivos). */
export const MAX_MB_EXPEDIENTE = 60;
/** Filas del índice por hoja: fijo, así la cuenta de páginas no depende del texto. */
export const FILAS_POR_HOJA_INDICE = 26;

/**
 * PDF e imágenes se unen; Word, Excel y el resto (videos, ZIP) van al índice
 * como «pedir el original»: no se pierden en silencio.
 */
export function tipoDePapel(mimeType: string, nombre: string): TipoPapel {
  if (mimeType === "application/pdf" || /\.pdf$/i.test(nombre)) return "pdf";
  // SVG queda afuera: sharp lo rasteriza, pero un SVG del Archivo suele ser un logo, no un papel.
  if (mimeType.startsWith("image/") && mimeType !== "image/svg+xml") return "imagen";
  return "no-imprimible";
}

/** Lo mínimo de una carpeta para ordenar y nombrar la ruta. */
export interface CarpetaDelExpediente {
  id: string;
  parentId: string | null;
  name: string;
}

/** Lo mínimo de un documento para ordenarlo. */
export interface DocDelExpediente {
  id: string;
  name: string;
  folderId: string | null;
}

const porNombre = (a: string, b: string) => a.localeCompare(b, "es", { numeric: true, sensitivity: "base" });

/**
 * Las carpetas de un expediente en el orden en que se leen: primero la elegida,
 * después sus hijas por nombre, cada una con sus nietas antes de pasar a la
 * siguiente (como el árbol del Archivo abierto entero). Sin subcarpetas, sólo
 * la elegida. Corta ciclos por si la base trajera uno.
 */
export function carpetasEnOrden(
  raizId: string,
  carpetas: readonly CarpetaDelExpediente[],
  incluirSubcarpetas: boolean,
): string[] {
  if (!incluirSubcarpetas) return [raizId];
  const hijas = new Map<string, CarpetaDelExpediente[]>();
  for (const c of carpetas) {
    if (!c.parentId) continue;
    const l = hijas.get(c.parentId) ?? [];
    l.push(c);
    hijas.set(c.parentId, l);
  }
  const orden: string[] = [];
  const vistas = new Set<string>();
  const recorrer = (id: string) => {
    if (vistas.has(id)) return;
    vistas.add(id);
    orden.push(id);
    for (const h of [...(hijas.get(id) ?? [])].sort((a, b) => porNombre(a.name, b.name))) recorrer(h.id);
  };
  recorrer(raizId);
  return orden;
}

/** Los papeles de una carpeta (o del árbol) en el orden del expediente: por carpeta y, adentro, por nombre. */
export function ordenarPorCarpeta<T extends DocDelExpediente>(docs: readonly T[], ordenCarpetas: readonly string[]): T[] {
  const lugar = new Map(ordenCarpetas.map((id, i) => [id, i]));
  const fuera = ordenCarpetas.length;
  return [...docs].sort((a, b) => {
    const la = a.folderId ? (lugar.get(a.folderId) ?? fuera) : fuera;
    const lb = b.folderId ? (lugar.get(b.folderId) ?? fuera) : fuera;
    return la - lb || porNombre(a.name, b.name);
  });
}

/** Los elegidos a mano, en el orden en que se eligieron (sin repetir). */
export function ordenDeSeleccion<T extends { id: string }>(docs: readonly T[], ids: readonly string[]): T[] {
  const porId = new Map(docs.map((d) => [d.id, d]));
  const vistos = new Set<string>();
  const out: T[] = [];
  for (const id of ids) {
    const d = porId.get(id);
    if (d && !vistos.has(id)) {
      vistos.add(id);
      out.push(d);
    }
  }
  return out;
}

/**
 * «GTF › 2026»: la ruta de la carpeta del papel. Con `desdeId`, empieza en esa
 * carpeta (la del expediente); si no, es sólo el nombre de la carpeta directa.
 */
export function rutaDeCarpeta(
  folderId: string | null,
  porId: ReadonlyMap<string, CarpetaDelExpediente>,
  desdeId?: string,
): string {
  if (!folderId) return "Archivo";
  const directa = porId.get(folderId);
  if (!directa) return "Archivo";
  if (!desdeId) return directa.name;
  const nombres: string[] = [];
  let actual: CarpetaDelExpediente | undefined = directa;
  for (let n = 0; actual && n < 50; n++) {
    nombres.unshift(actual.name);
    if (actual.id === desdeId) break;
    actual = actual.parentId ? porId.get(actual.parentId) : undefined;
  }
  return nombres.join(" › ");
}

/** Hojas que ocupa el índice (al menos una, aunque no haya papeles). */
export function hojasDelIndice(filas: number, porHoja = FILAS_POR_HOJA_INDICE): number {
  return Math.max(1, Math.ceil(filas / porHoja));
}

export interface NumeracionExpediente {
  /** Página (1 = portada) donde empieza cada papel; null = no entró al PDF. */
  inicio: (number | null)[];
  hojasIndice: number;
  /** Portada + índice + todas las páginas de los papeles. */
  total: number;
}

/**
 * Dónde empieza cada papel: portada (1 página) + índice + las páginas de los
 * anteriores. Un papel con 0 páginas (Word, Excel, un PDF que no se pudo leer)
 * no ocupa página: queda en el índice sin número.
 */
export function numerarExpediente(paginasPorPapel: readonly number[], porHoja = FILAS_POR_HOJA_INDICE): NumeracionExpediente {
  const hojasIndice = hojasDelIndice(paginasPorPapel.length, porHoja);
  let siguiente = 1 + hojasIndice + 1;
  const inicio = paginasPorPapel.map((p) => {
    if (p <= 0) return null;
    const aqui = siguiente;
    siguiente += p;
    return aqui;
  });
  return { inicio, hojasIndice, total: siguiente - 1 };
}

/** «Expediente CCNN Santa Rosa»: no repite la palabra si el título ya la trae. */
export function nombreDelExpediente(titulo: string): string {
  const t = titulo.trim().replace(/\s+/g, " ") || "sin título";
  return /^expediente\b/i.test(t) ? t : `Expediente ${t}`;
}

/** «jueves 22/10/2026» en hora de Lima (el formato de fecha del panel, con año para un papel oficial). */
export function fechaDeLima(fecha: Date): string {
  const dia = fecha.toLocaleDateString("es-PE", { weekday: "long", timeZone: "America/Lima" });
  const fechaCorta = fecha.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Lima" });
  return `${dia} ${fechaCorta}`;
}

/** «12/03/2027» en hora de Lima, o null si el papel no vence. */
export function venceEl(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-PE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Lima" });
}
