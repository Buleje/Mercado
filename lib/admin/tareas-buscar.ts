/**
 * Buscar en Tareas (OPER-6): por título, encargado o descripción, sin que
 * importen mayúsculas ni tildes («jhon» encuentra «Jhon Pérez», «perez»
 * también). El estado se filtra aparte, con los chips de siempre.
 */

export interface TareaBuscable {
  title: string;
  description?: string | null;
  assignedTo?: string | null;
  status: string;
}

/** Minúsculas y sin tildes: lo que escribes en el buscador no tiene por qué llevarlas. */
export function normalizarBusqueda(texto: string): string {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

/**
 * Las tareas que pasan el estado elegido Y el texto buscado. Cada palabra del
 * buscador tiene que aparecer en algún campo («aceite jhon» = las tareas de
 * aceite que tiene Jhon), no la frase entera seguida.
 */
export function filtrarTareas<T extends TareaBuscable>(tareas: readonly T[], estado: string, busqueda: string): T[] {
  const palabras = normalizarBusqueda(busqueda).split(/\s+/).filter(Boolean);
  return tareas.filter((t) => {
    if (estado !== "todas" && t.status !== estado) return false;
    if (palabras.length === 0) return true;
    const texto = normalizarBusqueda([t.title, t.assignedTo ?? "", t.description ?? ""].join(" "));
    return palabras.every((p) => texto.includes(p));
  });
}

const PESO_PRIORIDAD: Record<string, number> = { urgente: 0, alta: 1, media: 2, baja: 3 };

/**
 * Lo abierto, lo más urgente primero: la que vence antes (las que no tienen
 * fecha, al final) y, a igual fecha, la de más prioridad. No muta la lista y
 * respeta el orden que ya traía en los empates.
 */
export function ordenarPorUrgencia<T extends { dueDate?: string | null; priority?: string }>(tareas: readonly T[]): T[] {
  return tareas
    .map((t, i) => ({ t, i }))
    .sort((a, b) => {
      const fa = a.t.dueDate || "9999-99-99";
      const fb = b.t.dueDate || "9999-99-99";
      if (fa !== fb) return fa < fb ? -1 : 1;
      const pa = PESO_PRIORIDAD[a.t.priority ?? ""] ?? 4;
      const pb = PESO_PRIORIDAD[b.t.priority ?? ""] ?? 4;
      return pa - pb || a.i - b.i;
    })
    .map((x) => x.t);
}

/**
 * Los nombres para elegir encargado: el personal (sin repetir, en orden
 * alfabético). Si la tarea ya tenía alguien que no está en la lista (otra
 * persona escrita a mano, o un cesado), se respeta tal cual.
 */
export function nombresDelEquipo(personal: readonly { nombre: string }[]): string[] {
  const vistos = new Set<string>();
  for (const p of personal) {
    const n = p.nombre.trim();
    if (n) vistos.add(n);
  }
  return [...vistos].sort((a, b) => a.localeCompare(b, "es"));
}
