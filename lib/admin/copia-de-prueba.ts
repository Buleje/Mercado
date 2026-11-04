/**
 * Distingue una COPIA DE PRUEBA del negocio real, para que el panel lo pinte
 * distinto (franja gris + «PRUEBA») y nadie anote una guía en la copia equivocada.
 *
 * Regla (Brandon 04-11): palabra COMPLETA qa | prueba | demo | test en el slug
 * (partido por «-») o en el nombre (partido por todo lo que no sea letra o número).
 * «Testa», «Quasar» o «Demostración» NO cuentan: se compara la palabra entera,
 * nunca un pedazo. Se aceptan los plurales («pruebas», «tests», «demos»), porque
 * una copia llamada «Pruebas» que se viera como real es justo el error que esto evita.
 */

const PALABRAS_DE_PRUEBA = new Set(["qa", "prueba", "pruebas", "demo", "demos", "test", "tests"]);

/** minúsculas y sin tildes: «PRUEBA», «Prueba» y «prüeba» son la misma palabra. */
function palabrasDe(texto: string | null | undefined, separador: RegExp): string[] {
  if (!texto) return [];
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(separador)
    .filter(Boolean);
}

export function esCopiaDePrueba(negocio: {
  slug?: string | null;
  name?: string | null;
}): boolean {
  const palabras = [
    ...palabrasDe(negocio.slug, /-/),
    ...palabrasDe(negocio.name, /[^a-z0-9]+/),
  ];
  return palabras.some((p) => PALABRAS_DE_PRUEBA.has(p));
}

/** Cómo se pinta la franja: copia de prueba (gris), negocio forestal real o cualquier otro real. */
export type TonoNegocio = "prueba" | "forestal" | "general";

export function tonoDelNegocio(negocio: {
  slug?: string | null;
  name?: string | null;
  forestal: boolean;
}): TonoNegocio {
  if (esCopiaDePrueba(negocio)) return "prueba";
  return negocio.forestal ? "forestal" : "general";
}
