/**
 * Un campo que dice «—» está tan vacío como uno que no dice nada.
 *
 * La tabla del libro pinta un guion cuando el dato es `null`, así que el
 * operario aprende que **guion = no hay dato**. Cuando alguien lo escribe a
 * mano —o cuando entra por un Excel importado, que es de donde vienen casi
 * todos— el campo guarda literalmente `"—"` y deja de parecer un hueco para el
 * código, aunque en la pantalla se vea idéntico a uno.
 *
 * El resultado era el peor posible: la fila muestra un guion, el operario abre
 * el modal a completarla, y el campo aparece «ya cargado» y bloqueado. Con un
 * valor que no dice nada.
 *
 * Acá se decide una sola vez qué cuenta como ausencia, y lo usan **las dos
 * puntas**: el modal para ofrecer el campo, y el servidor para dejar
 * escribirlo. Si sólo lo supiera el cliente, el guardado lo rechazaría.
 */

/**
 * Las PALABRAS con que la gente dice «no hay dato». Los signos sueltos van
 * aparte, por patrón (ver `SOLO_SIGNOS`).
 *
 * Sólo se listan formas que en estos campos —especie, producto, presentación,
 * referencia, observaciones— **nunca** son un dato legítimo. Un producto no se
 * llama «n/a» y una especie no se llama «...». Ante la duda, no se agrega: dar
 * por vacío un dato real lo dejaría sobrescribible sin aviso.
 */
const PALABRAS_DE_AUSENCIA = new Set([
  "n/a", "na", "n.a.", "n.a", "no aplica", "noaplica",
  "s/d", "sd", "s.d.", "sin dato", "sin datos", "sindato",
  "s/n", "sin nombre", "sin especificar", "no especifica", "no especificado",
  "ninguno", "ninguna", "nada", "null", "undefined", "vacio", "vacío",
]);

/**
 * Sólo signos de relleno, en cualquier cantidad: `-`, `—`, `___`, `...`, `??`.
 *
 * Es un patrón y no una lista de largos porque enumerarlos se olvida de uno —
 * lo encontró un test con `___`, que estaba a un guion bajo de los que sí
 * figuraban. Exige que **todo** el contenido sean esos signos, así que un
 * código como «S-1» o «Lote 15-2026» no entra.
 */
const SOLO_SIGNOS = /^[-–—_.·?¿*]+$/;

/**
 * ¿Este campo está vacío de verdad, o sólo dice que no hay nada?
 *
 * Las dos cosas cuentan como ausencia: `null`, `""` y cualquier marcador.
 */
export function esCampoSinDato(v: string | null | undefined): boolean {
  if (v == null) return true;
  const limpio = v.trim();
  if (limpio === "") return true;
  return SOLO_SIGNOS.test(limpio) || PALABRAS_DE_AUSENCIA.has(limpio.toLowerCase());
}

/**
 * El marcador que había, si lo que ocupaba el campo era uno.
 *
 * Sirve para el rastro: reemplazar un `«—»` por «Tablas» **no es lo mismo** que
 * llenar un campo que nunca dijo nada, y la auditoría tiene que poder
 * distinguirlo. `null` cuando el campo estaba de verdad vacío.
 */
export function marcadorDeAusencia(v: string | null | undefined): string | null {
  if (v == null) return null;
  const limpio = v.trim();
  if (limpio === "") return null;
  return SOLO_SIGNOS.test(limpio) || PALABRAS_DE_AUSENCIA.has(limpio.toLowerCase()) ? limpio : null;
}
