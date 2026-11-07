/**
 * Un enlace con varias carpetas (23-10, Brandon: «al contador le mandas
 * licencias, contratos y SUNAT de una vez»).
 *
 * Sin schema nuevo: son los enlaces de carpeta de siempre (uno por carpeta,
 * cada uno con su vencimiento y su clave) y la URL los junta:
 * `/c/<t1>?mas=<t2>,<t3>`. La página resuelve cada token igual que si llegara
 * solo, así que no se publica nada que cada enlace no publique ya por separado.
 */

/**
 * Marca «sin candado» de un enlace de carpeta (Brandon 24-10, «QR sin papeles
 * con candado»): va en el propio token, sin schema. Un enlace con la marca
 * NUNCA sirve un papel restringido (por sí o por su cadena de carpetas), lo
 * haya armado quien lo haya armado — el dueño y el admin los ven, así que la
 * regla de siempre (`enlaceSigueSirviendo`) se los abría al tercero del QR.
 * Lo ponen todos los enlaces de varias carpetas (`folders/share-lote`: hoja
 * «Para inspección» y «Compartir» de Esenciales); «Compartir carpeta» de a
 * una sigue sin ella. No se puede quitar ni poner desde afuera: el token se
 * busca exacto, así que sin el prefijo es otro enlace (que no existe).
 * `s` no es hexadecimal: un token de siempre nunca empieza así.
 */
export const PREFIJO_SIN_CANDADO = "sc";

/** Formato exacto de un token de carpeta: `randomBytes(24).toString("hex")`, con o sin la marca «sin candado». */
export const TOKEN_ENLACE_CARPETA = /^(?:sc)?[0-9a-f]{48}$/;

/** ¿Este enlace de carpeta deja afuera todo lo que tiene candado? */
export function esEnlaceSinCandado(token: string): boolean {
  return token.startsWith(PREFIJO_SIN_CANDADO);
}

/** Tope de carpetas en un enlace (el de la ruta + 9 en `?mas=`). */
export const MAX_CARPETAS_POR_ENLACE = 10;

/**
 * Tokens extra de `?mas=`: sólo los que tienen el formato exacto, sin
 * repetidos ni el de la ruta, y como mucho 9. Lo que no cumple se descarta en
 * silencio (un enlace mal copiado abre lo que sí sirve).
 */
export function leerTokensMas(mas: string | string[] | undefined, principal: string): string[] {
  const crudo = Array.isArray(mas) ? mas.join(",") : (mas ?? "");
  // 9 tokens de 50 + comas = 458 caracteres: lo que pase de 1.000 no es un enlace nuestro.
  if (!crudo || crudo.length > 1000) return [];
  const vistos = new Set<string>([principal]);
  const extras: string[] = [];
  for (const parte of crudo.split(",")) {
    const t = parte.trim();
    if (!TOKEN_ENLACE_CARPETA.test(t) || vistos.has(t)) continue;
    vistos.add(t);
    extras.push(t);
    if (extras.length >= MAX_CARPETAS_POR_ENLACE - 1) break;
  }
  return extras;
}

/** `${origin}/c/<t1>?mas=<t2>,<t3>` (sin `?mas=` si es una sola carpeta). */
export function armarEnlaceVariasCarpetas(origin: string, tokens: string[]): string {
  const [primero, ...resto] = tokens;
  const base = `${origin}/c/${primero}`;
  return resto.length > 0 ? `${base}?mas=${resto.join(",")}` : base;
}

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/**
 * «jueves 10/09», en hora de Lima (igual en el servidor y en el navegador). El
 * día va escrito a mano: el nombre y el relleno que da `Intl` cambian según la
 * versión de ICU (Node dio «9/9» con `2-digit`).
 */
export function fechaConDiaCorta(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  // Por partes (no por el texto armado, que cambia de forma según el idioma).
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(d);
  const parte = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value);
  const [y, m, dia] = [parte("year"), parte("month"), parte("day")];
  const semana = DIAS_SEMANA[new Date(Date.UTC(y, m - 1, dia)).getUTCDay()];
  return `${semana} ${String(dia).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/** «A», «A y B», «A, B y C». */
export function listaConY(nombres: string[]): string {
  if (nombres.length <= 1) return nombres[0] ?? "";
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/**
 * Texto para WhatsApp. El enlace va solo en su línea: una coma o un punto
 * pegados al final los toma como parte de la URL algún lector de enlaces.
 */
export function mensajeEnlaceCarpetas(nombres: string[], enlace: string, venceIso: string): string {
  const fecha = fechaConDiaCorta(venceIso);
  return `Te comparto mis papeles (${listaConY(nombres)}):\n${enlace}\nVence el ${fecha}.`;
}
