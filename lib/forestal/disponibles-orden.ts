/**
 * Por qué columna se ordena «Productos disponibles» y cómo (ADR-418).
 *
 * La tabla del stock no ordenaba por ninguna columna: para contestar «cuál es
 * el paquete más viejo» o «cuál tiene más piezas» había que exportar a Excel
 * —cosa que esta pestaña tampoco hacía— o leer las 33 filas a ojo.
 *
 * PURO: la comparación vive acá, con tests, y no adentro de un componente de
 * 2.000 líneas donde nadie la puede probar.
 */

export type CampoOrden =
  | "codigo"
  | "producto"
  | "especie"
  | "piezas"
  | "volumen"
  | "pieTablar"
  | "saldo"
  | "edad"
  | "valor";

export interface Orden {
  by: CampoOrden;
  dir: "asc" | "desc";
}

/** Las columnas de texto: se comparan con `localeCompare`, no restando. */
const TEXTO: ReadonlySet<CampoOrden> = new Set<CampoOrden>(["codigo", "producto", "especie"]);

/** Lo mínimo que una fila tiene que saber decir de sí misma para ordenarse. */
export interface FilaOrdenable {
  codigo: string;
  producto: string;
  especie: string;
  piezas: number | null;
  volumenM3: number;
  pieTablar: number;
  saldoCorridaM3: number;
  diasParado: number | null;
  valorSoles: number | null;
}

const numeroDe = (f: FilaOrdenable, campo: CampoOrden): number | null => {
  switch (campo) {
    case "piezas":
      return f.piezas;
    case "volumen":
      return f.volumenM3;
    case "pieTablar":
      return f.pieTablar;
    case "saldo":
      return f.saldoCorridaM3;
    case "edad":
      return f.diasParado;
    case "valor":
      return f.valorSoles;
    default:
      return null;
  }
};

const textoDe = (f: FilaOrdenable, campo: CampoOrden): string => {
  switch (campo) {
    case "codigo":
      return f.codigo;
    case "producto":
      return f.producto;
    case "especie":
      return f.especie;
    default:
      return "";
  }
};

/**
 * Compara dos filas. Los **nulos y los vacíos van siempre al final**, suba o
 * baje el orden.
 *
 * Un paquete sin piezas declaradas no es «el que menos tiene»: es uno del que
 * no se sabe. Mezclarlo con los ceros reales haría que la lista de «lo que
 * menos queda» empiece por 19 filas que no dicen nada — y son justo las 19 que
 * el libro tiene hoy sin cantidad.
 */
export function compararDisponibles(a: FilaOrdenable, b: FilaOrdenable, orden: Orden): number {
  const signo = orden.dir === "asc" ? 1 : -1;
  if (TEXTO.has(orden.by)) {
    const ta = textoDe(a, orden.by).trim();
    const tb = textoDe(b, orden.by).trim();
    if (!ta && !tb) return 0;
    if (!ta) return 1;
    if (!tb) return -1;
    return signo * ta.localeCompare(tb, "es-PE");
  }
  const na = numeroDe(a, orden.by);
  const nb = numeroDe(b, orden.by);
  if (na == null && nb == null) return 0;
  if (na == null) return 1;
  if (nb == null) return -1;
  return signo * (na - nb);
}

/** Ordena sin tocar el array de entrada: la lista filtrada se reusa. */
export function ordenarDisponibles<T extends FilaOrdenable>(
  filas: readonly T[],
  orden: Orden,
): T[] {
  return [...filas].sort((a, b) => compararDisponibles(a, b, orden));
}

/**
 * Qué pasa al hacer click en una cabecera.
 *
 * La misma columna da vuelta el sentido. Una columna nueva empieza por donde
 * se mira primero: los textos de la A a la Z, y los números de mayor a menor
 * —el paquete más viejo, el más grande, el que más vale—, que es lo que se
 * busca cuando alguien ordena por esa columna.
 */
export function siguienteOrden(prev: Orden, campo: CampoOrden): Orden {
  if (prev.by === campo) return { by: campo, dir: prev.dir === "asc" ? "desc" : "asc" };
  return { by: campo, dir: TEXTO.has(campo) ? "asc" : "desc" };
}
