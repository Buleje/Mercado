/**
 * La identidad de «Musa» (manual del negocio + contrato visual del 10-10):
 * la paleta, las fuentes, la escala, las sombras y los tiempos viven SÓLO
 * acá, en DOS niveles. Los componentes usan `var(--mu-*)` y las clases
 * `.mu-*`; no llevan hex.
 *
 * Paleta del manual (no cambia): Nude #D9B8A3 · Negro #1A1A1A · Hueso #F7F3EF ·
 * Acento #8A6F5E · Cacao #2E2421. Se suman 4 acentos de la selva central
 * (rosa orquídea, selva, oro miel y achiote), cada uno en versión decorativa
 * (`--mu-X`), fondo (`--mu-X-claro`) y texto (`--mu-X-tinta`), con su par oscuro.
 *
 * 1. `CSS_TEMA` — encerrada en `[data-pagina="pagina-musa"]`: lo que dibuja
 *    esta carpeta (portada, encabezado, pie, catálogo, bolsa).
 * 2. `CSS_GLOBAL` (ADR-460) — en `:root`, SÓLO en las páginas de la tienda de
 *    este negocio (la monta el marco): cuenta, pedidos, legales y sus modales
 *    toman los mismos neutros y un acento LEGIBLE CON TEXTO BLANCO.
 *
 * Contraste (WCAG 2.x, medido con la luminancia de cada hex; ≥4,5 = texto chico):
 * · Texto en acento: `--mu-acento-tinta` 5,71 sobre hueso (el acento del manual
 *   da 4,2: sólo títulos grandes y decoración).
 * · Tintas de los acentos sobre hueso: rosa 6,05 · selva 6,73 · oro 5,74 ·
 *   achiote 5,49; sobre su propio fondo claro, el más bajo es achiote 4,63.
 * · Oro sobre cacao 6,47 (la script del héroe y del pie). Blanco sobre selva-tinta 7,43 (WhatsApp).
 * · Botón: hueso sobre cacao 13,68; en oscuro, negro sobre nude 9,39.
 * · Contador en oscuro: cacao sobre la tarjeta oscura daría 1,11, por eso va nude + número negro.
 * · Decorativos sin texto: oro (2,11) y selva (2,80) sobre hueso sólo en ✦, aros y filetes.
 */
export const ID_PAGINA = "pagina-musa";

/*
 * Fuentes: Cormorant Garamond (display, recta y cursiva), Great Vibes (la
 * script de los empaques impresos) y Poppins (lectura). Las mismas 3 del
 * catálogo y de las cajas: que la web y lo impreso se vean igual.
 *
 * ¿Por qué no `next/font`? En «Buleje Beauty» su hoja de @font-face (7 KB,
 * bloqueante) se colaba en TODAS las tiendas (medido 01-10 en /t/mi-pollo).
 * Acá van auto-alojadas (`public/fonts/musa/`, subconjunto latín de Google
 * Fonts) y el @font-face vive DENTRO de este `<style>`, que sólo sale en las
 * páginas de Musa: el navegador baja cada archivo recién cuando lo pinta.
 * Great Vibes va con `font-display:block`: una cursiva de respaldo se ve rota
 * (la portada la precarga con `preload()`).
 */
const FUENTES = `
@font-face{font-family:"Musa Cormorant";src:url(/fonts/musa/CormorantGaramond.woff2) format("woff2");font-weight:500 600;font-style:normal;font-display:swap}
@font-face{font-family:"Musa Cormorant";src:url(/fonts/musa/CormorantGaramond-Italic.woff2) format("woff2");font-weight:500 600;font-style:italic;font-display:swap}
@font-face{font-family:"Musa Great Vibes";src:url(/fonts/musa/GreatVibes-400.woff2) format("woff2");font-weight:400;font-style:normal;font-display:block}
@font-face{font-family:"Musa Poppins";src:url(/fonts/musa/Poppins-400.woff2) format("woff2");font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:"Musa Poppins";src:url(/fonts/musa/Poppins-500.woff2) format("woff2");font-weight:500;font-style:normal;font-display:swap}
@font-face{font-family:"Musa Poppins";src:url(/fonts/musa/Poppins-600.woff2) format("woff2");font-weight:600 700;font-style:normal;font-display:swap}
`;

/** La script se precarga sólo en la portada (`PaginaSalon`): es la única que bloquea. */
export const FUENTE_SCRIPT = "/fonts/musa/GreatVibes-400.woff2";

const SERIF = `"Musa Cormorant","Cormorant Garamond",Georgia,serif`;
const SCRIPT = `"Musa Great Vibes","Great Vibes","Segoe Script",cursive`;
const SANS = `"Musa Poppins",Poppins,var(--font-geist-sans),system-ui,sans-serif`;

const sel = `[data-pagina="${ID_PAGINA}"]`;

/** Lo que NO cambia entre claro y oscuro: fuentes, escala, forma, tiempos y los envases (son objetos). */
const FIJOS = `
--mu-fuente-display:${SERIF};--mu-fuente-script:${SCRIPT};--mu-fuente-texto:${SANS};
--mu-t-heroe:clamp(2.75rem,1.5rem + 5vw,5.5rem);
--mu-t-seccion:clamp(2.125rem,1.386rem + 2.955vw,3.75rem);
--mu-t-titulo:clamp(1.625rem,1.341rem + 1.136vw,2.25rem);
--mu-t-script-xl:clamp(2.5rem,1.591rem + 3.636vw,4.5rem);
--mu-t-script:clamp(1.875rem,1.477rem + 1.591vw,2.75rem);
--mu-t-precio:clamp(2rem,1.659rem + 1.364vw,2.75rem);
--mu-t-precio-tarjeta:1.5rem;
--mu-t-cuerpo:clamp(.9375rem,.909rem + .114vw,1rem);
--mu-t-nombre:clamp(.875rem,.847rem + .114vw,.9375rem);
--mu-t-boton:clamp(.875rem,.847rem + .114vw,.9375rem);
--mu-t-chico:.8125rem;--mu-t-kicker:.75rem;--mu-tracking-kicker:.28em;
--mu-radio-tarjeta:16px;--mu-radio-control:12px;--mu-radio-pill:999px;--mu-radio-arco:999px 999px 16px 16px;
--mu-dur-micro:120ms;--mu-dur-corto:200ms;--mu-dur-medio:320ms;--mu-dur-largo:600ms;
--mu-ease:cubic-bezier(.22,1,.36,1);--mu-ease-rebote:cubic-bezier(.34,1.56,.64,1);
--mu-envase-blanco:#faf7f2;--mu-envase-crema:#f1e8dc;--mu-envase-nude:#ead3c2;--mu-envase-ambar:#c98a4b;
--mu-envase-tapa:#1a1a1a;--mu-envase-salvia:#6f8f84;--mu-envase-celeste:#e3edea;--mu-envase-lavanda:#bfb0d1;
--mu-envase-naranja:#e9b97a;--mu-envase-kraft:#c9a27e;--mu-envase-kraft-sombra:#b38e6b;
--mu-envase-etiqueta:#ffffff;--mu-envase-tinta:#1a1a1a;
--mu-whatsapp-fondo:#3e5c47;--mu-whatsapp-texto:#ffffff;--mu-contador-aro:#c9a46a;
--mu-sello-nude:#d9b8a3;--mu-sello-m:#1a1a1a;
`;

const CLARO = `
--mu-hueso:#f7f3ef;--mu-nude-claro:#efe3da;--mu-nude:#d9b8a3;--mu-crema:#f1ebe4;--mu-nude-fuerte:#c49a82;
--mu-acento:#8a6f5e;--mu-acento-tinta:#735b4c;--mu-cacao:#2e2421;--mu-cacao-hondo:#221a17;--mu-negro:#1a1a1a;
--mu-sobre-cacao:#f7f3ef;--mu-sobre-cacao-2:#d9b8a3;
--mu-rosa:#d9a3a0;--mu-rosa-claro:#f3dcd6;--mu-rosa-tinta:#8e4651;
--mu-selva:#7c9a82;--mu-selva-claro:#dde5d6;--mu-selva-tinta:#3e5c47;
--mu-oro:#c9a46a;--mu-oro-claro:#f1e3c6;--mu-oro-tinta:#7a5a22;
--mu-achiote:#c8643f;--mu-achiote-claro:#f6dccf;--mu-achiote-tinta:#a3462a;
--mu-boton-fondo:#2e2421;--mu-boton-texto:#f7f3ef;--mu-boton-fondo-hover:#3d302b;
--mu-exito:#3e5c47;--mu-exito-fondo:#dde5d6;
--mu-ahorro:#a3462a;--mu-ahorro-fondo:#f6dccf;
--mu-encargo:#a3462a;--mu-encargo-fondo:#f6dccf;
--mu-contador-fondo:#2e2421;--mu-contador-texto:#f7f3ef;
--mu-foco:#8e4651;--mu-foco-halo:#f7f3ef;
--mu-tinte-cabello:#f2e4db;--mu-tinte-rostro:#f6e4df;--mu-tinte-cuerpo:#e4eadc;--mu-tinte-kits:#f3e8d2;
--mu-arco-exterior:#d2b4a2;--mu-arco-interior:#e3cbbe;
--mu-envase-sombra:rgb(46 36 33/.14);
--mu-sombra-tarjeta:0 1px 2px rgb(46 36 33/.06),0 10px 28px -14px rgb(46 36 33/.22);
--mu-sombra-flotante:0 28px 56px -20px rgb(46 36 33/.32);
--surface-canvas:#f7f3ef;--surface-raised:#ffffff;--surface-sunken:#f1eae3;
--rule-soft:#ece4dc;--rule-base:#ddd0c5;--rule-strong:#1a1a1a;
--text-primary:#1a1a1a;--text-secondary:#4f4440;--text-tertiary:#6b5d56;
--accent:#735b4c;--accent-600:#5c4639;--accent-dark:#5c4639;--color-primary:#735b4c;
`;

const OSCURO = `
--mu-hueso:#221b19;--mu-nude-claro:#2f2522;--mu-nude:#3d302b;--mu-crema:#28201d;--mu-nude-fuerte:#d9b8a3;
--mu-acento:#c9a690;--mu-acento-tinta:#e3c6b3;--mu-cacao:#120e0d;--mu-cacao-hondo:#0d0a09;--mu-negro:#f7f3ef;
--mu-sobre-cacao:#f7f3ef;--mu-sobre-cacao-2:#d9b8a3;
--mu-rosa:#c98d8f;--mu-rosa-claro:#3a2427;--mu-rosa-tinta:#ebb2b0;
--mu-selva:#6f8f78;--mu-selva-claro:#22302a;--mu-selva-tinta:#a9c9ae;
--mu-oro:#c9a46a;--mu-oro-claro:#352b1b;--mu-oro-tinta:#e4c68e;
--mu-achiote:#d27a57;--mu-achiote-claro:#3a231b;--mu-achiote-tinta:#f0a487;
--mu-boton-fondo:#d9b8a3;--mu-boton-texto:#1a1a1a;--mu-boton-fondo-hover:#e3c6b3;
--mu-exito:#a9c9ae;--mu-exito-fondo:#22302a;
--mu-ahorro:#f0a487;--mu-ahorro-fondo:#3a231b;
--mu-encargo:#f0a487;--mu-encargo-fondo:#3a231b;
--mu-contador-fondo:#d9b8a3;--mu-contador-texto:#1a1a1a;
--mu-foco:#ebb2b0;--mu-foco-halo:#1a1412;
--mu-tinte-cabello:#2f2522;--mu-tinte-rostro:#3a2427;--mu-tinte-cuerpo:#22302a;--mu-tinte-kits:#352b1b;
--mu-arco-exterior:#4a3a34;--mu-arco-interior:#3a2d29;
--mu-envase-sombra:rgb(0 0 0/.45);
--mu-sombra-tarjeta:0 1px 2px rgb(0 0 0/.3),0 10px 28px -14px rgb(0 0 0/.6);
--mu-sombra-flotante:0 28px 56px -20px rgb(0 0 0/.5);
--surface-canvas:#1a1412;--surface-raised:#241c1a;--surface-sunken:#1f1816;
--rule-soft:#2c2320;--rule-base:#40332e;--rule-strong:#f7f3ef;
--text-primary:#f7f3ef;--text-secondary:#d9cbc2;--text-tertiary:#b5a59b;
--accent:#e3c6b3;--accent-600:#efd9ca;--accent-dark:#efd9ca;--color-primary:#e3c6b3;
`;

/** Ruido de papel (SVG fractal): el grano del héroe y del pie. */
const RUIDO = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='180' height='180'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`;

/*
 * Clases (las de antes siguen: `.mu-serif`, `.mu-display`, `.mu-num`…):
 * · Letras: `.mu-script` (Great Vibes: ≥28 px, ≤3 palabras, 1 por vista, nunca
 *   precio ni botón) · `.mu-cursiva` (Cormorant itálica 500, 1-2 palabras dentro
 *   de un título) · `.mu-kicker` · `.mu-precio` (Cormorant 600 tabular) ·
 *   `.mu-precio-chico` (Poppins 600 tabular).
 * · Forma: `.mu-sombra-tarjeta` / `.mu-sombra-flotante` (el lint no deja
 *   `shadow-[…]`) · `.mu-arco` · `.mu-grano` (ruido detrás de los hijos) ·
 *   `.mu-foco` (aro DOBLE al enfocar con teclado: rosa por fuera y un halo hueso en
 *   el hueco, como el aro doble del sello; así se ve igual sobre hueso que sobre el
 *   cacao del héroe y del pie, donde el rosa solo daría 2,2:1) · `.mu-subrayado` (filete que
 *   crece desde el centro; color con `--mu-subrayado`).
 * · Foco de globals.css (`button:focus-visible{border-radius:8px;outline:…}` SIN capa):
 *   le gana a toda utilidad y volvía rectángulos las píldoras y los círculos. Acá,
 *   `revert-layer` devuelve el radio de su `rounded-*` y el aro de su
 *   `focus-visible:outline-*` (lo que no declara nada sigue con el aro global).
 * · El sello contador (`SelloContador` en `Sello.tsx`): `.mu-sello-contador`,
 *   `.mu-contador-num` (entra desde abajo) y `.mu-contador-num-sale` (sale hacia arriba).
 * · Movimiento: `mu-latido`, `mu-contador-sube`, `mu-aro-pulso`, `mu-flotar`,
 *   `mu-entrar` (con `--mu-i` para escalonar), `mu-brillo`, `mu-destello`, `mu-girar`.
 *   Con «reducir movimiento» todo queda quieto y nada depende de animarse.
 */
const CLASES = `
${sel} .mu-serif{font-family:${SERIF};font-weight:600;letter-spacing:-0.005em}
${sel} .mu-display{font-family:${SERIF};font-weight:500;letter-spacing:0.02em;text-transform:uppercase}
${sel} .mu-num{font-family:${SERIF};font-weight:600;font-variant-numeric:lining-nums proportional-nums;letter-spacing:0}
${sel} .mu-script{font-family:${SCRIPT};font-weight:400;font-style:normal;letter-spacing:0;text-transform:none;line-height:1}
${sel} .mu-cursiva{font-family:${SERIF};font-style:italic;font-weight:500;letter-spacing:0;text-transform:none}
${sel} .mu-kicker{font-family:${SANS};font-size:var(--mu-t-kicker);font-weight:600;line-height:1.4;letter-spacing:var(--mu-tracking-kicker);text-transform:uppercase}
${sel} .mu-precio{font-family:${SERIF};font-weight:600;line-height:1;letter-spacing:0;font-variant-numeric:lining-nums tabular-nums}
${sel} .mu-precio-chico{font-family:${SANS};font-weight:600;font-variant-numeric:tabular-nums}
${sel} .mu-sombra-tarjeta{box-shadow:var(--mu-sombra-tarjeta)}
${sel} .mu-sombra-flotante{box-shadow:var(--mu-sombra-flotante)}
${sel} .mu-arco{border-radius:var(--mu-radio-arco)}
${sel} :is(a,button,input,select,textarea,[role="button"],[tabindex])[class*="rounded"]:focus-visible{border-radius:revert-layer}
${sel} [class*="focus-visible:outline"]:focus-visible{outline:revert-layer;outline-offset:revert-layer}
body:has(${sel}) aside[aria-label="Cupón de bienvenida"]{display:none!important}
${sel} .mu-foco:focus-visible{outline:2px solid var(--mu-foco);outline-offset:2px;box-shadow:0 0 0 2px var(--mu-foco-halo)}
${sel} .mu-foco-dentro:focus-within{outline:2px solid var(--mu-foco);outline-offset:2px}
${sel} .mu-grano{position:relative;isolation:isolate}
${sel} .mu-grano::after{content:"";position:absolute;inset:0;z-index:-1;pointer-events:none;background-image:${RUIDO};opacity:.05;mix-blend-mode:soft-light}
.dark ${sel} .mu-grano::after{opacity:.07;filter:invert(1);mix-blend-mode:screen}
${sel} .mu-subrayado{position:relative}
${sel} .mu-subrayado::after{content:"";position:absolute;left:0;right:0;bottom:var(--mu-subrayado-abajo,.55rem);height:1.5px;border-radius:2px;background:var(--mu-subrayado,var(--mu-rosa-tinta));transform:scaleX(0);transform-origin:center;transition:transform var(--mu-dur-corto) var(--mu-ease)}
${sel} .mu-subrayado:hover::after,${sel} .mu-subrayado:focus-visible::after,${sel} .mu-subrayado[aria-current="page"]::after{transform:scaleX(1)}
${sel} .mu-barra{background:var(--surface-canvas);border-bottom:1px solid transparent;transition:background-color var(--mu-dur-corto) var(--mu-ease),border-color var(--mu-dur-corto) var(--mu-ease)}
${sel} .mu-barra[data-desplazado="si"]{background:color-mix(in srgb,var(--surface-canvas) 92%,transparent);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border-bottom-color:var(--rule-soft)}
${sel} .mu-buscador-movil{transition:transform var(--mu-dur-medio) var(--mu-ease),opacity var(--mu-dur-corto) var(--mu-ease)}
${sel} .mu-buscador-movil[data-oculto="si"]{transform:translateY(-100%);opacity:0;pointer-events:none}
${sel} .mu-sello-contador{position:relative;display:inline-grid;place-items:center;width:var(--mu-lado,22px);height:var(--mu-lado,22px);border-radius:999px;overflow:hidden;background:var(--mu-contador-fondo);color:var(--mu-contador-texto);font:600 calc(var(--mu-lado,22px) * .5)/1 ${SANS};font-variant-numeric:tabular-nums;letter-spacing:-.02em;outline:1.5px solid var(--mu-contador-aro);outline-offset:2px}
${sel} .mu-sello-contador>*{grid-area:1/1}
${sel} .mu-contador-num{animation:mu-contador-sube var(--mu-dur-corto) var(--mu-ease-rebote) both}
${sel} .mu-contador-num-sale{animation:mu-contador-sale var(--mu-dur-corto) var(--mu-ease) both}
${sel} .mu-aro-pulso{animation:mu-aro-pulso 400ms var(--mu-ease) both}
${sel} .mu-latido{animation:mu-latido var(--mu-dur-medio) var(--mu-ease-rebote)}
${sel} .mu-flotar{animation:mu-flotar 6s ease-in-out infinite}
${sel} .mu-entrar{animation:mu-entrar var(--mu-dur-largo) var(--mu-ease) both;animation-delay:calc(var(--mu-i,0) * 70ms)}
${sel} .mu-destello{animation:mu-destello var(--mu-dur-largo) var(--mu-ease) both;animation-delay:calc(var(--mu-i,0) * 90ms)}
${sel} .mu-brillo{position:relative;overflow:hidden}
${sel} .mu-brillo::after{content:"";position:absolute;inset:0 auto 0 0;width:45%;pointer-events:none;background:linear-gradient(90deg,transparent,rgb(255 255 255/.4),transparent);transform:translateX(-130%) skewX(-18deg)}
${sel} .group:hover .mu-brillo::after,${sel} .mu-brillo:hover::after{animation:mu-brillo var(--mu-dur-largo) var(--mu-ease) 1}
${sel} .mu-menu-movil:popover-open{animation:mu-cajon-izq var(--mu-dur-medio) var(--mu-ease)}
${sel} .mu-menu-movil::backdrop{background:rgb(18 14 13/.45)}
${sel} .mu-sin-barra{scrollbar-width:none}
${sel} .mu-sin-barra::-webkit-scrollbar{display:none}
${sel} .mu-desvanecer{-webkit-mask-image:linear-gradient(90deg,transparent,black 1rem,black calc(100% - 3rem),transparent);mask-image:linear-gradient(90deg,transparent,black 1rem,black calc(100% - 3rem),transparent)}
@media (min-width:640px){${sel} .mu-desvanecer-sm{-webkit-mask-image:none;mask-image:none}}
@media (min-width:768px){${sel} .mu-desvanecer-movil{-webkit-mask-image:none;mask-image:none}}
${sel} .mu-puntos{flex:1;align-self:end;margin-bottom:.4em;height:2px;background-image:radial-gradient(circle,currentColor 1px,transparent 1.3px);background-size:6px 2px;background-repeat:repeat-x;opacity:.45}
${sel} .noise-texture-bg::after{opacity:.06}
.dark ${sel} .noise-texture-bg::after{opacity:.05;filter:invert(1);mix-blend-mode:screen}
${sel} .mu-girar{animation:mu-girar 48s linear infinite}
`;

const KEYFRAMES = `
@keyframes mu-girar{to{transform:rotate(1turn)}}
@keyframes mu-latido{0%{transform:scale(1)}40%{transform:scale(1.12)}100%{transform:scale(1)}}
@keyframes mu-contador-sube{from{transform:translateY(75%);opacity:0}to{transform:none;opacity:1}}
@keyframes mu-contador-sale{from{transform:none;opacity:1}to{transform:translateY(-75%);opacity:0}}
@keyframes mu-aro-pulso{from{transform:scale(1);opacity:.6}to{transform:scale(1.6);opacity:0}}
@keyframes mu-flotar{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}
@keyframes mu-entrar{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes mu-brillo{from{transform:translateX(-130%) skewX(-18deg)}to{transform:translateX(260%) skewX(-18deg)}}
@keyframes mu-destello{0%{opacity:0;transform:scale(.3) rotate(0)}55%{opacity:1;transform:scale(1.1) rotate(45deg)}100%{opacity:0;transform:scale(.7) rotate(90deg)}}
@keyframes mu-cajon-izq{from{transform:translateX(-100%)}to{transform:none}}
@media (prefers-reduced-motion: reduce){
${sel} *,${sel} *::before,${sel} *::after{transition-duration:.01ms!important;animation:none!important;scroll-behavior:auto!important}
${sel} .mu-contador-num-sale,${sel} .mu-aro-pulso{display:none}
${sel} .mu-entrar,${sel} .mu-destello{opacity:1;transform:none}
}
`;

export const CSS_TEMA = `${FUENTES}
${sel}{${FIJOS}${CLARO}--font-sans:${SANS};background:var(--surface-canvas);color:var(--text-primary);font-family:${SANS};}
.dark ${sel}{${OSCURO}}
${CLASES}${KEYFRAMES}`;

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
--surface-canvas:#f7f3ef;--surface-raised:#ffffff;--surface-sunken:#f1eae3;
--rule-soft:#ece4dc;--rule-base:#ddd0c5;--rule-strong:#1a1a1a;
--text-primary:#1a1a1a;--text-secondary:#4f4440;--text-tertiary:#6b5d56;
--accent:#735b4c;--accent-600:#5c4639;--accent-dark:#5c4639;--accent-ink:#735b4c;
--accent-soft:rgb(115 91 76/.06);--accent-muted:rgb(115 91 76/.13);--accent-glow:rgb(115 91 76/.28);
--brand-accent:#735b4c;--color-primary:#735b4c;--color-primary-dark:#5c4639;--color-primary-light:#8a6f5e;
--color-background:#f7f3ef;--color-foreground:#1a1a1a;
--color-surface:#f1eae3;--color-card:#ffffff;--color-card-foreground:#1a1a1a;--color-card-border:#ddd0c5;
--color-popover:#ffffff;--color-popover-foreground:#1a1a1a;--color-border:#ddd0c5;--color-input:#ddd0c5;
--color-ring:#735b4c;--color-accent:#735b4c;--color-muted:#6b5d56;--color-muted-foreground:#6b5d56;
}
:root:root.dark{
--surface-canvas:#1a1412;--surface-raised:#241c1a;--surface-sunken:#1f1816;
--rule-soft:#2c2320;--rule-base:#40332e;--rule-strong:#f7f3ef;
--text-primary:#f7f3ef;--text-secondary:#d9cbc2;--text-tertiary:#b5a59b;
--accent:#8a6f5e;--accent-600:#735b4c;--accent-dark:#735b4c;--accent-ink:#e3c6b3;
--accent-soft:rgb(138 111 94/.12);--accent-muted:rgb(138 111 94/.22);--accent-glow:rgb(138 111 94/.3);
--brand-accent:#8a6f5e;--color-primary:#8a6f5e;--color-primary-light:#8a6f5e;
--color-background:#1a1412;--color-foreground:#f7f3ef;
--color-surface:#1f1816;--color-card:#241c1a;--color-card-foreground:#f7f3ef;--color-card-border:#40332e;
--color-popover:#241c1a;--color-popover-foreground:#f7f3ef;--color-border:#40332e;--color-input:#40332e;
--color-ring:#8a6f5e;--color-accent:#8a6f5e;--color-muted:#b5a59b;--color-muted-foreground:#b5a59b;
}
[data-marco] h1{font-family:${SERIF};font-weight:600;letter-spacing:-0.005em}
:root:root.dark :is(${TEXTO_CON_ACENTO}){color:var(--accent-ink)}
:root:root.dark :is(${TEXTO_EN_LINEA_CON_ACENTO}){color:var(--accent-ink)!important}
:root:root .text-muted{color:var(--text-tertiary)}
`;
