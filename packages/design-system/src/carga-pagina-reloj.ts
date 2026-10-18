/**
 * Reloj compartido del cargador de página (`CargaPagina` + `NavProgress`).
 *
 * Brandon 2026-10-17: «simplemente una carga del 1 al 100, minimalista, en
 * todas mis páginas». El progreso es SIMULADO —no hay forma de saber cuánto
 * falta—: la curva vive en CSS (`.carga-progreso` en globals.css) y arranca en
 * el instante que guarda este módulo. Así el número que muestra NavProgress al
 * hacer clic y el del `loading.tsx` que monta después siguen la MISMA curva:
 * nunca hay un salto hacia atrás.
 *
 * También cuenta cuántos cargadores de página hay montados: NavProgress no
 * da la navegación por terminada mientras un `loading.tsx` siga en pantalla.
 *
 * Sin React: módulo plano, una sola instancia en el navegador.
 */

let inicio: number | null = null;
let cargadores = 0;
const oyentes = new Set<() => void>();

function ahora(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function avisar(): void {
  for (const oyente of oyentes) oyente();
}

/** Arranca el reloj (clic en un enlace interno). */
export function iniciarCargaPagina(): void {
  inicio = ahora();
  avisar();
}

/** Para el reloj: la página llegó. */
export function terminarCargaPagina(): void {
  inicio = null;
  avisar();
}

/** Milisegundos desde que empezó la carga en curso (0 si no hay ninguna). */
export function msDeCarga(): number {
  return inicio === null ? 0 : Math.max(0, ahora() - inicio);
}

/** Un cargador de página entra en pantalla; devuelve la función que lo saca. */
export function registrarCargadorDePagina(): () => void {
  cargadores += 1;
  avisar();
  let fuera = false;
  return () => {
    if (fuera) return;
    fuera = true;
    cargadores = Math.max(0, cargadores - 1);
    avisar();
  };
}

export function hayCargadorDePagina(): boolean {
  return cargadores > 0;
}

/** Para `useSyncExternalStore`: avisa cada vez que cambia el reloj o la cuenta. */
export function suscribirCargaPagina(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}
