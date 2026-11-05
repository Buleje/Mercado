/**
 * lib/rrhh/parecido-nombre.ts — ¿la cuenta de Adelantos «Chato» es el trabajador
 * «Chato Gallinero»? Puro y client-safe.
 *
 * Por qué (medido 04-11 en Blas): 0 de 11 trabajadores estaban unidos a su
 * cuenta de Adelantos. La sugerencia buscaba SOLO por documento o celular y 10
 * de 11 no tienen DNI cargado (0 cuentas con teléfono): nunca sugería nada, y
 * «Traer de Adelantos» habría creado un segundo «Chato» al lado del que ya
 * estaba. El nombre es lo único que las dos fichas tienen siempre.
 *
 * Nunca une solo: devuelve una SUGERENCIA y la persona confirma con «Unir».
 * - `fuerte`: todas las palabras del nombre más corto están en el otro
 *   («Chato» ↔ «Chato Gallinero», «Quispe Galindo Victor» ↔ «Victor Quispe»).
 * - `parcial`: comparten alguna palabra («Mario Buleje» ↔ «Mario Pérez»). Solo
 *   se ofrece dentro de la ficha de la persona, nunca en un aviso general.
 */

/** Palabras que no identifican a nadie («Señor de CCNN Selva de Oro», «Joven 1 de Sabalillo»). */
const VACIAS: ReadonlySet<string> = new Set([
  "de", "del", "la", "las", "los", "el", "y", "e",
  "sr", "sra", "srta", "senor", "senora", "don", "dona", "ing",
  "joven", "otro", "otra", "chofer", "mama", "papa", "hijo", "hija", "tio", "tia",
  "prueba", "test", "qa",
]);

/** Largo mínimo de una palabra para contar como coincidencia («Leo» no basta: 3 letras empatan demasiado). */
const MINIMO = 4;

export type FuerzaParecido = "fuerte" | "parcial";

export interface Parecido {
  fuerza: FuerzaParecido;
  /** Las palabras en común, como se escriben en la cuenta («chato»). */
  comun: string[];
}

/** «Quispe Galindo  Víctor (hijo)» → ["quispe", "galindo", "victor"]. */
export function palabrasDelNombre(nombre: string | null | undefined): string[] {
  const limpio = (nombre ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, " ");
  const vistas = new Set<string>();
  for (const p of limpio.split(" ")) {
    if (p.length < 2 || VACIAS.has(p) || /^\d+$/.test(p)) continue;
    vistas.add(p);
  }
  return [...vistas];
}

/**
 * ¿Se parecen el trabajador (nombre y apodo) y el nombre de la cuenta? `null`
 * si no comparten ninguna palabra de 4 letras o más.
 */
export function parecidoDeNombre(trabajador: { nombre: string; apodo?: string | null }, cuenta: string): Parecido | null {
  const delTrabajador = palabrasDelNombre(trabajador.nombre);
  const conApodo = new Set([...delTrabajador, ...palabrasDelNombre(trabajador.apodo)]);
  const deLaCuenta = palabrasDelNombre(cuenta);
  const comun = deLaCuenta.filter((p) => p.length >= MINIMO && conApodo.has(p));
  if (comun.length === 0) return null;

  // Fuerte: el nombre más corto entra entero en el otro (contra el nombre o contra el apodo).
  const entra = (corto: readonly string[], largo: ReadonlySet<string>) => corto.length > 0 && corto.every((p) => largo.has(p));
  const setCuenta = new Set(deLaCuenta);
  const apodo = palabrasDelNombre(trabajador.apodo);
  const fuerte =
    entra(deLaCuenta, conApodo) ||
    entra(delTrabajador, setCuenta) ||
    (apodo.length > 0 && entra(apodo, setCuenta));
  return { fuerza: fuerte ? "fuerte" : "parcial", comun };
}

export interface ParDeNombre {
  trabajadorId: string;
  cuentaId: string;
  fuerza: FuerzaParecido;
  comun: string[];
}

/**
 * Todos los pares trabajador ↔ cuenta con nombre parecido, los fuertes primero.
 * Una cuenta que se parece FUERTE a dos trabajadores («Joven» ↔ «Joven 1» y
 * «Joven 2») es ambigua: no sale en `soloFuertes` (que la elija la persona).
 * Al revés también: un trabajador fuerte con DOS cuentas («Juan» ↔ «Juan Ríos»
 * y «Juan Pérez») queda fuera de `soloFuertes` (revisión 04-11).
 */
export function paresPorNombre(
  trabajadores: readonly { id: string; nombre: string; apodo?: string | null }[],
  cuentas: readonly { id: string; nombre: string }[],
  opciones: { soloFuertes?: boolean } = {},
): ParDeNombre[] {
  const pares: ParDeNombre[] = [];
  for (const c of cuentas) {
    const deEsta: ParDeNombre[] = [];
    for (const t of trabajadores) {
      const p = parecidoDeNombre(t, c.nombre);
      if (p) deEsta.push({ trabajadorId: t.id, cuentaId: c.id, ...p });
    }
    const fuertes = deEsta.filter((p) => p.fuerza === "fuerte");
    if (opciones.soloFuertes) {
      if (fuertes.length === 1 && fuertes[0]) pares.push(fuertes[0]);
    } else {
      pares.push(...deEsta);
    }
  }
  if (opciones.soloFuertes) {
    const cuentasPorTrabajador = new Map<string, number>();
    for (const p of pares) cuentasPorTrabajador.set(p.trabajadorId, (cuentasPorTrabajador.get(p.trabajadorId) ?? 0) + 1);
    return pares.filter((p) => cuentasPorTrabajador.get(p.trabajadorId) === 1).sort((a, b) => b.comun.length - a.comun.length);
  }
  return pares.sort((a, b) => (a.fuerza === b.fuerza ? b.comun.length - a.comun.length : a.fuerza === "fuerte" ? -1 : 1));
}
