/**
 * Palabras que CIERRAN el dictado y mandan lo dictado.
 *
 * Existen porque anotar a viva voz es de manos ocupadas: si para enviar hay que
 * soltar la manguera del combustible y tocar la pantalla, el dictado no sirve.
 * Se comparan contra la frase entera, no como substring: «listo, ya cargué» NO
 * puede mandar el mensaje a mitad de la oración.
 */
export const COMANDOS_ENVIAR = new Set([
  "listo",
  "enviar",
  "manda",
  "mandalo",
  "envialo",
  "ya esta",
]);
export const COMANDO_CANCELAR = new Set(["cancelar", "borra eso", "borrar", "olvidalo"]);

export const normalizarComando = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z ]/g, "")
    .trim();

/** Suma lo dictado o transcrito a lo que ya hay en el campo, con un espacio. */
export const juntar = (prev: string, mas: string) =>
  prev ? `${prev.replace(/\s+$/, "")} ${mas}` : mas;
