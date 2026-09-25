/**
 * En qué orden se importa un libro completo.
 *
 * Las cinco secciones no son independientes: la producción se atribuye contra
 * las guías de los ingresos, y el retrozado parte trozas que tienen que existir.
 * Importarlas en el orden de las hojas del Excel —o peor, en paralelo— hace que
 * la producción no encuentre su origen y entre sin consumos, que es justo lo que
 * deja el saldo mintiendo.
 *
 * El orden no es una preferencia: es la cadena de custodia.
 *
 *     Ingresos → Retrozado → Consumos → Producción → Salidas
 *
 * PURO: decide el orden y describe el plan. Los fetch los hace la pantalla.
 */

import { FORMATOS_LIBRO, TITULO_FORMATO, type FilaParseada, type FormatoCtp, type FormatoLibro } from "./ctp-formatos-serfor";

/** Menor = va antes. */
const ORDEN: Record<FormatoCtp, number> = {
  ingresos: 1,
  /* Antes que los consumos: un consumo puede apuntar a un retrozo, y el
     retrozo tiene que existir para que resuelva. */
  retrozado: 2,
  consumos: 3,
  /* Después de los consumos e ingresos: de ahí sale la atribución. */
  produccion: 4,
  /* Última: un despacho sale de lo producido. */
  salidas: 5,
  /* Los inventarios van PRIMERO: son la existencia con la que se arranca, y
     todo lo del libro ocurre después de ella. Entre ellos la rolliza va antes
     que la aserrada por la misma razón que los ingresos anteceden a la
     producción: la materia prima existe antes que el producto. Con el mismo
     número quedaban en el orden en que el operador soltó los archivos, y la
     pantalla mostraba «primero la aserrada», que se lee al revés de como
     funciona un aserradero. */
  inventarioTrozas: -2,
  inventarioAserrada: -1,
};

export type SeccionDelLibro = {
  formato: FormatoCtp;
  nombreHoja: string;
  filaCabecera: number;
  parseadas: FilaParseada[];
};

/**
 * Ordena las secciones por dependencia.
 *
 * Las secciones vacías se quedan afuera: una hoja de la plantilla que el
 * operador no llenó no es un error, es una sección que no usa.
 */
export function ordenarSecciones(secciones: readonly SeccionDelLibro[]): SeccionDelLibro[] {
  return secciones
    .filter((s) => s.parseadas.length > 0)
    .slice()
    .sort((a, b) => ORDEN[a.formato] - ORDEN[b.formato]);
}

/**
 * Qué se va a hacer, en palabras, antes de tocar nada.
 *
 * El operador sube un archivo con cinco hojas y tiene derecho a saber qué va a
 * pasar con cada una antes de apretar importar.
 */
export function describirPlan(secciones: readonly SeccionDelLibro[]): string[] {
  const orden = ordenarSecciones(secciones);
  if (orden.length === 0) return [];
  return orden.map((s) => {
    const listas = s.parseadas.filter((f) => f.problemas.length === 0).length;
    const conProblema = s.parseadas.length - listas;
    return [
      `${TITULO_FORMATO[s.formato]}: ${listas} fila${listas === 1 ? "" : "s"}`,
      conProblema > 0 && `${conProblema} incompleta${conProblema === 1 ? "" : "s"}`,
    ]
      .filter(Boolean)
      .join(" · ");
  });
}

/**
 * Las secciones del LIBRO que el archivo no trae — para avisar sin alarmar.
 *
 * Los inventarios quedan afuera a propósito: no son secciones del libro sino la
 * foto de la existencia inicial. Listarlos como «faltantes» le diría al operador
 * que su libro está incompleto cuando no lo está.
 */
export function seccionesAusentes(secciones: readonly SeccionDelLibro[]): FormatoLibro[] {
  const hay = new Set(ordenarSecciones(secciones).map((s) => s.formato));
  return FORMATOS_LIBRO.filter((f) => !hay.has(f as FormatoCtp));
}
