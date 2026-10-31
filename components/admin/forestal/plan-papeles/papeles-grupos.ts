/**
 * Cómo se ordena «Papeles del permiso» en la pestaña: por lo que te pide hacer
 * (Brandon 26-10: «mejor diseñado y ordenado»). Vencidos y los que faltan
 * arriba; lo que vence pronto; lo que está al día; y al final, plegado, lo que
 * la norma pide sólo en algunos casos.
 *
 * PURO (sin React): reparte la lista que ya armó `papelesDePlan` y no cambia
 * ninguna cuenta. Lo prueba `__tests__/plan-papeles-grupos.test.ts`.
 */
import type { EstadoPapel, PapelDelPlan } from "@/lib/forestal/loth-plan-papeles";

export interface GrupoPapeles {
  estado: EstadoPapel;
  titulo: string;
  papeles: PapelDelPlan[];
}

/** El orden de los grupos en pantalla: primero lo que pide acción. */
const ORDEN: readonly EstadoPapel[] = ["vencido", "falta", "vence_pronto", "presente", "segun_caso"];

const TITULO: Record<EstadoPapel, string> = {
  vencido: "Vencidos",
  falta: "Faltan",
  vence_pronto: "Por vencer",
  presente: "Al día",
  segun_caso: "Si aplica",
};

/**
 * Los grupos con papeles, en `ORDEN`. Dentro de cada uno se respeta el orden
 * de la norma, salvo «Por vencer» (el que vence antes, arriba) y «Si aplica»
 * (lo que se sube primero; lo que se archiva solo, como las GTF, al final).
 */
export function agruparPapeles(lista: readonly PapelDelPlan[]): GrupoPapeles[] {
  return ORDEN.map((estado) => {
    const papeles = lista.filter((p) => p.estado === estado);
    if (estado === "vence_pronto") papeles.sort((a, b) => (a.vence ?? "9999").localeCompare(b.vence ?? "9999"));
    if (estado === "segun_caso") papeles.sort((a, b) => Number(b.subible) - Number(a.subible));
    return { estado, titulo: TITULO[estado], papeles };
  }).filter((g) => g.papeles.length > 0);
}

/**
 * El estado de cada papel OBLIGATORIO, para la barra de avance: los que están
 * primero (llenan la barra) y después los que faltan o vencieron.
 */
export function tramosDeAvance(lista: readonly PapelDelPlan[]): { clave: string; nombre: string; estado: EstadoPapel }[] {
  const peso: Record<EstadoPapel, number> = { presente: 0, vence_pronto: 1, vencido: 2, falta: 3, segun_caso: 4 };
  return lista
    .filter((p) => p.exigencia === "siempre")
    .map((p) => ({ clave: p.clave, nombre: p.nombre, estado: p.estado }))
    .sort((a, b) => peso[a.estado] - peso[b.estado]);
}

interface CarpetaConCasilleros {
  clave: string;
  nombre: string;
  /** `papel`/`cuenta`/`porNorma`: la vista alineada al tipo de plan (ADR-517). */
  casilleros: readonly { clave: string; nombre: string; papel?: string | null; cuenta?: string; porNorma?: boolean }[];
}

/**
 * A qué carpeta del plan y a qué casillero va un papel: la MISMA regla de
 * «Subir» (su carpeta de la plantilla, o la primera si el negocio la quitó; el
 * primer casillero que lo representa, o suelto). null = el plan no tiene
 * carpetas todavía.
 */
export function destinoDelPapel<C extends CarpetaConCasilleros>(
  papel: Pick<PapelDelPlan, "carpeta" | "casilleros"> & { clave?: string },
  carpetas: readonly C[],
): { carpeta: C; casillero: C["casilleros"][number] | null } | null {
  /* Vista alineada al tipo de plan (ADR-517): el casillero que el servidor le
     asignó al papel —el de la plantilla o el «de la norma»—, donde esté. */
  if (papel.clave) {
    for (const es of [(x: C["casilleros"][number]) => x.cuenta === "obligatorio", (x: C["casilleros"][number]) => x.porNorma === true]) {
      for (const c of carpetas) {
        const k = c.casilleros.find((x) => x.papel === papel.clave && es(x));
        if (k) return { carpeta: c, casillero: k };
      }
    }
  }
  const carpeta = carpetas.find((c) => c.clave === papel.carpeta) ?? carpetas[0];
  if (!carpeta) return null;
  const casillero = carpeta.casilleros.find((k) => papel.casilleros.includes(k.clave)) ?? null;
  return { carpeta, casillero };
}
