"use client";

/**
 * Lo que se ve y se oye al agregar algo a la bolsa del salón.
 *
 * · `volarABolsa(origen, imagen)` — un círculo con la foto sale de la tarjeta
 *   (o del modal de la ficha rápida) y vuela en arco hasta el botón de la
 *   bolsa (`[data-mu-bolsa]`, en `Bolsa.tsx`); al llegar, el botón y su número
 *   (`[data-mu-contador]`) dan un salto. Web Animations API: la portada no
 *   tiene `MotionProvider` (sin framer). Con «reducir movimiento» no vuela ni
 *   salta: el número cambia y listo.
 * · `sonarAgregado()` — el mismo «pop» del carrito de la tienda (880→1400 Hz,
 *   120 ms). `addItem` ya lo toca solo (`cart-context`); `addMultiple` (la
 *   cantidad de la ficha y del modal) no, así que esos caminos lo piden acá.
 *   El `AudioContext` nace dentro del clic: así el navegador lo deja sonar.
 */

/** `EASE.editorial` del sistema de motion. */
const EDITORIAL = "cubic-bezier(0.22, 1, 0.36, 1)";
const DURACION = 700;
/** Lado (px) con que aterriza el círculo sobre la bolsa. */
const ATERRIZA = 22;

export function reducirMovimiento(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** El salto del botón de la bolsa y de su número. */
export function saltarBolsa(): void {
  if (reducirMovimiento()) return;
  const boton = document.querySelector<HTMLElement>("[data-mu-bolsa]");
  if (!boton) return;
  boton.animate([{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(1)" }], { duration: 380, easing: EDITORIAL });
  boton
    .querySelector<HTMLElement>("[data-mu-contador]")
    ?.animate([{ transform: "scale(1)" }, { transform: "scale(1.55)" }, { transform: "scale(0.9)" }, { transform: "scale(1)" }], { duration: 520, easing: "ease-out" });
}

/**
 * Vuela la foto desde `origen` hasta la bolsa. Dos capas: la de afuera se
 * mueve en X acelerando y la de adentro en Y frenando, así el camino es un
 * arco (sube primero, después va hacia la bolsa) y no una recta.
 */
export function volarABolsa(origen: Element | null | undefined, imagen: string | null | undefined): void {
  if (typeof window === "undefined" || reducirMovimiento()) return;
  const boton = document.querySelector<HTMLElement>("[data-mu-bolsa]");
  const desde = origen?.getBoundingClientRect();
  const hasta = boton?.getBoundingClientRect();
  if (!origen || !desde || !hasta || hasta.width === 0 || desde.width === 0) {
    saltarBolsa();
    return;
  }

  const lado = Math.round(Math.max(56, Math.min(140, Math.min(desde.width, desde.height) * 0.6)));
  const x0 = desde.left + desde.width / 2 - lado / 2;
  const y0 = desde.top + desde.height / 2 - lado / 2;
  const dx = hasta.left + hasta.width / 2 - (x0 + lado / 2);
  const dy = hasta.top + hasta.height / 2 - (y0 + lado / 2);

  const capa = document.createElement("div");
  capa.setAttribute("aria-hidden", "true");
  capa.dataset.bbVuelo = "";
  capa.className = "pointer-events-none fixed z-system";
  capa.style.cssText = `left:${x0}px;top:${y0}px;width:${lado}px;height:${lado}px;`;
  const bola = document.createElement("div");
  bola.className = "h-full w-full rounded-full border-2 border-[var(--surface-canvas)] bg-[var(--mu-nude-claro)] bg-cover bg-center shadow-[var(--shadow-lg)]";
  if (imagen) bola.style.backgroundImage = `url(${JSON.stringify(imagen)})`;
  capa.appendChild(bola);
  // Dentro de `[data-pagina]`: ahí viven los colores del salón (`--mu-*`).
  (origen.closest("[data-pagina]") ?? document.body).appendChild(capa);

  const enX = capa.animate([{ transform: "translateX(0)" }, { transform: `translateX(${dx}px)` }], { duration: DURACION, easing: "cubic-bezier(0.55, 0, 0.85, 0.35)", fill: "forwards" });
  bola.animate(
    [
      { transform: "translateY(0) scale(0.85)", opacity: 0.9 },
      { transform: `translateY(${dy * 0.15}px) scale(1.05)`, opacity: 1, offset: 0.12 },
      { transform: `translateY(${dy}px) scale(${ATERRIZA / lado})`, opacity: 0.85 },
    ],
    { duration: DURACION, easing: "cubic-bezier(0.1, 0.6, 0.3, 1)", fill: "forwards" },
  );
  let listo = false;
  const terminar = () => {
    if (listo) return;
    listo = true;
    capa.remove();
    saltarBolsa();
  };
  enX.onfinish = terminar;
  enX.oncancel = terminar;
}

let contexto: AudioContext | null = null;

/** El «pop» de agregar. Silencioso si el navegador no tiene audio. */
export function sonarAgregado(): void {
  if (typeof window === "undefined") return;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  try {
    if (!contexto || contexto.state === "closed") contexto = new Ctor();
  } catch {
    return;
  }
  const ac = contexto;
  const tocar = () => {
    try {
      const osc = ac.createOscillator();
      const vol = ac.createGain();
      osc.connect(vol);
      vol.connect(ac.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1400, ac.currentTime + 0.08);
      vol.gain.setValueAtTime(0.15, ac.currentTime);
      vol.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.12);
      osc.start(ac.currentTime);
      osc.stop(ac.currentTime + 0.12);
    } catch {
      /* sin audio: no pasa nada */
    }
  };
  if (ac.state === "suspended") {
    ac.resume().then(tocar, (err: unknown) => console.warn("[salon] el navegador no dejó sonar", err));
  } else {
    tocar();
  }
}
