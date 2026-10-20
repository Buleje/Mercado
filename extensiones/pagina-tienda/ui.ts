/**
 * Clases que repiten la portada y el marco de la tienda de cada negocio
 * (ADR-511): el diseño de Musa (`pagina-musa/ui.tsx` + `tema.ts`) sin nada de
 * Musa. Colores SÓLO con las variables `--ti-*` de `tema.ts` (blanco, casi
 * negro, un gris `--ti-suave` y UN acento `--ti-acento`): acá no hay hex.
 *
 * `CSS_PIEZAS` completa la hoja de `cssTema` (que trae colores, letra y radios)
 * con lo que no cambia entre negocios: la escala de letras, los tiempos, el
 * foco, el filete de los enlaces, la barra pegajosa, el contador de la bolsa
 * y el menú del celular. Va en el mismo `<style>` (portada y marco).
 *
 * Pautas (las de Musa): un botón lleno por bloque (`BOTON`), el segundo con
 * borde (`BOTON_BORDE`), el resto enlaces con `ti-subrayado`; nada bajo 14 px;
 * títulos por tamaño y peso, sin mayúsculas ni cursivas; sin degradés ni sombra.
 */
import { ID_PAGINA_TIENDA } from "./tema";

export const ANCHO = "mx-auto w-full max-w-[1280px] px-4 sm:px-6 lg:px-8";

const MOVER =
  "transition-[transform,background-color,color,border-color] duration-[var(--ti-dur-corto)] ease-[var(--ti-ease)] active:scale-[.97] active:duration-[var(--ti-dur-micro)] ti-foco";

/**
 * Botón principal: el acento del negocio con su texto (≥ 4,5:1, lo asegura `tema.ts`).
 * Al pasar se mezcla con el texto secundario: más oscuro en claro (más contraste
 * con el blanco), sin saltos ni sombra.
 */
export const BOTON = `inline-flex h-12 items-center justify-center gap-2 rounded-[var(--ti-radio-control)] bg-[var(--ti-acento)] px-7 text-[length:var(--ti-t-boton)] font-semibold text-[var(--ti-sobre-acento)] hover:bg-[color-mix(in_srgb,var(--ti-acento)_72%,var(--ti-texto-2))] ${MOVER}`;

/** Botón secundario: filete fino de tinta que se rellena al pasar. */
export const BOTON_BORDE = `inline-flex h-12 items-center justify-center gap-2 rounded-[var(--ti-radio-control)] border border-[var(--ti-texto)] px-7 text-[length:var(--ti-t-boton)] font-semibold text-[var(--ti-texto)] hover:bg-[var(--ti-texto)] hover:text-[var(--ti-fondo)] ${MOVER}`;

/** Enlace de texto con el filete que crece desde el centro (48 px de alto para el dedo). */
export const ENLACE_VER =
  "ti-subrayado ti-foco group inline-flex h-12 shrink-0 items-center gap-2 text-[length:var(--ti-t-boton)] font-semibold text-[var(--ti-texto)] [--ti-subrayado-abajo:.45rem]";

/** Ícono redondo de 48 px del encabezado (sin `display`: cada uso pone el suyo). */
export const ICONO =
  "ti-foco h-12 w-12 items-center justify-center gap-2 rounded-full text-[var(--ti-texto)] transition-colors duration-[var(--ti-dur-corto)] hover:bg-[var(--ti-suave)]";

/** Título de un bloque de la portada (`<h2>`). */
export const TITULO_BLOQUE = "ti-titulo text-[length:var(--ti-t-bloque)] text-[var(--ti-texto)]";

/** Texto corriente (16 px) en gris. */
export const CUERPO = "text-[length:var(--ti-t-cuerpo)] leading-relaxed text-[var(--ti-texto-2)]";

/** Sección de la portada: separada por un filete fino, no por bandas de color. */
export const SECCION = "scroll-mt-28 border-t border-[var(--ti-linea-suave)] py-12 sm:py-16";

/** `target` y `rel` de los enlaces que salen de la tienda (WhatsApp, redes). */
export const EXTERNO = { target: "_blank", rel: "noopener noreferrer" } as const;

const sel = `[data-pagina="${ID_PAGINA_TIENDA}"]`;

/**
 * Lo que `cssTema` no trae. Puente con el DS: dentro de la tienda, los tokens
 * generales (`--surface-*`, `--text-*`, `--rule-*`, `--accent`) valen los
 * `--ti-*`, así el menú de la cuenta y los íconos de pago se visten igual.
 * El foco de globals.css (`button:focus-visible{border-radius:8px…}` sin capa)
 * volvía rectángulos las píldoras: `revert-layer` le devuelve su `rounded-*`.
 */
export const CSS_PIEZAS = `
${sel}{--ti-t-heroe:clamp(2.25rem,1.5rem + 3vw,3.75rem);--ti-t-bloque:clamp(1.625rem,1.35rem + 1.1vw,2.25rem);
--ti-t-cuerpo:1rem;--ti-t-boton:1rem;--ti-t-chico:.875rem;
--ti-dur-micro:120ms;--ti-dur-corto:200ms;--ti-dur-medio:320ms;--ti-dur-largo:600ms;
--ti-ease:cubic-bezier(.22,1,.36,1);--ti-ease-rebote:cubic-bezier(.34,1.56,.64,1);
--surface-canvas:var(--ti-fondo);--surface-raised:var(--ti-fondo);--surface-sunken:var(--ti-suave);
--rule-soft:var(--ti-linea-suave);--rule-base:var(--ti-linea);--rule-strong:var(--ti-texto);
--text-primary:var(--ti-texto);--text-secondary:var(--ti-texto-2);--text-tertiary:var(--ti-texto-3);
--accent:var(--ti-acento);--color-primary:var(--ti-acento)}
${sel} .ti-titulo{font-family:var(--ti-fuente);font-weight:600;letter-spacing:-0.025em;line-height:1.12;text-wrap:balance}
${sel} .ti-nombre{font-family:var(--ti-fuente);font-weight:600;letter-spacing:-0.02em}
${sel} .ti-kicker{font-size:var(--ti-t-chico);font-weight:500;line-height:1.4;letter-spacing:0;text-transform:none}
${sel} .ti-sombra-flotante{box-shadow:var(--ti-sombra-flotante)}
${sel} :is(a,button,input,select,textarea,[role="button"],[tabindex])[class*="rounded"]:focus-visible{border-radius:revert-layer}
${sel} [class*="focus-visible:outline"]:focus-visible{outline:revert-layer;outline-offset:revert-layer}
${sel} .ti-foco:focus-visible{outline:2px solid var(--ti-texto);outline-offset:2px;box-shadow:0 0 0 2px var(--ti-fondo)}
${sel} .ti-subrayado{position:relative}
${sel} .ti-subrayado::after{content:"";position:absolute;left:0;right:0;bottom:var(--ti-subrayado-abajo,.55rem);height:1.5px;border-radius:2px;background:var(--ti-subrayado,var(--ti-texto));transform:scaleX(0);transform-origin:center;transition:transform var(--ti-dur-corto) var(--ti-ease)}
${sel} .ti-subrayado:hover::after,${sel} .ti-subrayado:focus-visible::after,${sel} .ti-subrayado[aria-current="page"]::after{transform:scaleX(1)}
${sel} .ti-barra{background:var(--ti-fondo);border-bottom:1px solid transparent;transition:background-color var(--ti-dur-corto) var(--ti-ease),border-color var(--ti-dur-corto) var(--ti-ease)}
${sel} .ti-barra[data-desplazado="si"]{background:color-mix(in srgb,var(--ti-fondo) 92%,transparent);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-bottom-color:var(--ti-linea-suave)}
${sel} .ti-buscador-movil{transition:transform var(--ti-dur-medio) var(--ti-ease),opacity var(--ti-dur-corto) var(--ti-ease)}
${sel} .ti-buscador-movil[data-oculto="si"]{transform:translateY(-100%);opacity:0;pointer-events:none}
${sel} .ti-sello-contador{position:relative;display:inline-grid;place-items:center;width:var(--ti-lado,22px);height:var(--ti-lado,22px);border-radius:999px;overflow:hidden;background:var(--ti-acento);color:var(--ti-sobre-acento);font:600 calc(var(--ti-lado,22px) * .5)/1 var(--ti-fuente);font-variant-numeric:tabular-nums;letter-spacing:-.02em;outline:1.5px solid color-mix(in srgb,var(--ti-acento) 22%,transparent);outline-offset:2px}
${sel} .ti-sello-contador>*{grid-area:1/1}
${sel} .ti-contador-num{animation:ti-contador-sube var(--ti-dur-corto) var(--ti-ease-rebote) both}
${sel} .ti-contador-num-sale{animation:ti-contador-sale var(--ti-dur-corto) var(--ti-ease) both}
${sel} .ti-aro-pulso{animation:ti-aro-pulso 400ms var(--ti-ease) both}
${sel} .ti-entrar{animation:ti-entrar var(--ti-dur-largo) var(--ti-ease) both;animation-delay:calc(var(--ti-i,0) * 70ms)}
${sel} .ti-menu-movil:popover-open{animation:ti-cajon-izq var(--ti-dur-medio) var(--ti-ease)}
${sel} .ti-menu-movil::backdrop{background:color-mix(in srgb,var(--ti-texto) 40%,transparent)}
${sel} .ti-sin-barra{scrollbar-width:none}
${sel} .ti-sin-barra::-webkit-scrollbar{display:none}
${sel} .ti-desvanecer{-webkit-mask-image:linear-gradient(90deg,transparent,black 1rem,black calc(100% - 3rem),transparent);mask-image:linear-gradient(90deg,transparent,black 1rem,black calc(100% - 3rem),transparent)}
@media (min-width:640px){${sel} .ti-desvanecer{-webkit-mask-image:none;mask-image:none}}
@keyframes ti-contador-sube{from{transform:translateY(75%);opacity:0}to{transform:none;opacity:1}}
@keyframes ti-contador-sale{from{transform:none;opacity:1}to{transform:translateY(-75%);opacity:0}}
@keyframes ti-aro-pulso{from{transform:scale(1);opacity:.6}to{transform:scale(1.6);opacity:0}}
@keyframes ti-entrar{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes ti-cajon-izq{from{transform:translateX(-100%)}to{transform:none}}
@media (prefers-reduced-motion: reduce){
${sel} *,${sel} *::before,${sel} *::after{transition-duration:.01ms!important;animation:none!important;scroll-behavior:auto!important}
${sel} .ti-contador-num-sale,${sel} .ti-aro-pulso{display:none}
${sel} .ti-entrar{opacity:1;transform:none}
}
`;

/** «S/ 43.90»; sin céntimos si el precio es entero («S/ 159»), como la vitrina de Musa. */
export const solesCortos = (n: number): string => (Number.isInteger(n) ? `S/ ${n}` : `S/ ${n.toFixed(2)}`);

/** «1 producto», «3 productos». */
export const unidades = (n: number): string => `${n} ${n === 1 ? "producto" : "productos"}`;

/** Las rutas de la tienda de un negocio (el catálogo entiende `?q=`, `?categoria=`, `?oferta=1` y `?orden=`). */
export function rutasTienda(slug: string) {
  const base = `/t/${encodeURIComponent(slug)}`;
  const catalogo = `${base}/tienda`;
  return {
    base,
    catalogo,
    categoria: (c: string) => `${catalogo}?categoria=${encodeURIComponent(c)}`,
    ofertas: `${catalogo}?oferta=1`,
    porPrecio: `${catalogo}?orden=precio-asc`,
    politicas: `${base}#politicas`,
  };
}

/** Enlace de WhatsApp con el mensaje armado (sólo se llama con número: sin número no hay botón). */
export const enlaceWhatsapp = (numero: string, mensaje: string): string => `https://wa.me/${numero}?text=${encodeURIComponent(mensaje)}`;

/** El WhatsApp para leerlo: 51921585006 → «921 585 006». */
export function numeroVisible(whatsapp: string): string {
  const local = whatsapp.startsWith("51") && whatsapp.length === 11 ? whatsapp.slice(2) : whatsapp;
  return local.length === 9 ? `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}` : local;
}

/** La inicial del negocio para el monograma («Pizza Pucallpa» → «P»; «7 Mares» → «7»). */
export function inicialDe(nombre: string): string {
  const letra = nombre.trim().match(/[\p{L}\p{N}]/u)?.[0];
  return (letra ?? "·").toLocaleUpperCase("es-PE");
}
