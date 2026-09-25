/**
 * conflictos — qué hacer cuando lo que se importa YA está en el drive.
 *
 * Es la pregunta que hace el explorador de Windows al copiar una carpeta sobre
 * otra: "ya existe un archivo con este nombre, ¿reemplazar, omitir o conservar
 * los dos?". Hasta ahora el importador decidía solo y en silencio: si el nombre
 * y el peso coincidían lo omitía, y si el peso era distinto subía un segundo
 * archivo con el mismo nombre. Ninguna de las dos es siempre la correcta —
 * "contrato.pdf" con otro peso puede ser la versión nueva del contrato o un
 * contrato distinto que alguien nombró igual.
 *
 * Acá sólo se CLASIFICA; decidir es del usuario (o de su "aplicar a todos").
 */

/** Lo que ya vive en la carpeta destino. */
export interface ArchivoExistente {
  name: string;
  size: number;
  /** Para reemplazar hace falta saber a qué documento subirle la versión. */
  id?: string;
}

export type EstadoConflicto =
  /** No hay nada con ese nombre: se sube y listo. */
  | "nuevo"
  /** Mismo nombre y mismo peso: es el mismo archivo, no vale la pena subirlo. */
  | "identico"
  /** Mismo nombre, contenido distinto: acá hay que preguntar. */
  | "conflicto";

/** Qué hacer con los que están en conflicto. */
export type Resolucion =
  /** Sube como versión nueva del documento que ya está (la anterior queda en el historial). */
  | "reemplazar"
  /** No lo sube. */
  | "omitir"
  /** Lo sube con otro nombre: "contrato (2).pdf". */
  | "conservar-ambos";

export interface Clasificado<T> {
  item: T;
  estado: EstadoConflicto;
  /** El documento que ya estaba, cuando hay conflicto (para versionar). */
  existente?: ArchivoExistente;
}

/** Compara nombres como lo hace un sistema de archivos de escritorio: sin distinguir mayúsculas. */
const clave = (nombre: string) => nombre.trim().toLowerCase();

/**
 * Clasifica cada archivo del plan contra lo que ya hay en SU carpeta destino.
 *
 * @param archivos   lo que se quiere subir, con la carpeta a la que va
 * @param existentes lo que ya hay, por carpeta (la misma clave que usa el plan)
 */
export function clasificarConflictos<T>(
  archivos: { item: T; carpeta: string; nombre: string; size: number }[],
  existentes: Record<string, ArchivoExistente[]>,
): Clasificado<T>[] {
  // Índice por carpeta+nombre: comparar linealmente contra 400 archivos por
  // cada uno de otros 400 son 160.000 comparaciones.
  const indice = new Map<string, ArchivoExistente[]>();
  for (const [carpeta, lista] of Object.entries(existentes)) {
    for (const e of lista) {
      const k = `${carpeta}\u0000${clave(e.name)}`;
      const previos = indice.get(k);
      if (previos) previos.push(e);
      else indice.set(k, [e]);
    }
  }

  return archivos.map(({ item, carpeta, nombre, size }) => {
    const candidatos = indice.get(`${carpeta}\u0000${clave(nombre)}`) ?? [];
    if (candidatos.length === 0) return { item, estado: "nuevo" as const };
    // Si alguno pesa igual, es el mismo archivo: no hay nada que preguntar.
    const igual = candidatos.find((c) => c.size === size);
    if (igual) return { item, estado: "identico" as const, existente: igual };
    return { item, estado: "conflicto" as const, existente: candidatos[0] };
  });
}

/**
 * Un nombre que no choque: "contrato.pdf" → "contrato (2).pdf".
 *
 * Sigue subiendo el número hasta encontrar uno libre, igual que el explorador.
 * `usados` se va llenando con lo que este mismo import ya reservó: si entran
 * dos "contrato.pdf" nuevos, el segundo no puede volver a elegir "(2)".
 */
export function nombreLibre(nombre: string, usados: Set<string>): string {
  if (!usados.has(clave(nombre))) {
    usados.add(clave(nombre));
    return nombre;
  }
  const punto = nombre.lastIndexOf(".");
  const base = punto > 0 ? nombre.slice(0, punto) : nombre;
  const ext = punto > 0 ? nombre.slice(punto) : "";
  // Si ya venía como "contrato (2).pdf", se sigue desde ahí en vez de anidar.
  const m = /^(.*) \((\d+)\)$/.exec(base);
  const raiz = m ? m[1] : base;
  let n = m ? Number(m[2]) + 1 : 2;
  for (;;) {
    const candidato = `${raiz} (${n})${ext}`;
    if (!usados.has(clave(candidato))) {
      usados.add(clave(candidato));
      return candidato;
    }
    n++;
  }
}

/** Resumen para el encabezado del diálogo. */
export function contar<T>(clasificados: Clasificado<T>[]): Record<EstadoConflicto, number> {
  return clasificados.reduce(
    (acc, c) => ({ ...acc, [c.estado]: acc[c.estado] + 1 }),
    { nuevo: 0, identico: 0, conflicto: 0 } as Record<EstadoConflicto, number>,
  );
}
