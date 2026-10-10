/**
 * La identidad de «Musa» (manual del negocio): la paleta y las fuentes viven
 * SÓLO acá, en DOS niveles.
 *
 * Paleta del manual: Nude #D9B8A3 · Negro #1A1A1A · Hueso #F7F3EF ·
 * Acento #8A6F5E · Cacao #2E2421. De ahí salen los tokens `--mu-*` y los del
 * DS (`--surface-*`, `--text-*`, `--rule-*`) re-teñidos, en claro y oscuro.
 *
 * 1. `CSS_TEMA` — encerrada en `[data-pagina="pagina-musa"]`: lo que dibuja
 *    esta carpeta (portada, encabezado, pie, catálogo, bolsa).
 * 2. `CSS_GLOBAL` (ADR-460) — en `:root`, SÓLO en las páginas de la tienda de
 *    este negocio (la monta el marco): cuenta, pedidos, legales y sus modales
 *    toman los mismos neutros y un acento LEGIBLE CON TEXTO BLANCO.
 *
 * Contraste (WCAG, calculado con la luminancia de cada hex):
 * · El acento del manual (#8A6F5E) da 4,2:1 sobre el hueso: alcanza para
 *   títulos grandes, no para texto chico. Para TEXTO va `--mu-acento-tinta`
 *   (#735b4c, el mismo tono más hondo): 5,7:1 sobre hueso y 5,0:1 sobre el
 *   nude claro de las tarjetas. Blanco sobre #8A6F5E = 4,65:1 (fondo de botón).
 * · `--text-tertiary` claro #6b5d56 = 5,7:1 sobre hueso.
 * · Sobre cacao: hueso 14:1, nude 8,1:1.
 * · `--mu-nude-fuerte` y `--mu-acento` son decorativos (filetes, íconos grandes).
 */
export const ID_PAGINA = "pagina-musa";

/*
 * Fuentes: títulos Cormorant Garamond (500-600), textos Poppins (400-600).
 *
 * ¿Por qué falló Cormorant en «Buleje Beauty»? Se cargó con `next/font` desde la
 * pieza, y la ruta `/t/[negocio]` empaqueta lo que la pieza importa: su hoja de
 * @font-face (7 KB, bloqueante) se colaba en TODAS las tiendas (medido 01-10 en
 * /t/mi-pollo). La fuente no tenía nada de malo: el problema era el camino.
 *
 * Acá van auto-alojadas (`public/fonts/musa/`, subconjunto latín de Google
 * Fonts: Cormorant variable 37 KB + Poppins 3 × 8 KB) y el @font-face vive
 * DENTRO de este `<style>`, que sólo sale en las páginas de Musa: ninguna otra
 * tienda lo ve, y el navegador baja cada archivo recién cuando lo pinta.
 * Sin cursiva cargada, los títulos van rectos (una cursiva falsa se ve rota).
 *
 * - `.mu-serif`: títulos chicos y medianos (Cormorant 600: su ojo es chico).
 * - `.mu-display`: titulares grandes, en versalitas abiertas como el catálogo.
 * - `.mu-num`: numerales de vitrina, alineados (`lnum`).
 */
const FUENTES = `
@font-face{font-family:"Musa Cormorant";src:url(/fonts/musa/CormorantGaramond.woff2) format("woff2");font-weight:500 600;font-style:normal;font-display:swap}
@font-face{font-family:"Musa Poppins";src:url(/fonts/musa/Poppins-400.woff2) format("woff2");font-weight:400;font-style:normal;font-display:swap}
@font-face{font-family:"Musa Poppins";src:url(/fonts/musa/Poppins-500.woff2) format("woff2");font-weight:500;font-style:normal;font-display:swap}
@font-face{font-family:"Musa Poppins";src:url(/fonts/musa/Poppins-600.woff2) format("woff2");font-weight:600 700;font-style:normal;font-display:swap}
`;

const SERIF = `"Musa Cormorant","Cormorant Garamond",Georgia,serif`;
const SANS = `"Musa Poppins",Poppins,var(--font-geist-sans),system-ui,sans-serif`;

const sel = `[data-pagina="${ID_PAGINA}"]`;

export const CSS_TEMA = `${FUENTES}
${sel}{
--mu-hueso:#f7f3ef;--mu-nude-claro:#efe3da;--mu-nude:#d9b8a3;--mu-crema:#f1ebe4;--mu-nude-fuerte:#c49a82;
--mu-acento:#8a6f5e;--mu-acento-tinta:#735b4c;--mu-cacao:#2e2421;--mu-negro:#1a1a1a;--mu-sobre-cacao:#f7f3ef;--mu-sobre-cacao-2:#d9b8a3;
--mu-sello-nude:#d9b8a3;--mu-sello-m:#1a1a1a;
--surface-canvas:#f7f3ef;--surface-raised:#ffffff;--surface-sunken:#f1eae3;
--rule-soft:#ece4dc;--rule-base:#ddd0c5;--rule-strong:#1a1a1a;
--text-primary:#1a1a1a;--text-secondary:#4f4440;--text-tertiary:#6b5d56;
--accent:#735b4c;--accent-600:#5c4639;--accent-dark:#5c4639;--color-primary:#735b4c;
--font-sans:${SANS};
background:var(--surface-canvas);color:var(--text-primary);font-family:${SANS};
}
.dark ${sel}{
--mu-hueso:#221b19;--mu-nude-claro:#2f2522;--mu-nude:#3d302b;--mu-crema:#28201d;--mu-nude-fuerte:#d9b8a3;
--mu-acento:#c9a690;--mu-acento-tinta:#e3c6b3;--mu-cacao:#120e0d;--mu-negro:#f7f3ef;--mu-sobre-cacao:#f7f3ef;--mu-sobre-cacao-2:#d9b8a3;
--surface-canvas:#1a1412;--surface-raised:#241c1a;--surface-sunken:#1f1816;
--rule-soft:#2c2320;--rule-base:#40332e;--rule-strong:#f7f3ef;
--text-primary:#f7f3ef;--text-secondary:#d9cbc2;--text-tertiary:#b5a59b;
--accent:#e3c6b3;--accent-600:#efd9ca;--accent-dark:#efd9ca;--color-primary:#e3c6b3;
}
${sel} .mu-serif{font-family:${SERIF};font-weight:600;letter-spacing:-0.005em}
${sel} .mu-display{font-family:${SERIF};font-weight:500;letter-spacing:0.02em;text-transform:uppercase}
${sel} .mu-num{font-family:${SERIF};font-weight:600;font-variant-numeric:lining-nums proportional-nums;letter-spacing:0}
${sel} .mu-sin-barra{scrollbar-width:none}
${sel} .mu-sin-barra::-webkit-scrollbar{display:none}
${sel} .mu-desvanecer{-webkit-mask-image:linear-gradient(90deg,transparent,black 1rem,black calc(100% - 3rem),transparent);mask-image:linear-gradient(90deg,transparent,black 1rem,black calc(100% - 3rem),transparent)}
@media (min-width:640px){${sel} .mu-desvanecer-sm{-webkit-mask-image:none;mask-image:none}}
@media (min-width:768px){${sel} .mu-desvanecer-movil{-webkit-mask-image:none;mask-image:none}}
${sel} .mu-puntos{flex:1;align-self:end;margin-bottom:.4em;height:2px;background-image:radial-gradient(circle,currentColor 1px,transparent 1.3px);background-size:6px 2px;background-repeat:repeat-x;opacity:.45}
${sel} .noise-texture-bg::after{opacity:.06}
.dark ${sel} .noise-texture-bg::after{opacity:.05;filter:invert(1);mix-blend-mode:screen}
@keyframes mu-girar{to{transform:rotate(1turn)}}
${sel} .mu-girar{animation:mu-girar 48s linear infinite}
@media (prefers-reduced-motion: reduce){${sel} *{transition-duration:.01ms!important;animation:none!important;scroll-behavior:auto!important}}
`;

/*
 * Nivel global (ADR-460), igual que «Buleje Beauty»: `:root:root` (0,2,0) le
 * gana al `:root` y al `.dark` de globals.css. En oscuro el acento de FONDO
 * (#8a6f5e, blanco encima 4,65:1) y el de TEXTO (`--accent-ink`, #e3c6b3) son
 * dos tokens: ningún tono sirve para las dos cosas sobre el lienzo oscuro.
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
