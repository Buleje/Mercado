/**
 * importar-arbol — convierte lo que el navegador entrega al elegir/soltar una
 * carpeta en un PLAN de importación: qué carpetas hay que crear (en orden
 * padre→hijo) y a qué carpeta va cada archivo.
 *
 * Es PURO a propósito: recibe rutas y devuelve el plan, sin tocar la red ni el
 * DOM. Así se puede probar el caso feo (nombres repetidos, carpetas vacías,
 * basura del sistema operativo) sin subir un solo byte.
 */

/** Archivos que el sistema operativo mete en cada carpeta y nadie quiere en el drive. */
const BASURA = new Set([".ds_store", "thumbs.db", "desktop.ini", ".localized", "icon\r"]);

/** Tope de profundidad: más que esto suele ser un árbol de proyecto, no documentos. */
export const PROFUNDIDAD_MAX = 6;

export interface CarpetaPlan {
  /** Ruta completa desde la raíz elegida: "Contratos/2026". */
  ruta: string;
  /** Nombre de esta carpeta: "2026". */
  nombre: string;
  /** Ruta del padre, o null si cuelga de la raíz del import. */
  padre: string | null;
  /** Nivel (0 = hija directa de donde se importa). */
  nivel: number;
}

export interface ArchivoPlan {
  file: File;
  /** Carpeta destino (ruta relativa). "" = la raíz donde se importa. */
  carpeta: string;
}

export interface PlanImport {
  /** Carpetas a crear, ordenadas padre→hijo (crear en este orden es seguro). */
  carpetas: CarpetaPlan[];
  archivos: ArchivoPlan[];
  /** Qué se dejó afuera y por qué — se muestra, no se esconde. */
  ignorados: { nombre: string; motivo: string }[];
  totalBytes: number;
}

/** La ruta de carpetas de un archivo, sin su nombre. */
function carpetaDe(rutaRelativa: string): string {
  const partes = rutaRelativa.split("/").filter(Boolean);
  partes.pop(); // el archivo
  return partes.join("/");
}

/**
 * Un nombre de carpeta/archivo que el drive pueda guardar: sin barras ni
 * caracteres de control, sin espacios de sobra y con un largo razonable.
 */
export function limpiarNombre(nombre: string): string {
  return nombre.replace(/[\u0000-\u001f/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

/**
 * Orden de recorrido en profundidad: el padre siempre antes que sus hijos, y
 * los hermanos alfabéticos. Sirve para las dos cosas a la vez — crear las
 * carpetas sin que falte el padre, y dibujar el árbol de la vista previa como
 * se ve en el explorador. Comparar segmento a segmento (y no la ruta entera)
 * evita que un hermano tipo "Contratos 2026" se cuele entre "Contratos" y sus
 * hijos, que es lo que pasa comparando el string completo.
 */
function compararRutas(a: string, b: string): number {
  const A = a.split("/");
  const B = b.split("/");
  for (let i = 0; i < Math.min(A.length, B.length); i++) {
    const c = A[i].localeCompare(B[i], "es");
    if (c !== 0) return c;
  }
  return A.length - B.length;
}

/**
 * Arma el plan a partir de los archivos que devuelve un `<input webkitdirectory>`
 * o un drop de carpetas. `rutaDe` permite pasar la ruta cuando no viene en
 * `webkitRelativePath` (el drag&drop la arma a mano).
 */
export function planificarImport(
  files: File[],
  opts: { rutaDe?: (f: File) => string; incluirOcultos?: boolean } = {},
): PlanImport {
  const rutaDe = opts.rutaDe ?? ((f: File) => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name);

  const carpetas = new Map<string, CarpetaPlan>();
  const archivos: ArchivoPlan[] = [];
  const ignorados: { nombre: string; motivo: string }[] = [];
  let totalBytes = 0;

  for (const f of files) {
    const ruta = rutaDe(f).replace(/\\/g, "/");
    const nombre = ruta.split("/").pop() ?? f.name;

    if (BASURA.has(nombre.toLowerCase())) {
      ignorados.push({ nombre: ruta, motivo: "archivo del sistema" });
      continue;
    }
    if (!opts.incluirOcultos && nombre.startsWith(".")) {
      ignorados.push({ nombre: ruta, motivo: "archivo oculto" });
      continue;
    }
    if (f.size === 0) {
      ignorados.push({ nombre: ruta, motivo: "archivo vacío" });
      continue;
    }

    const carpeta = carpetaDe(ruta);
    const niveles = carpeta ? carpeta.split("/").filter(Boolean) : [];
    if (niveles.length > PROFUNDIDAD_MAX) {
      ignorados.push({ nombre: ruta, motivo: `más de ${PROFUNDIDAD_MAX} niveles de carpeta` });
      continue;
    }

    // Cada nivel de la ruta es una carpeta a crear (si no estaba ya en el plan).
    let acumulada = "";
    let padre: string | null = null;
    niveles.forEach((n, i) => {
      const limpio = limpiarNombre(n);
      acumulada = acumulada ? `${acumulada}/${limpio}` : limpio;
      if (!carpetas.has(acumulada)) {
        carpetas.set(acumulada, { ruta: acumulada, nombre: limpio, padre, nivel: i });
      }
      padre = acumulada;
    });

    archivos.push({ file: f, carpeta: acumulada });
    totalBytes += f.size;
  }

  // Padre antes que hijo: crear en este orden garantiza que el padre exista.
  const ordenadas = [...carpetas.values()].sort((a, b) => compararRutas(a.ruta, b.ruta));

  return { carpetas: ordenadas, archivos, ignorados, totalBytes };
}

/** Lo mínimo que se necesita saber de una carpeta que YA está en el drive. */
export interface CarpetaExistente {
  id: string;
  name: string;
  parentId: string | null;
}

/**
 * Qué carpetas del plan ya existen en el drive y hay que REUSAR.
 *
 * Sin esto, importar dos veces la misma carpeta deja el drive con "Contratos"
 * y "Contratos" — el usuario quería fusionar, no duplicar. Se resuelve en el
 * mismo orden padre→hijo del plan: una carpeta sólo puede existir si su padre
 * también existía (si el padre es nuevo, la hija todavía no está en ningún
 * lado). La comparación de nombres ignora mayúsculas y espacios de sobra.
 *
 * @returns ruta del plan → id de la carpeta existente que se reusa.
 */
export function planReuso(
  carpetas: CarpetaPlan[],
  existentes: CarpetaExistente[],
  destino: string | null,
): Map<string, string> {
  const clave = (parentId: string | null, name: string) => `${parentId ?? ""}\u0000${name.trim().toLowerCase()}`;
  const indice = new Map<string, string>();
  for (const e of existentes) indice.set(clave(e.parentId, e.name), e.id);

  const reuso = new Map<string, string>();
  for (const c of carpetas) {
    // Padre nuevo (no está en `reuso`) ⇒ la hija no puede existir todavía.
    const padreId = c.padre === null ? destino : reuso.get(c.padre);
    if (padreId === undefined) continue;
    const hit = indice.get(clave(padreId, c.nombre));
    if (hit) reuso.set(c.ruta, hit);
  }
  return reuso;
}

/**
 * Cuántas rutas acepta el endpoint del árbol por llamada. Un año de contratos
 * puede tener más carpetas que eso, así que el cliente parte en lotes.
 */
export const CARPETAS_POR_LLAMADA = 400;

/**
 * Cuántos archivos se pueden subir de una sentada (preset DRIVE del rate limit:
 * 400 cada 15 min, y cada archivo es un request). Pasado ese número el servidor
 * empieza a devolver 429, así que conviene avisar ANTES y partir en tandas.
 */
export const ARCHIVOS_POR_TANDA = 400;

/**
 * Parte una lista en lotes conservando el orden. Para el árbol eso alcanza:
 * como viene en profundidad, el padre siempre cae en el mismo lote que sus
 * hijos o en uno anterior — nunca después.
 */
export function enLotes<T>(items: T[], tamano: number): T[][] {
  if (items.length <= tamano) return items.length > 0 ? [items] : [];
  const lotes: T[][] = [];
  for (let i = 0; i < items.length; i += tamano) lotes.push(items.slice(i, i + tamano));
  return lotes;
}

/** Tamaño legible para el resumen del plan. */
export function bytesLegibles(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * Recorre los `DataTransferItem` de un drop y devuelve los archivos con su ruta
 * relativa. El navegador NO da `webkitRelativePath` en un drop: hay que caminar
 * el árbol con la API de entries.
 */
export async function archivosDesdeDrop(items: DataTransferItemList): Promise<{ file: File; ruta: string }[]> {
  const raices: FileSystemEntry[] = [];
  for (const item of Array.from(items)) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) raices.push(entry);
  }

  const salida: { file: File; ruta: string }[] = [];

  const leerDir = (dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> =>
    new Promise((resolve) => {
      const reader = dir.createReader();
      const acumulado: FileSystemEntry[] = [];
      // readEntries devuelve de a tandas: hay que llamarlo hasta que venga vacío.
      const leer = () => reader.readEntries((tanda) => {
        if (tanda.length === 0) { resolve(acumulado); return; }
        acumulado.push(...tanda);
        leer();
      }, () => resolve(acumulado));
      leer();
    });

  const caminar = async (entry: FileSystemEntry, prefijo: string, nivel: number): Promise<void> => {
    if (nivel > PROFUNDIDAD_MAX) return;
    if (entry.isFile) {
      const file = await new Promise<File | null>((resolve) =>
        (entry as FileSystemFileEntry).file((f) => resolve(f), () => resolve(null)),
      );
      if (file) salida.push({ file, ruta: prefijo ? `${prefijo}/${file.name}` : file.name });
      return;
    }
    const hijos = await leerDir(entry as FileSystemDirectoryEntry);
    const base = prefijo ? `${prefijo}/${entry.name}` : entry.name;
    for (const h of hijos) await caminar(h, base, nivel + 1);
  };

  for (const r of raices) {
    // Un archivo suelto no crea carpeta; una carpeta sí lleva su nombre.
    await caminar(r, "", 0);
  }
  return salida;
}
