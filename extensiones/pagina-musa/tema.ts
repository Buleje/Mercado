/**
 * La identidad de «Musa» — rediseño minimalista del 16-10 (pedido de Brandon:
 * «menos colores fuertes de la marca, sin mucho ruido visual, como mi.com»).
 * La paleta, las fuentes, la escala, las sombras y los tiempos viven SÓLO acá.
 * Los componentes usan `var(--mu-*)` y las clases `.mu-*`; no llevan hex.
 *
 * Paleta: blanco casi plano, texto casi negro, grises cálidos suaves y UN acento
 * (el café del manual, #735b4c), usado poco: ahorro, «por encargo», el sello.
 * Los nombres viejos (`--mu-rosa`, `--mu-oro`, `--mu-selva`, `--mu-achiote`,
 * `--mu-cacao`, los `--mu-tinte-*`) siguen existiendo para no romper nada, pero
 * ahora valen neutros: las bandas de color por sección desaparecen solas.
 * `--mu-cacao` dejó de ser un fondo oscuro: es la «superficie de contraste»
 * clara (franja, pie, barra de compra) con `--mu-sobre-cacao` casi negro encima.
 *
 * 1. `CSS_TEMA` — encerrada en `[data-pagina="pagina-musa"]`: lo que dibuja
 *    esta carpeta (portada, encabezado, pie, catálogo, bolsa).
 * 2. `CSS_GLOBAL` (ADR-460) — en `:root`, SÓLO en las páginas de la tienda de
 *    este negocio (la monta el marco): cuenta, pedidos, legales y sus modales.
 *
 * Contraste (WCAG 2.x, medido 16-10; ≥4,5 = texto chico):
 * · Claro: texto #1a1a1a 17,4 sobre blanco · secundario #4a4642 9,35 ·
 *   terciario #6b6661 5,68 (5,17 sobre el gris #f5f4f2) · acento #735b4c 6,31
 *   (5,51 sobre su fondo #f3efeb) · éxito #2f5d45 6,73 sobre #edf3ef.
 * · Oscuro: #f5f4f2 16,9 sobre #141312 · secundario 11,4 · terciario #a8a29b
 *   7,34 (6,81 sobre la tarjeta) · acento #dcc7b8 11,4 · éxito 8,28.
 * · Botón: blanco sobre #1a1a1a 17,4; en oscuro, #141312 sobre #f5f4f2 16,9.
 */
import { carasDe, familiaDisplay, familiaTexto, PARES, type ParLetras } from "./letras";

export const ID_PAGINA = "pagina-musa";

/*
 * Letras: UNA sans para todo, en `letras.ts` (A = Plus Jakarta Sans; `?letras=b|c`
 * en la portada para comparar con Inter o Manrope). ¿Por qué no `next/font`? En
 * «Buleje Beauty» su hoja de @font-face se colaba en TODAS las tiendas (medido
 * 01-10 en /t/mi-pollo). Acá el @font-face vive DENTRO de este `<style>`.
 */
const TITULOS = familiaDisplay("a");

const sel = `[data-pagina="${ID_PAGINA}"]`;

/** Lo que NO cambia entre claro y oscuro: escala, forma, tiempos y los envases (son objetos). */
const FIJOS = `
--mu-t-seccion:clamp(1.75rem,1.4rem + 1.5vw,2.5rem);
--mu-t-titulo:clamp(1.375rem,1.2rem + .7vw,1.75rem);
--mu-t-script-xl:clamp(1.375rem,1.2rem + .7vw,1.75rem);
--mu-t-script:1.25rem;
--mu-t-precio:clamp(1.75rem,1.5rem + 1vw,2.25rem);
--mu-t-precio-tarjeta:1.125rem;
--mu-t-cuerpo:1rem;
--mu-t-nombre:1rem;
--mu-t-boton:1rem;
--mu-t-chico:.875rem;--mu-t-kicker:.875rem;--mu-tracking-kicker:0;
--mu-radio-tarjeta:16px;--mu-radio-control:12px;--mu-radio-pill:999px;--mu-radio-arco:16px;
--mu-dur-micro:120ms;--mu-dur-corto:200ms;--mu-dur-medio:320ms;--mu-dur-largo:600ms;
--mu-ease:cubic-bezier(.22,1,.36,1);--mu-ease-rebote:cubic-bezier(.34,1.56,.64,1);
--mu-envase-blanco:#faf7f2;--mu-envase-crema:#f1e8dc;--mu-envase-nude:#ead3c2;--mu-envase-ambar:#c98a4b;
--mu-envase-tapa:#1a1a1a;--mu-envase-salvia:#6f8f84;--mu-envase-celeste:#e3edea;--mu-envase-lavanda:#bfb0d1;
--mu-envase-naranja:#e9b97a;--mu-envase-kraft:#c9a27e;--mu-envase-kraft-sombra:#b38e6b;
--mu-envase-etiqueta:#ffffff;--mu-envase-tinta:#1a1a1a;
--mu-sello-nude:#d9b8a3;--mu-sello-m:#1a1a1a;
--mu-velo:#141312;
`;

const CLARO = `
--mu-hueso:#f5f4f2;--mu-nude-claro:#f3f1ee;--mu-nude:#e6e1dc;--mu-crema:#f5f4f2;--mu-nude-fuerte:#cfc8c1;
--mu-acento:#8a6f5e;--mu-acento-tinta:#735b4c;--mu-cacao:#f5f4f2;--mu-cacao-hondo:#efedea;--mu-negro:#1a1a1a;
--mu-sobre-cacao:#1a1a1a;--mu-sobre-cacao-2:#4a4642;
--mu-rosa:#cfc8c1;--mu-rosa-claro:#f5f4f2;--mu-rosa-tinta:#735b4c;
--mu-selva:#cfc8c1;--mu-selva-claro:#f5f4f2;--mu-selva-tinta:#1a1a1a;
--mu-oro:#735b4c;--mu-oro-claro:#f3efeb;--mu-oro-tinta:#735b4c;
--mu-achiote:#cfc8c1;--mu-achiote-claro:#f3efeb;--mu-achiote-tinta:#735b4c;
--mu-boton-fondo:#1a1a1a;--mu-boton-texto:#ffffff;--mu-boton-fondo-hover:#3a3734;
--mu-whatsapp-fondo:#1a1a1a;--mu-whatsapp-texto:#ffffff;
--mu-exito:#2f5d45;--mu-exito-fondo:#edf3ef;
--mu-ahorro:#735b4c;--mu-ahorro-fondo:#f3efeb;
--mu-encargo:#735b4c;--mu-encargo-fondo:#f3efeb;
--mu-contador-fondo:#1a1a1a;--mu-contador-texto:#ffffff;--mu-contador-aro:rgb(26 26 26/.18);
--mu-foco:#1a1a1a;--mu-foco-halo:#ffffff;
--mu-tinte-cabello:#f5f4f2;--mu-tinte-rostro:#f5f4f2;--mu-tinte-cuerpo:#f5f4f2;--mu-tinte-kits:#f5f4f2;
--mu-vitrina:#f5f4f2;--mu-arco-exterior:#ebe8e4;--mu-arco-interior:#f2f0ed;
--mu-envase-sombra:rgb(0 0 0/.08);
--mu-sombra-tarjeta:0 1px 2px rgb(0 0 0/.04);
--mu-sombra-flotante:0 12px 32px -12px rgb(0 0 0/.18);
--surface-canvas:#ffffff;--surface-raised:#ffffff;--surface-sunken:#f5f4f2;
--rule-soft:#ecebe8;--rule-base:#dedbd7;--rule-strong:#1a1a1a;
--text-primary:#1a1a1a;--text-secondary:#4a4642;--text-tertiary:#6b6661;
--accent:#735b4c;--accent-600:#5c4639;--accent-dark:#5c4639;--color-primary:#1a1a1a;
`;

const OSCURO = `
--mu-hueso:#1a1918;--mu-nude-claro:#22201e;--mu-nude:#2e2b28;--mu-crema:#1a1918;--mu-nude-fuerte:#4a4642;
--mu-acento:#c9b3a4;--mu-acento-tinta:#dcc7b8;--mu-cacao:#1c1b19;--mu-cacao-hondo:#181716;--mu-negro:#f5f4f2;
--mu-sobre-cacao:#f5f4f2;--mu-sobre-cacao-2:#cfcac4;
--mu-rosa:#4a4642;--mu-rosa-claro:#1f1e1c;--mu-rosa-tinta:#dcc7b8;
--mu-selva:#4a4642;--mu-selva-claro:#1f1e1c;--mu-selva-tinta:#f5f4f2;
--mu-oro:#dcc7b8;--mu-oro-claro:#2a2420;--mu-oro-tinta:#dcc7b8;
--mu-achiote:#4a4642;--mu-achiote-claro:#2a2420;--mu-achiote-tinta:#dcc7b8;
--mu-boton-fondo:#f5f4f2;--mu-boton-texto:#141312;--mu-boton-fondo-hover:#dedbd7;
--mu-whatsapp-fondo:#f5f4f2;--mu-whatsapp-texto:#141312;
--mu-exito:#a7c9b2;--mu-exito-fondo:#1d2a22;
--mu-ahorro:#dcc7b8;--mu-ahorro-fondo:#2a2420;
--mu-encargo:#dcc7b8;--mu-encargo-fondo:#2a2420;
--mu-contador-fondo:#f5f4f2;--mu-contador-texto:#141312;--mu-contador-aro:rgb(245 244 242/.25);
--mu-foco:#f5f4f2;--mu-foco-halo:#141312;
--mu-tinte-cabello:#1f1e1c;--mu-tinte-rostro:#1f1e1c;--mu-tinte-cuerpo:#1f1e1c;--mu-tinte-kits:#1f1e1c;
--mu-vitrina:#d6d2cc;--mu-arco-exterior:#2a2826;--mu-arco-interior:#222120;
--mu-envase-sombra:rgb(0 0 0/.4);
--mu-sombra-tarjeta:0 1px 2px rgb(0 0 0/.3);
--mu-sombra-flotante:0 16px 40px -16px rgb(0 0 0/.6);
--surface-canvas:#141312;--surface-raised:#1c1b19;--surface-sunken:#1f1e1c;
--rule-soft:#2a2826;--rule-base:#3a3734;--rule-strong:#f5f4f2;
--text-primary:#f5f4f2;--text-secondary:#cfcac4;--text-tertiary:#a8a29b;
--accent:#dcc7b8;--accent-600:#e9dbd1;--accent-dark:#e9dbd1;--color-primary:#f5f4f2;
`;

/*
 * Clases (los nombres viejos siguen, con el estilo nuevo):
 * · Letras: todo en la sans. `.mu-titulo` / `.mu-serif` / `.mu-display` = peso 600,
 *   −0,02 em, sin mayúsculas ni cursiva · `.mu-kicker` = 14 px peso 500 en tipo
 *   oración (antes 12 px en mayúsculas espaciadas) · `.mu-cursiva` y `.mu-script`
 *   ya no tuercen la letra (nunca itálicas en párrafos) · `.mu-precio` tabular.
 * · Forma: `.mu-sombra-tarjeta` / `.mu-sombra-flotante` (el lint no deja
 *   `shadow-[…]`) · `.mu-arco` · `.mu-grano` (ya sin ruido) · `.mu-foco` (aro doble:
 *   tinta por fuera y un halo del fondo en el hueco) · `.mu-subrayado` (filete que
 *   crece desde el centro; color con `--mu-subrayado`).
 * · Foco de globals.css (`button:focus-visible{border-radius:8px;outline:…}` SIN capa):
 *   le gana a toda utilidad y volvía rectángulos las píldoras y los círculos. Acá,
 *   `revert-layer` devuelve el radio de su `rounded-*` y el aro de su
 *   `focus-visible:outline-*` (lo que no declara nada sigue con el aro global).
 * · El sello contador (`SelloContador` en `Sello.tsx`): `.mu-sello-contador`,
 *   `.mu-contador-num` (entra desde abajo) y `.mu-contador-num-sale` (sale hacia arriba).
 * · Movimiento (sobrio): `mu-latido`, `mu-contador-sube`, `mu-aro-pulso`, `mu-entrar`
 *   (con `--mu-i` para escalonar), `mu-girar`. Con «reducir movimiento» todo queda
 *   quieto y nada depende de animarse.
 */
const CLASES = `
${sel} .mu-serif{font-family:var(--mu-fuente-display);font-weight:600;letter-spacing:-0.02em}
${sel} .mu-titulo{font-family:var(--mu-fuente-display);font-weight:600;letter-spacing:-0.025em;line-height:1.12;text-wrap:balance}
${sel} .mu-display{font-family:var(--mu-fuente-display);font-weight:600;letter-spacing:-0.025em;text-transform:none;line-height:1.12}
${sel} .mu-num{font-family:var(--mu-fuente-display);font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-0.02em}
${sel} .mu-script{font-family:var(--mu-fuente-texto);font-weight:600;font-style:normal;letter-spacing:-0.01em;text-transform:none;line-height:1.25}
${sel} .mu-cursiva{font-style:normal;letter-spacing:inherit;text-transform:none}
${sel} .mu-kicker{font-family:var(--mu-fuente-texto);font-size:var(--mu-t-kicker);font-weight:500;line-height:1.4;letter-spacing:0;text-transform:none}
${sel} .mu-precio{font-family:var(--mu-fuente-texto);font-weight:600;line-height:1.1;letter-spacing:-0.01em;font-variant-numeric:tabular-nums}
${sel} .mu-precio-chico{font-family:var(--mu-fuente-texto);font-weight:600;font-variant-numeric:tabular-nums}
${sel} .mu-sombra-tarjeta{box-shadow:var(--mu-sombra-tarjeta)}
${sel} .mu-sombra-flotante{box-shadow:var(--mu-sombra-flotante)}
${sel} .mu-arco{border-radius:var(--mu-radio-arco)}
${sel} :is(a,button,input,select,textarea,[role="button"],[tabindex])[class*="rounded"]:focus-visible{border-radius:revert-layer}
${sel} [class*="focus-visible:outline"]:focus-visible{outline:revert-layer;outline-offset:revert-layer}
body:has(${sel}) aside[aria-label="Cupón de bienvenida"]{display:none!important}
${sel} .mu-foco:focus-visible{outline:2px solid var(--mu-foco);outline-offset:2px;box-shadow:0 0 0 2px var(--mu-foco-halo)}
${sel} .mu-foco-dentro:focus-within{outline:2px solid var(--mu-foco);outline-offset:2px}
${sel} .mu-grano{position:relative}
${sel} .mu-subrayado{position:relative}
${sel} .mu-subrayado::after{content:"";position:absolute;left:0;right:0;bottom:var(--mu-subrayado-abajo,.55rem);height:1.5px;border-radius:2px;background:var(--mu-subrayado,var(--text-primary));transform:scaleX(0);transform-origin:center;transition:transform var(--mu-dur-corto) var(--mu-ease)}
${sel} .mu-subrayado:hover::after,${sel} .mu-subrayado:focus-visible::after,${sel} .mu-subrayado[aria-current="page"]::after{transform:scaleX(1)}
${sel} .mu-barra{background:var(--surface-canvas);border-bottom:1px solid transparent;transition:background-color var(--mu-dur-corto) var(--mu-ease),border-color var(--mu-dur-corto) var(--mu-ease)}
${sel} .mu-barra[data-desplazado="si"]{background:color-mix(in srgb,var(--surface-canvas) 92%,transparent);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-bottom-color:var(--rule-soft)}
${sel} .mu-buscador-movil{transition:transform var(--mu-dur-medio) var(--mu-ease),opacity var(--mu-dur-corto) var(--mu-ease)}
${sel} .mu-buscador-movil[data-oculto="si"]{transform:translateY(-100%);opacity:0;pointer-events:none}
${sel} .mu-sello-contador{position:relative;display:inline-grid;place-items:center;width:var(--mu-lado,22px);height:var(--mu-lado,22px);border-radius:999px;overflow:hidden;background:var(--mu-contador-fondo);color:var(--mu-contador-texto);font:600 calc(var(--mu-lado,22px) * .5)/1 var(--mu-fuente-texto);font-variant-numeric:tabular-nums;letter-spacing:-.02em;outline:1.5px solid var(--mu-contador-aro);outline-offset:2px}
${sel} .mu-sello-contador>*{grid-area:1/1}
${sel} .mu-contador-num{animation:mu-contador-sube var(--mu-dur-corto) var(--mu-ease-rebote) both}
${sel} .mu-contador-num-sale{animation:mu-contador-sale var(--mu-dur-corto) var(--mu-ease) both}
${sel} .mu-aro-pulso{animation:mu-aro-pulso 400ms var(--mu-ease) both}
${sel} .mu-latido{animation:mu-latido var(--mu-dur-medio) var(--mu-ease-rebote)}
${sel} .mu-entrar{animation:mu-entrar var(--mu-dur-largo) var(--mu-ease) both;animation-delay:calc(var(--mu-i,0) * 70ms)}
${sel} .mu-brillo{position:relative;overflow:hidden}
${sel} .mu-menu-movil:popover-open{animation:mu-cajon-izq var(--mu-dur-medio) var(--mu-ease)}
${sel} .mu-menu-movil::backdrop{background:rgb(20 19 18/.4)}
${sel} .mu-sin-barra{scrollbar-width:none}
${sel} .mu-sin-barra::-webkit-scrollbar{display:none}
${sel} .mu-desvanecer{-webkit-mask-image:linear-gradient(90deg,transparent,black 1rem,black calc(100% - 3rem),transparent);mask-image:linear-gradient(90deg,transparent,black 1rem,black calc(100% - 3rem),transparent)}
@media (min-width:640px){${sel} .mu-desvanecer-sm{-webkit-mask-image:none;mask-image:none}}
@media (min-width:768px){${sel} .mu-desvanecer-movil{-webkit-mask-image:none;mask-image:none}}
${sel} .mu-puntos{flex:1;align-self:end;margin-bottom:.4em;height:2px;background-image:radial-gradient(circle,currentColor 1px,transparent 1.3px);background-size:6px 2px;background-repeat:repeat-x;opacity:.35}
${sel} .noise-texture-bg::after{display:none}
${sel} .mu-girar{animation:mu-girar 48s linear infinite}
`;

const KEYFRAMES = `
@keyframes mu-girar{to{transform:rotate(1turn)}}
@keyframes mu-latido{0%{transform:scale(1)}40%{transform:scale(1.12)}100%{transform:scale(1)}}
@keyframes mu-contador-sube{from{transform:translateY(75%);opacity:0}to{transform:none;opacity:1}}
@keyframes mu-contador-sale{from{transform:none;opacity:1}to{transform:translateY(-75%);opacity:0}}
@keyframes mu-aro-pulso{from{transform:scale(1);opacity:.6}to{transform:scale(1.6);opacity:0}}
@keyframes mu-entrar{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes mu-cajon-izq{from{transform:translateX(-100%)}to{transform:none}}
@media (prefers-reduced-motion: reduce){
${sel} *,${sel} *::before,${sel} *::after{transition-duration:.01ms!important;animation:none!important;scroll-behavior:auto!important}
${sel} .mu-contador-num-sale,${sel} .mu-aro-pulso{display:none}
${sel} .mu-entrar{opacity:1;transform:none}
}
`;

/** La hoja de la marca con el par de letras `par` (A, el de la tienda, si no se pide otro). */
export function cssTema(par: ParLetras = "a"): string {
  const letras = `--mu-fuente-display:${familiaDisplay(par)};--mu-fuente-script:${familiaTexto(par)};--mu-fuente-texto:${familiaTexto(par)};${PARES[par].tamanos}`;
  return `${carasDe(par)}
${sel}{${FIJOS}${letras}${CLARO}--font-sans:var(--mu-fuente-texto);background:var(--surface-canvas);color:var(--text-primary);font-family:var(--mu-fuente-texto);}
.dark ${sel}{${OSCURO}}
${CLASES}${KEYFRAMES}`;
}

export const CSS_TEMA = cssTema("a");

/*
 * Nivel global (ADR-460), igual que «Buleje Beauty»: `:root:root` (0,2,0) le
 * gana al `:root` y al `.dark` de globals.css. En oscuro el acento de FONDO
 * (#8a6f5e, blanco encima 4,65:1) y el de TEXTO (`--accent-ink`, #e3c6b3) son
 * dos tokens: ningún tono sirve para las dos cosas sobre el lienzo oscuro.
 * El cupón de bienvenida de la tienda general («10 % en tu primer pedido», código
 * BIENVENIDO) no va en Musa: el pedido sale por WhatsApp sin checkout (el código no
 * se aplica en ningún lado) y la oferta real del manual es otra («preventa 10 % a las
 * primeras 20 clientas»), que va en la franja (`FRANJA` en anuncios.ts). La regla que
 * lo esconde está en `CLASES` (`body:has(…)`): así vale también en la portada, que no
 * lleva esta hoja global.
 */
export const TEXTO_CON_ACENTO = [
  ".text-\\[var\\(--accent\\)\\]",
  ".dark\\:text-\\[var\\(--accent\\)\\]",
  ".text-\\[var\\(--accent-dark\\)\\]",
  ".text-\\[var\\(--accent-600\\)\\]",
  ".text-\\[var\\(--color-primary\\)\\]",
  ".text-primary",
  ".text-primary-dark",
  ".text-primary\\/70",
  ".text-accent",
  ".hover\\:text-\\[var\\(--accent\\)\\]:hover",
  ".hover\\:text-primary:hover",
  ":where(.group):hover .group-hover\\:text-primary",
  ":where(.group):hover .group-hover\\:text-\\[var\\(--accent\\)\\]",
].join(",");

/** El color en línea de React llega como `color:var(…)` (servidor) o `color: var(…)` (navegador); nunca `background-color`. */
export const TEXTO_EN_LINEA_CON_ACENTO = ["--color-primary", "--accent", "--tenant-primary"]
  .flatMap((v) => [`[style^="color:var(${v}"]`, `[style^="color: var(${v}"]`, `[style*=";color:var(${v}"]`, `[style*="; color: var(${v}"]`])
  .join(",");

export const CSS_GLOBAL = `
:root:root{
--surface-canvas:#ffffff;--surface-raised:#ffffff;--surface-sunken:#f5f4f2;
--rule-soft:#ecebe8;--rule-base:#dedbd7;--rule-strong:#1a1a1a;
--text-primary:#1a1a1a;--text-secondary:#4a4642;--text-tertiary:#6b6661;
--accent:#1a1a1a;--accent-600:#3a3734;--accent-dark:#3a3734;--accent-ink:#1a1a1a;
--accent-soft:rgb(26 26 26/.04);--accent-muted:rgb(26 26 26/.08);--accent-glow:rgb(26 26 26/.18);
--brand-accent:#735b4c;--color-primary:#1a1a1a;--color-primary-dark:#000000;--color-primary-light:#4a4642;
--color-background:#ffffff;--color-foreground:#1a1a1a;
--color-surface:#f5f4f2;--color-card:#ffffff;--color-card-foreground:#1a1a1a;--color-card-border:#dedbd7;
--color-popover:#ffffff;--color-popover-foreground:#1a1a1a;--color-border:#dedbd7;--color-input:#dedbd7;
--color-ring:#1a1a1a;--color-accent:#1a1a1a;--color-muted:#6b6661;--color-muted-foreground:#6b6661;
}
:root:root.dark{
--surface-canvas:#141312;--surface-raised:#1c1b19;--surface-sunken:#1f1e1c;
--rule-soft:#2a2826;--rule-base:#3a3734;--rule-strong:#f5f4f2;
--text-primary:#f5f4f2;--text-secondary:#cfcac4;--text-tertiary:#a8a29b;
--accent:#f5f4f2;--accent-600:#dedbd7;--accent-dark:#dedbd7;--accent-ink:#f5f4f2;
--accent-soft:rgb(245 244 242/.05);--accent-muted:rgb(245 244 242/.1);--accent-glow:rgb(245 244 242/.2);
--brand-accent:#dcc7b8;--color-primary:#f5f4f2;--color-primary-light:#dedbd7;
--color-background:#141312;--color-foreground:#f5f4f2;
--color-surface:#1f1e1c;--color-card:#1c1b19;--color-card-foreground:#f5f4f2;--color-card-border:#3a3734;
--color-popover:#1c1b19;--color-popover-foreground:#f5f4f2;--color-border:#3a3734;--color-input:#3a3734;
--color-ring:#f5f4f2;--color-accent:#f5f4f2;--color-muted:#a8a29b;--color-muted-foreground:#a8a29b;
}
[data-marco] h1{font-family:${TITULOS};font-weight:600;letter-spacing:-0.025em}
:root:root.dark :is(${TEXTO_CON_ACENTO}){color:var(--accent-ink)}
:root:root.dark :is(${TEXTO_EN_LINEA_CON_ACENTO}){color:var(--accent-ink)!important}
:root:root .text-muted{color:var(--text-tertiary)}
`;
