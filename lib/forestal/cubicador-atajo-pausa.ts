/**
 * lib/forestal/cubicador-atajo-pausa.ts
 *
 * Cuándo Espacio (o Ctrl+Espacio) alterna pausa/reanudar del dictado del
 * cubicador (Brandon, 2026-09-23: «que se cumpla siempre esa tecla esa
 * función al estar ese panel»). Pura y sin DOM: el componente arma estos
 * objetos planos a partir del evento y del elemento con foco, y esta función
 * decide — así se prueba cada combinación sin levantar un navegador.
 *
 * Reglas (ver también el botón «Pausar · Espacio» en `cubicador-entrada-voz`):
 * - Sin dictado escuchando, Espacio no significa nada acá.
 * - `e.repeat` (tecla mantenida) se ignora entero.
 * - Un campo de TEXTO real (Observación, Código, cualquier textarea o
 *   contenteditable) deja que Espacio escriba su espacio, como siempre. Las
 *   celdas de la grilla NO cuentan: son `<input type="text"
 *   inputMode="decimal">`, y ahí un espacio no vale nada.
 * - Un diálogo AJENO abierto encima (Dueños, Especies, Declarar…) que no
 *   contiene al cubicador se queda con la tecla — no es asunto nuestro.
 * - Ctrl+Espacio (o Cmd+Espacio) se salta las dos excepciones de arriba: sirve
 *   para pausar aun con el cursor parado en Observación.
 */

/** Lo mínimo del `KeyboardEvent` que hace falta — nunca el evento real, para
 *  poder armar el caso de test a mano. */
export interface TeclaPausaEvento {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  repeat: boolean;
}

/** Lo mínimo del elemento con foco — nunca el `Element` real. */
export interface ElementoConFoco {
  tagName: string;
  type?: string | null;
  inputMode?: string | null;
  isContentEditable?: boolean;
}

export interface ContextoAtajoPausa {
  /** El dictado está escuchando: sin esto, Espacio no hace nada. */
  listening: boolean;
  /** El elemento con foco al momento del evento (null = ninguno puntual, ej. `body`). */
  foco: ElementoConFoco | null;
  /** Hay un diálogo AJENO (Dueños, Especies, Declarar…) abierto ENCIMA — el
   *  suyo propio, «Producir sin lote», no cuenta como ajeno. */
  dialogoAjenoAbierto: boolean;
}

const TECLAS_ESPACIO = new Set([" ", "Spacebar"]);

/** Espesor/ancho/largo/cantidad de la grilla: texto por debajo, pero el
 *  `inputMode` dice que es un número — ahí un espacio no escribe nada. */
function esCeldaNumerica(modo: string): boolean {
  return modo === "decimal" || modo === "numeric";
}

/** Observación, Código, cualquier `<textarea>` o `contenteditable`: ahí
 *  Espacio escribe un espacio de verdad, como en cualquier campo. */
function esCampoDeTextoReal(el: ElementoConFoco): boolean {
  if (el.isContentEditable) return true;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;
  const tipo = (el.type ?? "text").toLowerCase();
  if (tipo !== "text" && tipo !== "search") return false; // number/checkbox/etc: no es dónde se escribe un espacio
  return !esCeldaNumerica((el.inputMode ?? "").toLowerCase());
}

/**
 * true si este keydown debe alternar pausa/reanudar — y por lo tanto el
 * caller tiene que `preventDefault()` + `stopPropagation()` antes de llamar a
 * `alternarPausa()`. false = dejarlo pasar tal cual (escribe, navega, o es
 * cosa de otro diálogo).
 */
export function debeAlternarPausaCubicador(e: TeclaPausaEvento, ctx: ContextoAtajoPausa): boolean {
  if (!ctx.listening) return false;
  if (e.repeat) return false;
  if (!TECLAS_ESPACIO.has(e.key)) return false;

  const conCtrl = e.ctrlKey || e.metaKey;
  if (conCtrl) return true; // Ctrl+Espacio alterna siempre, pase lo que pase

  if (ctx.dialogoAjenoAbierto) return false;
  if (ctx.foco && esCampoDeTextoReal(ctx.foco)) return false;
  return true;
}
