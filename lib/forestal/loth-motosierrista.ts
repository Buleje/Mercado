/**
 * De quién sale el motosierrista de una tala o un trozado (Brandon 24-10):
 * primero tu personal (Recursos Humanos), después los nombres que ya están en
 * el libro (terceros que nunca pasaron por la planilla) y al final las
 * personas del Directorio forestal (las que tienen DNI). Siempre se puede
 * escribir otro.
 *
 * No es obligatorio —el formato SERFOR no tiene esa columna—, pero el semáforo
 * del plan avisa de los árboles sin motosierrista (`loth-plan-semaforo`).
 *
 * PURO: lo usa `LothTalaDatosInternos` y lo prueba el test sin navegador.
 */

export interface OpcionMotosierrista {
  nombre: string;
  /** De dónde sale: el puesto, «ya está en el libro» o «Directorio». */
  nota: string;
}

/** Para comparar nombres: minúsculas, sin tildes y con los espacios juntos. */
export function claveDeNombre(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function opcionesMotosierrista(o: {
  personal: readonly { nombre: string; puesto?: { nombre: string } | null }[];
  usados: readonly string[];
  directorio: readonly { nombre: string; docTipo: string | null; activo?: boolean }[];
}): OpcionMotosierrista[] {
  const out: OpcionMotosierrista[] = [];
  const vistos = new Set<string>();
  const sumar = (nombre: string, nota: string) => {
    const n = nombre.replace(/\s+/g, " ").trim();
    const k = claveDeNombre(n);
    if (!k || vistos.has(k)) return;
    vistos.add(k);
    out.push({ nombre: n, nota });
  };
  for (const c of o.personal) sumar(c.nombre, c.puesto?.nombre?.trim() || "Tu personal");
  for (const u of o.usados) sumar(u, "Ya está en el libro");
  for (const p of o.directorio) if (p.activo !== false && p.docTipo === "DNI") sumar(p.nombre, "Directorio");
  return out;
}

/** Lo escrito no está en ninguna lista: se guarda igual, como nombre nuevo. */
export function esMotosierristaNuevo(texto: string, opciones: readonly OpcionMotosierrista[]): boolean {
  const k = claveDeNombre(texto);
  return k.length > 0 && !opciones.some((x) => claveDeNombre(x.nombre) === k);
}
